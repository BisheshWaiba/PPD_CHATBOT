import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables
dotenv.config();

// MongoDB Connection String
const mongoUser = process.env.MONGO_USER || 'manishbaral';
const mongoPass = process.env.MONGO_PASS || '1dIc0odKBV7ab3vX';
const mongoCluster = process.env.MONGO_CLUSTER || 'cluster0.0hwxpms.mongodb.net';
const mongoUri = `mongodb+srv://${mongoUser}:${mongoPass}@${mongoCluster}/?retryWrites=true&w=majority&appName=Cluster0`;

// Connect to MongoDB
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB Atlas');
  
  // View all users
  try {
    const users = await User.find({}).select('-password'); // Exclude passwords
    console.log('\n===== USERS IN DATABASE =====');
    
    if (users.length === 0) {
      console.log('No users found in the database.');
    } else {
      console.log(`Found ${users.length} users:`);
      users.forEach((user, index) => {
        console.log(`\nUser ${index + 1}:`);
        console.log(`Name: ${user.firstName} ${user.lastName}`);
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Created: ${user.createdAt}`);
      });
    }
  } catch (error) {
    console.error('Error fetching users:', error);
  }
  
  // Close the connection
  mongoose.connection.close();
  console.log('\nDatabase connection closed');
})
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
}); 