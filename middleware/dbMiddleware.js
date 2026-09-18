// middleware/dbMiddleware.js
const { connectDB } = require('../config/database');

// ✅ MUST export a single function — Express requires this
module.exports = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('❌ Database middleware error:', err.message);
    next();
  }
};