const mongoose = require('mongoose');

const cashierAnalyticsSchema = new mongoose.Schema({
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier', required: true },
  period: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  metrics: {
    totalRevenue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalTransactions: { type: Number, default: 0 },
    totalItemsSold: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    performanceScore: { type: Number, default: 0 },
    averageTransactionValue: { type: Number, default: 0 },
    paymentMethods: {
      cash: { type: Number, default: 0 },
      mpesa_bank: { type: Number, default: 0 }
    },
    digitalPaymentRatio: { type: Number, default: 0 },
    cashPaymentRatio: { type: Number, default: 0 }
  },
  dailyBreakdown: [{ date: Date, revenue: Number, transactions: Number, profit: Number, cash: Number, mpesa_bank: Number }],
  topProducts: [{ productName: String, productId: mongoose.Schema.Types.ObjectId, quantitySold: Number, revenue: Number, profit: Number }]
}, { timestamps: true });

cashierAnalyticsSchema.index({ cashierId: 1, period: 1, startDate: -1, endDate: -1 });

module.exports = mongoose.models.CashierAnalytics || mongoose.model('CashierAnalytics', cashierAnalyticsSchema);