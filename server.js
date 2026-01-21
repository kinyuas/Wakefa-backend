const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// ==================== ENHANCED MODELS WITH BARCODE SUPPORT ====================

const createModels = (connection) => {
  console.log('🔧 Creating enhanced models...');
  
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Uncategorized' },
    buyingPrice: { type: Number, default: 0 },
    minSellingPrice: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    minStockLevel: { type: Number, default: 5 },
    barcode: { type: String, index: true },
    barcodeType: { type: String, default: 'INTERNAL' },
    barcodeGenerated: { type: Boolean, default: false },
    barcodePrinted: { type: Boolean, default: false },
    lastPrintedAt: Date,
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    description: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

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

  // UPDATED TRANSACTION SCHEMA WITH BARCODE SUPPORT
  const transactionSchema = new mongoose.Schema({
    transactionNumber: { type: String, required: true, unique: true },
    totalAmount: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    items: [{
      productName: String,
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      barcode: String,
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
      bank_mpesa: { type: Number, default: 0 }
    },
    
    receiptNumber: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

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

  const secureCodeSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false }
  });

  const tokenBlacklistSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userId: mongoose.Schema.Types.ObjectId,
    reason: String,
    createdAt: { type: Date, default: Date.now }
  });

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

  // Indexes for performance
  secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  cashierSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  cashierSessionSchema.index({ cashierId: 1 });
  auditLogSchema.index({ timestamp: -1 });
  auditLogSchema.index({ userId: 1, timestamp: -1 });
  
  transactionSchema.index({ saleDate: -1 });
  transactionSchema.index({ shop: 1 });
  transactionSchema.index({ cashierId: 1 });
  transactionSchema.index({ status: 1 });
  productSchema.index({ isActive: 1 });
  productSchema.index({ shop: 1 });
  productSchema.index({ barcode: 1 });
  productSchema.index({ shop: 1, barcode: 1 }, { unique: true });

  const models = {
    Product: connection.models.Product || connection.model('Product', productSchema),
    Shop: connection.models.Shop || connection.model('Shop', shopSchema),
    Cashier: connection.models.Cashier || connection.model('Cashier', cashierSchema),
    Expense: connection.models.Expense || connection.model('Expense', expenseSchema),
    Transaction: connection.models.Transaction || connection.model('Transaction', transactionSchema),
    User: connection.models.User || connection.model('User', userSchema),
    SecureCode: connection.models.SecureCode || connection.model('SecureCode', secureCodeSchema),
    TokenBlacklist: connection.models.TokenBlacklist || connection.model('TokenBlacklist', tokenBlacklistSchema),
    CashierSession: connection.models.CashierSession || connection.model('CashierSession', cashierSessionSchema),
    AuditLog: connection.models.AuditLog || connection.model('AuditLog', auditLogSchema)
  };

  console.log('✅ All enhanced models created successfully');
  return models;
};

// ==================== DATABASE CONNECTION MANAGER ====================

let cachedConnection = null;
let cachedModels = null;

const connectDB = async () => {
  if (cachedConnection && cachedConnection.readyState === 1) {
    console.log('🔗 Using cached database connection');
    return cachedConnection;
  }

  try {
    const connectionString = process.env.MONGODB_URI || 'mongodb+srv://kinyuastanzo6759_db_user:Y9P9gdROuewvBmq8@cluster0.4rtcx4y.mongodb.net/?appName=Cluster0';
    
    console.log('🔗 Creating new database connection...');
    
    const options = {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 0,
      retryWrites: true,
      bufferCommands: false,
      connectTimeoutMS: 10000,
      family: 4
    };

    if (!cachedConnection) {
      await mongoose.connect(connectionString, options);
      cachedConnection = mongoose.connection;
      cachedModels = createModels(cachedConnection);
      console.log('✅ New database connection created successfully');
    }
    
    return cachedConnection;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

// ==================== ENHANCED TOKEN MANAGEMENT ====================

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
        jti: crypto.randomBytes(16).toString('hex')
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
}

// ==================== EMAIL TRANSPORTER ====================

let emailTransporter = null;

const getEmailTransporter = () => {
  if (!emailTransporter) {
    try {
      const emailUser = process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com';
      const emailPass = process.env.EMAIL_PASSWORD || 'qavwswxnsidtuytn';

      console.log('📧 Configuring email transporter...');
      
      if (!emailUser || !emailPass) {
        console.error('❌ Email credentials not configured');
        throw new Error('Email credentials not configured');
      }

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
            subject: mailOptions.subject,
            text: mailOptions.text?.substring(0, 100) + '...'
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

// ==================== ENHANCED AUTHENTICATION MIDDLEWARE ====================

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        message: 'No authorization token provided' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Check if token is blacklisted
    const isBlacklisted = await TokenManager.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ 
        success: false,
        message: 'Token has been revoked' 
      });
    }

    const decoded = TokenManager.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired token' 
      });
    }

    // Add user info to request
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name,
      shopId: decoded.shopId,
      shopName: decoded.shopName
    };

    // Update last activity for cashier sessions
    if (req.user.role === 'cashier') {
      await cachedModels.CashierSession.updateOne(
        { cashierId: req.user.id, token: token },
        { lastActivity: new Date() }
      );
    }

    next();
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(401).json({ 
      success: false,
      message: 'Authentication failed' 
    });
  }
};

const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

// ==================== BARCODE UTILITIES ====================

