// routes/expenses.js
const express = require('express');
const router = express.Router();

const Expense = require('../models/Expense');
const Shop = require('../models/Shop');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET all expenses
router.get('/', async (req, res) => {
  try {
    const { shopId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (shopId && shopId !== 'all') filter.shop = shopId;

    if (startDate && endDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      filter.date = { $gte: s, $lte: e };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [data, total] = await Promise.all([
      Expense.find(filter)
        .populate('shop', 'name location')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Expense.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      count: data.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch expenses' });
  }
});

// CREATE expense
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body };

    if (data.shop) {
      const shop = await Shop.findById(data.shop);
      if (shop) {
        data.shopName = shop.name;
        data.shopId = shop._id;
      }
    }

    const expense = await Expense.create(data);
    await expense.populate('shop', 'name location');

    res.status(201).json({ success: true, data: expense, message: 'Expense created' });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ success: false, message: 'Failed to create expense' });
  }
});

// UPDATE expense
router.put('/:id', async (req, res) => {
  try {
    const data = { ...req.body };

    if (data.shop) {
      const shop = await Shop.findById(data.shop);
      if (shop) {
        data.shopName = shop.name;
        data.shopId = shop._id;
      }
    }

    const expense = await Expense.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true
    }).populate('shop', 'name location');

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, data: expense, message: 'Expense updated' });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ success: false, message: 'Failed to update expense' });
  }
});

// DELETE expense
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    res.json({ success: true, data: expense, message: 'Expense deleted' });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete expense' });
  }
});

// STATS overview
router.get('/stats/overview', async (req, res) => {
  try {
    const { shopId, startDate, endDate } = req.query;
    const filter = {};

    if (shopId && shopId !== 'all') filter.shop = shopId;

    if (startDate && endDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      filter.date = { $gte: s, $lte: e };
    }

    const expenses = await Expense.find(filter)
      .populate('shop', 'name')
      .sort({ date: -1 });

    const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    const byCategory = {};
    const byPayment = {};

    expenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      byPayment[e.paymentMethod] = (byPayment[e.paymentMethod] || 0) + e.amount;
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalExpenses: expenses.length,
          totalAmount,
          averageExpense: expenses.length ? totalAmount / expenses.length : 0,
          minExpense: expenses.length ? Math.min(...expenses.map(e => e.amount)) : 0,
          maxExpense: expenses.length ? Math.max(...expenses.map(e => e.amount)) : 0
        },
        byCategory: Object.entries(byCategory).map(([category, total]) => ({
          category,
          total
        })),
        byPaymentMethod: Object.entries(byPayment).map(([method, total]) => ({
          method,
          total
        })),
        recentExpenses: expenses.slice(0, 10)
      }
    });
  } catch (err) {
    console.error('Expense stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch expense stats' });
  }
});

// ✅ MUST export the router (a function), not an object
module.exports = router;