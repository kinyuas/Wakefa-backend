// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const User = require('../models/User');
const Cashier = require('../models/Cashier');
const SecureCode = require('../models/SecureCode');
const CashierSession = require('../models/CashierSession');

const { TokenManager } = require('../utils/TokenManager');
const { sendSecureCodeEmail } = require('../utils/emailService');
const auditLogger = require('../utils/auditLogger');
const { requestCodeLimiter, verifyCodeLimiter, loginLimiter } = require('../middleware/rateLimiters');
const { protect } = require('../middleware/auth');
const {
  CODE_COOLDOWN_MS, CODE_EXPIRY_MINUTES, MAX_CODE_ATTEMPTS, INACTIVITY_LIMIT_MS
} = require('../config/constants');

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// ---------- Activity tracking ----------
router.post('/activity', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(400).json({ success: false, message: 'No token' });

  if (await TokenManager.isTokenBlacklisted(token))
    return res.status(401).json({ success: false, message: 'Session expired', code: 'SESSION_EXPIRED' });

  const decoded = TokenManager.verifyToken(token);
  if (!decoded) return res.status(401).json({ success: false, message: 'Invalid token', code: 'SESSION_EXPIRED' });

  const lastActivity = decoded.lastActivity || decoded.iat * 1000;
  if (Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
    await TokenManager.blacklistToken(token, decoded.userId, 'inactivity');
    return res.status(401).json({ success: false, message: 'Session expired', code: 'SESSION_EXPIRED' });
  }

  if (decoded.role === 'cashier') {
    await CashierSession.updateOne(
      { cashierId: decoded.userId, status: 'active' },
      { lastActivity: new Date() }
    );
  }

  const newToken = TokenManager.generateToken({
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    name: decoded.name
  });

  res.json({ success: true, message: 'Activity recorded', token: newToken });
});

// ---------- Validate session ----------
router.post('/validate-session', protect, async (req, res) => {
  let user = null;
  if (req.user.role === 'admin') user = await User.findById(req.user.id).lean();
  else if (req.user.role === 'cashier') user = await Cashier.findById(req.user.id).lean();

  if (!user) {
    return res.json({
      success: true,
      message: 'Session valid (offline mode)',
      user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, status: 'active' },
      offlineMode: true
    });
  }

  const status = user.status || (user.isActive ? 'active' : 'inactive');
  if (status !== 'active') {
    return res.status(401).json({ success: false, message: 'Account inactive', code: 'SESSION_EXPIRED' });
  }

  res.json({
    success: true,
    message: 'Session valid',
    user: { id: user._id, email: user.email, name: user.name, role: user.role, status }
  });
});

// ---------- Logout ----------
router.post('/logout', async (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    const decoded = TokenManager.verifyToken(token);
    if (decoded?.userId) {
      await TokenManager.blacklistToken(token, decoded.userId, 'logout');
      await CashierSession.updateOne(
        { cashierId: decoded.userId, token },
        { status: 'logged_out' }
      );
    }
  }
  res.json({ success: true, message: 'Logged out' });
});

// ---------- Request secure code ----------
//
// Anti-duplicate-email protection (3 layers):
//   1. requestCodeLimiter — 1 req / 60s per IP+email
//   2. Cooldown check — reuse recent code, do NOT send again
//   3. Atomic upsert — concurrent requests cannot both create codes
router.post('/request-code',
  requestCodeLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Invalid email' });

    const { email } = req.body;
    const user = await User.findOne({ email }) || await Cashier.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'No account with this email' });

    // --- Cooldown check ---
    const existing = await SecureCode.findOne({ email });
    if (existing && !existing.used && existing.createdAt) {
      const age = Date.now() - new Date(existing.createdAt).getTime();
      if (age < CODE_COOLDOWN_MS) {
        const wait = Math.ceil((CODE_COOLDOWN_MS - age) / 1000);
        console.log(`⏳ Cooldown active for ${email} — ${wait}s. Skipping email.`);
        return res.json({
          success: true,
          message: 'A code was already sent. Please check your inbox.',
          cooldown: true,
          retryAfterSeconds: wait,
          expiresIn: CODE_EXPIRY_MINUTES
        });
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
    const hashedCode = await bcrypt.hash(code, 10);

    await SecureCode.findOneAndUpdate(
      { email },
      { code: hashedCode, expiresAt, attempts: 0, used: false, createdAt: new Date() },
      { upsert: true, new: true }
    );

    const sent = await sendSecureCodeEmail(email, code);
    if (!sent && process.env.NODE_ENV === 'production') {
      return res.status(500).json({ success: false, message: 'Failed to send email' });
    }

    res.json({
      success: true,
      message: sent ? 'Secure code sent' : 'Code generated (dev mode)',
      expiresIn: CODE_EXPIRY_MINUTES
    });
  }
);

