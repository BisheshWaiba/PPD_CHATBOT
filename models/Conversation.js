import mongoose from 'mongoose';

// One saved chat. Every query filters on userId, so an account can only ever reach its own.
// messageCount and preview are kept up to date as messages are added, so listing a person's
// chats never has to load the messages themselves.
const conversationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },
  preview: {
    type: String,
    default: ''
  },
  messages: [{
    _id: false,
    role: { type: String, enum: ['user', 'bot'], required: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now }
  }]
});

conversationSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
