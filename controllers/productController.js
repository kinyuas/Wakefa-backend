const Product = require('../models/products');
const Shop = require('../models/shop');
const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res, next) => {
  const { 
    name, 
    buyingPrice, 
    minSellingPrice, 
    shop,
    shopName,
    barcode,
    barcodeType
  } = req.body;

  console.log('🛒 CREATE PRODUCT REQUEST BODY:', req.body);

  // Check for required fields
  if (!name || !buyingPrice || !minSellingPrice || !shop) {
    return next(new ErrorResponse('Name, buying price, selling price, and shop are required', 400));
  }

  // Validate that selling price is not less than buying price
  if (minSellingPrice < buyingPrice) {
    return next(new ErrorResponse('Selling price cannot be less than buying price', 400));
  }

  // ✅ Validate barcode if provided
  if (barcode) {
    const existingProduct = await Product.findOne({ barcode });
    if (existingProduct) {
      return next(new ErrorResponse('Barcode already exists', 400));
    }
  }

  // Fetch shop name from database
  let finalShopName = shopName;
  try {
    console.log('🔍 Looking up shop with ID:', shop);
    const shopData = await Shop.findById(shop);
    
    if (!shopData) {
      console.error('❌ Shop not found with ID:', shop);
      return next(new ErrorResponse('Shop not found', 404));
    }
    
    finalShopName = shopData.name;
    console.log('✅ Found shop:', finalShopName, 'for ID:', shop);
    
  } catch (error) {
    console.error('❌ Error fetching shop:', error);
    return next(new ErrorResponse('Invalid shop ID', 400));
  }

  // Create product data
  const productData = {
    name: name.trim(),
    category: req.body.category ? req.body.category.trim() : 'General',
    buyingPrice: Number(buyingPrice),
    minSellingPrice: Number(minSellingPrice),
    currentStock: Number(req.body.currentStock) || 0,
    minStockLevel: Number(req.body.minStockLevel) || 5,
    shop: shop,
    shopName: finalShopName,
    description: req.body.description || '',
    supplier: req.body.supplier || '',
    unit: req.body.unit || 'pcs',
    reorderPoint: Number(req.body.reorderPoint) || 10,
    // ✅ NEW: Barcode fields
    barcode: barcode || undefined,
    barcodeType: barcodeType || 'INTERNAL'
  };

  console.log('📦 FINAL PRODUCT DATA TO SAVE:', productData);

  try {
    const product = await Product.create(productData);
    
    console.log('✅ PRODUCT CREATED SUCCESSFULLY:', {
      _id: product._id,
      name: product.name,
      barcode: product.barcode,
      barcodeType: product.barcodeType
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('❌ ERROR CREATING PRODUCT:', error);
    return next(new ErrorResponse('Failed to create product: ' + error.message, 500));
  }
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin/Manager/Cashier
const updateProduct = asyncHandler(async (req, res, next) => {
  console.log('🔄 UPDATE PRODUCT REQUEST:', {
    id: req.params.id,
    body: req.body
  });

  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // ✅ Validate barcode if changing
  if (req.body.barcode && req.body.barcode !== product.barcode) {
    const existingProduct = await Product.findOne({ barcode: req.body.barcode });
    if (existingProduct && existingProduct._id.toString() !== req.params.id) {
      return next(new ErrorResponse('Barcode already exists', 400));
    }
  }

  // Update shop name if shop ID changes
  if (req.body.shop && req.body.shop !== product.shop.toString()) {
    console.log('🔄 Shop ID changed, fetching new shop name...');
    
    try {
      const shopData = await Shop.findById(req.body.shop);
      if (!shopData) {
        return next(new ErrorResponse('Shop not found', 404));
      }
      
      req.body.shopName = shopData.name;
      console.log('✅ Updated shop name to:', shopData.name, 'for shop ID:', req.body.shop);
      
    } catch (error) {
      console.error('❌ Error fetching shop during update:', error);
      return next(new ErrorResponse('Invalid shop ID', 400));
    }
  }

  // Update fields
  const updateFields = [
    'name', 'category', 'buyingPrice', 'minSellingPrice', 
    'currentStock', 'minStockLevel', 'shop', 'shopName', 
    'barcode', 'barcodeType', 'supplier', 'description', 'unit', 'reorderPoint'
  ];

  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  // Validate selling price
  if (product.minSellingPrice < product.buyingPrice) {
    return next(new ErrorResponse('Selling price cannot be less than buying price', 400));
  }

  try {
    await product.save();
    
    console.log('✅ PRODUCT UPDATED SUCCESSFULLY:', {
      _id: product._id,
      name: product.name,
      barcode: product.barcode,
      barcodeType: product.barcodeType
    });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('❌ ERROR UPDATING PRODUCT:', error);
    return next(new ErrorResponse('Failed to update product: ' + error.message, 500));
  }
});

// @desc    Get all products with advanced filtering
// @route   GET /api/products
// @access  Private
const getAllProducts = asyncHandler(async (req, res, next) => {
  const { 
    shop, 
    category, 
    lowStock, 
    search, 
    page = 1, 
    limit = 20,
    sortBy = 'name',
    sortOrder = 'asc',
    barcode, // ✅ NEW: Barcode search parameter
    barcodeType // ✅ NEW: Barcode type filter
  } = req.query;
  
  // Build filter object
  let filter = { isActive: true };
  
  if (shop) filter.shop = shop;
  if (category) filter.category = category;
  if (barcodeType) filter.barcodeType = barcodeType;
  
  // ✅ NEW: Barcode exact search
  if (barcode) {
    filter.barcode = barcode;
  }
  
  // Low stock filter
  if (lowStock === 'true') {
    filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
  }
  
  // Search across multiple fields including barcode
  if (search && !barcode) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
      { supplier: { $regex: search, $options: 'i' } },
      { shopName: { $regex: search, $options: 'i' } }
    ];
  }

  // Validate and parse pagination parameters
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  
  // Build sort object
  const sortOptions = {};
  const validSortFields = ['name', 'category', 'currentStock', 'buyingPrice', 'minSellingPrice', 'createdAt', 'shopName', 'barcode'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
  sortOptions[sortField] = sortOrder === 'desc' ? -1 : 1;

  const products = await Product.find(filter)
    .sort(sortOptions)
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .select('-__v');

  const total = await Product.countDocuments(filter);

  console.log(`📊 Found ${products.length} products`);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    data: products,
    pagination: {
      current: pageNum,
      totalPages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1
    }
  });
});

