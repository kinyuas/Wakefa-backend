const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  userId: mongoose.Schema.Types.ObjectId,
  reason: String,
  createdAt: { type: Date, default: Date.now }
});

tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.TokenBlacklist || mongoose.model('TokenBlacklist', tokenBlacklistSchema);