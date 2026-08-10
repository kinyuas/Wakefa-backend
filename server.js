// server.js - Stanzo Shop Management System
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const dayjs = require('dayjs');

// Import dependencies with fallbacks for serverless
let cors, helmet, morgan, rateLimit, compression;
try {
  cors = require('cors');
  helmet = require('helmet');
  morgan = require('morgan');
  rateLimit = require('express-rate-limit');
  compression = require('compression');
} catch (e) {
  console.warn('Some dependencies not installed, using fallbacks');
  // Simple CORS middleware as fallback
  cors = (options) => (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:3000',
      'https://front1-lvfitof14-stanzos-projects.vercel.app',
      'https://front1-hqoeqlxqg-stanzos-projects.vercel.app',
      'https://front1-bunkdw5st-stanzos-projects.vercel.app',
      'https://back2.vercel.app',
      'https://back2-git-main-stanzos-projects.vercel.app',
      'https://back2-7qq5a2p8l-stanzos-projects.vercel.app'
    ];
    
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
  helmet = () => (req, res, next) => next();
  morgan = () => (req, res, next) => next();
  rateLimit = () => (req, res, next) => next();
  compression = () => (req, res, next) => next();
}

require('dotenv').config();

const app = express();

// ==================== CORS CONFIGURATION ====================

const allowedOrigins = [
  // Local development
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  
  // Production domains
  'https://wadave-supermarket.com',
  'https://www.wadave-supermarket.com',
  'https://admin.wadave-supermarket.com',
  'https://pos.wadave-supermarket.com',
  'https://api.wadave-supermarket.com',
  
  // Vercel deployment domains
  'http://localhost:3000',
  'https://front1-lvfitof14-stanzos-projects.vercel.app',
  'https://front1-hqoeqlxqg-stanzos-projects.vercel.app',
  'https://front1-bunkdw5st-stanzos-projects.vercel.app',
  'https://back2.vercel.app',
  'https://back2-git-main-stanzos-projects.vercel.app',
  'https://back2-7qq5a2p8l-stanzos-projects.vercel.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: This origin is not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'X-Total-Count', 'X-New-Token'],
  maxAge: 86400,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ==================== SECURITY MIDDLEWARE ====================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(compression({ level: 6, threshold: 1024 }));

// Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID middleware
app.use((req, res, next) => {
  req.id = crypto.randomBytes(16).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Device detection
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  req.deviceType = /mobile/i.test(userAgent) ? 'mobile' : /tablet/i.test(userAgent) ? 'tablet' : 'desktop';
  req.platform = /android/i.test(userAgent) ? 'android' : /iphone|ipad|ipod/i.test(userAgent) ? 'ios' : 'unknown';
  next();
});

// ==================== DATABASE CONNECTION MANAGER ====================

let cachedConnection = null;
let cachedModels = null;

const connectDB = async () => {
  if (cachedConnection && cachedConnection.readyState === 1) {
    console.log('✅ Using existing database connection');
    return cachedConnection;
  }

  try {
    if (cachedConnection) {
      await mongoose.disconnect();
    }

    const connectionString = process.env.MONGODB_URI || 'mongodb+srv://kinyuastanzo6759_db_user:Y9P9gdROuewvBmq8@cluster0.4rtcx4y.mongodb.net/kianjirusupermarket_db?retryWrites=true&w=majority';
    
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      maxPoolSize: 5,
      minPoolSize: 1,
      maxIdleTimeMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      bufferCommands: false
    };

    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(connectionString, options);
    cachedConnection = mongoose.connection;
    cachedModels = createModels(cachedConnection);
    console.log('✅ Database connection established');
    
    return cachedConnection;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    cachedConnection = null;
    cachedModels = createModels(null);
    return null;
  }
};

// ==================== SCHEMA DEFINITIONS ====================

const createModels = (connection) => {
  if (!connection) {
    console.log('⚠️ Creating mock models (no DB connection)');
    return {
      Product: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), findByIdAndDelete: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), deleteMany: () => Promise.resolve({ deletedCount: 0 }), updateMany: () => Promise.resolve({ modifiedCount: 0 }) },
      Shop: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), findByIdAndDelete: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), deleteMany: () => Promise.resolve({ deletedCount: 0 }), updateMany: () => Promise.resolve({ modifiedCount: 0 }), aggregate: () => Promise.resolve([]) },
      Cashier: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), findByIdAndDelete: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), deleteMany: () => Promise.resolve({ deletedCount: 0 }), updateMany: () => Promise.resolve({ modifiedCount: 0 }) },
      Expense: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), findByIdAndDelete: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), deleteMany: () => Promise.resolve({ deletedCount: 0 }), updateMany: () => Promise.resolve({ modifiedCount: 0 }) },
      Transaction: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), findByIdAndDelete: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0), deleteMany: () => Promise.resolve({ deletedCount: 0 }), updateMany: () => Promise.resolve({ modifiedCount: 0 }), aggregate: () => Promise.resolve([]) },
      User: { find: () => Promise.resolve([]), findOne: () => Promise.resolve(null), findById: () => Promise.resolve(null), findByIdAndUpdate: () => Promise.resolve(null), countDocuments: () => Promise.resolve(0) },
      SecureCode: { findOne: () => Promise.resolve(null), findOneAndUpdate: () => Promise.resolve(null), deleteOne: () => Promise.resolve({ deletedCount: 0 }) },
      TokenBlacklist: { findOne: () => Promise.resolve(null), findOneAndUpdate: () => Promise.resolve(null), save: () => Promise.resolve({}) },
      CashierSession: { findOneAndUpdate: () => Promise.resolve(null), find: () => Promise.resolve([]) },
      AuditLog: { save: () => Promise.resolve({}) },
      CashierAnalytics: { findOne: () => Promise.resolve(null), deleteMany: () => Promise.resolve({ deletedCount: 0 }) }
    };
  }

  // Product Schema (BARCODE REMOVED)
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Uncategorized' },
    buyingPrice: { type: Number, default: 0 },
    minSellingPrice: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    minStockLevel: { type: Number, default: 5 },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    description: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Shop Schema
  const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: String,
    manager: String,
    contact: String,
    email: String,
    type: { type: String, default: 'retail' },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Cashier Schema
  const cashierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    password: String,
    role: { type: String, default: 'cashier' },
    status: { type: String, default: 'active' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: String,
    lastLogin: Date,
    lastLogout: Date,
    loginCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Expense Schema
  const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'General' },
    date: { type: Date, default: Date.now },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    recordedBy: String,
    paymentMethod: { type: String, default: 'cash' },
    referenceNumber: String,
    notes: String,
    status: { type: String, default: 'completed' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Transaction Schema (BARCODE REMOVED)
  const transactionSchema = new mongoose.Schema({
    transactionNumber: { type: String, required: true, unique: true },
    totalAmount: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    items: [{
      productName: String,
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number, default: 1 },
      price: Number,
      totalPrice: Number,
      buyingPrice: Number,
      cost: Number,
      profit: Number,
      profitMargin: Number
    }],
    itemsCount: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    paymentMethodDetailed: {
      cash: { type: Number, default: 0 },
      mpesa: { type: Number, default: 0 },
      bank: { type: Number, default: 0 },
      mpesa_bank: { type: Number, default: 0 },
      card: { type: Number, default: 0 }
    },
    customerName: { type: String, default: 'Walk-in Customer' },
    customerPhone: String,
    cashierName: String,
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier' },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    saleDate: { type: Date, default: Date.now },
    status: { type: String, default: 'completed' },
    paymentSplit: {
      cash: { type: Number, default: 0 },
      mpesa_bank: { type: Number, default: 0 }
    },
    receiptNumber: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // User Schema
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String },
    role: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    loginCount: { type: Number, default: 0 },
    passwordResetToken: String,
    passwordResetExpires: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Secure Code Schema
  const secureCodeSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false }
  });

  // Token Blacklist Schema
  const tokenBlacklistSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userId: mongoose.Schema.Types.ObjectId,
    reason: String,
    createdAt: { type: Date, default: Date.now }
  });

  // Cashier Session Schema
  const cashierSessionSchema = new mongoose.Schema({
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier', required: true },
    token: { type: String, required: true },
    deviceInfo: String,
    ipAddress: String,
    loggedInAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    status: { type: String, default: 'active' }
  });

  // Audit Log Schema
  const auditLogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    userId: mongoose.Schema.Types.ObjectId,
    userEmail: String,
    userRole: String,
    entityType: String,
    entityId: mongoose.Schema.Types.ObjectId,
    changes: Object,
    ipAddress: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
  });

  // Cashier Analytics Schema
  const cashierAnalyticsSchema = new mongoose.Schema({
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier', required: true, index: true },
    period: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    metrics: {
      totalRevenue: { type: Number, default: 0 },
      totalCost: { type: Number, default: 0 },
      totalProfit: { type: Number, default: 0 },
      totalTransactions: { type: Number, default: 0 },
      totalItemsSold: { type: Number, default: 0 },
      profitMargin: { type: Number, default: 0 },
      performanceScore: { type: Number, default: 0 },
      averageTransactionValue: { type: Number, default: 0 },
      paymentMethods: {
        cash: { type: Number, default: 0 },
        mpesa_bank: { type: Number, default: 0 }
      },
      digitalPaymentRatio: { type: Number, default: 0 },
      cashPaymentRatio: { type: Number, default: 0 }
    },
    dailyBreakdown: [{
      date: Date,
      revenue: Number,
      transactions: Number,
      profit: Number,
      cash: Number,
      mpesa_bank: Number
    }],
    topProducts: [{
      productName: String,
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantitySold: Number,
      revenue: Number,
      profit: Number
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Indexes
  secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  cashierSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  cashierSessionSchema.index({ cashierId: 1 });
  auditLogSchema.index({ timestamp: -1 });
  auditLogSchema.index({ userId: 1, timestamp: -1 });
  cashierAnalyticsSchema.index({ cashierId: 1, period: 1, startDate: -1, endDate: -1 });
  transactionSchema.index({ saleDate: -1 });
  transactionSchema.index({ shop: 1 });
  transactionSchema.index({ cashierId: 1 });
  transactionSchema.index({ status: 1 });
  productSchema.index({ isActive: 1 });
  productSchema.index({ shop: 1 });
  productSchema.index({ name: 1, shop: 1 });

  return {
    Product: connection.models.Product || connection.model('Product', productSchema),
    Shop: connection.models.Shop || connection.model('Shop', shopSchema),
    Cashier: connection.models.Cashier || connection.model('Cashier', cashierSchema),
    Expense: connection.models.Expense || connection.model('Expense', expenseSchema),
    Transaction: connection.models.Transaction || connection.model('Transaction', transactionSchema),
    User: connection.models.User || connection.model('User', userSchema),
    SecureCode: connection.models.SecureCode || connection.model('SecureCode', secureCodeSchema),
    TokenBlacklist: connection.models.TokenBlacklist || connection.model('TokenBlacklist', tokenBlacklistSchema),
    CashierSession: connection.models.CashierSession || connection.model('CashierSession', cashierSessionSchema),
    AuditLog: connection.models.AuditLog || connection.model('AuditLog', auditLogSchema),
    CashierAnalytics: connection.models.CashierAnalytics || connection.model('CashierAnalytics', cashierAnalyticsSchema)
  };
};

// ==================== DATABASE MIDDLEWARE ====================

app.use(async (req, res, next) => {
  try {
    if (!cachedModels) {
      await connectDB();
    }
    req.models = cachedModels || createModels(null);
    next();
  } catch (error) {
    console.error('❌ Database middleware error:', error);
    req.models = createModels(null);
    next();
  }
});

// ==================== TOKEN MANAGEMENT ====================

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '8h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

class TokenManager {
  static generateToken(payload, isRefresh = false) {
    const secret = isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET;
    const expiresIn = isRefresh ? REFRESH_TOKEN_EXPIRY : TOKEN_EXPIRY;
    
    return jwt.sign(
      {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomBytes(16).toString('hex'),
        sessionId: crypto.randomBytes(16).toString('hex'),
        lastActivity: Date.now()
      },
      secret,
      { expiresIn }
    );
  }

  static verifyToken(token, isRefresh = false) {
    const secret = isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET;
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      return null;
    }
  }

  static async blacklistToken(token, userId, reason = 'logout') {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return false;

      const blacklistedToken = new cachedModels.TokenBlacklist({
        token,
        expiresAt: new Date(decoded.exp * 1000),
        userId,
        reason
      });
      
      await blacklistedToken.save();
      return true;
    } catch (error) {
      console.error('Error blacklisting token:', error);
      return false;
    }
  }

  static async isTokenBlacklisted(token) {
    try {
      const blacklisted = await cachedModels.TokenBlacklist.findOne({ token });
      return !!blacklisted;
    } catch (error) {
      return false;
    }
  }

  static async checkSessionActivity(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return { valid: false, reason: 'invalid_token' };

      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) return { valid: false, reason: 'blacklisted' };

      const lastActivity = decoded.lastActivity || decoded.iat * 1000;
      const inactivityPeriod = Date.now() - lastActivity;
      const INACTIVITY_LIMIT = 60 * 60 * 1000;

      if (inactivityPeriod > INACTIVITY_LIMIT) {
        await this.blacklistToken(token, decoded.userId, 'inactivity');
        return { valid: false, reason: 'inactivity' };
      }

      return { valid: true, decoded };
    } catch (error) {
      console.error('Error checking session activity:', error);
      return { valid: false, reason: 'error' };
    }
  }

  static updateLastActivity(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return null;

      const newToken = jwt.sign(
        {
          ...decoded,
          lastActivity: Date.now(),
          iat: decoded.iat,
          exp: decoded.exp
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return newToken;
    } catch (error) {
      console.error('Error updating last activity:', error);
      return null;
    }
  }
}