const BarcodeUtils = {
  generateBarcode: (type = 'INTERNAL') => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substr(2, 4).toUpperCase();
    
    switch(type) {
      case 'EAN13':
        const base = '200' + Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        return base + BarcodeUtils.calculateEAN13CheckDigit(base);
      case 'UPC':
        const upcBase = Math.floor(Math.random() * 10000000000).toString().padStart(11, '0');
        return upcBase + BarcodeUtils.calculateUPCACheckDigit(upcBase);
      case 'CODE128':
        return `C128${timestamp}${random}`;
      case 'CODE39':
        return `C39${timestamp}${random}`;
      default:
        return `IN${timestamp}${random}`;
    }
  },

  calculateEAN13CheckDigit: (code) => {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code[i]);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  },

  calculateUPCACheckDigit: (code) => {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(code[i]);
      sum += (i % 2 === 0) ? digit * 3 : digit;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  },

  validateBarcode: (barcode, type = 'INTERNAL') => {
    if (!barcode || barcode.trim() === '') return false;
    
    switch(type) {
      case 'EAN13':
        return /^\d{13}$/.test(barcode);
      case 'UPC':
        return /^\d{12}$/.test(barcode);
      case 'CODE128':
        return /^[A-Z0-9]{8,}$/.test(barcode);
      case 'CODE39':
        return /^[A-Z0-9\-\.\$\+\/%\s]{1,}$/.test(barcode);
      default:
        return /^[A-Z0-9]{8,}$/.test(barcode);
    }
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

  processShopData: async (transactions, expenses, products, shopId) => {
    if (!shopId || shopId === 'all') {
      return CalculationUtils.processAllShopsData(transactions, expenses, products);
    }

    const filteredTransactions = transactions.filter(t => 
      t.shop === shopId || t.shopId === shopId
    );
    
    const filteredExpenses = expenses.filter(e => 
      e.shop === shopId || e.shopId === shopId
    );
    
    const filteredProducts = products.filter(p => 
      p.shop === shopId || p.shopId === shopId
    );

    return CalculationUtils.processFinancialStats(
      filteredTransactions,
      filteredExpenses,
      filteredProducts,
      shopId
    );
  },

  processAllShopsData: async (transactions, expenses, products) => {
    const shopStats = {};
    
    transactions.forEach(transaction => {
      const shopId = transaction.shop || transaction.shopId;
      if (!shopId) return;
      
      if (!shopStats[shopId]) {
        shopStats[shopId] = {
          shopId: shopId,
          shopName: transaction.shopName || 'Unknown Shop',
          transactions: [],
          expenses: [],
          products: []
        };
      }
      
      shopStats[shopId].transactions.push(transaction);
    });
    
    expenses.forEach(expense => {
      const shopId = expense.shop || expense.shopId;
      if (!shopId) return;
      
      if (shopStats[shopId]) {
        shopStats[shopId].expenses.push(expense);
      }
    });
    
    products.forEach(product => {
      const shopId = product.shop || product.shopId;
      if (!shopId) return;
      
      if (shopStats[shopId]) {
        shopStats[shopId].products.push(product);
      }
    });
    
    const result = {
      allShops: [],
      summary: {
        totalRevenue: 0,
        totalExpenses: 0,
        totalProfit: 0,
        totalCOGS: 0
      }
    };
    
    for (const shopId in shopStats) {
      const shopData = shopStats[shopId];
      const financialStats = CalculationUtils.processFinancialStats(
        shopData.transactions,
        shopData.expenses,
        shopData.products,
        shopId
      );
      
      result.allShops.push({
        shopId: shopId,
        shopName: shopData.shopName,
        financialStats: financialStats
      });
      
      result.summary.totalRevenue += financialStats.totalRevenue;
      result.summary.totalExpenses += financialStats.totalExpenses;
      result.summary.totalProfit += financialStats.netProfit;
      result.summary.totalCOGS += financialStats.costOfGoodsSold;
    }
    
    return result;
  },

  processFinancialStats: (transactions, expenses, products, shopId) => {
    const totalTransactions = transactions.length;
    const totalRevenue = CalculationUtils.calculateRevenue(transactions);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(transactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;
    
    let totalCash = 0;
    let totalMpesaBank = 0;

    transactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        totalCash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        totalMpesaBank += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
      }
    });

    const financialStats = {
      totalSales: totalTransactions,
      totalRevenue: totalRevenue,
      totalExpenses: totalExpenses,
      grossProfit: grossProfit,
      netProfit: netProfit,
      costOfGoodsSold: costOfGoodsSold,
      totalMpesaBank: totalMpesaBank,
      totalCash: totalCash,
      profitMargin: CalculationUtils.calculateProfitMargin(totalRevenue, netProfit),
      totalItemsSold: transactions.reduce((sum, t) => sum + t.itemsCount, 0),
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
    };

    return financialStats;
  },

  processCashierData: async (transactions, expenses, products, cashierId) => {
    if (!cashierId || cashierId === 'all') {
      return {
        success: false,
        message: 'Cashier ID is required'
      };
    }

    const filteredTransactions = transactions.filter(t => 
      t.cashierId === cashierId || t.cashierName?.includes(cashierId)
    );

    const cashierShopId = filteredTransactions.length > 0 
      ? (filteredTransactions[0].shop || filteredTransactions[0].shopId)
      : null;

    const filteredExpenses = cashierShopId ? 
      expenses.filter(e => e.shop === cashierShopId || e.shopId === cashierShopId) : [];
    
    const filteredProducts = cashierShopId ? 
      products.filter(p => p.shop === cashierShopId || p.shopId === cashierShopId) : [];

    const financialStats = CalculationUtils.processFinancialStats(
      filteredTransactions,
      filteredExpenses,
      filteredProducts,
      cashierShopId
    );

    return {
      cashierId: cashierId,
      shopId: cashierShopId,
      transactions: filteredTransactions,
      expenses: filteredExpenses,
      products: filteredProducts,
      financialStats: financialStats
    };
  }
};

// ==================== EMAIL FUNCTIONS ====================

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

// ==================== TRANSACTION DATA FETCHING ====================

