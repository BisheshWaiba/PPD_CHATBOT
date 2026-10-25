// Load environment variables
import 'dotenv/config';

import connectDB from './config/db.js';
import { createApp } from './app.js';
import { assertJwtConfig } from './util/jwt.js';
import { initUserStore } from './util/userStore.js';
import { startHistoryCleanup } from './util/historyStore.js';

// Fail now, not on the first sign-in, if the JWT secret is missing in production
assertJwtConfig();

const mongoConnected = await connectDB();
const store = initUserStore({ mongoConnected });

if (!store) {
  console.error('=================================================================');
  console.error('No user database is available. Sign in and registration are disabled.');
  console.error('Fix the problem reported above (MONGO_URI: see MongoDB-Setup-Guide.md) and restart.');
  console.error('=================================================================');
} else if (store.kind === 'file') {
  console.warn('=================================================================');
  console.warn('MongoDB is not connected. Using the local development user file');
  console.warn('(data/users.json). Accounts created now will NOT be in MongoDB.');
  console.warn('=================================================================');
}

// Saved chats are kept until their owner deletes them, unless CHAT_HISTORY_DAYS asks for expiry
startHistoryCleanup();

const app = createApp();

// Start server
const PORT = process.env.PORT || 8004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the home page at: http://localhost:${PORT}`);
  console.log('Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI ? '********' : undefined,
    USER_STORE: store ? store.kind : 'none'
  });
});