// ==================== EMAIL TRANSPORTER ====================

let emailTransporter = null;

const getEmailTransporter = () => {
  if (!emailTransporter) {
    try {
      const emailUser = process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com';
      const emailPass = process.env.EMAIL_PASSWORD || 'amzimbywdjplkdty';

      console.log('📧 Configuring email transporter...');
      
      emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: emailUser,
          pass: emailPass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      console.log('✅ Email transporter created successfully');
    } catch (error) {
      console.error('❌ Error creating email transporter:', error.message);
      emailTransporter = {
        sendMail: async (mailOptions) => {
          console.log('📧 [MOCK] Email would be sent:', {
            to: mailOptions.to,
            subject: mailOptions.subject
          });
          
          if (mailOptions.text && mailOptions.text.includes('secure code')) {
            const codeMatch = mailOptions.text.match(/\d{6}/);
            if (codeMatch) {
              console.log(`📧 [DEVELOPMENT] Your secure code is: ${codeMatch[0]}`);
            }
          }
          
          return { messageId: 'mock-message-id-' + Date.now() };
        }
      };
    }
  }
  return emailTransporter;
};

// ==================== AUDIT LOGGING ====================

const auditLogger = {
  log: async (action, user, entityType, entityId, changes, req) => {
    try {
      const logEntry = new cachedModels.AuditLog({
        action,
        userId: user?._id,
        userEmail: user?.email,
        userRole: user?.role,
        entityType,
        entityId,
        changes,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get('user-agent')
      });
      
      await logEntry.save();
    } catch (error) {
      console.error('❌ Error saving audit log:', error);
    }
  },
  logLogin: async (user, req) => {
    await auditLogger.log('LOGIN', user, 'User', user._id, null, req);
  },
  logLogout: async (user, req) => {
    await auditLogger.log('LOGOUT', user, 'User', user._id, null, req);
  },
  logTransaction: async (user, transactionId, changes, req) => {
    await auditLogger.log('TRANSACTION_CREATE', user, 'Transaction', transactionId, changes, req);
  },
  logProductUpdate: async (user, productId, changes, req) => {
    await auditLogger.log('PRODUCT_UPDATE', user, 'Product', productId, changes, req);
  }
};

// ==================== CALCULATION UTILITIES ====================

