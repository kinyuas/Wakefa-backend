// routes/reports.js
const express = require('express');
const router = express.Router();

const Transaction = require('../models/Transaction');
const Shop = require('../models/Shop');
const Cashier = require('../models/Cashier');
const Product = require('../models/Product');
const Expense = require('../models/Expense');

const { protect, authorize } = require('../middleware/auth');
const { CalculationUtils } = require('../utils/CalculationUtils');

router.use(protect);

// Dashboard mega-fetch
router.get('/dashboard', async (req, res) => {
  const { startDate, endDate, shopId } = req.query;

  const txFilter = { status: 'completed' };
  if (startDate && endDate) {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    txFilter.saleDate = { $gte: s, $lte: e };
  }
  if (shopId && shopId !== 'all') txFilter.shop = shopId;

  const [transactions, shops, cashiers, products, expenses] = await Promise.all([
    Transaction.find(txFilter).populate('shop', 'name location').populate('cashierId', 'name email').sort({ saleDate: -1 }).lean(),
    Shop.find().lean(),
    Cashier.find().lean(),
    Product.find().lean(),
    Expense.find().populate('shop', 'name').lean()
  ]);

  const revenue = CalculationUtils.calculateRevenue(transactions);
  const cogs = CalculationUtils.calculateCOGS(transactions);
  const gross = revenue - cogs;
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const net = gross - totalExpenses;
  const pc = CalculationUtils.calculatePaymentComposition(transactions);

  const summary = {
    totalSales: transactions.length, totalRevenue: revenue, totalExpenses,
    grossProfit: gross, netProfit: net, costOfGoodsSold: cogs,
    totalMpesaBank: pc.mpesa_bank, totalCash: pc.cash,
    profitMargin: CalculationUtils.calculateProfitMargin(revenue, net),
    totalItemsSold: transactions.reduce((s, t) => s + (t.itemsCount || 0), 0),
    averageTransactionValue: transactions.length ? revenue / transactions.length : 0
  };

  res.json({
    success: true,
    data: {
      transactions, shops, cashiers, products, expenses,
      summary, financialStats: summary,
      enhancedStats: { salesWithProfit: transactions, financialStats: summary },
      paymentComposition: pc
    }
  });
});

// Cashier dashboard metrics
router.get('/cashier/dashboard-metrics', async (req, res) => {
  const { cashierId, startDate, endDate } = req.query;
  if (!cashierId) return res.status(400).json({ success: false, message: 'cashierId required' });

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const txs = await Transaction.find({ cashierId, status: 'completed', saleDate: { $gte: start, $lte: end } });
  const m = CalculationUtils.calculatePerformanceMetrics(txs);

  res.json({
    success: true,
    data: {
      totalSales: m.totalRevenue, totalTransactions: m.totalTransactions,
      totalCash: m.totalCash, totalMpesaBank: m.totalBankMpesa,
      itemsSold: m.totalItemsSold, averageTransaction: m.averageTransactionValue,
      profitMargin: m.profitMargin, digitalPaymentRatio: m.digitalPaymentRatio,
      cashPaymentRatio: m.cashPaymentRatio
    }
  });
});

// Sales report
router.get('/sales', authorize('admin', 'manager'), async (req, res) => {
  const { startDate, endDate, shopId } = req.query;
  const filter = { status: 'completed' };
  if (startDate && endDate) {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    filter.saleDate = { $gte: s, $lte: e };
  }
  if (shopId && shopId !== 'all') filter.shop = shopId;

  const txs = await Transaction.find(filter).sort({ saleDate: -1 }).lean();
  res.json({
    success: true,
    data: txs,
    summary: {
      totalRevenue: CalculationUtils.calculateRevenue(txs),
      totalProfit: txs.reduce((s, t) => s + (t.profit || 0), 0),
      totalTransactions: txs.length
    }
  });
});

module.exports = router;