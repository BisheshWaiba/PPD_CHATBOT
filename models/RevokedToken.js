import mongoose from 'mongoose';

// A token that was signed out. It only needs remembering until it would have expired anyway:
// MongoDB deletes each entry by itself once expiresAt has passed (expireAfterSeconds: 0).
const revokedTokenSchema = new mongoose.Schema({
  jti: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RevokedToken', revokedTokenSchema);
