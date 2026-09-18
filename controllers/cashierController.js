// backend/controllers/cashierController.js
const Cashier = require('../models/Cashier');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const validator = require('validator');

// Generate JWT token for cashier
const generateCashierToken = (id) => {
  return jwt.sign(
    { id, role: 'cashier' }, 
    process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production',
    { expiresIn: '8h' } // Shorter expiration for cashiers
  );
};

// @desc    Login cashier
// @route   POST /api/v1/cashiers/login
// @access  Public
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Check if cashier exists && password is correct
  const cashier = await Cashier.findOne({ email: email.toLowerCase().trim() }).select('+password');
  
  if (!cashier || !(await bcrypt.compare(password, cashier.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // Check if cashier is active
  if (cashier.status !== 'active') {
    return next(new AppError('Your account has been deactivated. Please contact an administrator.', 401));
  }

  // Record exact last login timestamp
  cashier.lastLogin = new Date();
  await cashier.save({ validateBeforeSave: false });

  // If everything ok, send token to client
  const token = generateCashierToken(cashier._id);

  // Remove password from output
  cashier.password = undefined;

  res.status(200).json({
    status: 'success',
    token,
    data: {
      cashier
    }
  });
});

// @desc    Register new cashier
// @route   POST /api/v1/cashiers
// @access  Private/Admin
exports.registerCashier = catchAsync(async (req, res, next) => {
  const { name, email, password, club, phone } = req.body;

  // Validate input
  if (!name || !name.trim()) {
    return next(new AppError('Name is required', 400));
  }

  if (!email || !validator.isEmail(email)) {
    return next(new AppError('Please provide a valid email', 400));
  }

  if (!password || password.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }

  // Check for existing cashier
  const existingCashier = await Cashier.findOne({ email: email.toLowerCase() });
  if (existingCashier) {
    return next(new AppError('Email already in use', 400));
  }

  // Create new cashier
  const cashier = await Cashier.create({
    name: name.trim(),
    email: email.toLowerCase(),
    password,
    phone: phone ? phone.trim() : '',
    role: 'cashier',
    club: club || '',
    status: 'active' // Default status
  });

  // Remove password from output
  cashier.password = undefined;

  res.status(201).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Get all cashiers
// @route   GET /api/v1/cashiers
// @access  Private/Admin
exports.getAllCashiers = catchAsync(async (req, res, next) => {
  const cashiers = await Cashier.find().select('-password');
  
  res.status(200).json({
    status: 'success',
    results: cashiers.length,
    data: {
      cashiers
    }
  });
});

// @desc    Get single cashier
// @route   GET /api/v1/cashiers/:id
// @access  Private/Admin
exports.getCashier = catchAsync(async (req, res, next) => {
  const cashier = await Cashier.findById(req.params.id).select('-password');
  
  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Update cashier (supports partial updates including status & password)
// @route   PATCH /api/v1/cashiers/:id
// @access  Private/Admin
exports.updateCashier = catchAsync(async (req, res, next) => {
  // Filter allowed fields to update
  const allowedUpdates = ['name', 'email', 'status', 'club', 'phone', 'password'];
  const updates = Object.keys(req.body);
  
  const isValidOperation = updates.every(update => 
    allowedUpdates.includes(update)
  );

  if (!isValidOperation) {
    return next(new AppError('Invalid updates!', 400));
  }

  // Handle email uniqueness if email is being updated
  if (req.body.email) {
    const existingCashier = await Cashier.findOne({ 
      email: req.body.email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    
    if (existingCashier) {
      return next(new AppError('Email already in use', 400));
    }
    req.body.email = req.body.email.toLowerCase().trim();
  }

  // Validate status enum
  if (req.body.status && !['active', 'inactive'].includes(req.body.status)) {
    return next(new AppError('Status must be either active or inactive', 400));
  }

  // Normalize fields
  if (req.body.name) req.body.name = req.body.name.trim();
  if (req.body.phone !== undefined) req.body.phone = req.body.phone ? req.body.phone.trim() : '';
  if (req.body.club !== undefined) req.body.club = req.body.club || '';

  // Handle password update (needs to go through model pre-save hook)
  let cashier;
  if (req.body.password) {
    cashier = await Cashier.findById(req.params.id);
    if (!cashier) {
      return next(new AppError('No cashier found with that ID', 404));
    }
    Object.keys(req.body).forEach(key => {
      if (key !== 'password') cashier[key] = req.body[key];
    });
    cashier.password = req.body.password;
    await cashier.save();
    cashier = await Cashier.findById(req.params.id).select('-password');
  } else {
    cashier = await Cashier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { 
        new: true,
        runValidators: true
      }
    ).select('-password');
  }

  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Delete cashier
// @route   DELETE /api/v1/cashiers/:id
// @access  Private/Admin
exports.deleteCashier = catchAsync(async (req, res, next) => {
  const cashier = await Cashier.findByIdAndDelete(req.params.id);

  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

// @desc    Get current cashier profile
// @route   GET /api/v1/cashiers/me
// @access  Private/Cashier
exports.getMe = catchAsync(async (req, res, next) => {
  const cashier = await Cashier.findById(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      cashier
    }
  });
});