const CalculationUtils = {
  safeNumber: (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === '') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  },
  formatCurrency: (amount) => {
    const value = CalculationUtils.safeNumber(amount);
    return `KES ${value.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  },
  calculateProfit: (revenue, cost) => {
    return CalculationUtils.safeNumber(revenue) - CalculationUtils.safeNumber(cost);
  },
  calculateProfitMargin: (revenue, profit) => {
    const safeRevenue = CalculationUtils.safeNumber(revenue);
    const safeProfit = CalculationUtils.safeNumber(profit);
    return safeRevenue > 0 ? (safeProfit / safeRevenue) * 100 : 0;
  },
  calculateCOGS: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      return sum + CalculationUtils.safeNumber(transaction.cost);
    }, 0);
  },
  calculateRevenue: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      return sum + CalculationUtils.safeNumber(transaction.totalAmount);
    }, 0);
  },
  calculatePaymentComposition: (transactions) => {
    const composition = {
      cash: 0,
      mpesa_bank: 0,
      total: 0,
      transactions: transactions.length,
      cashPercentage: 0,
      mpesaBankPercentage: 0
    };

    transactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        composition.cash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        composition.mpesa_bank += CalculationUtils.safeNumber(transaction.paymentSplit.mpesa_bank);
      } else {
        const amount = CalculationUtils.safeNumber(transaction.totalAmount);
        if (transaction.paymentMethod === 'cash') {
          composition.cash += amount;
        } else if (['mpesa', 'bank', 'mpesa_bank', 'card'].includes(transaction.paymentMethod)) {
          composition.mpesa_bank += amount;
        } else {
          composition.cash += amount;
        }
      }
    });

    composition.total = composition.cash + composition.mpesa_bank;
    composition.cashPercentage = composition.total > 0 
      ? (composition.cash / composition.total) * 100 
      : 0;
    composition.mpesaBankPercentage = composition.total > 0 
      ? (composition.mpesa_bank / composition.total) * 100 
      : 0;

    return composition;
  },
  calculatePerformanceMetrics: (transactions, type = 'cashier') => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalTransactions: 0,
        totalItemsSold: 0,
        profitMargin: 0,
        performanceScore: 0,
        paymentMethods: { cash: 0, mpesa_bank: 0 },
        digitalPaymentRatio: 0,
        cashPaymentRatio: 0,
        averageTransactionValue: 0,
        totalCash: 0,
        totalBankMpesa: 0,
        cashPercentage: 0,
        mpesaBankPercentage: 0
      };
    }

    const totalRevenue = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.totalAmount), 0);
    
    const totalCost = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.cost || 0), 0);
    
    const totalProfit = totalRevenue - totalCost;
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.itemsCount || 0), 0);
    
    const profitMargin = CalculationUtils.calculateProfitMargin(totalRevenue, totalProfit);
    const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const paymentMethods = { cash: 0, mpesa_bank: 0 };
    transactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        paymentMethods.cash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        paymentMethods.mpesa_bank += CalculationUtils.safeNumber(transaction.paymentSplit.mpesa_bank);
      } else {
        const amount = CalculationUtils.safeNumber(transaction.totalAmount);
        if (transaction.paymentMethod === 'cash') {
          paymentMethods.cash += amount;
        } else if (['mpesa', 'bank', 'mpesa_bank', 'card'].includes(transaction.paymentMethod)) {
          paymentMethods.mpesa_bank += amount;
        } else {
          paymentMethods.cash += amount;
        }
      }
    });

    const digitalPaymentRatio = totalRevenue > 0 ? (paymentMethods.mpesa_bank / totalRevenue) * 100 : 0;
    const cashPaymentRatio = totalRevenue > 0 ? (paymentMethods.cash / totalRevenue) * 100 : 0;

    let performanceScore = 0;
    performanceScore += Math.min(40, (totalRevenue / 10000) * 40);
    performanceScore += Math.min(30, (totalTransactions / 50) * 30);
    performanceScore += Math.min(15, digitalPaymentRatio * 0.15);
    performanceScore += Math.min(15, (Math.max(0, profitMargin) / 50) * 15);
    performanceScore = Math.round(Math.min(100, performanceScore));

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      totalTransactions,
      totalItemsSold,
      profitMargin,
      performanceScore,
      paymentMethods,
      digitalPaymentRatio,
      cashPaymentRatio,
      averageTransactionValue,
      totalCash: paymentMethods.cash,
      totalBankMpesa: paymentMethods.mpesa_bank,
      cashPercentage: cashPaymentRatio,
      mpesaBankPercentage: digitalPaymentRatio
    };
  },
  generateDailyBreakdown: (transactions) => {
    const dailyMap = new Map();

    transactions.forEach(transaction => {
      const saleDate = transaction.saleDate || transaction.createdAt;
      const dateKey = new Date(saleDate).toISOString().split('T')[0];
      
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: new Date(dateKey),
          revenue: 0,
          transactions: 0,
          profit: 0,
          cash: 0,
          mpesa_bank: 0
        });
      }
      
      const dayData = dailyMap.get(dateKey);
      dayData.revenue += CalculationUtils.safeNumber(transaction.totalAmount);
      dayData.transactions += 1;
      dayData.profit += CalculationUtils.safeNumber(transaction.profit || 0);
      
      if (transaction.paymentSplit) {
        dayData.cash += CalculationUtils.safeNumber(transaction.paymentSplit.cash || 0);
        dayData.mpesa_bank += CalculationUtils.safeNumber(transaction.paymentSplit.mpesa_bank || 0);
      } else {
        const amount = CalculationUtils.safeNumber(transaction.totalAmount);
        if (transaction.paymentMethod === 'cash') {
          dayData.cash += amount;
        } else if (['mpesa', 'bank', 'mpesa_bank', 'card'].includes(transaction.paymentMethod)) {
          dayData.mpesa_bank += amount;
        } else {
          dayData.cash += amount;
        }
      }
    });

    return Array.from(dailyMap.values()).sort((a, b) => a.date - b.date);
  },
  generateTopProducts: (transactions, limit = 10) => {
    const productMap = new Map();

    transactions.forEach(transaction => {
      transaction.items?.forEach(item => {
        const productKey = item.productId?.toString() || item.productName;
        if (!productMap.has(productKey)) {
          productMap.set(productKey, {
            productName: item.productName || 'Unknown Product',
            productId: item.productId,
            quantitySold: 0,
            revenue: 0,
            profit: 0
          });
        }
        
        const productData = productMap.get(productKey);
        productData.quantitySold += CalculationUtils.safeNumber(item.quantity || 1);
        productData.revenue += CalculationUtils.safeNumber(item.totalPrice || 0);
        productData.profit += CalculationUtils.safeNumber(item.profit || 0);
      });
    });

    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }
};

// ==================== ANALYTICS SERVICE ====================

class AnalyticsService {
  static async getCashierPerformanceSummary(cashierId, params = {}) {
    try {
      const models = cachedModels;
      
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate = new Date().toISOString().split('T')[0],
        period = '30d'
      } = params;

      const cachedAnalytics = await models.CashierAnalytics.findOne({
        cashierId,
        period: period,
        startDate: { $gte: new Date(startDate) },
        endDate: { $lte: new Date(endDate) }
      })
      .populate('cashierId', 'name email shopName')
      .lean();

      let analyticsData;
      
      if (cachedAnalytics) {
        console.log('📊 Using cached cashier analytics');
        analyticsData = {
          summary: {
            totalRevenue: cachedAnalytics.metrics.totalRevenue,
            totalSales: cachedAnalytics.metrics.totalTransactions,
            totalProfit: cachedAnalytics.metrics.totalProfit,
            profitMargin: cachedAnalytics.metrics.profitMargin,
            performanceScore: cachedAnalytics.metrics.performanceScore,
            totalItemsSold: cachedAnalytics.metrics.totalItemsSold,
            totalCash: cachedAnalytics.metrics.paymentMethods?.cash || 0,
            totalBankMpesa: cachedAnalytics.metrics.paymentMethods?.mpesa_bank || 0,
            cashPercentage: cachedAnalytics.metrics.cashPaymentRatio,
            mpesaBankPercentage: cachedAnalytics.metrics.digitalPaymentRatio
          },
          cashier: cachedAnalytics.cashierId
        };
      } else {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const transactions = await models.Transaction.find({
          cashierId: cashierId,
          status: 'completed',
          saleDate: { $gte: thirtyDaysAgo, $lte: today }
        }).lean();

        const metrics = CalculationUtils.calculatePerformanceMetrics(transactions, 'cashier');
        
        analyticsData = {
          summary: {
            totalRevenue: metrics.totalRevenue,
            totalSales: metrics.totalTransactions,
            totalProfit: metrics.totalProfit,
            profitMargin: metrics.profitMargin,
            performanceScore: metrics.performanceScore,
            totalItemsSold: metrics.totalItemsSold,
            totalCash: metrics.totalCash,
            totalBankMpesa: metrics.totalBankMpesa,
            cashPercentage: metrics.cashPercentage,
            mpesaBankPercentage: metrics.mpesaBankPercentage
          },
          cashier: await models.Cashier.findById(cashierId).lean()
        };
      }

      return analyticsData;

    } catch (error) {
      console.error('❌ Error getting cashier performance summary:', error);
      throw error;
    }
  }

  static async getCashierTransactions(cashierId, params = {}) {
    try {
      const models = cachedModels;
      
      const {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate = new Date().toISOString().split('T')[0],
        dataType = 'withItems'
      } = params;

      console.log(`💳 Fetching cashier transactions for: ${cashierId}`);

      const transactions = await models.Transaction.find({
        cashierId: cashierId,
        status: 'completed',
        saleDate: { 
          $gte: new Date(startDate), 
          $lte: new Date(endDate) 
        }
      })
      .populate('shop', 'name')
      .populate('cashierId', 'name email')
      .sort({ saleDate: -1 })
      .lean();

      const cashier = await models.Cashier.findById(cashierId)
        .populate('shopId', 'name location')
        .lean();

      if (!cashier) {
        throw new Error('Cashier not found');
      }

      const metrics = CalculationUtils.calculatePerformanceMetrics(transactions, 'cashier');

      return {
        transactions: dataType === 'withItems' ? transactions : [],
        salesWithProfit: transactions.map(t => ({
          ...t,
          profit: t.profit || 0,
          profitMargin: t.profitMargin || 0
        })),
        summary: {
          totalRevenue: metrics.totalRevenue,
          totalSales: metrics.totalTransactions,
          totalProfit: metrics.totalProfit,
          netProfit: metrics.totalProfit,
          profitMargin: metrics.profitMargin,
          totalItemsSold: metrics.totalItemsSold,
          performanceScore: metrics.performanceScore,
          paymentComposition: {
            cash: metrics.totalCash,
            mpesa_bank: metrics.totalBankMpesa,
            cashPercentage: metrics.cashPercentage,
            mpesaBankPercentage: metrics.mpesaBankPercentage,
            cashTransactions: transactions.filter(t => 
              t.paymentMethod === 'cash' || (t.paymentSplit && t.paymentSplit.cash > 0)
            ).length,
            mpesaBankTransactions: transactions.filter(t => 
              ['mpesa', 'bank', 'mpesa_bank', 'card'].includes(t.paymentMethod) ||
              (t.paymentSplit && t.paymentSplit.mpesa_bank > 0)
            ).length
          },
          dataSource: 'server'
        },
        cashier: {
          _id: cashier._id,
          name: cashier.name,
          email: cashier.email,
          phone: cashier.phone,
          status: cashier.status,
          shopId: cashier.shopId?._id,
          shopName: cashier.shopId?.name || cashier.shopName,
          shopLocation: cashier.shopId?.location
        }
      };

    } catch (error) {
      console.error('❌ Error getting cashier transactions:', error);
      throw error;
    }
  }
}

// ==================== AUTH ROUTES ====================

// Activity tracking endpoint
app.post('/api/auth/activity', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No token provided'
      });
    }

    const isBlacklisted = await TokenManager.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Session expired',
        reason: 'blacklisted',
        code: 'SESSION_EXPIRED'
      });
    }

    const decoded = TokenManager.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        reason: 'invalid_token',
        code: 'SESSION_EXPIRED'
      });
    }

    const lastActivity = decoded.lastActivity || decoded.iat * 1000;
    const inactivityPeriod = Date.now() - lastActivity;
    const INACTIVITY_LIMIT = 60 * 60 * 1000;

    if (inactivityPeriod > INACTIVITY_LIMIT) {
      await TokenManager.blacklistToken(token, decoded.userId, 'inactivity');
      
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity',
        reason: 'inactivity',
        code: 'SESSION_EXPIRED'
      });
    }

    if (decoded.role === 'cashier' && req.models && req.models.CashierSession) {
      try {
        await req.models.CashierSession.findOneAndUpdate(
          { cashierId: decoded.userId, status: 'active' },
          { lastActivity: new Date() }
        );
      } catch (sessionError) {
        console.error('Error updating session:', sessionError);
      }
    }

    const newToken = TokenManager.generateToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      lastActivity: Date.now()
    });

    res.json({
      success: true,
      message: 'Activity recorded',
      token: newToken
    });

  } catch (error) {
    console.error('❌ Activity tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record activity'
    });
  }
});

// Validate session endpoint
app.post('/api/auth/validate-session', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    const isBlacklisted = await TokenManager.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Session has been terminated',
        reason: 'blacklisted',
        code: 'SESSION_EXPIRED'
      });
    }

    const decoded = TokenManager.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        reason: 'invalid_token',
        code: 'SESSION_EXPIRED'
      });
    }

    const lastActivity = decoded.lastActivity || decoded.iat * 1000;
    const inactivityPeriod = Date.now() - lastActivity;
    const INACTIVITY_LIMIT = 60 * 60 * 1000;

    if (inactivityPeriod > INACTIVITY_LIMIT) {
      await TokenManager.blacklistToken(token, decoded.userId, 'inactivity');
      
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity',
        reason: 'inactivity',
        code: 'SESSION_EXPIRED'
      });
    }

    let user = null;
    
    if (!req.models) {
      req.models = createModels(null);
    }
    
    try {
      if (decoded.role === 'admin') {
        user = await req.models.User?.findById(decoded.userId);
      } else if (decoded.role === 'cashier') {
        user = await req.models.Cashier?.findById(decoded.userId);
      }
    } catch (dbError) {
      console.error('Database error in validate-session:', dbError);
    }

    if (!user) {
      return res.json({
        success: true,
        message: 'Session is valid (offline mode)',
        user: {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name || decoded.email,
          role: decoded.role,
          status: 'active'
        },
        offlineMode: true
      });
    }

    let userStatus = 'active';
    if (user) {
      userStatus = user.status || (user.isActive !== undefined ? (user.isActive ? 'active' : 'inactive') : 'active');
    }
    
    if (userStatus !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive',
        reason: 'inactive_account',
        code: 'SESSION_EXPIRED'
      });
    }

    res.json({
      success: true,
      message: 'Session is valid',
      user: {
        id: user._id || decoded.userId,
        email: user.email || decoded.email,
        name: user.name || decoded.name || decoded.email,
        role: user.role || decoded.role,
        status: userStatus
      }
    });

  } catch (error) {
    console.error('❌ Session validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.decode(token);
      
      if (decoded?.userId && req.models?.CashierSession) {
        await TokenManager.blacklistToken(token, decoded.userId, 'logout');
        
        await req.models.CashierSession.findOneAndUpdate(
          { cashierId: decoded.userId, token: token },
          { status: 'logged_out' }
        );
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// Get active sessions
app.get('/api/auth/sessions', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const sessions = await req.models.CashierSession.find({
      cashierId: userId,
      status: 'active'
    }).sort({ loggedInAt: -1 });

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sessions'
    });
  }
});

// Terminate session
app.post('/api/auth/sessions/terminate', async (req, res) => {
  try {
    const { token, userId } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token required'
      });
    }

    await TokenManager.blacklistToken(token, userId, 'terminated');

    if (req.models?.CashierSession) {
      await req.models.CashierSession.findOneAndUpdate(
        { token: token },
        { status: 'terminated' }
      );
    }

    res.json({
      success: true,
      message: 'Session terminated successfully'
    });
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to terminate session'
    });
  }
});

// Generate secure code helper
const generateSecureCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send secure code email
const sendSecureCodeEmail = async (email, secureCode) => {
  try {
    const transporter = getEmailTransporter();
    
    console.log(`📧 Preparing to send secure code to: ${email}`);
    
    const mailOptions = {
      from: {
        name: 'Stanzo Shop Management',
        address: process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com'
      },
      to: email,
      subject: 'Your Secure Login Code - Stanzo Shop Management',
      text: `Hello,\n\nYour secure login code is: ${secureCode}\n\nThis code will expire in 15 minutes.\n\nBest regards,\nStanzo Shop Management Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Stanzo Shop Management</h2>
          <p>Hello,</p>
          <div style="background: #f4f4f4; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 16px; font-weight: bold;">Your secure login code is:</p>
            <p style="font-size: 32px; font-weight: bold; color: #2c5282; margin: 10px 0;">${secureCode}</p>
          </div>
          <p style="color: #666;">This code will expire in 15 minutes.</p>
          <p style="color: #999; font-size: 12px;">Best regards,<br>Stanzo Shop Management Team</p>
        </div>
      `
    };

    console.log('📧 Sending email...');
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully:', info.messageId);
    return true;

  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.log(`📧 [DEVELOPMENT MODE] Your secure code is: ${secureCode}`);
    return false;
  }
};

// Request secure code
app.post('/api/auth/request-code',
  [
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email address'
        });
      }
      
      const { email } = req.body;
      const { models } = req;
      console.log('📧 Requesting secure code for:', email);

      const user = await models.User.findOne({ email }) || 
                   await models.Cashier.findOne({ email });

      if (!user) {
        console.log('❌ No user found with email:', email);
        return res.status(404).json({
          success: false,
          message: 'No account found with this email address'
        });
      }

      const secureCode = generateSecureCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      const hashedCode = await bcrypt.hash(secureCode, 10);
      
      await models.SecureCode.findOneAndUpdate(
        { email },
        {
          code: hashedCode,
          expiresAt,
          attempts: 0,
          used: false
        },
        { upsert: true, new: true }
      );

      console.log(`📧 Generated secure code for ${email}: ${secureCode}`);
      
      const emailSent = await sendSecureCodeEmail(email, secureCode);
      
      if (!emailSent && process.env.NODE_ENV === 'production') {
        return res.status(500).json({
          success: false,
          message: 'Failed to send email. Please try again later.'
        });
      }

      if (!emailSent) {
        console.log(`📧 [DEV] Secure code for ${email}: ${secureCode}`);
        
        return res.json({
          success: true,
          message: 'Secure code generated (check console for development)',
          developmentMode: true,
          expiresIn: 15
        });
      }

      res.json({
        success: true,
        message: 'Secure code sent to your email',
        expiresIn: 15
      });

    } catch (error) {
      console.error('❌ Error requesting secure code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Verify secure code
app.post('/api/auth/verify-code',
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid input data'
        });
      }

      const { email, code } = req.body;
      const { models } = req;
      console.log('🔐 Secure code verification for:', email);

      const secureCode = await models.SecureCode.findOne({ email });
      if (!secureCode) {
        return res.status(404).json({
          success: false,
          message: 'No secure code found for this email. Please request a new code.'
        });
      }

      if (new Date() > secureCode.expiresAt) {
        await models.SecureCode.deleteOne({ email });
        return res.status(400).json({
          success: false,
          message: 'Secure code has expired. Please request a new code.'
        });
      }

      if (secureCode.used) {
        return res.status(400).json({
          success: false,
          message: 'Secure code has already been used. Please request a new code.'
        });
      }

      if (secureCode.attempts >= 5) {
        await models.SecureCode.deleteOne({ email });
        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts. Please request a new code.'
        });
      }

      const isValidCode = await bcrypt.compare(code, secureCode.code);
      if (!isValidCode) {
        secureCode.attempts += 1;
        await secureCode.save();
        
        return res.status(400).json({
          success: false,
          message: 'Invalid secure code',
          attemptsRemaining: 5 - secureCode.attempts
        });
      }

      secureCode.used = true;
      await secureCode.save();

      const user = await models.User.findOne({ email }) || 
                   await models.Cashier.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found'
        });
      }

      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      await user.save();

      const tokenPayload = {
        userId: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      };

      const accessToken = TokenManager.generateToken(tokenPayload);
      const refreshToken = TokenManager.generateToken(tokenPayload, true);

      const userData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount
      };

      if (user.role === 'cashier' && user.shopId) {
        userData.shopId = user.shopId;
        userData.shopName = user.shopName;
      }

      await auditLogger.logLogin(user, req);

      console.log('✅ Secure code verification successful for:', email);

      res.json({
        success: true,
        user: userData,
        token: accessToken,
        refreshToken: refreshToken,
        message: 'Login successful'
      });

    } catch (error) {
      console.error('❌ Error verifying secure code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify code. Please try again.'
      });
    }
  }
);

// Cashier login
app.post('/api/auth/cashier/login', async (req, res) => {
  try {
    console.log('🔐 Cashier login attempt:', { 
      body: req.body,
      timestamp: new Date().toISOString() 
    });

    const { models } = req;
    
    const { email, password } = req.body;
    
    console.log('📝 Login credentials received:', { 
      email: email || 'not provided',
      hasPassword: !!password 
    });

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔍 Searching for cashier with email:', normalizedEmail);

    const cashier = await models.Cashier.findOne({ 
      email: normalizedEmail 
    }).populate('shopId', 'name location');

    if (!cashier) {
      console.log('❌ Cashier not found with email:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'Cashier account not found'
      });
    }

    console.log('✅ Cashier found:', {
      id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      status: cashier.status,
      shop: cashier.shopName
    });

    if (cashier.status !== 'active') {
      console.log('❌ Cashier account inactive:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Cashier account is inactive. Please contact administrator.'
      });
    }

    if (!cashier.password) {
      console.log('❌ Cashier has no password stored');
      return res.status(401).json({
        success: false,
        message: 'Password not configured. Please contact administrator.'
      });
    }

    let isPasswordValid = false;
    const hashedPassword = cashier.password;

    if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$')) {
      console.log('🔑 Using bcrypt verification');
      
      try {
        isPasswordValid = await bcrypt.compare(password, hashedPassword);
        console.log('🔑 Bcrypt comparison result:', isPasswordValid);
      } catch (bcryptError) {
        console.error('❌ Bcrypt comparison error:', bcryptError);
        isPasswordValid = false;
      }
    } else {
      console.log('🔑 Using plaintext verification (legacy)');
      isPasswordValid = (hashedPassword === password);
      
      if (isPasswordValid) {
        console.log('🔄 Upgrading plaintext password to bcrypt');
        try {
          const salt = await bcrypt.genSalt(12);
          cashier.password = await bcrypt.hash(password, salt);
          await cashier.save();
          console.log('✅ Password upgraded to bcrypt');
        } catch (hashError) {
          console.error('⚠️ Failed to upgrade password:', hashError);
        }
      }
    }

    console.log('🔑 Password validation result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Invalid password for cashier:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid password. Please try again.'
      });
    }

    cashier.lastLogin = new Date();
    cashier.loginCount = (cashier.loginCount || 0) + 1;
    await cashier.save();

    const tokenPayload = {
      userId: cashier._id,
      email: cashier.email,
      role: 'cashier',
      name: cashier.name,
      shopId: cashier.shopId?._id,
      shopName: cashier.shopId?.name || cashier.shopName
    };

    const accessToken = TokenManager.generateToken(tokenPayload);
    const refreshToken = TokenManager.generateToken(tokenPayload, true);

    try {
      const session = new models.CashierSession({
        cashierId: cashier._id,
        token: accessToken,
        deviceInfo: req.get('user-agent'),
        ipAddress: req.ip || req.connection.remoteAddress,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
      });
      await session.save();
    } catch (sessionError) {
      console.error('⚠️ Failed to create session:', sessionError);
    }

    const userData = {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone || '',
      role: 'cashier',
      status: cashier.status,
      lastLogin: cashier.lastLogin,
      loginCount: cashier.loginCount,
      shopId: cashier.shopId?._id || null,
      shopName: cashier.shopId?.name || cashier.shopName || null,
      shopLocation: cashier.shopId?.location || null,
      createdAt: cashier.createdAt
    };

    try {
      await auditLogger.logLogin(cashier, req);
    } catch (auditError) {
      console.error('⚠️ Failed to create audit log:', auditError);
    }

    console.log('✅ Login successful:', {
      id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      shop: cashier.shopName
    });

    res.json({
      success: true,
      user: userData,
      token: accessToken,
      refreshToken: refreshToken,
      message: 'Cashier login successful'
    });

  } catch (error) {
    console.error('❌ Cashier login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Refresh token
app.post('/api/auth/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const { models } = req;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const decoded = TokenManager.verifyToken(refreshToken, true);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    const user = await models.User.findById(decoded.userId) || 
                 await models.Cashier.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      shopId: user.shopId,
      shopName: user.shopName
    };

    const newAccessToken = TokenManager.generateToken(tokenPayload);
    const newRefreshToken = TokenManager.generateToken(tokenPayload, true);

    if (user.role === 'cashier') {
      await models.CashierSession.findOneAndUpdate(
        { cashierId: user._id, token: req.headers.authorization?.replace('Bearer ', '') },
        { 
          token: newAccessToken,
          lastActivity: new Date(),
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
        }
      );
    }

    res.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

// ==================== CASHIER ROUTES ====================

// Get all cashiers
app.get('/api/cashiers', async (req, res) => {
  try {
    const { models } = req;
    const { shopId, status, search, page = 1, limit = 20, withMetrics = 'false' } = req.query;
    
    console.log('📋 Fetching cashiers...', { shopId, status, search, page, limit, withMetrics });
    
    let filter = {};
    
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shopId: shopId },
        { shopName: { $regex: shopId, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [cashiers, total] = await Promise.all([
      models.Cashier.find(filter)
        .populate('shopId', 'name location')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      models.Cashier.countDocuments(filter)
    ]);
    
    console.log(`✅ Found ${cashiers.length} cashiers (total: ${total})`);
    
    let enhancedCashiers = cashiers;
    if (withMetrics === 'true') {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      enhancedCashiers = await Promise.all(cashiers.map(async (cashier) => {
        try {
          const transactions = await models.Transaction.find({
            cashierId: cashier._id,
            status: 'completed',
            saleDate: { $gte: thirtyDaysAgo, $lte: today }
          }).lean();
          
          const metrics = CalculationUtils.calculatePerformanceMetrics(transactions, 'cashier');
          
          return {
            ...cashier,
            metrics: {
              totalTransactions: metrics.totalTransactions,
              totalRevenue: metrics.totalRevenue,
              totalProfit: metrics.totalProfit,
              profitMargin: metrics.profitMargin,
              performanceScore: metrics.performanceScore,
              last30Days: {
                transactions: metrics.totalTransactions,
                revenue: metrics.totalRevenue,
                profit: metrics.totalProfit
              }
            }
          };
        } catch (error) {
          console.error(`❌ Error calculating metrics for cashier ${cashier._id}:`, error);
          return {
            ...cashier,
            metrics: {
              totalTransactions: 0,
              totalRevenue: 0,
              totalProfit: 0,
              profitMargin: 0,
              performanceScore: 0,
              last30Days: {
                transactions: 0,
                revenue: 0,
                profit: 0
              }
            }
          };
        }
      }));
    }
    
    res.json({
      success: true,
      data: enhancedCashiers,
      count: enhancedCashiers.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      message: 'Cashiers fetched successfully',
      ...(withMetrics === 'true' ? { withMetrics: true } : {})
    });
  } catch (error) {
    console.error('❌ Error fetching cashiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashiers',
      error: error.message
    });
  }
});

// Get cashier performance data
app.get('/api/cashiers/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      startDate, 
      endDate, 
      period = 'daily',
      dataType = 'withItems' 
    } = req.query;
    const { models } = req;

    console.log('📈 Fetching cashier performance...', { 
      id, 
      startDate, 
      endDate, 
      period, 
      dataType 
    });

    const cashier = await models.Cashier.findById(id)
      .populate('shopId', 'name location')
      .lean();
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    const today = new Date();
    let start = new Date(today);
    let end = today;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch(period) {
        case 'daily':
          start.setDate(start.getDate() - 1);
          break;
        case 'weekly':
          start.setDate(start.getDate() - 7);
          break;
        case 'monthly':
          start.setMonth(start.getMonth() - 1);
          break;
        case 'annually':
          start.setFullYear(start.getFullYear() - 1);
          break;
        default:
          start.setDate(start.getDate() - 1);
      }
    }
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const transactions = await models.Transaction.find({
      cashierId: id,
      status: 'completed',
      saleDate: { $gte: start, $lte: end }
    })
    .populate('shop', 'name')
    .populate('cashierId', 'name email')
    .sort({ saleDate: -1 })
    .lean();

    const metrics = CalculationUtils.calculatePerformanceMetrics(transactions, 'cashier');
    const dailyBreakdown = CalculationUtils.generateDailyBreakdown(transactions);
    const topProducts = CalculationUtils.generateTopProducts(transactions, 10);

    const response = {
      success: true,
      data: {
        cashier: {
          _id: cashier._id,
          name: cashier.name,
          email: cashier.email,
          phone: cashier.phone,
          status: cashier.status,
          shopId: cashier.shopId?._id,
          shopName: cashier.shopId?.name || cashier.shopName,
          shopLocation: cashier.shopId?.location,
          lastLogin: cashier.lastLogin,
          loginCount: cashier.loginCount,
          createdAt: cashier.createdAt,
          updatedAt: cashier.updatedAt
        },
        
        summary: {
          totalRevenue: metrics.totalRevenue,
          totalSales: metrics.totalTransactions,
          totalProfit: metrics.totalProfit,
          netProfit: metrics.totalProfit,
          profitMargin: metrics.profitMargin,
          totalItemsSold: metrics.totalItemsSold,
          performanceScore: metrics.performanceScore,
          totalCost: metrics.totalCost,
          
          paymentComposition: {
            cash: metrics.totalCash,
            mpesa_bank: metrics.totalBankMpesa,
            total: metrics.totalCash + metrics.totalBankMpesa,
            cashPercentage: metrics.cashPercentage,
            mpesaBankPercentage: metrics.mpesaBankPercentage,
            cashTransactions: transactions.filter(t => 
              t.paymentMethod === 'cash' || (t.paymentSplit && t.paymentSplit.cash > 0)
            ).length,
            mpesaBankTransactions: transactions.filter(t => 
              ['mpesa', 'bank', 'mpesa_bank', 'card'].includes(t.paymentMethod) ||
              (t.paymentSplit && t.paymentSplit.mpesa_bank > 0)
            ).length
          },
          
          averageTransactionValue: metrics.averageTransactionValue,
          digitalPaymentRatio: metrics.digitalPaymentRatio,
          dataSource: 'server'
        },
        
        transactions: dataType === 'withItems' ? transactions : [],
        salesWithProfit: transactions.map(t => ({
          ...t,
          profit: t.profit || 0,
          profitMargin: t.profitMargin || 0
        })),
        filteredTransactions: transactions,
        
        dailyPerformance: dailyBreakdown,
        topProducts: topProducts,
        recentTransactions: transactions.slice(0, 20),
        
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
          period: period
        }
      },
      message: 'Cashier performance data fetched successfully'
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Error fetching cashier performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier performance data',
      error: error.message
    });
  }
});

// Create cashier
app.post('/api/cashiers', async (req, res) => {
  try {
    const { models } = req;
    const cashierData = req.body;
    
    console.log('🆕 Creating cashier...', { 
      name: cashierData.name,
      email: cashierData.email 
    });

    const existingCashier = await models.Cashier.findOne({ 
      email: cashierData.email.toLowerCase().trim() 
    });
    
    if (existingCashier) {
      return res.status(409).json({
        success: false,
        message: 'Cashier with this email already exists'
      });
    }
    
    if (cashierData.password) {
      const salt = await bcrypt.genSalt(12);
      cashierData.password = await bcrypt.hash(cashierData.password, salt);
    }
    
    cashierData.role = 'cashier';
    cashierData.status = cashierData.status || 'active';
    cashierData.email = cashierData.email.toLowerCase().trim();
    
    if (cashierData.shopId) {
      const shop = await models.Shop.findById(cashierData.shopId);
      if (shop) {
        cashierData.shopName = shop.name;
      }
    }

    const cashier = new models.Cashier(cashierData);
    await cashier.save();
    
    await cashier.populate('shopId', 'name location');
    
    console.log('✅ Cashier created:', cashier._id);
    
    res.status(201).json({
      success: true,
      data: cashier,
      message: 'Cashier created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating cashier:', error);
    
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({
        success: false,
        message: 'Cashier with this email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create cashier',
      error: error.message
    });
  }
});

// Update cashier
app.put('/api/cashiers/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const cashierData = req.body;
    
    console.log('✏️ Updating cashier...', id);

    const existingCashier = await models.Cashier.findById(id);
    if (!existingCashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    if (cashierData.email && cashierData.email !== existingCashier.email) {
      const emailExists = await models.Cashier.findOne({ 
        email: cashierData.email.toLowerCase().trim(),
        _id: { $ne: id }
      });
      
      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: 'Cashier with this email already exists'
        });
      }
      cashierData.email = cashierData.email.toLowerCase().trim();
    }
    
    if (cashierData.password && cashierData.password !== '') {
      const salt = await bcrypt.genSalt(12);
      cashierData.password = await bcrypt.hash(cashierData.password, salt);
    } else {
      delete cashierData.password;
    }
    
    if (cashierData.shopId) {
      const shop = await models.Shop.findById(cashierData.shopId);
      if (shop) {
        cashierData.shopName = shop.name;
      }
    }

    const updatedCashier = await models.Cashier.findByIdAndUpdate(
      id,
      { ...cashierData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shopId', 'name location');
    
    console.log('✅ Cashier updated:', id);
    
    res.json({
      success: true,
      data: updatedCashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating cashier:', error);
    
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({
        success: false,
        message: 'Cashier with this email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

// Delete cashier
app.delete('/api/cashiers/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    console.log('🗑️ Deleting cashier...', id);

    const cashier = await models.Cashier.findByIdAndDelete(id);
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    console.log('✅ Cashier deleted:', id);
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cashier',
      error: error.message
    });
  }
});

// Get cashier by ID
app.get('/api/cashiers/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    console.log('🔍 Getting cashier by ID...', id);

    const cashier = await models.Cashier.findById(id)
      .populate('shopId', 'name location')
      .lean();
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    console.log('✅ Cashier found:', id);
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier',
      error: error.message
    });
  }
});

// ==================== TRANSACTION ROUTES ====================

// Create transaction (BARCODE REMOVED)
app.post('/api/transactions', async (req, res) => {
  try {
    const { models } = req;
    const transactionData = req.body;
    
    console.log('💳 Creating transaction:', {
      paymentMethod: transactionData.paymentMethod,
      totalAmount: transactionData.totalAmount
    });

    if (transactionData.paymentMethod === 'cash_bank_mpesa') {
      const cashAmount = CalculationUtils.safeNumber(transactionData.cashAmount);
      const bankMpesaAmount = CalculationUtils.safeNumber(transactionData.bankMpesaAmount);
      const totalAmount = CalculationUtils.safeNumber(transactionData.totalAmount);
      
      if (Math.abs((cashAmount + bankMpesaAmount) - totalAmount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: 'Cash amount + Bank/Mpesa amount must equal total amount'
        });
      }
    }

    if (transactionData.transactionNumber) {
      const existingTransaction = await models.Transaction.findOne({ 
        transactionNumber: transactionData.transactionNumber 
      });
      
      if (existingTransaction) {
        console.log('⚠️ Duplicate transaction detected:', transactionData.transactionNumber);
        return res.status(409).json({
          success: false,
          message: 'Transaction with this number already exists'
        });
      }
    }

    if (transactionData.shop) {
      const shop = await models.Shop.findById(transactionData.shop);
      if (shop) {
        transactionData.shopName = shop.name;
        transactionData.shopId = shop._id;
      }
    }

    const items = transactionData.items || [];
    let totalAmount = 0;
    let totalCost = 0;

    const enhancedItems = await Promise.all(items.map(async (item) => {
      const quantity = CalculationUtils.safeNumber(item.quantity, 1);
      const price = CalculationUtils.safeNumber(item.price);
      const buyingPrice = CalculationUtils.safeNumber(item.buyingPrice);
      const itemTotalPrice = price * quantity;
      const itemCost = buyingPrice * quantity;
      const itemProfit = itemTotalPrice - itemCost;
      const itemProfitMargin = itemTotalPrice > 0 ? (itemProfit / itemTotalPrice) * 100 : 0;

      totalAmount += itemTotalPrice;
      totalCost += itemCost;

      if (item.productId) {
        try {
          const product = await models.Product.findById(item.productId);
          if (product) {
            const currentStock = CalculationUtils.safeNumber(product.currentStock);
            const newStock = Math.max(0, currentStock - quantity);
            
            await models.Product.findByIdAndUpdate(item.productId, {
              currentStock: newStock,
              updatedAt: new Date()
            });
            
            console.log(`📦 Stock reduced for ${product.name}: ${currentStock} -> ${newStock}`);
          }
        } catch (stockError) {
          console.error('❌ Error reducing stock for product:', item.productId, stockError);
        }
      }

      return {
        ...item,
        quantity,
        price,
        totalPrice: itemTotalPrice,
        buyingPrice,
        cost: itemCost,
        profit: itemProfit,
        profitMargin: itemProfitMargin
      };
    }));

    const profit = totalAmount - totalCost;
    const profitMargin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

    transactionData.totalAmount = totalAmount;
    transactionData.cost = totalCost;
    transactionData.profit = profit;
    transactionData.profitMargin = profitMargin;
    transactionData.itemsCount = items.reduce((sum, item) => sum + CalculationUtils.safeNumber(item.quantity, 1), 0);
    transactionData.items = enhancedItems;

    transactionData.paymentSplit = {
      cash: 0,
      mpesa_bank: 0
    };

    transactionData.paymentMethodDetailed = {
      cash: 0,
      mpesa: 0,
      bank: 0,
      mpesa_bank: 0,
      card: 0
    };

    if (transactionData.paymentMethod === 'cash') {
      transactionData.paymentSplit.cash = totalAmount;
      transactionData.paymentMethodDetailed.cash = totalAmount;
    } else if (transactionData.paymentMethod === 'mpesa_bank') {
      transactionData.paymentSplit.mpesa_bank = totalAmount;
      transactionData.paymentMethodDetailed.mpesa_bank = totalAmount;
    } else if (transactionData.paymentMethod === 'cash_mpesa_bank') {
      const cashAmount = CalculationUtils.safeNumber(transactionData.cashAmount);
      const mpesaBankAmount = CalculationUtils.safeNumber(transactionData.mpesaBankAmount);
      
      transactionData.paymentSplit.cash = cashAmount;
      transactionData.paymentSplit.mpesa_bank = mpesaBankAmount;
      transactionData.paymentMethodDetailed.cash = cashAmount;
      transactionData.paymentMethodDetailed.mpesa_bank = mpesaBankAmount;
    }

    if (!transactionData.transactionNumber) {
      transactionData.transactionNumber = `TXN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`;
    }

    if (!transactionData.receiptNumber) {
      transactionData.receiptNumber = `RCP-${Date.now().toString().slice(-8)}`;
    }

    const transaction = new models.Transaction(transactionData);
    await transaction.save();
    
    await transaction.populate('shop', 'name location type');
    await transaction.populate('cashierId', 'name email');

    if (transaction.cashierId) {
      try {
        await models.CashierAnalytics.deleteMany({ cashierId: transaction.cashierId });
        console.log('🔄 Invalidated analytics cache for cashier:', transaction.cashierId);
      } catch (cacheError) {
        console.error('❌ Error invalidating analytics cache:', cacheError);
      }
    }

    console.log('✅ Transaction created:', {
      transactionId: transaction._id,
      totalAmount: totalAmount,
      profit: profit,
      paymentSplit: transaction.paymentSplit,
      paymentMethodDetailed: transaction.paymentMethodDetailed
    });

    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction created successfully'
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    });
  }
});

// Unified transactions endpoint
app.get('/api/transactions/combined', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      dataType = 'withItems'
    } = req.query;

    const { models } = req;

    console.log('🚀 Processing combined transaction endpoint...', req.query);

    const startTime = Date.now();
    
    let filter = { status: 'completed' };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.saleDate = { $gte: start, $lte: end };
    }

    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    if (cashierId && cashierId !== 'all') {
      filter.cashierId = cashierId;
      console.log('👤 Filtering by cashierId:', cashierId);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'digital') {
        filter.$or = [
          { paymentMethod: 'mpesa' },
          { paymentMethod: 'bank' },
          { paymentMethod: 'card' },
          { paymentMethod: 'mpesa_bank' }
        ];
      } else {
        filter.paymentMethod = paymentMethod;
      }
    }

    const [transactions, shops, cashiers, products, expenses] = await Promise.all([
      models.Transaction.find(filter)
        .populate('shop', 'name location type')
        .populate('cashierId', 'name email shopName')
        .sort({ saleDate: -1 })
        .lean(),
      models.Shop.find().lean(),
      models.Cashier.find().lean(),
      models.Product.find({}).lean(),
      models.Expense.find({}).populate('shop', 'name').lean()
    ]);

    console.log(`📊 Found ${transactions.length} transactions`);
    
    let specificCashier = null;
    if (cashierId && cashierId !== 'all') {
      specificCashier = await models.Cashier.findById(cashierId)
        .populate('shopId', 'name location')
        .lean();
    }

    const totalTransactions = transactions.length;
    const totalRevenue = CalculationUtils.calculateRevenue(transactions);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(transactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    const netProfit = grossProfit;
    
    const paymentComposition = CalculationUtils.calculatePaymentComposition(transactions);

    let cashierMetrics = null;
    if (specificCashier) {
      cashierMetrics = CalculationUtils.calculatePerformanceMetrics(transactions, 'cashier');
    }

    const summary = {
      totalSales: totalTransactions,
      totalRevenue: totalRevenue,
      totalExpenses: 0,
      grossProfit: grossProfit,
      netProfit: netProfit,
      costOfGoodsSold: costOfGoodsSold,
      totalMpesaBank: paymentComposition.mpesa_bank,
      totalCash: paymentComposition.cash,
      profitMargin: CalculationUtils.calculateProfitMargin(totalRevenue, netProfit),
      totalItemsSold: transactions.reduce((sum, t) => sum + CalculationUtils.safeNumber(t.itemsCount || 0), 0),
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      paymentComposition: paymentComposition,
      ...(cashierMetrics ? {
        performanceScore: cashierMetrics.performanceScore,
        digitalPaymentRatio: cashierMetrics.digitalPaymentRatio,
        cashPaymentRatio: cashierMetrics.cashPaymentRatio
      } : {})
    };

    const processedData = {
      transactions: transactions,
      salesWithProfit: transactions.map(t => ({
        ...t,
        profit: t.profit || 0,
        profitMargin: t.profitMargin || 0
      })),
      filteredTransactions: transactions,
      expenses: expenses,
      products: products,
      shops: shops,
      cashiers: cashiers,
      summary: summary,
      financialStats: summary,
      enhancedStats: {
        salesWithProfit: transactions.map(t => ({
          ...t,
          profit: t.profit || 0,
          profitMargin: t.profitMargin || 0
        })),
        financialStats: summary
      },
      paymentComposition: paymentComposition,
      ...(specificCashier ? {
        cashier: specificCashier,
        cashierMetrics: cashierMetrics
      } : {})
    };

    const processingTime = Date.now() - startTime;

    console.log(`✅ Combined transaction data generated in ${processingTime}ms`);
    console.log(`📊 Summary: ${totalTransactions} transactions, KES ${totalRevenue.toFixed(2)} revenue`);

    res.json({
      success: true,
      data: processedData,
      processingTime,
      message: 'Combined transaction data fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error in combined transaction endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch combined transaction data',
      error: error.message,
      processingTime: 0
    });
  }
});

// Transaction metrics
app.get('/api/transactions/metrics', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    const { models } = req;

    console.log('📈 Fetching transaction metrics...', { startDate, endDate, shopId });

    let filter = { status: 'completed' };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.saleDate = { $gte: start, $lte: end };
    }

    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const transactions = await models.Transaction.find(filter);

    const totalTransactions = transactions.length;
    const totalRevenue = CalculationUtils.calculateRevenue(transactions);
    const totalExpenses = await models.Expense.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const expensesTotal = totalExpenses.length > 0 ? totalExpenses[0].total : 0;
    const costOfGoodsSold = CalculationUtils.calculateCOGS(transactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    const netProfit = grossProfit - expensesTotal;

    const totalCash = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.paymentSplit?.cash || 0), 0);
    
    const totalMpesaBank = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.paymentSplit?.mpesa_bank || 0), 0);

    const metrics = {
      totalSales: { amount: totalRevenue, count: totalTransactions, description: `${totalTransactions} transactions` },
      totalRevenue: { amount: totalRevenue, description: 'From all sales' },
      expenses: { amount: expensesTotal, description: 'Total operational costs' },
      grossProfit: { amount: grossProfit, description: 'Revenue - Cost of Goods' },
      netProfit: { amount: netProfit, description: 'After all expenses' },
      costOfGoodsSold: { amount: costOfGoodsSold, description: 'For all sales' },
      totalMpesaBank: { amount: totalMpesaBank, description: 'Digital payments (M-Pesa/Bank)' },
      totalCash: { amount: totalCash, description: 'Cash payments' }
    };

    res.json({
      success: true,
      data: metrics,
      message: 'Transaction metrics fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching transaction metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction metrics',
      error: error.message
    });
  }
});

// ==================== PRODUCT ROUTES (BARCODE REMOVED) ====================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { models } = req;
    const { shopId, search, category, page = 1, limit = 50 } = req.query;
    
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      models.Product.find(filter)
        .populate('shop', 'name location type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      models.Product.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: products,
      count: products.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Create product
app.post('/api/products', async (req, res) => {
  try {
    const { models } = req;
    const productData = req.body;
    
    console.log('🆕 Creating product:', {
      name: productData.name
    });

    if (productData.shop) {
      const shop = await models.Shop.findById(productData.shop);
      if (shop) {
        productData.shopName = shop.name;
        productData.shopId = shop._id;
      }
    }

    const product = new models.Product(productData);
    await product.save();
    
    await product.populate('shop', 'name location type');
    
    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const productData = req.body;

    const product = await models.Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (productData.shop) {
      const shop = await models.Shop.findById(productData.shop);
      if (shop) {
        productData.shopName = shop.name;
        productData.shopId = shop._id;
      }
    }

    const updatedProduct = await models.Product.findByIdAndUpdate(
      id,
      { ...productData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shop', 'name location type');

    res.json({
      success: true,
      data: updatedProduct,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    const product = await models.Product.findByIdAndDelete(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// Product stats overview
app.get('/api/products/stats/overview', async (req, res) => {
  try {
    const { shopId } = req.query;
    const { models } = req;
    
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const products = await models.Product.find(filter);
    
    const totalProducts = products.length;
    const outOfStock = products.filter(p => p.currentStock === 0).length;
    const lowStock = products.filter(p => 
      p.currentStock > 0 && p.currentStock <= (p.minStockLevel || 5)
    ).length;
    const inStock = totalProducts - outOfStock;

    const totalInventoryValue = products.reduce((sum, product) => {
      return sum + (product.currentStock * product.buyingPrice);
    }, 0);

    const totalPotentialRevenue = products.reduce((sum, product) => {
      return sum + (product.currentStock * product.minSellingPrice);
    }, 0);

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

    const stats = {
      overview: {
        totalProducts,
        outOfStock,
        lowStock,
        inStock,
        totalInventoryValue,
        totalPotentialRevenue,
        averageStockValue: totalProducts > 0 ? totalInventoryValue / totalProducts : 0
      },
      categories: categories.map(category => ({
        name: category,
        count: products.filter(p => p.category === category).length,
        products: products.filter(p => p.category === category).slice(0, 5)
      })),
      stockAnalysis: {
        stockValueByCategory: {},
        reorderNeeded: products.filter(p => p.currentStock <= (p.minStockLevel || 5)).length,
        zeroStock: outOfStock
      }
    };

    categories.forEach(category => {
      const categoryProducts = products.filter(p => p.category === category);
      const categoryValue = categoryProducts.reduce((sum, p) => 
        sum + (p.currentStock * p.buyingPrice), 0
      );
      stats.stockAnalysis.stockValueByCategory[category] = categoryValue;
    });

    res.json({
      success: true,
      data: stats,
      message: 'Product statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product statistics',
      error: error.message
    });
  }
});

// ==================== SHOP ROUTES ====================

// Get all shops
app.get('/api/shops', async (req, res) => {
  try {
    const { models } = req;
    console.log('🔍 Fetching shops from database...');
    
    const shops = await models.Shop.find({}).sort({ createdAt: -1 });
    
    console.log(`📊 Raw database results: ${shops.length} shops`);
    
    const seenNames = new Set();
    const uniqueShops = [];
    
    shops.forEach(shop => {
      const shopName = shop.name.trim().toLowerCase();
      if (!seenNames.has(shopName)) {
        seenNames.add(shopName);
        uniqueShops.push(shop);
      } else {
        console.log(`⚠️ Filtering out duplicate shop by name: ${shop.name} (ID: ${shop._id})`);
      }
    });
    
    console.log(`✅ Returning ${uniqueShops.length} unique shops (from ${shops.length} total)`);
    
    res.json({
      success: true,
      data: uniqueShops,
      count: uniqueShops.length,
      originalCount: shops.length,
      duplicatesRemoved: shops.length - uniqueShops.length
    });
  } catch (error) {
    console.error('❌ Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
});

// Delete shop
app.delete('/api/shops/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    console.log(`🗑️ Deleting shop ID: ${id}`);
    
    const shop = await models.Shop.findById(id);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    const deletedShop = await models.Shop.findByIdAndDelete(id);
    
    const deletePromises = [
      models.Product.deleteMany({ shop: id }),
      models.Transaction.deleteMany({ shop: id }),
      models.Expense.deleteMany({ shop: id }),
      models.Cashier.updateMany(
        { shopId: id }, 
        { 
          $unset: { shopId: "", shopName: "" },
          status: 'inactive',
          updatedAt: new Date()
        }
      )
    ];
    
    await Promise.all(deletePromises);
    
    console.log(`✅ Shop permanently deleted: ${shop.name} (ID: ${shop._id})`);
    
    res.json({
      success: true,
      data: deletedShop,
      message: 'Shop and all related data permanently deleted successfully',
      cleanup: {
        productsDeleted: true,
        transactionsDeleted: true,
        expensesDeleted: true,
        cashiersUpdated: true
      }
    });
  } catch (error) {
    console.error('Error deleting shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shop',
      error: error.message
    });
  }
});

// Get shop by ID
app.get('/api/shops/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shop ID'
      });
    }
    
    console.log('🔍 Getting shop by ID...', id);

    const shop = await models.Shop.findById(id).lean();
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    console.log('✅ Shop found:', id);
    
    res.json({
      success: true,
      data: shop,
      message: 'Shop fetched successfully'
    });
  } catch (error) {
    console.error('❌ Error fetching shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop',
      error: error.message
    });
  }
});

// Update shop
app.put('/api/shops/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const shopData = req.body;
    
    console.log('✏️ Updating shop ID:', id, 'with data:', shopData);

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shop ID'
      });
    }

    const existingShop = await models.Shop.findById(id);
    if (!existingShop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    if (shopData.name && shopData.name.trim() !== existingShop.name.trim()) {
      const normalizedName = shopData.name.trim().toLowerCase();
      const duplicateShop = await models.Shop.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${normalizedName}$`, 'i') },
        status: { $ne: 'deleted' }
      });

      if (duplicateShop) {
        return res.status(409).json({
          success: false,
          message: 'Shop with this name already exists'
        });
      }
    }

    const updatedShop = await models.Shop.findByIdAndUpdate(
      id,
      { 
        ...shopData, 
        updatedAt: new Date(),
        name: shopData.name?.trim() || existingShop.name
      },
      { new: true, runValidators: true }
    );

    if (shopData.name && shopData.name !== existingShop.name) {
      const updatePromises = [
        models.Product.updateMany(
          { shop: id },
          { shopName: shopData.name, updatedAt: new Date() }
        ),
        models.Transaction.updateMany(
          { shop: id },
          { shopName: shopData.name, updatedAt: new Date() }
        ),
        models.Expense.updateMany(
          { shop: id },
          { shopName: shopData.name, updatedAt: new Date() }
        ),
        models.Cashier.updateMany(
          { shopId: id },
          { shopName: shopData.name, updatedAt: new Date() }
        )
      ];

      await Promise.all(updatePromises);
      
      console.log(`🔄 Updated related data for shop: ${shopData.name}`);
    }

    console.log('✅ Shop updated successfully:', updatedShop._id);
    
    res.json({
      success: true,
      data: updatedShop,
      message: 'Shop updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating shop:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Shop with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update shop',
      error: error.message
    });
  }
});

