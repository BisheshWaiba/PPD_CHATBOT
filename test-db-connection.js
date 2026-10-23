// Test MongoDB Connection
import mongoose from 'mongoose';
import 'dotenv/config';

async function testConnection() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI environment variable is not defined.');
      console.error('Please create a .env file with your MongoDB connection string.');
      return;
    }

    console.log('Attempting to connect to MongoDB...');
    console.log(`URI: ${process.env.MONGO_URI.substring(0, 25)}...`);
    
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ MongoDB connection successful!');
    console.log(`Connected to: ${mongoose.connection.host}`);
    console.log(`Database name: ${mongoose.connection.name}`);
    
    // Verify JWT environment variables
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET is not defined. Authentication will not work properly.');
    } else {
      console.log('✅ JWT_SECRET is defined.');
    }
    
    if (!process.env.JWT_EXPIRE) {
      console.warn('⚠️ JWT_EXPIRE is not defined. Using default expiration time.');
    } else {
      console.log(`✅ JWT_EXPIRE is set to: ${process.env.JWT_EXPIRE}`);
    }
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error(error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('The MongoDB server hostname could not be found. Check your connection string.');
    } else if (error.message.includes('ETIMEDOUT')) {
      console.error('Connection timed out. Check your network or MongoDB Atlas IP whitelist settings.');
    } else if (error.message.includes('Authentication failed')) {
      console.error('Username or password is incorrect in your connection string.');
    }
  } finally {
    // Close the connection regardless of success or failure
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('MongoDB connection closed.');
    }
    process.exit(0);
  }
}

testConnection(); 