const getAllTransactionData = async (models, filters = {}) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      status
    } = filters;

    console.log('📊 Fetching transaction data with filters:', filters);

    let transactionFilter = { 
      status: { $in: ['completed'] }
    };

    let expenseFilter = {};
    let productFilter = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      transactionFilter.saleDate = { $gte: start, $lte: end };
      expenseFilter.date = { $gte: start, $lte: end };
    }

    if (shopId && shopId !== 'all') {
      transactionFilter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
      expenseFilter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
      productFilter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    if (cashierId && cashierId !== 'all') {
      transactionFilter.$or = [
        ...(transactionFilter.$or || []),
        { cashierId: cashierId },
        { cashierName: { $regex: cashierId, $options: 'i' } }
      ];
    }

    if (paymentMethod && paymentMethod !== 'all') {
      if (paymentMethod === 'digital') {
        transactionFilter.paymentMethod = { $in: ['mpesa', 'bank', 'card'] };
      } else {
        transactionFilter.paymentMethod = paymentMethod;
      }
    }

    const [transactions, shops, cashiers, products, expenses] = await Promise.all([
      models.Transaction.find(transactionFilter)
        .populate('shop', 'name location type')
        .populate('cashierId', 'name email')
        .sort({ saleDate: -1 })
        .lean(),
      models.Shop.find().lean(),
      models.Cashier.find().lean(),
      models.Product.find(productFilter).lean(),
      models.Expense.find(expenseFilter).populate('shop', 'name').lean()
    ]);

    console.log(`✅ Transaction data fetched: ${transactions.length} transactions`);

    return {
      transactions,
      shops,
      cashiers,
      products,
      expenses
    };

  } catch (error) {
    console.error('❌ Error in getAllTransactionData:', error);
    throw error;
  }
};

// ==================== MIDDLEWARE SETUP ====================

const allowedOrigins = [
  'https://front1-beta.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many authentication attempts' }
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many email requests' }
});

app.use('/api/auth/request-code', emailLimiter);
app.use('/api/auth/verify-code', authLimiter);

app.use(morgan('dev'));

// ==================== DATABASE MIDDLEWARE ====================

app.use(async (req, res, next) => {
  try {
    const connection = await connectDB();
    req.dbConnection = connection;
    req.models = cachedModels;
    next();
  } catch (error) {
    console.error('❌ Database connection middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
});

// ==================== ENHANCED AUTHENTICATION ENDPOINTS ====================

const generateSecureCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Admin secure code authentication
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
          message: 'Secure code generated (email service disabled)',
          developmentMode: true,
          secureCode: secureCode,
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

      // Generate tokens
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

      // Log login activity
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

// Enhanced cashier login with token management
app.post('/api/auth/cashier/login', async (req, res) => {
  try {
    console.log('🔐 Cashier login attempt:', { 
      email: req.body?.email,
      timestamp: new Date().toISOString() 
    });

    const { email, password, deviceInfo } = req.body;
    const { models } = req;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔍 Searching for cashier:', normalizedEmail);

    const cashier = await models.Cashier.findOne({ 
      email: normalizedEmail 
    }).populate('shopId', 'name location');

    if (!cashier) {
      console.log('❌ Cashier not found:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'Cashier account not found'
      });
    }

    console.log('✅ Cashier found:', {
      id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      status: cashier.status
    });

    if (cashier.status !== 'active') {
      console.log('❌ Cashier account inactive:', normalizedEmail);
      return res.status(403).json({
        success: false,
        message: 'Cashier account is inactive. Please contact administrator.'
      });
    }

    let isPasswordValid = false;

    if (!cashier.password) {
      console.log('❌ Cashier has no password stored');
      return res.status(401).json({
        success: false,
        message: 'Password not configured. Please contact administrator.'
      });
    }

    const hashedPassword = cashier.password;
    const bcryptVersion = hashedPassword.substring(0, 4);

    if (['$2a$', '$2b$', '$2y$'].some(prefix => hashedPassword.startsWith(prefix))) {
      console.log(`🔑 Using bcrypt verification (${bcryptVersion})`);
      
      try {
        isPasswordValid = await bcrypt.compare(password, hashedPassword);
        console.log('🔑 Bcrypt comparison result:', isPasswordValid);
        
        if (!isPasswordValid && process.env.NODE_ENV === 'development') {
          console.log('🔍 Development fallback: checking direct match');
          isPasswordValid = (hashedPassword === password);
        }
      } catch (bcryptError) {
        console.error('❌ Bcrypt comparison error:', bcryptError);
        isPasswordValid = (hashedPassword === password);
      }
    } else {
      console.log('🔑 Using plaintext verification');
      isPasswordValid = (hashedPassword === password);
      
      if (isPasswordValid) {
        console.log('🔄 Upgrading plaintext to bcrypt');
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
      console.log('❌ Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid password. Please try again.'
      });
    }

    cashier.lastLogin = new Date();
    cashier.loginCount = (cashier.loginCount || 0) + 1;
    await cashier.save();

    // Generate tokens
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

    // Create cashier session
    const session = new models.CashierSession({
      cashierId: cashier._id,
      token: accessToken,
      deviceInfo: deviceInfo || req.get('user-agent'),
      ipAddress: req.ip || req.connection.remoteAddress,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) // 8 hours
    });
    await session.save();

    const userData = {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      role: 'cashier',
      status: cashier.status,
      lastLogin: cashier.lastLogin,
      loginCount: cashier.loginCount,
      shopId: cashier.shopId?._id || null,
      shopName: cashier.shopId?.name || cashier.shopName || null,
      shopLocation: cashier.shopId?.location || null,
      createdAt: cashier.createdAt
    };

    // Log login activity
    await auditLogger.logLogin(cashier, req);

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

// Token refresh endpoint
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

    // Verify refresh token
    const decoded = TokenManager.verifyToken(refreshToken, true);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if user exists
    const user = await models.User.findById(decoded.userId) || 
                 await models.Cashier.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new tokens
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

    // Update cashier session if applicable
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

// Logout endpoint with token blacklisting
app.post('/api/auth/logout', verifyToken, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const { models } = req;

    if (token) {
      // Blacklist the token
      await TokenManager.blacklistToken(token, req.user.id, 'logout');

      // Update cashier session if applicable
      if (req.user.role === 'cashier') {
        await models.CashierSession.findOneAndUpdate(
          { cashierId: req.user.id, token: token },
          { status: 'logged_out' }
        );

        // Update cashier last logout time
        await models.Cashier.findByIdAndUpdate(req.user.id, {
          lastLogout: new Date()
        });
      }
    }

    // Log logout activity
    await auditLogger.logLogout(req.user, req);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout'
    });
  }
});