// Cleanup duplicate shops
app.post('/api/shops/cleanup-duplicates', async (req, res) => {
  try {
    const { models } = req;
    
    console.log('🧹 Cleaning up duplicate shops...');
    
    const allShops = await models.Shop.find({ status: { $ne: 'deleted' } }).sort({ createdAt: 1 });
    
    const nameMap = new Map();
    const shopsToDelete = [];
    const uniqueShops = [];
    
    allShops.forEach(shop => {
      const normalizedName = shop.name.trim().toLowerCase();
      
      if (nameMap.has(normalizedName)) {
        shopsToDelete.push(shop);
        console.log(`❌ Marking for deletion: ${shop.name} (ID: ${shop._id}, Created: ${shop.createdAt})`);
      } else {
        nameMap.set(normalizedName, shop);
        uniqueShops.push(shop);
        console.log(`✅ Keeping shop: ${shop.name} (ID: ${shop._id}, Created: ${shop.createdAt})`);
      }
    });
    
    const deletedShops = [];
    
    for (const shop of shopsToDelete) {
      try {
        await models.Shop.findByIdAndDelete(shop._id);
        
        const keptShop = nameMap.get(shop.name.trim().toLowerCase());
        
        if (keptShop) {
          await Promise.all([
            models.Product.updateMany(
              { shop: shop._id },
              { shop: keptShop._id, shopName: keptShop.name, shopId: keptShop._id, updatedAt: new Date() }
            ),
            models.Transaction.updateMany(
              { shop: shop._id },
              { shop: keptShop._id, shopName: keptShop.name, shopId: keptShop._id, updatedAt: new Date() }
            ),
            models.Expense.updateMany(
              { shop: shop._id },
              { shop: keptShop._id, shopName: keptShop.name, shopId: keptShop._id, updatedAt: new Date() }
            ),
            models.Cashier.updateMany(
              { shopId: shop._id },
              { shopId: keptShop._id, shopName: keptShop.name, updatedAt: new Date() }
            )
          ]);
        }
        
        deletedShops.push({
          name: shop.name,
          id: shop._id,
          keptShop: keptShop ? { name: keptShop.name, id: keptShop._id } : null
        });
      } catch (deleteError) {
        console.error(`❌ Error deleting shop ${shop._id}:`, deleteError);
      }
    }
    
    console.log(`✅ Cleanup complete: Deleted ${deletedShops.length} duplicate shops`);
    
    res.json({
      success: true,
      data: {
        totalShops: allShops.length,
        uniqueShops: uniqueShops.length,
        deletedDuplicates: deletedShops.length,
        shopsDeleted: deletedShops,
        shopsKept: uniqueShops.map(s => ({ name: s.name, id: s._id }))
      },
      message: `Successfully cleaned up ${deletedShops.length} duplicate shops`
    });
  } catch (error) {
    console.error('Error cleaning up duplicate shops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clean up duplicate shops',
      error: error.message
    });
  }
});

