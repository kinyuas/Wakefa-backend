// config/constants.js
const crypto = require('crypto');

const SYSTEM_EMAIL = process.env.EMAIL_USER || 'kinyuastanzo6759@gmail.com';
const SYSTEM_EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || 'liblxnwmaspnvmvl';

const ALLOWED_ORIGINS = [
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
  // ✅ Production
  'https://wakefa-frontend.vercel.app'
];

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '8h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

const CODE_COOLDOWN_MS = 60 * 1000;
const CODE_EXPIRY_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

module.exports = {
  SYSTEM_EMAIL,
  SYSTEM_EMAIL_PASSWORD,
  ALLOWED_ORIGINS,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  CODE_COOLDOWN_MS,
  CODE_EXPIRY_MINUTES,
  MAX_CODE_ATTEMPTS,
  INACTIVITY_LIMIT_MS
};