const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [2, 'Product name must be at least 2 characters long'],
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  // ✅ NEW: Barcode Fields
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true
  },
  barcodeType: {
    type: String,
    enum: ['INTERNAL', 'EAN13', 'EAN8', 'UPC', 'CODE128', 'CODE39'],
    default: 'INTERNAL'
  },
  // ✅ NEW: Barcode metadata
  barcodeGenerated: {
    type: Boolean,
    default: false
  },
  barcodePrinted: {
    type: Boolean,
    default: false
  },
  lastPrintedAt: {
    type: Date
  },
  // Existing fields
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    minlength: [2, 'Category must be at least 2 characters long'],
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  buyingPrice: {
    type: Number,
    required: [true, 'Buying price is required'],
    min: [0, 'Buying price cannot be negative']
  },
  minSellingPrice: {
    type: Number,
    required: [true, 'Selling price is required'],
    min: [0, 'Selling price cannot be negative']
  },
  currentStock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative']
  },
  minStockLevel: {
    type: Number,
    default: 5,
    min: [0, 'Minimum stock level cannot be negative']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  unit: {
    type: String,
    default: 'pcs',
    enum: ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bottle', 'can']
  },
  supplier: {
    type: String,
    trim: true,
    maxlength: [100, 'Supplier name cannot exceed 100 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop is required']
  },
  shopName: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastRestocked: {
    type: Date,
    default: Date.now
  },
  reorderPoint: {
    type: Number,
    default: 10,
    min: [0, 'Reorder point cannot be negative']
  },
  stockHistory: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['purchase', 'sale', 'adjustment', 'return'] },
    quantity: Number,
    newStock: Number,
    reference: String,
    notes: String,
    shopName: String,
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' }
  }],
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
productSchema.index({ name: 1, shop: 1 }, { unique: true });
productSchema.index({ barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ category: 1 });
productSchema.index({ shop: 1 });
productSchema.index({ currentStock: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ barcodeType: 1 });
productSchema.index({ barcodeGenerated: 1 });

// ✅ ENHANCED PRE-SAVE: Generate barcode if not provided
productSchema.pre('save', async function(next) {
  console.log('🔄 PRE-SAVE HOOK TRIGGERED for product:', this.name);
  
  // ✅ Generate internal barcode if not provided
  if (!this.barcode && this.barcodeType === 'INTERNAL') {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.barcode = `IN${timestamp}${random}`;
    this.barcodeGenerated = true;
    console.log('✅ Generated internal barcode:', this.barcode);
  }
  
  // Validate that selling price is not less than buying price
  if (this.minSellingPrice < this.buyingPrice) {
    return next(new Error('Selling price cannot be less than buying price'));
  }
  
  // Set shopName from shop reference if available
  if (this.shop && !this.shopName) {
    try {
      console.log('🔍 Pre-save: Looking up shop with ID:', this.shop);
      const Shop = mongoose.model('Shop');
      const shopData = await Shop.findById(this.shop);
      
      if (shopData) {
        this.shopName = shopData.name;
        console.log('✅ Pre-save: Set shopName to:', this.shopName, 'for shop ID:', this.shop);
      } else {
        console.error('❌ Pre-save: Shop not found with ID:', this.shop);
      }
    } catch (error) {
      console.error('❌ Pre-save: Error fetching shop:', error);
    }
  }
  
  // Ensure shopName is properly formatted
  if (this.shopName) {
    this.shopName = this.shopName.trim();
  }
  
  next();
});

// ✅ Method to generate EAN13 barcode
productSchema.methods.generateEAN13 = function() {
  // This is a simplified version - in production use a proper EAN13 generator
  const prefix = '89'; // Country code for internal use
  const random = Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10);
  let barcode = prefix + random;
  
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return barcode + checkDigit;
};

// ✅ Method to generate UPC barcode
productSchema.methods.generateUPC = function() {
  const random = Math.floor(10000000000 + Math.random() * 90000000000).toString().slice(0, 11);
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(random[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return random + checkDigit;
};

// Virtuals and methods
productSchema.virtual('profitMargin').get(function() {
  if (this.buyingPrice === 0) return 0;
  return ((this.minSellingPrice - this.buyingPrice) / this.buyingPrice) * 100;
});

productSchema.virtual('profitAmount').get(function() {
  return this.minSellingPrice - this.buyingPrice;
});

productSchema.virtual('stockStatus').get(function() {
  if (this.currentStock === 0) {
    return 'out_of_stock';
  } else if (this.currentStock <= this.minStockLevel) {
    return 'low_stock';
  } else {
    return 'in_stock';
  }
});

productSchema.virtual('needsReorder').get(function() {
  return this.currentStock <= this.minStockLevel;
});

module.exports = mongoose.model('Product', productSchema);