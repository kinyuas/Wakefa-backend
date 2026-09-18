// routes/products.js
const express = require('express');
const router = express.Router();

const Product = require('../models/Product');
const Shop = require('../models/Shop');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', async (req, res) => {
  const { shopId, search, category, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (shopId && shopId !== 'all') filter.shop = shopId;
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { category: { $regex: search, $options: 'i' } }
  ];
  if (category && category !== 'all') filter.category = category;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    Product.find(filter).populate('shop', 'name location type').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Product.countDocuments(filter)
  ]);

  res.json({ success: true, data, count: data.length, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
});

router.post('/', authorize('admin', 'manager'), async (req, res) => {
  const data = { ...req.body };
  if (data.shop) {
    const shop = await Shop.findById(data.shop);
    if (shop) { data.shopName = shop.name; data.shopId = shop._id; }
  }
  const product = await Product.create(data);
  await product.populate('shop', 'name location type');
  res.status(201).json({ success: true, data: product, message: 'Product created' });
});

router.put('/:id', authorize('admin', 'manager', 'cashier'), async (req, res) => {
  const data = { ...req.body };
  if (data.shop) {
    const shop = await Shop.findById(data.shop);
    if (shop) { data.shopName = shop.name; data.shopId = shop._id; }
  }
  const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true })
    .populate('shop', 'name location type');
  if (!product) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: product, message: 'Product updated' });
});

router.delete('/:id', authorize('admin', 'manager'), async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: product, message: 'Product deleted' });
});

// Stats overview
router.get('/stats/overview', async (req, res) => {
  const { shopId } = req.query;
  const filter = {};
  if (shopId && shopId !== 'all') filter.shop = shopId;

  const products = await Product.find(filter);
  const outOfStock = products.filter(p => p.currentStock === 0).length;
  const lowStock = products.filter(p => p.currentStock > 0 && p.currentStock <= (p.minStockLevel || 5)).length;

  res.json({
    success: true,
    data: {
      overview: {
        totalProducts: products.length,
        outOfStock, lowStock,
        inStock: products.length - outOfStock,
        totalInventoryValue: products.reduce((s, p) => s + (p.currentStock * p.buyingPrice), 0),
        totalPotentialRevenue: products.reduce((s, p) => s + (p.currentStock * p.minSellingPrice), 0),
        averageStockValue: products.length ? products.reduce((s, p) => s + (p.currentStock * p.buyingPrice), 0) / products.length : 0
      }
    }
  });
});

module.exports = router;