// middleware/auth.js
const { TokenManager } = require('../utils/TokenManager');
const { INACTIVITY_LIMIT_MS } = require('../config/constants');

const protect = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided', code: 'NO_TOKEN' });
    }

    if (await TokenManager.isTokenBlacklisted(token)) {
      return res.status(401).json({ success: false, message: 'Session terminated', code: 'SESSION_EXPIRED' });
    }

    const decoded = TokenManager.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Invalid token', code: 'SESSION_EXPIRED' });
    }

    const lastActivity = decoded.lastActivity || decoded.iat * 1000;
    if (Date.now() - lastActivity > INACTIVITY_LIMIT_MS) {
      await TokenManager.blacklistToken(token, decoded.userId, 'inactivity');
      return res.status(401).json({ success: false, message: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    req.user = {
      id: decoded.userId,
      _id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      shopId: decoded.shopId,
      shopName: decoded.shopName
    };
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ success: false, message: 'Auth failed' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden: insufficient permissions' });
  }
  next();
};

module.exports = { protect, authorize };