// ✅ NEW: Search product by barcode (for POS scanning)
// @desc    Search product by barcode
// @route   GET /api/products/search/barcode
// @access  Private
const searchByBarcode = asyncHandler(async (req, res, next) => {
  const { barcode, shop } = req.query;

  if (!barcode) {
    return next(new ErrorResponse('Barcode is required', 400));
  }

  let filter = { 
    barcode: barcode.trim().toUpperCase(),
    isActive: true 
  };

  if (shop) {
    filter.shop = shop;
  }

  const product = await Product.findOne(filter)
    .select('-__v')
    .populate('shop', 'name location');

  if (!product) {
    return res.status(200).json({
      success: false,
      message: 'Product not found with this barcode',
      data: null
    });
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

// ✅ NEW: Generate barcode for existing products
// @desc    Generate barcode for product
// @route   POST /api/products/:id/generate-barcode
// @access  Private/Admin/Manager
const generateBarcode = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  const { barcodeType = 'INTERNAL' } = req.body;

  let newBarcode;
  
  switch(barcodeType) {
    case 'EAN13':
      newBarcode = product.generateEAN13();
      break;
    case 'UPC':
      newBarcode = product.generateUPC();
      break;
    case 'INTERNAL':
    default:
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.random().toString(36).substr(2, 4).toUpperCase();
      newBarcode = `IN${timestamp}${random}`;
      break;
  }

  // Check if barcode already exists
  const existingProduct = await Product.findOne({ barcode: newBarcode });
  if (existingProduct) {
    return next(new ErrorResponse('Generated barcode already exists, please try again', 409));
  }

  product.barcode = newBarcode;
  product.barcodeType = barcodeType;
  product.barcodeGenerated = true;
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Barcode generated successfully',
    data: {
      barcode: product.barcode,
      barcodeType: product.barcodeType
    }
  });
});

