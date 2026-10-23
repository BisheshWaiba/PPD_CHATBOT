import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import readline from 'readline';

// Load environment variables
dotenv.config();

// MongoDB Connection String
const mongoUser = process.env.MONGO_USER || 'manishbaral';
const mongoPass = process.env.MONGO_PASS || '1dIc0odKBV7ab3vX';
const mongoCluster = process.env.MONGO_CLUSTER || 'cluster0.0hwxpms.mongodb.net';
const mongoUri = `mongodb+srv://${mongoUser}:${mongoPass}@${mongoCluster}/?retryWrites=true&w=majority&appName=Cluster0`;

// Create readline interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Connect to MongoDB
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('Connected to MongoDB Atlas');
  showMenu();
})
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

// Main menu
function showMenu() {
  console.log('\n===== DATABASE ADMIN UTILITY =====');
  console.log('1. View all users');
  console.log('2. View all collections');
  console.log('3. Create a new user');
  console.log('4. Delete a user');
  console.log('5. Clear a collection');
  console.log('6. Connection status');
  console.log('0. Exit');
  
  rl.question('\nEnter your choice: ', async (choice) => {
    switch(choice) {
      case '1':
        await viewAllUsers();
        break;
      case '2':
        await viewAllCollections();
        break;
      case '3':
        await createNewUser();
        break;
      case '4':
        await deleteUser();
        break;
      case '5':
        await clearCollection();
        break;
      case '6':
        checkConnectionStatus();
        break;
      case '0':
        console.log('Closing database connection...');
        mongoose.connection.close();
        console.log('Connection closed. Goodbye!');
        rl.close();
        process.exit(0);
        break;
      default:
        console.log('Invalid choice. Please try again.');
        showMenu();
    }
  });
}

// View all users
async function viewAllUsers() {
  try {
    const users = await User.find({}).select('-password');
    console.log('\n===== USERS IN DATABASE =====');
    
    if (users.length === 0) {
      console.log('No users found in the database.');
    } else {
      console.log(`Found ${users.length} users:`);
      users.forEach((user, index) => {
        console.log(`\nUser ${index + 1}:`);
        console.log(`ID: ${user._id}`);
        console.log(`Name: ${user.firstName} ${user.lastName}`);
        console.log(`Username: ${user.username}`);
        console.log(`Email: ${user.email}`);
        console.log(`Created: ${user.createdAt}`);
      });
    }
  } catch (error) {
    console.error('Error fetching users:', error);
  }
  
  // Return to menu
  rl.question('\nPress Enter to return to the menu...', () => {
    showMenu();
  });
}

// View all collections
async function viewAllCollections() {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n===== COLLECTIONS IN DATABASE =====');
    
    if (collections.length === 0) {
      console.log('No collections found in the database.');
    } else {
      console.log(`Found ${collections.length} collections:`);
      collections.forEach((collection, index) => {
        console.log(`${index + 1}. ${collection.name}`);
      });
    }
  } catch (error) {
    console.error('Error fetching collections:', error);
  }
  
  // Return to menu
  rl.question('\nPress Enter to return to the menu...', () => {
    showMenu();
  });
}

// Create a new user
async function createNewUser() {
  console.log('\n===== CREATE NEW USER =====');
  
  rl.question('First Name: ', (firstName) => {
    rl.question('Last Name: ', (lastName) => {
      rl.question('Username: ', (username) => {
        rl.question('Email: ', (email) => {
          rl.question('Password: ', async (password) => {
            try {
              const newUser = new User({
                firstName,
                lastName,
                username,
                email,
                password
              });
              
              await newUser.save();
              console.log(`\nUser ${username} created successfully!`);
            } catch (error) {
              console.error('Error creating user:', error.message);
            }
            
            // Return to menu
            rl.question('\nPress Enter to return to the menu...', () => {
              showMenu();
            });
          });
        });
      });
    });
  });
}

// Delete a user
async function deleteUser() {
  console.log('\n===== DELETE USER =====');
  
  rl.question('Enter the username of the user to delete: ', async (username) => {
    try {
      const result = await User.deleteOne({ username });
      
      if (result.deletedCount === 1) {
        console.log(`User "${username}" was successfully deleted.`);
      } else {
        console.log(`User "${username}" not found.`);
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
    
    // Return to menu
    rl.question('\nPress Enter to return to the menu...', () => {
      showMenu();
    });
  });
}

// Clear a collection
async function clearCollection() {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n===== CLEAR COLLECTION =====');
    
    if (collections.length === 0) {
      console.log('No collections found in the database.');
      rl.question('\nPress Enter to return to the menu...', () => {
        showMenu();
      });
      return;
    }
    
    console.log('Available collections:');
    collections.forEach((collection, index) => {
      console.log(`${index + 1}. ${collection.name}`);
    });
    
    rl.question('\nEnter the name of the collection to clear: ', async (collectionName) => {
      rl.question(`Are you sure you want to clear all data from "${collectionName}"? (yes/no): `, async (confirm) => {
        if (confirm.toLowerCase() === 'yes') {
          try {
            const result = await mongoose.connection.db.collection(collectionName).deleteMany({});
            console.log(`Cleared ${result.deletedCount} documents from "${collectionName}".`);
          } catch (error) {
            console.error(`Error clearing collection "${collectionName}":`, error);
          }
        } else {
          console.log('Operation canceled.');
        }
        
        // Return to menu
        rl.question('\nPress Enter to return to the menu...', () => {
          showMenu();
        });
      });
    });
  } catch (error) {
    console.error('Error listing collections:', error);
    rl.question('\nPress Enter to return to the menu...', () => {
      showMenu();
    });
  }
}

// Check connection status
function checkConnectionStatus() {
  console.log('\n===== CONNECTION STATUS =====');
  console.log(`MongoDB connection state: ${mongoose.connection.readyState}`);
  console.log(`Connected to: ${mongoose.connection.host}`);
  console.log(`Database name: ${mongoose.connection.name}`);
  console.log(`Connection port: ${mongoose.connection.port}`);
  
  // Return to menu
  rl.question('\nPress Enter to return to the menu...', () => {
    showMenu();
  });
}

// Handle process termination
process.on('SIGINT', () => {
  mongoose.connection.close();
  console.log('\nMongoDB connection closed.');
  rl.close();
  process.exit(0);
}); 