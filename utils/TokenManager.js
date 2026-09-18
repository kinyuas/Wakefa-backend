// utils/TokenManager.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const TokenBlacklist = require('../models/TokenBlacklist');
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY
} = require('../config/constants');

class TokenManager {
  static generateToken(payload, isRefresh = false) {
    const secret = isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET;
    const expiresIn = isRefresh ? REFRESH_TOKEN_EXPIRY : TOKEN_EXPIRY;
    return jwt.sign(
      {
        ...payload,
        jti: crypto.randomBytes(16).toString('hex'),
        sessionId: crypto.randomBytes(16).toString('hex'),
        lastActivity: Date.now()
      },
      secret,
      { expiresIn }
    );
  }

  static verifyToken(token, isRefresh = false) {
    try {
      return jwt.verify(token, isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET);
    } catch {
      return null;
    }
  }

  static async blacklistToken(token, userId, reason = 'logout') {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return false;
      await TokenBlacklist.updateOne(
        { token },
        {
          token,
          expiresAt: new Date(decoded.exp * 1000),
          userId,
          reason
        },
        { upsert: true }
      );
      return true;
    } catch (err) {
      console.error('Blacklist error:', err);
      return false;
    }
  }

  static async isTokenBlacklisted(token) {
    try {
      return !!(await TokenBlacklist.findOne({ token }).lean());
    } catch {
      return false;
    }
  }
}

module.exports = { TokenManager };