// ✅ NEW: Bulk generate barcodes for products without barcodes
// @desc    Bulk generate barcodes
// @route   POST /api/products/bulk-generate-barcodes
// @access  Private/Admin
const bulkGenerateBarcodes = asyncHandler(async (req, res, next) => {
  const { shop, barcodeType = 'INTERNAL' } = req.body;

  let filter = { 
    isActive: true,
    $or: [
      { barcode: { $exists: false } },
      { barcode: null },
      { barcode: '' }
    ]
  };

  if (shop) {
    filter.shop = shop;
  }

  const productsWithoutBarcode = await Product.find(filter);

  if (productsWithoutBarcode.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'All products already have barcodes',
      count: 0
    });
  }

  const results = {
    success: 0,
    failed: 0,
    details: []
  };

  for (const product of productsWithoutBarcode) {
    try {
      let newBarcode;
      
      switch(barcodeType) {
        case 'EAN13':
          newBarcode = product.generateEAN13();
          break;
        case 'UPC':
          newBarcode = product.generateUPC();
          break;
        case 'INTERNAL':
        default:
          const timestamp = Date.now().toString().slice(-6);
          const random = Math.random().toString(36).substr(2, 4).toUpperCase();
          newBarcode = `IN${timestamp}${random}`;
          break;
      }

      // Check if barcode already exists
      const existingProduct = await Product.findOne({ barcode: newBarcode });
      if (!existingProduct) {
        product.barcode = newBarcode;
        product.barcodeType = barcodeType;
        product.barcodeGenerated = true;
        await product.save();
        
        results.success++;
        results.details.push({
          productId: product._id,
          name: product.name,
          barcode: newBarcode,
          status: 'success'
        });
      } else {
        results.failed++;
        results.details.push({
          productId: product._id,
          name: product.name,
          status: 'failed',
          reason: 'Duplicate barcode'
        });
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        productId: product._id,
        name: product.name,
        status: 'failed',
        reason: error.message
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Barcodes generated: ${results.success} success, ${results.failed} failed`,
    results
  });
});

// ✅ NEW: Mark barcode as printed
// @desc    Mark barcode as printed
// @route   POST /api/products/:id/mark-printed
// @access  Private/Admin/Manager/Cashier
const markBarcodePrinted = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  product.barcodePrinted = true;
  product.lastPrintedAt = new Date();
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Barcode marked as printed',
    data: {
      barcodePrinted: product.barcodePrinted,
      lastPrintedAt: product.lastPrintedAt
    }
  });
});

// Existing functions remain the same...
const getActiveProducts = asyncHandler(async (req, res, next) => {
  const { shop } = req.query;
  
  if (!shop) {
    return next(new ErrorResponse('Shop parameter is required', 400));
  }

  const products = await Product.find({ 
    shop, 
    isActive: true,
    currentStock: { $gt: 0 }
  })
  .select('name category buyingPrice minSellingPrice currentStock barcode barcodeType supplier shopName')
  .sort({ name: 1 });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

const getLowStockProducts = asyncHandler(async (req, res, next) => {
  const { shop, criticalOnly = 'false' } = req.query;
  
  let filter = { 
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] }
  };
  
  if (shop) filter.shop = shop;
  
  if (criticalOnly === 'true') {
    filter.currentStock = { $lte: 0 };
  }

  const products = await Product.find(filter)
    .sort({ currentStock: 1 })
    .select('name category currentStock minStockLevel buyingPrice minSellingPrice barcode barcodeType shop shopName');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
    criticalCount: products.filter(p => p.currentStock <= 0).length
  });
});

const getProductsByShop = asyncHandler(async (req, res, next) => {
  const { category, inStock = 'true' } = req.query;
  
  let filter = { 
    shop: req.params.shop, 
    isActive: true 
  };
  
  if (category) filter.category = category;
  if (inStock === 'true') filter.currentStock = { $gt: 0 };

  const products = await Product.find(filter)
    .sort({ name: 1 })
    .select('-__v');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id).select('-__v');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

const bulkUpdateStock = asyncHandler(async (req, res, next) => {
  const { updates } = req.body;
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return next(new ErrorResponse('Updates array with at least one item is required', 400));
  }

  for (const update of updates) {
    if (!update.productId || typeof update.quantity !== 'number') {
      return next(new ErrorResponse('Each update must contain productId and quantity', 400));
    }
    
    if (update.quantity === 0) {
      return next(new ErrorResponse('Quantity cannot be zero', 400));
    }
  }

  const bulkOps = updates.map(update => ({
    updateOne: {
      filter: { 
        _id: update.productId, 
        isActive: true 
      },
      update: { 
        $inc: { currentStock: update.quantity },
        $set: { 
          lastRestocked: new Date(),
          updatedAt: new Date()
        }
      }
    }
  }));

  const result = await Product.bulkWrite(bulkOps);

  res.status(200).json({
    success: true,
    message: `Stock updated for ${result.modifiedCount} products`,
    modifiedCount: result.modifiedCount
  });
});

const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  product.isActive = false;
  product.deletedAt = new Date();
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
    data: {}
  });
});

module.exports = {
  getAllProducts,
  getActiveProducts,
  getLowStockProducts,
  getProductsByShop,
  getProduct,
  createProduct,
  updateProduct,
  bulkUpdateStock,
  deleteProduct,
  // ✅ NEW: Barcode related functions
  searchByBarcode,
  generateBarcode,
  bulkGenerateBarcodes,
  markBarcodePrinted
};