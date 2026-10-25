import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import historyRoutes from './routes/history.js';
import assistantRoutes from './routes/assistant.js';
import accountRoutes from './routes/account.js';
import { isProduction } from './util/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// What a page may load. Scripts come only from this site and never inline, so markup that
// gets injected into a page cannot run code. Inline styles stay allowed because the pages use
// style attributes and <style> blocks. Fonts come from Google Fonts.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
];
const developmentCsp = csp.join('; ');
// Like X-Frame-Options below, framing is only refused in production
const productionCsp = [...csp, "frame-ancestors 'none'"].join('; ');

// Errors that mean "the database cannot be reached right now" (it is down, restarting, or the network
// dropped), as opposed to a bug. They are a 503 the page can simply retry.
const DATABASE_UNREACHABLE = /^(MongooseServerSelectionError|MongoServerSelectionError|MongoNetworkError|MongoNetworkTimeoutError|MongoNotConnectedError|MongoTopologyClosedError)$/;
const isDatabaseUnreachable = err => DATABASE_UNREACHABLE.test(err?.name || '') || /buffering timed out/i.test(err?.message || '');

// Builds the Express app. Nothing is started here, so tests can use it directly.
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Set TRUST_PROXY=true (or a hop count) when running behind a reverse proxy so req.ip
  // is the visitor's address. The sign-in rate limiter depends on it.
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
  }

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': isProduction() ? productionCsp : developmentCsp
    });
    if (isProduction()) {
      // Stops other sites from framing the login page (clickjacking). Left off in development
      // so editor previews such as VS Code's Simple Browser, which use a frame, keep working.
      res.set('X-Frame-Options', 'DENY');
      res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  // The site and the API share one origin, so CORS stays off unless origins are listed
  if (process.env.CORS_ORIGIN) {
    app.use(cors({
      origin: process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
      methods: ['GET', 'POST']
    }));
  }

  app.use(express.json({ limit: '100kb' }));

  // Serve static files from the public directory with proper MIME types
  app.use(express.static(path.join(__dirname, 'public'), {
    index: 'home.html',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript');
      }
    }
  }));

  // Account data and tokens must never be cached
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // /api/v1 is the stable path. The unversioned /api paths serve the same routes (and share
  // their rate limits), so older clients keep working.
  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/conversations', historyRoutes);
  api.use('/assistant', assistantRoutes);
  api.use('/account', accountRoutes);
  app.use('/api/v1', api);
  app.use('/api', api);

  // Unknown API paths get JSON, not the home page
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
  });

  // Basic route - Root path serves home.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
  });

  // Chat page route
  app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
  });

  // Home page route (alternative)
  app.get('/home', (req, res) => {
    res.redirect('/');
  });

  // Every page is a real file, so anything else is a real 404
  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  });

  // Error handling. Must come after the routes to catch their errors.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, message: 'Invalid request body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, message: 'Request body is too large' });
    }
    // Database validation failures (for example a bad email) are the client's mistake
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors || {})[0]?.message || 'Invalid data';
      return res.status(400).json({ success: false, message });
    }
    if (isDatabaseUnreachable(err)) {
      console.error(`Database unavailable: ${err.message}`);
      res.set('Retry-After', '5');
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again in a moment.' });
    }
    console.error(err.stack || err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  });

  return app;
}
