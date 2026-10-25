import mongoose from 'mongoose';

// A single-use link token (password reset, email verification). Only the hash of the token is
// stored, never the token that went into the email, so a copy of the database cannot be used to
// reset anyone's password. MongoDB deletes each entry by itself once expiresAt has passed.
const authTokenSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  purpose: {
    type: String,
    enum: ['reset', 'verify'],
    required: true
  },
  hash: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuthToken', authTokenSchema);
