const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const productController = require('../controllers/productController');

// Existing routes
router.get('/', protect, productController.getAllProducts);
router.get('/active', protect, productController.getActiveProducts);
router.get('/low-stock', protect, productController.getLowStockProducts);
router.get('/shop/:shop', protect, productController.getProductsByShop);
router.get('/:id', protect, productController.getProduct);
router.post('/', protect, authorize('admin', 'manager'), productController.createProduct);
router.put('/:id', protect, authorize('admin', 'manager', 'cashier'), productController.updateProduct);
router.patch('/bulk-stock', protect, authorize('admin', 'manager', 'cashier'), productController.bulkUpdateStock);
router.delete('/:id', protect, authorize('admin', 'manager'), productController.deleteProduct);

// ✅ NEW: Barcode related routes
router.get('/search/barcode', protect, productController.searchByBarcode);
router.post('/:id/generate-barcode', protect, authorize('admin', 'manager'), productController.generateBarcode);
router.post('/bulk-generate-barcodes', protect, authorize('admin', 'manager'), productController.bulkGenerateBarcodes);
router.post('/:id/mark-printed', protect, authorize('admin', 'manager', 'cashier'), productController.markBarcodePrinted);

module.exports = router;