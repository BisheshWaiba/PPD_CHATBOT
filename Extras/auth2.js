import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();
const router = express.Router();

// In-memory store as fallback for when MongoDB is unavailable
const users = [];
let nextUserId = 1;

// Helper functions for in-memory store
const findUserByEmail = (email) => users.find(user => user.email === email);
const findUserByUsername = (username) => users.find(user => user.username === username);
const findUserById = (id) => users.find(user => user.id === id);

// Validation middleware
const validateSignup = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/\d/).withMessage('Password must contain a number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain a special character'),
];

const validateLogin = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Check if MongoDB is connected
const isMongoConnected = () => {
  return global.mongoose && global.mongoose.connection.readyState === 1;
};

// Register new user
router.post('/register', validateSignup, async (req, res) => {
  console.log('Registration request received:', { 
    ...req.body, 
    password: req.body.password ? '********' : undefined 
  });

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { firstName, lastName, username, email, password, phoneNumber } = req.body;

    // Try to use MongoDB if connected
    if (isMongoConnected()) {
      // Check if user already exists
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        console.log('Email already in use:', email);
        return res.status(400).json({ message: 'Email already in use' });
      }

      const existingUserByUsername = await User.findOne({ username });
      if (existingUserByUsername) {
        console.log('Username already taken:', username);
        return res.status(400).json({ message: 'Username already taken' });
      }

      // Create new user
      const user = new User({
        firstName,
        lastName,
        username,
        email,
        password,
        phoneNumber
      });

      // Save user to database
      await user.save();
      console.log('User saved to database:', user._id);

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      const response = {
        message: 'User registered successfully',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email
        }
      };
      return res.status(201).json(response);
    } else {
      // MongoDB not connected, use in-memory store
      console.log('Using in-memory store for registration (MongoDB not connected)');
      
      // Check if user already exists in memory
      if (findUserByEmail(email)) {
        console.log('Email already in use:', email);
        return res.status(400).json({ message: 'Email already in use' });
      }
      
      if (findUserByUsername(username)) {
        console.log('Username already taken:', username);
        return res.status(400).json({ message: 'Username already taken' });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Create new user in memory
      const id = String(nextUserId++);
      const user = {
        id,
        firstName,
        lastName,
        username,
        email,
        password: hashedPassword,
        phoneNumber,
        createdAt: new Date()
      };
      users.push(user);
      console.log('User saved to in-memory store:', id);
      
      // Generate JWT token (longer expiry for better user experience)
      const token = jwt.sign(
        { userId: id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      const response = {
        message: 'User registered successfully',
        token,
        user: {
          id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email
        }
      };
      return res.status(201).json(response);
    }
  } catch (error) {
    console.error('Registration error details:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', validateLogin, async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Try to use MongoDB if connected
    if (isMongoConnected()) {
      console.log('Using MongoDB for login');
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: req.body.remember ? '30d' : '7d' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email
        }
      });
    } else {
      // MongoDB not connected, use in-memory store
      console.log('Using in-memory store for login (MongoDB not connected)');
      
      // Find user by email
      const user = findUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }
      
      // Check password
      try {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ message: 'Invalid email or password' });
        }
      } catch (passwordError) {
        console.error('Password comparison error:', passwordError);
        return res.status(500).json({ message: 'Error validating credentials' });
      }
      
      // Generate JWT token
      try {
        const token = jwt.sign(
          { userId: user.id },
          process.env.JWT_SECRET,
          { expiresIn: req.body.remember ? '30d' : '7d' }
        );
        
        return res.json({
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            email: user.email
          }
        });
      } catch (jwtError) {
        console.error('JWT signing error:', jwtError);
        return res.status(500).json({ message: 'Error generating authentication token' });
      }
    }
  } catch (error) {
    console.error('Login error details:', error);
    res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
});

// Get current user
router.get('/user', async (req, res) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to use MongoDB if connected
    if (isMongoConnected()) {
      // Find user by id
      const user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      return res.json(user);
    } else {
      // MongoDB not connected, use in-memory store
      console.log('Using in-memory store for getting user (MongoDB not connected)');
      
      // Find user by id
      const user = findUserById(decoded.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Remove password from user object before sending
      const { password, ...userWithoutPassword } = user;
      return res.json(userWithoutPassword);
    }
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
});

// Diagnostic route to check server status and create a test user
router.get('/test-setup', async (req, res) => {
  try {
    console.log('Test setup route called');
    
    // Check MongoDB connection
    const mongoStatus = isMongoConnected() ? 'connected' : 'disconnected';
    console.log('MongoDB status:', mongoStatus);
    
    // Check JWT secret
    const jwtStatus = process.env.JWT_SECRET ? 'configured' : 'missing';
    console.log('JWT status:', jwtStatus);
    
    // Create test user in memory
    const testEmail = 'test@example.com';
    const testPassword = 'Test@123';
    
    // Delete existing test user if found
    if (findUserByEmail(testEmail)) {
      const index = users.findIndex(user => user.email === testEmail);
      if (index !== -1) {
        users.splice(index, 1);
        console.log('Deleted existing test user');
      }
    }
    
    // Create new test user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(testPassword, salt);
    
    const testUser = {
      id: 'test123',
      firstName: 'Test',
      lastName: 'User',
      username: 'testuser',
      email: testEmail,
      password: hashedPassword,
      createdAt: new Date()
    };
    
    users.push(testUser);
    console.log('Created test user:', testUser.email);
    
    return res.json({
      message: 'Diagnostic test complete',
      status: {
        mongo: mongoStatus,
        jwt: jwtStatus,
        testUser: {
          email: testEmail,
          password: 'Test@123', // Plaintext for testing only
          created: true
        }
      }
    });
  } catch (error) {
    console.error('Diagnostic test error:', error);
    res.status(500).json({ 
      message: 'Server error during diagnostic test',
      error: error.message 
    });
  }
});

// Direct login route for testing
router.get('/direct-login', async (req, res) => {
  try {
    console.log('Direct login route called');
    
    // Create a test user in memory if it doesn't exist
    const testEmail = 'test@example.com';
    const testPassword = 'Test@123';
    
    let testUser = findUserByEmail(testEmail);
    
    // Create test user if not exists
    if (!testUser) {
      console.log('Creating test user for direct login');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(testPassword, salt);
      
      testUser = {
        id: 'test123',
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        email: testEmail,
        password: hashedPassword,
        createdAt: new Date()
      };
      
      users.push(testUser);
    }
    
    // Generate token directly
    try {
      const token = jwt.sign(
        { userId: testUser.id },
        process.env.JWT_SECRET || 'mom_platform_fallback_secret_key_12345',
        { expiresIn: '30d' }
      );
      
      return res.json({
        message: 'Direct login successful',
        token,
        user: {
          id: testUser.id,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          username: testUser.username,
          email: testUser.email
        }
      });
    } catch (jwtError) {
      console.error('JWT signing error in direct login:', jwtError);
      return res.status(500).json({ 
        message: 'Error generating token', 
        error: jwtError.message 
      });
    }
  } catch (error) {
    console.error('Direct login error:', error);
    res.status(500).json({ 
      message: 'Server error during direct login', 
      error: error.message 
    });
  }
});

export default router; 