// Shop stats
app.get('/api/shops/stats', async (req, res) => {
  try {
    const { models } = req;
    
    const stats = await models.Shop.aggregate([
      {
        $match: { status: { $ne: 'deleted' } }
      },
      {
        $group: {
          _id: null,
          totalShops: { $sum: 1 },
          activeShops: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactiveShops: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          },
          retailShops: {
            $sum: { $cond: [{ $eq: ['$type', 'retail'] }, 1, 0] }
          },
          wholesaleShops: {
            $sum: { $cond: [{ $eq: ['$type', 'wholesale'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalShops: 1,
          activeShops: 1,
          inactiveShops: 1,
          retailShops: 1,
          wholesaleShops: 1,
          otherShops: {
            $subtract: [
              '$totalShops',
              { $add: ['$retailShops', '$wholesaleShops'] }
            ]
          }
        }
      }
    ]);
    
    const defaultStats = {
      totalShops: 0,
      activeShops: 0,
      inactiveShops: 0,
      retailShops: 0,
      wholesaleShops: 0,
      otherShops: 0
    };
    
    res.json({
      success: true,
      data: stats[0] || defaultStats,
      message: 'Shop statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching shop stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop statistics',
      error: error.message
    });
  }
});

// Soft delete shop
app.delete('/api/shops/:id/soft', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    const shop = await models.Shop.findByIdAndUpdate(
      id,
      { 
        status: 'deleted',
        deletedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    console.log(`✅ Shop marked as deleted: ${shop.name} (ID: ${shop._id})`);
    
    res.json({
      success: true,
      data: shop,
      message: 'Shop marked as deleted successfully'
    });
  } catch (error) {
    console.error('Error soft deleting shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shop',
      error: error.message
    });
  }
});

// ==================== EXPENSE ROUTES ====================

// Get all expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const { shopId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const { models } = req;
    
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [expenses, total] = await Promise.all([
      models.Expense.find(filter)
        .populate('shop', 'name location')
        .sort({ date: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      models.Expense.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: expenses,
      count: expenses.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
});

// Create expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { models } = req;
    const expenseData = req.body;
    
    if (expenseData.shop) {
      const shop = await models.Shop.findById(expenseData.shop);
      if (shop) {
        expenseData.shopName = shop.name;
        expenseData.shopId = shop._id;
      }
    }

    const expense = new models.Expense(expenseData);
    await expense.save();
    
    await expense.populate('shop', 'name location');
    
    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
});

// Update expense
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const expenseData = req.body;
    
    if (expenseData.shop) {
      const shop = await models.Shop.findById(expenseData.shop);
      if (shop) {
        expenseData.shopName = shop.name;
        expenseData.shopId = shop._id;
      }
    }

    const expense = await models.Expense.findByIdAndUpdate(
      id,
      { ...expenseData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shop', 'name location');
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message
    });
  }
});

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    const expense = await models.Expense.findByIdAndDelete(id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }
    
    res.json({
      success: true,
      data: expense,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
});