// Validate token endpoint
app.get('/api/auth/validate', verifyToken, async (req, res) => {
  try {
    const { models } = req;

    let user;
    if (req.user.role === 'cashier') {
      user = await models.Cashier.findById(req.user.id)
        .populate('shopId', 'name location');
    } else {
      user = await models.User.findById(req.user.id);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      lastLogin: user.lastLogin
    };

    if (user.role === 'cashier') {
      userData.shopId = user.shopId?._id;
      userData.shopName = user.shopId?.name || user.shopName;
      userData.shopLocation = user.shopId?.location;
    }

    res.json({
      success: true,
      user: userData,
      message: 'Token is valid'
    });

  } catch (error) {
    console.error('❌ Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Token validation failed'
    });
  }
});

// ==================== PROTECTED TRANSACTION ENDPOINTS ====================

// Create transaction with enhanced payment split tracking
app.post('/api/transactions', verifyToken, authorizeRole('cashier', 'admin'), async (req, res) => {
  try {
    const { models } = req;
    const transactionData = req.body;
    
    console.log('💳 Creating transaction:', {
      paymentMethod: transactionData.paymentMethod,
      totalAmount: transactionData.totalAmount,
      cashier: req.user.name
    });

    // Validate payment split for cash+bank/mpesa
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

    // Use authenticated cashier info
    transactionData.cashierId = req.user.id;
    transactionData.cashierName = req.user.name;

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

      // Get product barcode if available
      let barcode = item.barcode;
      if (!barcode && item.productId) {
        try {
          const product = await models.Product.findById(item.productId);
          if (product && product.barcode) {
            barcode = product.barcode;
          }
        } catch (error) {
          console.error('❌ Error fetching product barcode:', error);
        }
      }

      // Update stock
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
        profitMargin: itemProfitMargin,
        barcode: barcode
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

    // Enhanced payment split calculation
    transactionData.paymentSplit = {
      cash: 0,
      bank_mpesa: 0
    };

    if (transactionData.paymentMethod === 'cash') {
      transactionData.paymentSplit.cash = totalAmount;
    } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transactionData.paymentMethod)) {
      transactionData.paymentSplit.bank_mpesa = totalAmount;
    } else if (transactionData.paymentMethod === 'cash_bank_mpesa') {
      // For split payments
      transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.cashAmount);
      transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.bankMpesaAmount);
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

    // Log transaction creation
    await auditLogger.logTransaction(req.user, transaction._id, {
      totalAmount: transaction.totalAmount,
      paymentMethod: transaction.paymentMethod,
      paymentSplit: transaction.paymentSplit,
      itemsCount: transaction.itemsCount
    }, req);

    console.log('✅ Transaction created:', {
      transactionId: transaction._id,
      totalAmount: totalAmount,
      profit: profit,
      paymentSplit: transaction.paymentSplit
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

// Get combined transactions with payment split data
app.get('/api/transactions/combined', verifyToken, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      dataType = 'all'
    } = req.query;

    const { models } = req;

    console.log('🚀 Processing combined transaction endpoint...', req.query);

    const startTime = Date.now();
    
    const filters = {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod
    };

    const transactionData = await getAllTransactionData(models, filters);
    
    // Process data with shop isolation
    let processedData;
    if (shopId && shopId !== 'all') {
      const shopData = await CalculationUtils.processShopData(
        transactionData.transactions,
        transactionData.expenses,
        transactionData.products,
        shopId
      );
      
      processedData = {
        salesWithProfit: transactionData.transactions,
        financialStats: shopData,
        expenses: transactionData.expenses,
        products: transactionData.products,
        shops: transactionData.shops,
        cashiers: transactionData.cashiers,
        summary: shopData,
        timestamp: new Date().toISOString()
      };
    } else {
      // Process all shops data
      const allShopsData = await CalculationUtils.processAllShopsData(
        transactionData.transactions,
        transactionData.expenses,
        transactionData.products
      );
      
      processedData = {
        salesWithProfit: transactionData.transactions,
        financialStats: allShopsData.summary,
        expenses: transactionData.expenses,
        products: transactionData.products,
        shops: transactionData.shops,
        cashiers: transactionData.cashiers,
        summary: allShopsData.summary,
        allShopsData: allShopsData.allShops,
        timestamp: new Date().toISOString()
      };
    }

    // Calculate payment composition totals
    const paymentComposition = {
      cash: 0,
      bank_mpesa: 0,
      total: 0
    };

    transactionData.transactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        paymentComposition.cash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        paymentComposition.bank_mpesa += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
      }
    });

    paymentComposition.total = paymentComposition.cash + paymentComposition.bank_mpesa;

    processedData.paymentComposition = paymentComposition;

    const processingTime = Date.now() - startTime;

    console.log(`✅ Combined transaction data generated in ${processingTime}ms`);
    console.log('💰 Payment Composition:', paymentComposition);

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

// Cashier-specific data endpoint with payment composition
app.get('/api/cashier/data/:cashierId', verifyToken, async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { startDate, endDate } = req.query;
    const { models } = req;

    console.log('👤 Fetching cashier-specific data:', { cashierId, startDate, endDate });

    const filters = {
      startDate,
      endDate,
      cashierId
    };

    const transactionData = await getAllTransactionData(models, filters);
    
    // Process cashier-specific data
    const cashierData = await CalculationUtils.processCashierData(
      transactionData.transactions,
      transactionData.expenses,
      transactionData.products,
      cashierId
    );

    // Calculate cashier-specific payment composition
    const cashierPaymentComposition = {
      cash: 0,
      bank_mpesa: 0,
      total: 0
    };

    transactionData.transactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        cashierPaymentComposition.cash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        cashierPaymentComposition.bank_mpesa += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
      }
    });

    cashierPaymentComposition.total = cashierPaymentComposition.cash + cashierPaymentComposition.bank_mpesa;

    // Get cashier details
    const cashier = await models.Cashier.findById(cashierId)
      .populate('shopId', 'name location')
      .lean();

    res.json({
      success: true,
      data: {
        cashier: cashier,
        ...cashierData,
        paymentComposition: cashierPaymentComposition
      },
      message: 'Cashier data fetched successfully',
      note: 'Data includes only transactions, expenses, and products related to this cashier'
    });

  } catch (error) {
    console.error('❌ Error fetching cashier data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier data',
      error: error.message
    });
  }
});

