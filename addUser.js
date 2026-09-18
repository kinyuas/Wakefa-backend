// C:\Stan\New\back\addUser.js
require('dotenv').config(); 
const mongoose = require('mongoose');
const User = require('./models/User'); 

const addNewUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB...');

    const existingUser = await User.findOne({ email: 'kinyuastanzo6759@gmail.com' });
    if (existingUser) {
      console.log('User already exists!');
      process.exit(0);
    }

    const newUser = new User({
      email: 'kinyuastanzo6759@gmail.com',
      name: 'Kinyua Admin', 
      role: 'admin',
      isActive: true
    });

    await newUser.save();
    console.log('✅ User successfully created!');
    
  } catch (error) {
    console.error('❌ Error creating user:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
};

addNewUser();