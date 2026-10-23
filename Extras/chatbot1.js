import express from 'express';
import auth from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// @route   POST api/chatbot/message
// @desc    Send a message to the chatbot and get a response
// @access  Private
router.post('/message', auth, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ msg: 'Please provide a message' });
    }
    
    // Simple response for now - in a real application, 
    // this would connect to an actual AI service
    const responses = [
      "Thank you for sharing. How are you feeling today?",
      "I understand that can be challenging. What specific concerns do you have?",
      "It's normal to feel overwhelmed during the postpartum period. Have you been able to get any rest?",
      "Remember that it's okay to ask for help. Have you discussed this with your healthcare provider?",
      "I'm here to support you. Would you like some resources on postpartum recovery?"
    ];
    
    // Simple random response for demo purposes
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    // Find user and add to chat history
    const user = await User.findById(req.user.id);
    
    if (user) {
      // Add to chat history
      user.chatHistory.push({
        message,
        response
      });
      
      await user.save();
    }
    
    res.json({ 
      success: true, 
      response,
      userId: req.user.id
    });
  } catch (err) {
    console.error('Chatbot error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   GET api/chatbot/history
// @desc    Get user's chat history
// @access  Private
router.get('/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json({
      success: true,
      history: user.chatHistory
    });
  } catch (err) {
    console.error('History retrieval error:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

export default router; 