// ==================== PROTECTED PRODUCT ENDPOINTS ====================

// Search product by barcode
app.get('/api/products/search/barcode', verifyToken, async (req, res) => {
  try {
    const { barcode, shop } = req.query;
    const { models } = req;

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: 'Barcode is required'
      });
    }

    console.log(`🔍 Searching product by barcode: ${barcode}, shop: ${shop}`);

    let query = { barcode };
    
    if (shop && shop !== 'all') {
      query.$or = [
        { shop: shop },
        { shopId: shop }
      ];
    }

    const product = await models.Product.findOne(query)
      .populate('shop', 'name location type')
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found with this barcode'
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product found successfully'
    });

  } catch (error) {
    console.error('❌ Error searching product by barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search product',
      error: error.message
    });
  }
});

// Generate barcode for a product
app.post('/api/products/:id/generate-barcode', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { barcodeType = 'INTERNAL', customBarcode } = req.body;
    const { models } = req;

    console.log(`🎫 Generating barcode for product: ${id}, type: ${barcodeType}`);

    const product = await models.Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    let barcode;
    
    if (customBarcode && BarcodeUtils.validateBarcode(customBarcode, barcodeType)) {
      barcode = customBarcode;
      
      // Check if barcode already exists in the same shop
      const existingProduct = await models.Product.findOne({
        _id: { $ne: id },
        barcode: customBarcode,
        $or: [
          { shop: product.shop },
          { shopId: product.shopId || product.shop }
        ]
      });
      
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'Barcode already exists for another product in this shop'
        });
      }
    } else {
      barcode = BarcodeUtils.generateBarcode(barcodeType);
    }

    product.barcode = barcode;
    product.barcodeType = barcodeType;
    product.barcodeGenerated = true;
    product.updatedAt = new Date();

    await product.save();

    await product.populate('shop', 'name location type');

    // Log product update
    await auditLogger.logProductUpdate(req.user, product._id, {
      barcode: barcode,
      barcodeType: barcodeType
    }, req);

    res.json({
      success: true,
      data: {
        barcode: product.barcode,
        barcodeType: product.barcodeType,
        barcodeGenerated: product.barcodeGenerated,
        product: product
      },
      message: 'Barcode generated successfully'
    });

  } catch (error) {
    console.error('❌ Error generating barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate barcode',
      error: error.message
    });
  }
});

