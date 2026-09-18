const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  category: { type: String, default: 'General' },
  date: { type: Date, default: Date.now },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopId: String,
  shopName: String,
  recordedBy: String,
  paymentMethod: { type: String, default: 'cash' },
  referenceNumber: String,
  notes: String,
  status: { type: String, default: 'completed' }
}, { timestamps: true });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);