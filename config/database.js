// config/database.js
const mongoose = require('mongoose');

let cachedConnection = null;

/**
 * Connects to MongoDB using MONGODB_URI from .env
 * - No hardcoded fallback (prevents connecting to the wrong database)
 * - Logs the database name so you can verify at a glance
 * - Returns null on failure so the server can still boot
 */
const connectDB = async () => {
  // Reuse existing healthy connection
  if (cachedConnection && cachedConnection.readyState === 1) {
    return cachedConnection;
  }

  try {
    // Tear down any half-open connection before reconnecting
    if (cachedConnection) {
      await mongoose.disconnect();
      cachedConnection = null;
    }

    // ---------- Validate the URI ----------
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      console.error('❌ MONGODB_URI is not set.');
      console.error('   → Create or check: C:\\Stan\\New\\back\\.env');
      console.error('   → It must contain a line like:');
      console.error('     MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority');
      return null;
    }

    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      console.error('❌ MONGODB_URI is malformed — must start with mongodb:// or mongodb+srv://');
      console.error(`   Received: ${uri.slice(0, 40)}...`);
      return null;
    }

    // Extract DB name (segment between last '/' and first '?')
    const dbName = uri.split('/').pop().split('?')[0] || '(default)';

    console.log('🔄 Connecting to MongoDB...');
    console.log(`   database: ${dbName}`);

    // ---------- Connect ----------
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      maxPoolSize: 5,
      minPoolSize: 1,
      maxIdleTimeMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      bufferCommands: false,
      family: 4 // Force IPv4 — fixes common Windows/ISP IPv6 timeouts
    });

    cachedConnection = mongoose.connection;

    console.log('✅ MongoDB connected');
    console.log(`   database: ${cachedConnection.name}`);
    console.log(`   host:     ${cachedConnection.host}`);

    // Handle post-connect events
    cachedConnection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
      cachedConnection = null;
    });

    cachedConnection.on('error', (err) => {
      console.error('❌ MongoDB error:', err.message);
    });

    return cachedConnection;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   → Check:');
    console.error('     1. Atlas cluster is running (not paused)');
    console.error('     2. Your IP is whitelisted in Atlas → Network Access');
    console.error('     3. Port 27017 not blocked by firewall/VPN');
    console.error('     4. Username & password in the URI are correct');
    console.error('     5. Database name in URI matches exactly (case-sensitive!)');
    cachedConnection = null;
    return null;
  }
};

const getConnection = () => cachedConnection;

module.exports = { connectDB, getConnection };