// Expense stats overview
app.get('/api/expenses/stats/overview', async (req, res) => {
  try {
    const { shopId, startDate, endDate } = req.query;
    const { models } = req;
    
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const expenses = await models.Expense.find(filter)
      .populate('shop', 'name')
      .sort({ date: -1 });

    const totalExpenses = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const averageExpense = totalExpenses > 0 ? totalAmount / totalExpenses : 0;
    
    const categories = [...new Set(expenses.map(e => e.category).filter(Boolean))];
    const byCategory = categories.map(category => ({
      category,
      count: expenses.filter(e => e.category === category).length,
      total: expenses.filter(e => e.category === category)
        .reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0)
    })).sort((a, b) => b.total - a.total);

    const byPaymentMethod = expenses.reduce((acc, expense) => {
      const method = expense.paymentMethod || 'cash';
      if (!acc[method]) {
        acc[method] = { method, count: 0, total: 0 };
      }
      acc[method].count += 1;
      acc[method].total += CalculationUtils.safeNumber(expense.amount);
      return acc;
    }, {});

    const byShop = expenses.reduce((acc, expense) => {
      const shopName = expense.shopName || 'Unknown';
      if (!acc[shopName]) {
        acc[shopName] = { shopName, count: 0, total: 0 };
      }
      acc[shopName].count += 1;
      acc[shopName].total += CalculationUtils.safeNumber(expense.amount);
      return acc;
    }, {});

    const stats = {
      overview: {
        totalExpenses,
        totalAmount,
        averageExpense,
        minExpense: totalExpenses > 0 ? Math.min(...expenses.map(e => CalculationUtils.safeNumber(e.amount))) : 0,
        maxExpense: totalExpenses > 0 ? Math.max(...expenses.map(e => CalculationUtils.safeNumber(e.amount))) : 0,
        expensesCount: totalExpenses
      },
      byCategory: Object.values(byCategory),
      byPaymentMethod: Object.values(byPaymentMethod),
      byShop: Object.values(byShop),
      recentExpenses: expenses.slice(0, 10),
      trends: {
        daily: [],
        weekly: [],
        monthly: []
      }
    };

    res.json({
      success: true,
      data: stats,
      message: 'Expense statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching expense stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense statistics',
      error: error.message
    });
  }
});