// ---------- Verify secure code ----------
router.post('/verify-code',
  verifyCodeLimiter,
  [body('email').isEmail().normalizeEmail(), body('code').isLength({ min: 6, max: 6 }).isNumeric()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid input' });

    const { email, code } = req.body;
    const sc = await SecureCode.findOne({ email });
    if (!sc) return res.status(404).json({ success: false, message: 'No code found. Request a new one.' });

    if (new Date() > sc.expiresAt) {
      await SecureCode.deleteOne({ email });
      return res.status(400).json({ success: false, message: 'Code expired' });
    }
    if (sc.used) return res.status(400).json({ success: false, message: 'Code already used' });
    if (sc.attempts >= MAX_CODE_ATTEMPTS) {
      await SecureCode.deleteOne({ email });
      return res.status(400).json({ success: false, message: 'Too many attempts' });
    }

    const valid = await bcrypt.compare(code, sc.code);
    if (!valid) {
      sc.attempts += 1;
      await sc.save();
      return res.status(400).json({
        success: false,
        message: 'Invalid code',
        attemptsRemaining: MAX_CODE_ATTEMPTS - sc.attempts
      });
    }

    sc.used = true;
    await sc.save();

    const user = await User.findOne({ email }) || await Cashier.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    const payload = { userId: user._id, email: user.email, role: user.role, name: user.name };
    const accessToken = TokenManager.generateToken(payload);
    const refreshToken = TokenManager.generateToken(payload, true);

    const userData = {
      _id: user._id, name: user.name, email: user.email, role: user.role,
      lastLogin: user.lastLogin, loginCount: user.loginCount
    };
    if (user.role === 'cashier' && user.shopId) {
      userData.shopId = user.shopId;
      userData.shopName = user.shopName;
    }

    await auditLogger.logLogin(user, req);

    res.json({ success: true, user: userData, token: accessToken, refreshToken, message: 'Login successful' });
  }
);

// ---------- Cashier password login ----------
router.post('/cashier/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  const cashier = await Cashier.findOne({ email: email.toLowerCase().trim() })
    .select('+password')
    .populate('shopId', 'name location');

  if (!cashier) return res.status(404).json({ success: false, message: 'Cashier not found' });
  if (cashier.status !== 'active') return res.status(403).json({ success: false, message: 'Account inactive' });
  if (!cashier.password) return res.status(401).json({ success: false, message: 'Password not set' });

  let valid = false;
  if (cashier.password.startsWith('$2')) {
    valid = await bcrypt.compare(password, cashier.password);
  } else {
    valid = cashier.password === password;
    if (valid) cashier.password = password; // triggers re-hash in pre-save
  }

  if (!valid) return res.status(401).json({ success: false, message: 'Invalid password' });

  cashier.lastLogin = new Date();
  cashier.loginCount = (cashier.loginCount || 0) + 1;
  await cashier.save();

  const payload = {
    userId: cashier._id, email: cashier.email, role: 'cashier', name: cashier.name,
    shopId: cashier.shopId?._id, shopName: cashier.shopId?.name || cashier.shopName
  };
  const accessToken = TokenManager.generateToken(payload);
  const refreshToken = TokenManager.generateToken(payload, true);

  await CashierSession.create({
    cashierId: cashier._id,
    token: accessToken,
    deviceInfo: req.get('user-agent'),
    ipAddress: req.ip,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
  });

  await auditLogger.logLogin(cashier, req);

  res.json({
    success: true,
    user: {
      _id: cashier._id, name: cashier.name, email: cashier.email, phone: cashier.phone || '',
      role: 'cashier', status: cashier.status, lastLogin: cashier.lastLogin,
      loginCount: cashier.loginCount,
      shopId: cashier.shopId?._id || null,
      shopName: cashier.shopId?.name || cashier.shopName || null,
      shopLocation: cashier.shopId?.location || null
    },
    token: accessToken,
    refreshToken,
    message: 'Cashier login successful'
  });
});

// ---------- Refresh token ----------
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

  const decoded = TokenManager.verifyToken(refreshToken, true);
  if (!decoded) return res.status(401).json({ success: false, message: 'Invalid refresh token' });

  const user = await User.findById(decoded.userId) || await Cashier.findById(decoded.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const payload = { userId: user._id, email: user.email, role: user.role, name: user.name, shopId: user.shopId, shopName: user.shopName };
  const newAccessToken = TokenManager.generateToken(payload);
  const newRefreshToken = TokenManager.generateToken(payload, true);

  if (user.role === 'cashier') {
    await CashierSession.updateOne(
      { cashierId: user._id },
      { token: newAccessToken, lastActivity: new Date(), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) }
    );
  }

  res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken, message: 'Token refreshed' });
});

module.exports = router;