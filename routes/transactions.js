// routes/transactions.js
const express = require('express');
const router = express.Router();

const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const Cashier = require('../models/Cashier');
const Expense = require('../models/Expense');
const CashierAnalytics = require('../models/CashierAnalytics');

const { protect, authorize } = require('../middleware/auth');
const { CalculationUtils } = require('../utils/CalculationUtils');

router.use(protect);

// ============================================================
// GET /combined — dashboard mega-endpoint
// ============================================================
router.get('/combined', async (req, res) => {
  const { startDate, endDate, shopId, cashierId, paymentMethod } = req.query;
  const startTime = Date.now();

  const filter = { status: 'completed' };
  if (startDate && endDate) {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    filter.saleDate = { $gte: s, $lte: e };
  }
  if (shopId && shopId !== 'all') filter.shop = shopId;
  if (cashierId && cashierId !== 'all') filter.cashierId = cashierId;
  if (paymentMethod && paymentMethod !== 'all') {
    if (paymentMethod === 'digital') {
      filter.paymentMethod = { $in: ['mpesa', 'bank', 'mpesa_bank', 'card'] };
    } else {
      filter.paymentMethod = paymentMethod;
    }
  }

  const [transactions, shops, cashiers, products, expenses] = await Promise.all([
    Transaction.find(filter)
      .populate('shop', 'name location type')
      .populate('cashierId', 'name email')
      .sort({ saleDate: -1 })
      .lean(),
    Shop.find().lean(),
    Cashier.find().lean(),
    Product.find().lean(),
    Expense.find().populate('shop', 'name').lean()
  ]);

  const revenue = CalculationUtils.calculateRevenue(transactions);
  const cogs = CalculationUtils.calculateCOGS(transactions);
  const pc = CalculationUtils.calculatePaymentComposition(transactions);

  const summary = {
    totalSales: transactions.length,
    totalRevenue: revenue,
    costOfGoodsSold: cogs,
    grossProfit: revenue - cogs,
    netProfit: revenue - cogs,
    profitMargin: CalculationUtils.calculateProfitMargin(revenue, revenue - cogs),
    totalMpesaBank: pc.mpesa_bank,
    totalCash: pc.cash,
    totalItemsSold: transactions.reduce((s, t) => s + (t.itemsCount || 0), 0),
    averageTransactionValue: transactions.length ? revenue / transactions.length : 0,
    paymentComposition: pc
  };

  res.json({
    success: true,
    data: {
      transactions,
      salesWithProfit: transactions,
      filteredTransactions: transactions,
      expenses,
      products,
      shops,
      cashiers,
      summary,
      financialStats: summary,
      enhancedStats: { salesWithProfit: transactions, financialStats: summary },
      paymentComposition: pc
    },
    processingTime: Date.now() - startTime
  });
});

// ============================================================
// GET /metrics
// ============================================================
router.get('/metrics', async (req, res) => {
  const { startDate, endDate, shopId } = req.query;
  const filter = { status: 'completed' };
  if (startDate && endDate) {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    filter.saleDate = { $gte: s, $lte: e };
  }
  if (shopId && shopId !== 'all') filter.shop = shopId;

  const txs = await Transaction.find(filter).lean();
  const revenue = CalculationUtils.calculateRevenue(txs);
  const cogs = CalculationUtils.calculateCOGS(txs);
  const expAgg = await Expense.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const expTotal = expAgg[0]?.total || 0;

  res.json({
    success: true,
    data: {
      totalSales: { amount: revenue, count: txs.length, description: `${txs.length} transactions` },
      totalRevenue: { amount: revenue, description: 'From all sales' },
      expenses: { amount: expTotal, description: 'Total operational costs' },
      grossProfit: { amount: revenue - cogs, description: 'Revenue - COGS' },
      netProfit: { amount: revenue - cogs - expTotal, description: 'After expenses' },
      costOfGoodsSold: { amount: cogs, description: 'For all sales' },
      totalMpesaBank: { amount: txs.reduce((s, t) => s + (t.paymentSplit?.mpesa_bank || 0), 0), description: 'Digital' },
      totalCash: { amount: txs.reduce((s, t) => s + (t.paymentSplit?.cash || 0), 0), description: 'Cash' }
    }
  });
});