// ==================== DASHBOARD ROUTES ====================

// Dashboard data
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    const { models } = req;

    console.log('📊 Fetching dashboard data...', { startDate, endDate, shopId });

    const [transactions, shops, cashiers, products, expenses] = await Promise.all([
      models.Transaction.find({
        status: 'completed',
        ...(startDate && endDate ? {
          saleDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        } : {}),
        ...(shopId && shopId !== 'all' ? {
          $or: [
            { shop: shopId },
            { shopId: shopId }
          ]
        } : {})
      })
      .populate('shop', 'name location')
      .populate('cashierId', 'name email')
      .sort({ saleDate: -1 })
      .lean(),
      models.Shop.find().lean(),
      models.Cashier.find().lean(),
      models.Product.find({}).lean(),
      models.Expense.find({})
        .populate('shop', 'name')
        .lean()
    ]);

    const totalTransactions = transactions.length;
    const totalRevenue = CalculationUtils.calculateRevenue(transactions);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(transactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;
    
    const paymentComposition = CalculationUtils.calculatePaymentComposition(transactions);

    const financialStats = {
      totalSales: totalTransactions,
      totalRevenue: totalRevenue,
      totalExpenses: totalExpenses,
      grossProfit: grossProfit,
      netProfit: netProfit,
      costOfGoodsSold: costOfGoodsSold,
      totalMpesaBank: paymentComposition.mpesa_bank,
      totalCash: paymentComposition.cash,
      profitMargin: CalculationUtils.calculateProfitMargin(totalRevenue, netProfit),
      totalItemsSold: transactions.reduce((sum, t) => sum + CalculationUtils.safeNumber(t.itemsCount || 0), 0),
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
    };

    const dashboardData = {
      transactions: transactions,
      shops: shops,
      cashiers: cashiers,
      products: products,
      expenses: expenses,
      summary: financialStats,
      financialStats: financialStats,
      enhancedStats: {
        salesWithProfit: transactions,
        financialStats: financialStats
      },
      paymentComposition: paymentComposition,
      loadedAt: new Date().toISOString(),
      dataSources: {
        transactions: transactions.length,
        shops: shops.length,
        cashiers: cashiers.length,
        products: products.length,
        expenses: expenses.length
      }
    };

    console.log('✅ Dashboard data loaded successfully');

    res.json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error loading dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard data',
      error: error.message
    });
  }
});

