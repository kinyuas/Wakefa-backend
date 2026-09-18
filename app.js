

const express = require('express');
const cors = require('cors');
const app = express();

// 1. FIRST: Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Enhanced CORS Configuration for serverless
const allowedOrigins = [
  'http://localhost:3000',
  // 'https://back2-khaki.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5002'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, serverless)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 204,
  maxAge: 86400
};

// 3. Apply CORS middleware
app.use(cors(corsOptions));

// 4. Handle OPTIONS preflight requests globally
app.options('*', cors(corsOptions));

// 5. Special handling for preflight requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    
    // Only set headers if origin is allowed
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400');
    }
    return res.status(204).send();
  }
  next();
});

// 6. Security Headers Middleware (optimized for serverless)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Only set Access-Control-Allow-Origin if origin is allowed
  if (!origin || allowedOrigins.indexOf(origin) !== -1) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Remove X-Powered-By
  res.removeHeader('X-Powered-By');
  
  next();
});

// 7. Import route files (serverless compatible)
const createRouter = () => {
  const router = express.Router();
  
  // Placeholder routes - replace with your actual routes
  router.get('/', (req, res) => {
    res.json({ message: 'Auth route placeholder' });
  });
  
  return router;
};

// Create routers
const authRoutes = createRouter();
const productRoutes = createRouter();
const transactionRoutes = createRouter();
const cashierRoutes = createRouter();
const shopRoutes = createRouter();
const expenseRoutes = createRouter();
const creditRoutes = createRouter();

// 8. API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/cashiers', cashierRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/credits', creditRoutes);

// 9. Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    apiVersion: '1.0.0',
    serverless: true,
    platform: 'vercel',
    endpoints: [
      '/api/auth',
      '/api/products',
      '/api/transactions',
      '/api/cashiers',
      '/api/shops',
      '/api/expenses',
      '/api/credits'
    ]
  });
});

// 10. Simple root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Stanzo Shop Management API - Serverless Edition',
    version: '1.0.0',
    status: 'running',
    serverless: true,
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    documentation: {
      health: '/health',
      auth: '/api/auth',
      cors: {
        allowedOrigins: allowedOrigins,
        credentials: true
      }
    }
  });
});

// 11. 404 Handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    method: req.method,
    timestamp: new Date().toISOString(),
    serverless: true
  });
});

// 12. Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', {
    message: err.message,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    serverless: true
  });
  
  // Handle CORS errors
  if (err.message.includes('CORS') || err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({
      success: false,
      message: 'CORS Error: Cross-origin request not allowed',
      requestedOrigin: req.headers.origin,
      allowedOrigins: allowedOrigins,
      timestamp: new Date().toISOString(),
      serverless: true
    });
  }
  
  // Handle JWT/auth errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: err.message,
      serverless: true
    });
  }
  
  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: err.errors || err.message,
      serverless: true
    });
  }
  
  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? {
      name: err.name,
      message: err.message
    } : undefined,
    timestamp: new Date().toISOString(),
    serverless: true
  });
});

// Export for serverless
module.exports = app;