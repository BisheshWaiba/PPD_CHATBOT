import mongoose from 'mongoose';
import { hashPassword, comparePassword } from '../util/passwords.js';
import { signToken } from '../util/jwt.js';
import { EMAIL_RE, EMAIL_MAX, NAME_MAX, PASSWORD_MIN, PASSWORD_MAX_BYTES } from '../util/validation.js';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
    maxlength: [NAME_MAX, `Name cannot be more than ${NAME_MAX} characters`]
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [EMAIL_MAX, 'Email is too long'],
    match: [EMAIL_RE, 'Please add a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`],
    validate: {
      // Checked on the plain password, before it is hashed
      validator: value => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES,
      message: `Password is too long (maximum ${PASSWORD_MAX_BYTES} bytes)`
    },
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Set once the person has opened the link we emailed to this address
  emailVerified: {
    type: Boolean,
    default: false
  },
  // A sign-in token carries the number it was issued under. Changing the password adds one, which
  // ends every sign-in that was issued before.
  tokenVersion: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash the password whenever it is new or changed. Saving other fields must leave the
// stored hash alone (the old hook hashed the hash again on every save).
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await hashPassword(this.password);
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function () {
  return signToken({ id: this._id, tokenVersion: this.tokenVersion });
};

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = function (enteredPassword) {
  return comparePassword(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
