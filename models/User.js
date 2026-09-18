const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true },
  password: String,
  role: { type: String, default: 'admin' },
  status: { type: String, default: 'active' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  loginCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);