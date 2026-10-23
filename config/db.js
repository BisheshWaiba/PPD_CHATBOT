import mongoose from 'mongoose';

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI is not set in your .env file. See MongoDB-Setup-Guide.md.');
    return false;
  }

  try {
    console.log('Attempting to connect to MongoDB...');

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Fail fast instead of hanging for 30 seconds when the server cannot be reached
      serverSelectionTimeoutMS: 5000
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    console.log('Check MONGO_URI in your .env file and that your IP address is allowed in MongoDB Atlas.');
    return false;
  }
};

export default connectDB;
