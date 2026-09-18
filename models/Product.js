const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, default: 'Uncategorized', trim: true },
  buyingPrice: { type: Number, default: 0, min: 0 },
  minSellingPrice: { type: Number, default: 0, min: 0 },
  currentStock: { type: Number, default: 0, min: 0 },
  minStockLevel: { type: Number, default: 5, min: 0 },
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopId: String,
  shopName: String,
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastRestocked: { type: Date, default: Date.now }
}, { timestamps: true });

productSchema.index({ name: 1, shop: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ shop: 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);