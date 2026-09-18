// routes/cashiers.js
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const Cashier = require('../models/Cashier');
const Transaction = require('../models/Transaction');
const Shop = require('../models/Shop');

const { protect, authorize } = require('../middleware/auth');
const { CalculationUtils } = require('../utils/CalculationUtils');

router.use(protect);

// GET all cashiers
router.get('/', async (req, res) => {
  const { shopId, status, search, page = 1, limit = 20, withMetrics = 'false' } = req.query;
  const filter = {};

  if (shopId && shopId !== 'all') filter.shopId = shopId;
  if (status && status !== 'all') filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [cashiers, total] = await Promise.all([
    Cashier.find(filter).populate('shopId', 'name location').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Cashier.countDocuments(filter)
  ]);

  let enhanced = cashiers;
  if (withMetrics === 'true') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    enhanced = await Promise.all(cashiers.map(async (c) => {
      const txs = await Transaction.find({ cashierId: c._id, status: 'completed', saleDate: { $gte: thirtyDaysAgo } }).lean();
      const m = CalculationUtils.calculatePerformanceMetrics(txs);
      return { ...c, metrics: { ...m, last30Days: { transactions: m.totalTransactions, revenue: m.totalRevenue, profit: m.totalProfit } } };
    }));
  }

  res.json({
    success: true, data: enhanced, count: enhanced.length, total,
    page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit))
  });
});

// GET cashier performance
router.get('/:id/performance', async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, period = 'daily', dataType = 'withItems' } = req.query;

  const cashier = await Cashier.findById(id).populate('shopId', 'name location').lean();
  if (!cashier) return res.status(404).json({ success: false, message: 'Cashier not found' });

  let start = new Date(), end = new Date();
  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
  } else {
    switch (period) {
      case 'daily': start.setDate(start.getDate() - 1); break;
      case 'weekly': start.setDate(start.getDate() - 7); break;
      case 'monthly': start.setMonth(start.getMonth() - 1); break;
      case 'annually': start.setFullYear(start.getFullYear() - 1); break;
      default: start.setDate(start.getDate() - 1);
    }
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const txs = await Transaction.find({
    cashierId: id, status: 'completed', saleDate: { $gte: start, $lte: end }
  }).populate('shop', 'name').sort({ saleDate: -1 }).lean();

  const metrics = CalculationUtils.calculatePerformanceMetrics(txs);

  res.json({
    success: true,
    data: {
      cashier: {
        _id: cashier._id, name: cashier.name, email: cashier.email, phone: cashier.phone,
        status: cashier.status, shopId: cashier.shopId?._id,
        shopName: cashier.shopId?.name || cashier.shopName,
        shopLocation: cashier.shopId?.location,
        lastLogin: cashier.lastLogin, loginCount: cashier.loginCount
      },
      summary: {
        totalRevenue: metrics.totalRevenue, totalSales: metrics.totalTransactions,
        totalProfit: metrics.totalProfit, profitMargin: metrics.profitMargin,
        totalItemsSold: metrics.totalItemsSold, performanceScore: metrics.performanceScore,
        totalCost: metrics.totalCost,
        paymentComposition: {
          cash: metrics.totalCash, mpesa_bank: metrics.totalBankMpesa,
          total: metrics.totalCash + metrics.totalBankMpesa,
          cashPercentage: metrics.cashPercentage, mpesaBankPercentage: metrics.mpesaBankPercentage
        },
        averageTransactionValue: metrics.averageTransactionValue,
        digitalPaymentRatio: metrics.digitalPaymentRatio
      },
      transactions: dataType === 'withItems' ? txs : [],
      salesWithProfit: txs,
      dailyPerformance: CalculationUtils.generateDailyBreakdown(txs),
      topProducts: CalculationUtils.generateTopProducts(txs, 10),
      recentTransactions: txs.slice(0, 20),
      period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0], period }
    }
  });
});

// CREATE cashier
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  const data = { ...req.body };
  if (!data.email) return res.status(400).json({ success: false, message: 'Email required' });

  const existing = await Cashier.findOne({ email: data.email.toLowerCase().trim() });
  if (existing) return res.status(409).json({ success: false, message: 'Email exists' });

  data.email = data.email.toLowerCase().trim();
  data.role = 'cashier';
  data.status = data.status || 'active';
  if (data.password) data.password = await bcrypt.hash(data.password, 12);

  if (data.shopId) {
    const shop = await Shop.findById(data.shopId);
    if (shop) data.shopName = shop.name;
  }

  const cashier = await Cashier.create(data);
  await cashier.populate('shopId', 'name location');
  res.status(201).json({ success: true, data: cashier, message: 'Cashier created' });
});

// UPDATE cashier
router.put('/:id', authorize('admin', 'manager'), async (req, res) => {
  const { id } = req.params;
  const data = { ...req.body };

  if (data.email) {
    const dup = await Cashier.findOne({ email: data.email.toLowerCase().trim(), _id: { $ne: id } });
    if (dup) return res.status(409).json({ success: false, message: 'Email exists' });
    data.email = data.email.toLowerCase().trim();
  }

  if (data.password) data.password = await bcrypt.hash(data.password, 12);
  else delete data.password;

  if (data.shopId) {
    const shop = await Shop.findById(data.shopId);
    if (shop) data.shopName = shop.name;
  }

  const cashier = await Cashier.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('shopId', 'name location');
  if (!cashier) return res.status(404).json({ success: false, message: 'Not found' });

  res.json({ success: true, data: cashier, message: 'Cashier updated' });
});

// DELETE cashier
router.delete('/:id', authorize('admin'), async (req, res) => {
  const cashier = await Cashier.findByIdAndDelete(req.params.id);
  if (!cashier) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: cashier, message: 'Cashier deleted' });
});

// GET cashier by id
router.get('/:id', async (req, res) => {
  const cashier = await Cashier.findById(req.params.id).populate('shopId', 'name location').lean();
  if (!cashier) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: cashier });
});

module.exports = router;