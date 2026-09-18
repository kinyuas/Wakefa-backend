const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const cashierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  password: { type: String, select: false },
  role: { type: String, default: 'cashier' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopName: String,
  lastLogin: Date,
  lastLogout: Date,
  loginCount: { type: Number, default: 0 }
}, { timestamps: true });

cashierSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

cashierSchema.methods.verifyPassword = function (pw) {
  return bcrypt.compare(pw, this.password);
};

module.exports = mongoose.models.Cashier || mongoose.model('Cashier', cashierSchema);