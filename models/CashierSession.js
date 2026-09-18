const mongoose = require('mongoose');

const cashierSessionSchema = new mongoose.Schema({
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier', required: true },
  token: { type: String, required: true },
  deviceInfo: String,
  ipAddress: String,
  loggedInAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, default: 'active' }
});

cashierSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
cashierSessionSchema.index({ cashierId: 1 });

module.exports = mongoose.models.CashierSession || mongoose.model('CashierSession', cashierSessionSchema);