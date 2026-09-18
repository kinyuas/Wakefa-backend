// middleware/rateLimiters.js
let rateLimit;
let ipKeyGenerator;

try {
  rateLimit = require('express-rate-limit');
  // ipKeyGenerator was added in express-rate-limit v7.4+
  ipKeyGenerator = rateLimit.ipKeyGenerator || ((ip) => ip);
} catch {
  console.warn('⚠️  express-rate-limit not installed — rate limiting disabled');
  const passthrough = () => (req, res, next) => next();
  module.exports = {
    apiLimiter: passthrough(),
    requestCodeLimiter: passthrough(),
    verifyCodeLimiter: passthrough(),
    loginLimiter: passthrough()
  };
  return;
}

// ---------- Generic API limiter ----------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// ---------- Request-code limiter (anti-duplicate-email) ----------
// IPv6-safe: uses ipKeyGenerator() helper as required by express-rate-limit v7.4+
const requestCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const email = (req.body?.email || '').toLowerCase().trim();
    const ip = ipKeyGenerator(req.ip);
    return `${ip}:${email}`;
  },
  message: {
    success: false,
    message: 'Please wait 60 seconds before requesting another code.'
  }
});

// ---------- Verify-code limiter ----------
const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' }
});

// ---------- Login limiter ----------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

module.exports = { apiLimiter, requestCodeLimiter, verifyCodeLimiter, loginLimiter };