import mongoose from 'mongoose';

// Connects to MongoDB. Returns true only when the database is reachable AND its indexes are in
// place. The uri and options can be overridden (the tests do), otherwise MONGO_URI is used.
const connectDB = async (uri = process.env.MONGO_URI, options = {}) => {
  if (!uri) {
    console.warn('MONGO_URI is not set in your .env file. See MongoDB-Setup-Guide.md.');
    return false;
  }

  try {
    console.log('Attempting to connect to MongoDB...');

    const conn = await mongoose.connect(uri, {
      // Fail fast instead of hanging for 30 seconds when the server cannot be reached
      serverSelectionTimeoutMS: 5000,
      ...options
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    console.log('Check MONGO_URI in your .env file and that your IP address is allowed in MongoDB Atlas.');
    return false;
  }

  // The app depends on its indexes: a unique email stops two accounts sharing an address, unique
  // link and sign-out entries stop replays, and expiry indexes clear out old entries. Mongoose
  // builds them in the background and says nothing when one fails (for example because duplicate
  // accounts already exist), so wait for them here and refuse a database that cannot provide them.
  try {
    await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
  } catch (error) {
    console.error(`MongoDB is reachable, but a database index could not be built: ${error.message}`);
    console.error('Sign-up relies on a unique index on email, so this database is NOT being used until that is fixed.');
    console.error('(If it says "duplicate key", the users collection already holds two accounts with one email address.)');
    await mongoose.disconnect();
    return false;
  }

  return true;
};

export default connectDB;
