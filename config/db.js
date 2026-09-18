const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in your .env file');
    }

    console.log('🔗 Attempting DB connection...');
    console.log('📂 Target database:', uri.split('/').pop().split('?')[0]);

    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      connectTimeoutMS: 30000,
      family: 4,
      retryWrites: true,
      w: 'majority'
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Actual database name: ${conn.connection.name}`);

    mongoose.connection.on('connected', () => console.log('Mongoose connected to DB'));
    mongoose.connection.on('error', (err) => console.error(`Mongoose connection error: ${err}`));
    mongoose.connection.on('disconnected', () => console.log('Mongoose disconnected'));

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('Mongoose connection closed through app termination');
      process.exit(0);
    });

  } catch (err) {
    console.error(`❌ Database connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;