const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  location: String,
  manager: String,
  contact: String,
  email: String,
  description: String,
  type: { type: String, default: 'retail' },
  status: { type: String, default: 'active' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.Shop || mongoose.model('Shop', shopSchema);