// Bulk generate barcodes for products
app.post('/api/products/bulk-generate-barcodes', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { barcodeType = 'INTERNAL', productIds, shopId } = req.body;
    const { models } = req;

    console.log(`🎫 Bulk generating barcodes, type: ${barcodeType}`);

    let query = { barcode: { $exists: false } };
    
    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      query._id = { $in: productIds };
    }
    
    if (shopId && shopId !== 'all') {
      query.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const products = await models.Product.find(query);

    if (products.length === 0) {
      return res.json({
        success: true,
        data: {
          processed: 0,
          success: 0,
          failed: 0
        },
        message: 'No products need barcode generation'
      });
    }

    const results = {
      processed: products.length,
      success: 0,
      failed: 0,
      products: []
    };

    for (const product of products) {
      try {
        const barcode = BarcodeUtils.generateBarcode(barcodeType);
        
        product.barcode = barcode;
        product.barcodeType = barcodeType;
        product.barcodeGenerated = true;
        product.updatedAt = new Date();
        
        await product.save();
        
        results.success++;
        results.products.push({
          productId: product._id,
          name: product.name,
          barcode: barcode,
          barcodeType: barcodeType,
          success: true
        });
      } catch (error) {
        console.error(`❌ Failed to generate barcode for product ${product._id}:`, error);
        results.failed++;
        results.products.push({
          productId: product._id,
          name: product.name,
          error: error.message,
          success: false
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Generated barcodes for ${results.success} products successfully, ${results.failed} failed`
    });

  } catch (error) {
    console.error('❌ Error bulk generating barcodes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk generate barcodes',
      error: error.message
    });
  }
});

// Mark barcode as printed
app.post('/api/products/:id/mark-printed', verifyToken, authorizeRole('admin', 'cashier'), async (req, res) => {
  try {
    const { id } = req.params;
    const { models } = req;

    console.log(`🏷️ Marking barcode as printed for product: ${id}`);

    const product = await models.Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (!product.barcode) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a barcode'
      });
    }

    product.barcodePrinted = true;
    product.lastPrintedAt = new Date();
    product.updatedAt = new Date();

    await product.save();

    res.json({
      success: true,
      data: {
        barcodePrinted: product.barcodePrinted,
        lastPrintedAt: product.lastPrintedAt,
        product: {
          _id: product._id,
          name: product.name,
          barcode: product.barcode
        }
      },
      message: 'Barcode marked as printed successfully'
    });

  } catch (error) {
    console.error('❌ Error marking barcode as printed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark barcode as printed',
      error: error.message
    });
  }
});

// Get barcode statistics
app.get('/api/products/barcode-stats', verifyToken, async (req, res) => {
  try {
    const { shopId } = req.query;
    const { models } = req;

    console.log(`📊 Getting barcode statistics for shop: ${shopId || 'all'}`);

    let query = {};
    
    if (shopId && shopId !== 'all') {
      query.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const products = await models.Product.find(query);
    
    const stats = {
      totalProducts: products.length,
      withBarcode: products.filter(p => p.barcode).length,
      withoutBarcode: products.filter(p => !p.barcode).length,
      barcodePrinted: products.filter(p => p.barcodePrinted).length,
      barcodeNotPrinted: products.filter(p => p.barcode && !p.barcodePrinted).length,
      byBarcodeType: {}
    };

    products.forEach(product => {
      if (product.barcodeType) {
        stats.byBarcodeType[product.barcodeType] = (stats.byBarcodeType[product.barcodeType] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: stats,
      message: 'Barcode statistics retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error getting barcode statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get barcode statistics',
      error: error.message
    });
  }
});

// ==================== PROTECTED CRUD ENDPOINTS ====================

// Products API with barcode support
app.get('/api/products', verifyToken, async (req, res) => {
  try {
    const { shopId, search, barcode, category } = req.query;
    const { models } = req;
    
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
        { barcode: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (barcode) {
      filter.barcode = barcode;
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    const products = await models.Product.find(filter)
      .populate('shop', 'name location type')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: products,
      count: products.length
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

app.post('/api/products', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const productData = req.body;
    
    console.log('🆕 Creating product:', {
      name: productData.name,
      barcode: productData.barcode,
      barcodeType: productData.barcodeType
    });

    // Check if barcode already exists in the same shop
    if (productData.barcode) {
      const existingProduct = await models.Product.findOne({
        barcode: productData.barcode,
        $or: [
          { shop: productData.shop },
          { shopId: productData.shopId || productData.shop }
        ]
      });
      
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'Barcode already exists for another product in this shop'
        });
      }
      
      productData.barcodeGenerated = true;
    }

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
    
    // Log product creation
    await auditLogger.logProductUpdate(req.user, product._id, {
      action: 'CREATE',
      name: product.name,
      barcode: product.barcode
    }, req);
    
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

app.put('/api/products/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const productData = req.body;

    console.log('✏️ Updating product:', id);

    const product = await models.Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check barcode uniqueness if changing barcode
    if (productData.barcode && productData.barcode !== product.barcode) {
      const existingProduct = await models.Product.findOne({
        _id: { $ne: id },
        barcode: productData.barcode,
        $or: [
          { shop: product.shop },
          { shopId: product.shopId || product.shop }
        ]
      });
      
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'Barcode already exists for another product in this shop'
        });
      }
      
      productData.barcodeGenerated = true;
    }

    if (productData.shop) {
      const shop = await models.Shop.findById(productData.shop);
      if (shop) {
        productData.shopName = shop.name;
        productData.shopId = shop._id;
      }
    }

    const oldProduct = { ...product.toObject() };
    const updatedProduct = await models.Product.findByIdAndUpdate(
      id,
      { ...productData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shop', 'name location type');

    // Log product update
    await auditLogger.logProductUpdate(req.user, updatedProduct._id, {
      action: 'UPDATE',
      changes: productData
    }, req);
    
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

app.delete('/api/products/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
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

    // Log product deletion
    await auditLogger.log('PRODUCT_DELETE', req.user, 'Product', id, {
      productName: product.name,
      barcode: product.barcode
    }, req);
    
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

// Shops API - FULL CRUD
app.get('/api/shops', verifyToken, async (req, res) => {
  try {
    const { models } = req;
    const shops = await models.Shop.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: shops,
      count: shops.length
    });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
});

app.post('/api/shops', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const shopData = req.body;
    
    const shop = new models.Shop(shopData);
    await shop.save();
    
    res.status(201).json({
      success: true,
      data: shop,
      message: 'Shop created successfully'
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create shop',
      error: error.message
    });
  }
});

app.put('/api/shops/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const shopData = req.body;
    
    const shop = await models.Shop.findByIdAndUpdate(
      id,
      { ...shopData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.json({
      success: true,
      data: shop,
      message: 'Shop updated successfully'
    });
  } catch (error) {
    console.error('Error updating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shop',
      error: error.message
    });
  }
});

app.delete('/api/shops/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    const shop = await models.Shop.findByIdAndDelete(id);
    
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }
    
    res.json({
      success: true,
      data: shop,
      message: 'Shop deleted successfully'
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

// Cashiers API with shop isolation - FULL CRUD
app.get('/api/cashiers', verifyToken, async (req, res) => {
  try {
    const { shopId } = req.query;
    const { models } = req;
    
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shopId: shopId },
        { shopName: { $regex: shopId, $options: 'i' } }
      ];
    }

    const cashiers = await models.Cashier.find(filter)
      .populate('shopId', 'name location')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: cashiers,
      count: cashiers.length
    });
  } catch (error) {
    console.error('Error fetching cashiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashiers',
      error: error.message
    });
  }
});

app.post('/api/cashiers', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const cashierData = req.body;
    
    // Hash password if provided
    if (cashierData.password) {
      const salt = await bcrypt.genSalt(12);
      cashierData.password = await bcrypt.hash(cashierData.password, salt);
    }
    
    if (cashierData.shopId) {
      const shop = await models.Shop.findById(cashierData.shopId);
      if (shop) {
        cashierData.shopName = shop.name;
      }
    }

    const cashier = new models.Cashier(cashierData);
    await cashier.save();
    
    await cashier.populate('shopId', 'name location');
    
    res.status(201).json({
      success: true,
      data: cashier,
      message: 'Cashier created successfully'
    });
  } catch (error) {
    console.error('Error creating cashier:', error);
    
    // Handle duplicate email error
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

app.put('/api/cashiers/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    const cashierData = req.body;
    
    // Don't update password if not provided
    if (!cashierData.password || cashierData.password === '') {
      delete cashierData.password;
    } else if (cashierData.password) {
      // Hash new password
      const salt = await bcrypt.genSalt(12);
      cashierData.password = await bcrypt.hash(cashierData.password, salt);
    }
    
    if (cashierData.shopId) {
      const shop = await models.Shop.findById(cashierData.shopId);
      if (shop) {
        cashierData.shopName = shop.name;
      }
    }

    const cashier = await models.Cashier.findByIdAndUpdate(
      id,
      { ...cashierData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shopId', 'name location');
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('Error updating cashier:', error);
    
    // Handle duplicate email error
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

app.delete('/api/cashiers/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { models } = req;
    const { id } = req.params;
    
    const cashier = await models.Cashier.findByIdAndDelete(id);
    
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    
    res.json({
      success: true,
      data: cashier,
      message: 'Cashier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cashier',
      error: error.message
    });
  }
});

// Expenses API with shop isolation - FULL CRUD
app.get('/api/expenses', verifyToken, async (req, res) => {
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
      .populate('shop', 'name location')
      .sort({ date: -1 });
    
    res.json({
      success: true,
      data: expenses,
      count: expenses.length
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

app.post('/api/expenses', verifyToken, authorizeRole('admin', 'cashier'), async (req, res) => {
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

app.put('/api/expenses/:id', verifyToken, authorizeRole('admin', 'cashier'), async (req, res) => {
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

app.delete('/api/expenses/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
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

// ==================== ENHANCED ANALYTICS ENDPOINTS ====================

// Get product statistics
app.get('/api/products/stats/overview', verifyToken, async (req, res) => {
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
    const withBarcode = products.filter(p => p.barcode).length;
    const withoutBarcode = totalProducts - withBarcode;
    const printedBarcodes = products.filter(p => p.barcodePrinted).length;

    // Calculate total inventory value
    const totalInventoryValue = products.reduce((sum, product) => {
      return sum + (product.currentStock * product.buyingPrice);
    }, 0);

    // Calculate total potential revenue
    const totalPotentialRevenue = products.reduce((sum, product) => {
      return sum + (product.currentStock * product.minSellingPrice);
    }, 0);

    // Get categories
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    
    // Get barcode types
    const barcodeTypes = {};
    products.forEach(product => {
      if (product.barcodeType) {
        barcodeTypes[product.barcodeType] = (barcodeTypes[product.barcodeType] || 0) + 1;
      }
    });

    const stats = {
      overview: {
        totalProducts,
        outOfStock,
        lowStock,
        inStock,
        withBarcode,
        withoutBarcode,
        printedBarcodes,
        totalInventoryValue,
        totalPotentialRevenue,
        averageStockValue: totalProducts > 0 ? totalInventoryValue / totalProducts : 0
      },
      categories: categories.map(category => ({
        name: category,
        count: products.filter(p => p.category === category).length,
        products: products.filter(p => p.category === category).slice(0, 5)
      })),
      barcodeStats: {
        byType: barcodeTypes,
        totalWithBarcode: withBarcode,
        totalWithoutBarcode: withoutBarcode,
        printedVsNotPrinted: {
          printed: printedBarcodes,
          notPrinted: withBarcode - printedBarcodes
        }
      },
      stockAnalysis: {
        stockValueByCategory: {},
        reorderNeeded: products.filter(p => p.currentStock <= (p.minStockLevel || 5)).length,
        zeroStock: outOfStock
      }
    };

    // Calculate stock value by category
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

// Get low stock products
app.get('/api/products/low-stock', verifyToken, async (req, res) => {
  try {
    const { shopId, limit = 20 } = req.query;
    const { models } = req;
    
    let filter = {
      currentStock: { $gt: 0 },
      $expr: { $lte: ['$currentStock', '$minStockLevel'] }
    };
    
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const lowStockProducts = await models.Product.find(filter)
      .populate('shop', 'name location type')
      .sort({ currentStock: 1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: lowStockProducts,
      count: lowStockProducts.length,
      message: 'Low stock products retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch low stock products',
      error: error.message
    });
  }
});

// Get out of stock products
app.get('/api/products/out-of-stock', verifyToken, async (req, res) => {
  try {
    const { shopId, limit = 20 } = req.query;
    const { models } = req;
    
    let filter = { currentStock: 0 };
    
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const outOfStockProducts = await models.Product.find(filter)
      .populate('shop', 'name location type')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: outOfStockProducts,
      count: outOfStockProducts.length,
      message: 'Out of stock products retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching out of stock products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch out of stock products',
      error: error.message
    });
  }
});

// Get products without barcodes
app.get('/api/products/without-barcode', verifyToken, async (req, res) => {
  try {
    const { shopId, limit = 50 } = req.query;
    const { models } = req;
    
    let filter = { 
      barcode: { $exists: false }
    };
    
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const productsWithoutBarcode = await models.Product.find(filter)
      .populate('shop', 'name location type')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: productsWithoutBarcode,
      count: productsWithoutBarcode.length,
      message: 'Products without barcode retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching products without barcode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products without barcode',
      error: error.message
    });
  }
});

// ==================== PAYMENT COMPOSITION DASHBOARD ====================

// Get payment composition analytics
app.get('/api/analytics/payment-composition', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, shopId, cashierId } = req.query;
    const { models } = req;

    console.log('💰 Analyzing payment composition...', { startDate, endDate, shopId, cashierId });

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
    }

    const transactions = await models.Transaction.find(filter)
      .populate('shop', 'name')
      .populate('cashierId', 'name')
      .sort({ saleDate: -1 });

    // Calculate payment composition
    const composition = {
      cash: 0,
      bank_mpesa: 0,
      total: 0,
      transactions: transactions.length,
      byDate: {},
      byCashier: {},
      byShop: {}
    };

    transactions.forEach(transaction => {
      const cashAmount = CalculationUtils.safeNumber(transaction.paymentSplit?.cash);
      const bankMpesaAmount = CalculationUtils.safeNumber(transaction.paymentSplit?.bank_mpesa);
      
      composition.cash += cashAmount;
      composition.bank_mpesa += bankMpesaAmount;
      composition.total += cashAmount + bankMpesaAmount;

      // Group by date
      const dateStr = transaction.saleDate.toISOString().split('T')[0];
      if (!composition.byDate[dateStr]) {
        composition.byDate[dateStr] = { cash: 0, bank_mpesa: 0, total: 0 };
      }
      composition.byDate[dateStr].cash += cashAmount;
      composition.byDate[dateStr].bank_mpesa += bankMpesaAmount;
      composition.byDate[dateStr].total += cashAmount + bankMpesaAmount;

      // Group by cashier
      const cashierName = transaction.cashierName || 'Unknown';
      if (!composition.byCashier[cashierName]) {
        composition.byCashier[cashierName] = { cash: 0, bank_mpesa: 0, total: 0 };
      }
      composition.byCashier[cashierName].cash += cashAmount;
      composition.byCashier[cashierName].bank_mpesa += bankMpesaAmount;
      composition.byCashier[cashierName].total += cashAmount + bankMpesaAmount;

      // Group by shop
      const shopName = transaction.shopName || 'Unknown';
      if (!composition.byShop[shopName]) {
        composition.byShop[shopName] = { cash: 0, bank_mpesa: 0, total: 0 };
      }
      composition.byShop[shopName].cash += cashAmount;
      composition.byShop[shopName].bank_mpesa += bankMpesaAmount;
      composition.byShop[shopName].total += cashAmount + bankMpesaAmount;
    });

    // Calculate percentages
    composition.cashPercentage = composition.total > 0 ? (composition.cash / composition.total) * 100 : 0;
    composition.bankMpesaPercentage = composition.total > 0 ? (composition.bank_mpesa / composition.total) * 100 : 0;

    // Convert objects to arrays for easier consumption
    composition.byDateArray = Object.entries(composition.byDate).map(([date, data]) => ({
      date,
      ...data,
      cashPercentage: data.total > 0 ? (data.cash / data.total) * 100 : 0,
      bankMpesaPercentage: data.total > 0 ? (data.bank_mpesa / data.total) * 100 : 0
    })).sort((a, b) => a.date.localeCompare(b.date));

    composition.byCashierArray = Object.entries(composition.byCashier).map(([cashier, data]) => ({
      cashier,
      ...data,
      cashPercentage: data.total > 0 ? (data.cash / data.total) * 100 : 0,
      bankMpesaPercentage: data.total > 0 ? (data.bank_mpesa / data.total) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    composition.byShopArray = Object.entries(composition.byShop).map(([shop, data]) => ({
      shop,
      ...data,
      cashPercentage: data.total > 0 ? (data.cash / data.total) * 100 : 0,
      bankMpesaPercentage: data.total > 0 ? (data.bank_mpesa / data.total) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    res.json({
      success: true,
      data: composition,
      message: 'Payment composition analysis completed successfully'
    });

  } catch (error) {
    console.error('❌ Error analyzing payment composition:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze payment composition',
      error: error.message
    });
  }
});

// Get cashier payment performance
app.get('/api/analytics/cashier-payment-performance', verifyToken, async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    const { models } = req;

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

    const transactions = await models.Transaction.find(filter)
      .populate('cashierId', 'name email shopName')
      .sort({ saleDate: -1 });

    const cashierPerformance = {};

    transactions.forEach(transaction => {
      const cashierId = transaction.cashierId?._id || transaction.cashierId;
      const cashierName = transaction.cashierName || 'Unknown';

      if (!cashierPerformance[cashierId]) {
        cashierPerformance[cashierId] = {
          cashierId,
          cashierName,
          totalTransactions: 0,
          totalAmount: 0,
          cashAmount: 0,
          bankMpesaAmount: 0,
          averageTransaction: 0,
          lastTransactionDate: transaction.saleDate
        };
      }

      const cashAmount = CalculationUtils.safeNumber(transaction.paymentSplit?.cash);
      const bankMpesaAmount = CalculationUtils.safeNumber(transaction.paymentSplit?.bank_mpesa);
      const totalAmount = cashAmount + bankMpesaAmount;

      cashierPerformance[cashierId].totalTransactions++;
      cashierPerformance[cashierId].totalAmount += totalAmount;
      cashierPerformance[cashierId].cashAmount += cashAmount;
      cashierPerformance[cashierId].bankMpesaAmount += bankMpesaAmount;
      cashierPerformance[cashierId].lastTransactionDate = transaction.saleDate;
    });

    // Calculate averages and percentages
    const performanceArray = Object.values(cashierPerformance).map(performance => ({
      ...performance,
      averageTransaction: performance.totalTransactions > 0 
        ? performance.totalAmount / performance.totalTransactions 
        : 0,
      cashPercentage: performance.totalAmount > 0 
        ? (performance.cashAmount / performance.totalAmount) * 100 
        : 0,
      bankMpesaPercentage: performance.totalAmount > 0 
        ? (performance.bankMpesaAmount / performance.totalAmount) * 100 
        : 0
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    res.json({
      success: true,
      data: performanceArray,
      message: 'Cashier payment performance analysis completed'
    });

  } catch (error) {
    console.error('❌ Error analyzing cashier payment performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze cashier payment performance',
      error: error.message
    });
  }
});

// ==================== ROOT ENDPOINT ====================

app.get('/', (req, res) => {
  res.json({
    message: process.env.APP_NAME || 'Stanzo Shop Management API',
    version: process.env.APP_VERSION || '3.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    features: {
      tokenAuthentication: 'enabled',
      paymentComposition: 'enabled',
      shopDataIsolation: 'enabled',
      cashierDataIsolation: 'enabled',
      barcodeManagement: 'enabled',
      auditLogging: 'enabled',
      supermarketPOS: 'enabled'
    },
    security: {
      tokenExpiry: TOKEN_EXPIRY,
      refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
      tokenBlacklisting: 'enabled'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: req.dbConnection?.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// ==================== ERROR HANDLER ====================

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
        console.log(`🚀 ENHANCED SUPERMARKET MANAGEMENT SERVER STARTED SUCCESSFULLY!`);
        console.log('='.repeat(60));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
        console.log(`🔐 Token Authentication: ENABLED`);
        console.log(`💰 Payment Composition: ENABLED`);
        console.log(`🏪 Shop Data Isolation: ENABLED`);
        console.log(`👤 Cashier Data Isolation: ENABLED`);
        console.log(`📦 Barcode Management: ENABLED`);
        console.log(`📝 Audit Logging: ENABLED`);
        console.log(`🎫 Token Expiry: ${TOKEN_EXPIRY}`);
        console.log(`🔄 Token Refresh: ENABLED`);
        console.log('='.repeat(60) + '\n');
      });
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  };
  
  startServer();
}

module.exports = app;