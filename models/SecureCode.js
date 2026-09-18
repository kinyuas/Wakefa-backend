const mongoose = require('mongoose');

const secureCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.SecureCode || mongoose.model('SecureCode', secureCodeSchema);