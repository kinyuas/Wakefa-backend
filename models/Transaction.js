// models/Transaction.js
const mongoose = require('mongoose');

const transactionItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  price: { type: Number, required: true, min: 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  buyingPrice: { type: Number, required: true, min: 0, default: 0 },
  cost: { type: Number, required: true, min: 0, default: 0 },
  profit: { type: Number, default: 0 },
  profitMargin: { type: Number, default: 0 }
}, { _id: true });

const transactionSchema = new mongoose.Schema({
  transactionNumber: { type: String, required: true, unique: true },
  totalAmount: { type: Number, required: true },
  cost: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  profitMargin: { type: Number, default: 0 },
  items: [transactionItemSchema],
  itemsCount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'cash' },
  paymentMethodDetailed: {
    cash: { type: Number, default: 0 },
    mpesa: { type: Number, default: 0 },
    bank: { type: Number, default: 0 },
    mpesa_bank: { type: Number, default: 0 },
    card: { type: Number, default: 0 }
  },
  customerName: { type: String, default: 'Walk-in Customer' },
  customerPhone: String,
  cashierName: String,
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier' },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopId: String,
  shopName: String,
  saleDate: { type: Date, default: Date.now },
  status: { type: String, default: 'completed' },
  paymentSplit: {
    cash: { type: Number, default: 0 },
    mpesa_bank: { type: Number, default: 0 }
  },
  receiptNumber: String
}, { timestamps: true });

transactionSchema.index({ saleDate: -1 });
transactionSchema.index({ shop: 1 });
transactionSchema.index({ cashierId: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);