// ============================================================
// POST / — CREATE  (authoritative server-side cost computation)
// ============================================================
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ success: false, message: 'items[] is required' });
    }

    if (data.transactionNumber) {
      const exists = await Transaction.findOne({ transactionNumber: data.transactionNumber });
      if (exists) return res.status(409).json({ success: false, message: 'Duplicate transaction' });
    }

    if (data.shop) {
      const shop = await Shop.findById(data.shop).lean();
      if (shop) { data.shopName = shop.name; data.shopId = shop._id; }
    }

    let totalAmount = 0;
    let totalCost = 0;
    const stockUpdates = [];

    const enhancedItems = await Promise.all(data.items.map(async (raw) => {
      const qty = CalculationUtils.safeNumber(raw.quantity, 1);
      const product = raw.productId ? await Product.findById(raw.productId).lean() : null;

      // ✅ PRODUCT NAME — prefer payload, fall back to DB
      const productName =
        raw.productName ||
        (product && product.name) ||
        'Unknown Item';

      const price = CalculationUtils.safeNumber(
        raw.price ?? (product && product.minSellingPrice),
        0
      );

      // ✅ BUYING PRICE — pull from DB if payload is missing it
      const buyingPrice = CalculationUtils.safeNumber(
        raw.buyingPrice ?? raw.costPrice ?? (product && product.buyingPrice),
        0
      );

      const totalPrice = price * qty;
      const cost = buyingPrice * qty;
      const profit = totalPrice - cost;
      const profitMargin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;

      totalAmount += totalPrice;
      totalCost += cost;

      if (product) {
        stockUpdates.push({
          productId: product._id,
          newStock: Math.max(0, (product.currentStock || 0) - qty)
        });
      }

      return {
        productId: raw.productId,
        productName,
        quantity: qty,
        price,
        totalPrice,
        buyingPrice,
        cost,
        profit,
        profitMargin
      };
    }));

    await Promise.all(stockUpdates.map(u =>
      Product.findByIdAndUpdate(u.productId, { currentStock: u.newStock })
    ));

    data.totalAmount = totalAmount;
    data.cost = totalCost;
    data.profit = totalAmount - totalCost;
    data.profitMargin = totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) * 100 : 0;
    data.itemsCount = enhancedItems.reduce((s, i) => s + i.quantity, 0);
    data.items = enhancedItems;

    data.paymentSplit = { cash: 0, mpesa_bank: 0 };
    data.paymentMethodDetailed = { cash: 0, mpesa: 0, bank: 0, mpesa_bank: 0, card: 0 };

    if (data.paymentMethod === 'cash') {
      data.paymentSplit.cash = totalAmount;
      data.paymentMethodDetailed.cash = totalAmount;
    } else if (data.paymentMethod === 'mpesa_bank') {
      data.paymentSplit.mpesa_bank = totalAmount;
      data.paymentMethodDetailed.mpesa_bank = totalAmount;
    } else if (data.paymentMethod === 'cash_mpesa_bank') {
      const cash = CalculationUtils.safeNumber(data.cashAmount);
      const mb = CalculationUtils.safeNumber(data.mpesaBankAmount);
      data.paymentSplit.cash = cash;
      data.paymentSplit.mpesa_bank = mb;
      data.paymentMethodDetailed.cash = cash;
      data.paymentMethodDetailed.mpesa_bank = mb;
    }

    if (!data.transactionNumber) {
      data.transactionNumber = `TXN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
    }
    if (!data.receiptNumber) {
      data.receiptNumber = `RCP-${Date.now()}`;
    }

    const tx = await Transaction.create(data);
    if (tx.cashierId) await CashierAnalytics.deleteMany({ cashierId: tx.cashierId });

    console.log('✅ Transaction saved:', {
      id: tx._id,
      totalAmount: tx.totalAmount,
      cost: tx.cost,
      profit: tx.profit,
      items: tx.items.map(i => ({ name: i.productName, buyingPrice: i.buyingPrice }))
    });

    res.status(201).json({ success: true, data: tx, message: 'Transaction created' });
  } catch (err) {
    console.error('❌ Transaction create error:', err);
    res.status(500).json({ success: false, message: 'Failed', error: err.message });
  }
});

// ============================================================
// GET / — Admin/manager list
// ============================================================
router.get('/', authorize('admin', 'manager'), async (req, res) => {
  const { startDate, endDate, shopId, cashierId, paymentMethod, page = 1, limit = 50 } = req.query;
  const filter = { status: 'completed' };
  if (startDate && endDate) {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    filter.saleDate = { $gte: s, $lte: e };
  }
  if (shopId && shopId !== 'all') filter.shop = shopId;
  if (cashierId && cashierId !== 'all') filter.cashierId = cashierId;
  if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    Transaction.find(filter).sort({ saleDate: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Transaction.countDocuments(filter)
  ]);

  res.json({ success: true, data, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
});

module.exports = router;