// Cashier dashboard metrics
app.get('/api/cashier/dashboard-metrics', async (req, res) => {
  try {
    const { cashierId, startDate, endDate } = req.query;
    const { models } = req;

    if (!cashierId) {
      return res.status(400).json({
        success: false,
        message: 'Cashier ID is required'
      });
    }

    console.log('👤 Fetching cashier dashboard metrics:', { cashierId, startDate, endDate });

    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : new Date();
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const transactions = await models.Transaction.find({
      cashierId: cashierId,
      status: 'completed',
      saleDate: { $gte: start, $lte: end }
    });

    const totalTransactions = transactions.length;
    const totalSales = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.totalAmount), 0);
    
    const totalCash = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.paymentSplit?.cash || 0), 0);
    
    const totalMpesaBank = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.paymentSplit?.mpesa_bank || 0), 0);
    
    const itemsSold = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.itemsCount || 0), 0);
    
    const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    
    const totalProfit = transactions.reduce((sum, t) => 
      sum + CalculationUtils.safeNumber(t.profit || 0), 0);
    
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    const digitalPaymentRatio = totalSales > 0 ? (totalMpesaBank / totalSales) * 100 : 0;
    const cashPaymentRatio = totalSales > 0 ? (totalCash / totalSales) * 100 : 0;

    const metrics = {
      totalSales,
      totalTransactions,
      totalCash,
      totalMpesaBank,
      itemsSold,
      averageTransaction,
      profitMargin,
      digitalPaymentRatio,
      cashPaymentRatio
    };

    res.json({
      success: true,
      data: metrics,
      message: 'Cashier dashboard metrics fetched successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching cashier dashboard metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier dashboard metrics',
      error: error.message
    });
  }
});

// ==================== ROOT AND HEALTH ENDPOINTS ====================

app.get('/api/health', (req, res) => {
  const dbStatus = cachedConnection?.readyState === 1 ? 'connected' : 'disconnected';
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    serverless: true,
    platform: 'vercel'
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    features: {
      cashierManagement: 'enabled',
      analytics: 'enabled',
      transactions: 'enabled',
      products: 'enabled',
      shops: 'enabled',
      expenses: 'enabled',
      authentication: 'enabled'
    },
    deployment: 'serverless-vercel'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Stanzo Shop Management API',
    version: '4.1.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    deployment: 'serverless-vercel',
    endpoints: {
      cashiers: '/api/cashiers',
      cashierPerformance: '/api/cashiers/:id/performance',
      transactions: '/api/transactions',
      combinedTransactions: '/api/transactions/combined',
      products: '/api/products',
      shops: '/api/shops',
      expenses: '/api/expenses',
      auth: '/api/auth/*',
      health: '/api/health'
    }
  });
});

// Catch-all for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  
  if (err.name === 'CorsError') {
    return res.status(403).json({
      success: false,
      message: 'CORS error: Not allowed by CORS policy'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});


// ==================== SERVER STARTUP ====================

if (require.main === module) {
  const PORT = process.env.PORT || 5002;
  
  const startServer = async () => {
    try {
      console.log('🔄 Attempting to connect to database...');
      
      try {
        const connection = await connectDB();
        console.log('✅ Database connection established successfully');
        console.log(`🔗 Database state: ${connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
      } catch (dbError) {
        console.log('⚠️ Database connection will be established on first request');
        console.log('📝 Database connection error:', dbError.message);
      }
      
      app.listen(PORT, '0.0.0.0', () => {
        console.log('\n' + '='.repeat(60));
        console.log(`🚀 STANZO SHOP MANAGEMENT SERVER STARTED SUCCESSFULLY!`);
        console.log('='.repeat(60));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔐 Test endpoint: http://localhost:${PORT}/api/test`);
        console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
        console.log(`📊 Cashier Analytics: ENABLED`);
        console.log(`📈 Performance Metrics: ENABLED`);
        console.log(`🏪 Shop Management: ENABLED`);
        console.log(`📦 Product Management: ENABLED`);
        console.log(`💳 Transaction Processing: ENABLED`);
        console.log(`💰 Expense Tracking: ENABLED`);
        console.log(`🔐 Authentication: ENABLED`);
        console.log(`📝 Audit Logging: ENABLED`);
        console.log(`🔄 Real-time Updates: ENABLED`);
        console.log(`🎫 BARCODE FUNCTIONALITY: REMOVED`);
        console.log('='.repeat(60) + '\n');
      });
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };
  
  startServer();
}

module.exports = {
  app,
  connectDB,
  TokenManager,
  CalculationUtils,
  AnalyticsService,
  models: cachedModels
};