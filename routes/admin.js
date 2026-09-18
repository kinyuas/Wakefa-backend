// routes/admin.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const User = require('../models/User');
const { JWT_SECRET } = require('../config/constants');
const { protect, authorize } = require('../middleware/auth');

// Admin login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

  let admin = await User.findOne({ email: email.toLowerCase(), role: 'admin' });

  if (!admin) {
    // Seed default admin if this is the seeded one
    if (email.toLowerCase() !== 'kinyuastanzo6759@gmail.com') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    admin = await User.create({
      email: 'kinyuastanzo6759@gmail.com',
      name: 'Administrator',
      role: 'admin',
      status: 'active',
      password: await bcrypt.hash('Kinyua01', 12)
    });
  }

  const valid = admin.password ? await bcrypt.compare(password, admin.password) : false;
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  admin.lastLogin = new Date();
  admin.loginCount = (admin.loginCount || 0) + 1;
  await admin.save();

  const token = jwt.sign({ userId: admin._id, email: admin.email, role: 'admin', name: admin.name }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    token,
    admin: { id: admin._id, email: admin.email, role: 'admin', name: admin.name },
    message: 'Admin login successful'
  });
});

router.get('/check', protect, authorize('admin'), (req, res) => res.json({ success: true, valid: true, user: req.user }));
router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  res.json({ success: true, data: { totalUsers: await User.countDocuments(), user: req.user } });
});
router.get('/profile', protect, authorize('admin'), (req, res) => res.json({ success: true, data: { user: req.user } }));
router.post('/logout', protect, authorize('admin'), (req, res) => res.json({ success: true, message: 'Logged out' }));

module.exports = router;