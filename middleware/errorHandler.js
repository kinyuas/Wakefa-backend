// middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error('❌ Server error:', err.message);

  if (err.name === 'CorsError') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation'
    });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};