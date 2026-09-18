// server.js - Stanzo Shop Management System (slim entry point)
const express = require('express');
const crypto = require('crypto');
require('dotenv').config();

// ---------- Dependencies with fallbacks (offline/serverless-safe) ----------
let cors, helmet, morgan, rateLimit, compression;
try {
  cors = require('cors');
  helmet = require('helmet');
  morgan = require('morgan');
  rateLimit = require('express-rate-limit');
  compression = require('compression');
} catch (e) {
  console.warn('⚠️  Some dependencies missing — using fallbacks:', e.message);
  cors = () => (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
  helmet = () => (req, res, next) => next();
  morgan = () => (req, res, next) => next();
  rateLimit = () => () => (req, res, next) => next();
  compression = () => (req, res, next) => next();
}

const { connectDB } = require('./config/database');
const { ALLOWED_ORIGINS } = require('./config/constants');
const dbMiddleware = require('./middleware/dbMiddleware');
const { apiLimiter } = require('./middleware/rateLimiters');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ---------- Security headers ----------
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ---------- CORS ----------
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || process.env.NODE_ENV !== 'production') return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Total-Count', 'X-New-Token'],
  maxAge: 86400,
  optionsSuccessStatus: 204
}));

// ---------- Body parsing + compression ----------
app.use(compression({ level: 6, threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ---------- Request ID ----------
app.use((req, res, next) => {
  req.id = crypto.randomBytes(16).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ---------- Rate limiter (global) ----------
app.use('/api/', apiLimiter);

// ---------- DB middleware (function export) ----------
app.use('/api', dbMiddleware);

// ---------- Routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cashiers', require('./routes/cashiers'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/products', require('./routes/products'));
app.use('/api/shops', require('./routes/shops'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

// ---------- Health / Root ----------
app.get('/api/health', (req, res) => res.json({
  success: true,
  status: 'healthy',
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development'
}));

app.get('/api/test', (req, res) => res.json({
  success: true,
  message: 'API is working!',
  timestamp: new Date().toISOString()
}));

app.get('/', (req, res) => res.json({
  message: 'Stanzo Shop Management API',
  version: '5.0.0',
  endpoints: {
    auth: '/api/auth/*',
    cashiers: '/api/cashiers',
    transactions: '/api/transactions',
    products: '/api/products',
    shops: '/api/shops',
    expenses: '/api/expenses',
    reports: '/api/reports',
    admin: '/api/admin',
    health: '/api/health'
  }
}));

// ---------- 404 + error handlers ----------
app.use('/api/*', (req, res) => res.status(404).json({
  success: false,
  message: 'Endpoint not found'
}));
app.use(errorHandler);

// ---------- Startup ----------
if (require.main === module) {
  const PORT = process.env.PORT || 5002;

  (async () => {
    try {
      await connectDB();
      console.log('✅ Database connection established');
    } catch (err) {
      console.log('⚠️  DB will connect on first request:', err.message);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log('🚀 STANZO SHOP MANAGEMENT SERVER STARTED');
      console.log('='.repeat(60));
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌐 Local: http://localhost:${PORT}`);
      console.log(`📧 System email: kinyuastanzo6759@gmail.com`);
      console.log('🚫 BARCODE: REMOVED');
      console.log('📧 Duplicate email prevention: ENABLED (60s cooldown + rate limit)');
      console.log('='.repeat(60) + '\n');
    });
  })();
}

module.exports = app;