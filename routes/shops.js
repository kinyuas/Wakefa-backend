// routes/shops.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ✅ Import the EXACT same model file. This must match what created your data.
const Shop = require('../models/Shop');

const { protect, authorize } = require('../middleware/auth');

// Protect all shop routes (except we log if auth fails in dev)
router.use(protect);

// ============================================================
// GET ALL SHOPS
// ============================================================
router.get('/', async (req, res) => {
  try {
    console.log('📋 GET /api/shops — querying collection:', Shop.collection.name);
    console.log('📋 Database:', mongoose.connection.name);

    const shops = await Shop.find({}).sort({ createdAt: -1 }).lean();

    console.log(`✅ Found ${shops.length} shops in DB`);
    if (shops.length > 0) {
      console.log('   First shop:', { _id: shops[0]._id, name: shops[0].name });
    }

    res.json({
      success: true,
      data: shops,
      count: shops.length
    });
  } catch (err) {
    console.error('❌ GET /shops error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch shops', error: err.message });
  }
});

// ============================================================
// GET SINGLE SHOP
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shop ID' });
    }
    const shop = await Shop.findById(req.params.id).lean();
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    res.json({ success: true, data: shop });
  } catch (err) {
    console.error('❌ GET /shops/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch shop', error: err.message });
  }
});

// ============================================================
// CREATE SHOP
// ============================================================
router.post('/', authorize('admin', 'manager'), async (req, res) => {
  try {
    const { name, location, description, manager, contact, email, type, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Shop name is required' });
    }
    if (!location || !location.trim()) {
      return res.status(400).json({ success: false, message: 'Location is required' });
    }

    const existing = await Shop.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A shop with this name already exists' });
    }

    const shop = await Shop.create({
      name: name.trim(),
      location: location.trim(),
      description: description?.trim() || '',
      manager: manager?.trim() || '',
      contact: contact?.trim() || '',
      email: email?.trim() || '',
      type: type || 'retail',
      status: status || 'active',
      isActive: true
    });

    console.log('✅ Shop created:', shop._id, shop.name);

    res.status(201).json({ success: true, data: shop, message: 'Shop created successfully' });
  } catch (err) {
    console.error('❌ POST /shops error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Shop name already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create shop', error: err.message });
  }
});

// ============================================================
// UPDATE SHOP
// ============================================================
router.put('/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shop ID' });
    }

    const shop = await Shop.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    console.log('✅ Shop updated:', shop._id);
    res.json({ success: true, data: shop, message: 'Shop updated successfully' });
  } catch (err) {
    console.error('❌ PUT /shops error:', err);
    res.status(500).json({ success: false, message: 'Failed to update shop', error: err.message });
  }
});

// ============================================================
// DELETE SHOP
// ============================================================
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid shop ID' });
    }

    const shop = await Shop.findByIdAndDelete(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    console.log('✅ Shop deleted:', shop._id);
    res.json({ success: true, data: shop, message: 'Shop deleted successfully' });
  } catch (err) {
    console.error('❌ DELETE /shops error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete shop', error: err.message });
  }
});

module.exports = router;