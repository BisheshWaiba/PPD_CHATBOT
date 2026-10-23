import { verifyToken } from '../util/jwt.js';
import { getUserStore } from '../util/userStore.js';

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Protect routes: requires "Authorization: Bearer <token>" with a valid, unexpired token
// that belongs to a user who still exists.
export const protect = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return fail(res, 401, 'Not authorized to access this route');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please sign in again.'
      : 'Token is not valid';
    return fail(res, 401, message);
  }

  const store = getUserStore();
  if (!store) return fail(res, 503, 'Authentication is temporarily unavailable');

  try {
    const user = await store.findById(decoded.id);
    if (!user) return fail(res, 401, 'User no longer exists');
    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return fail(res, 503, 'Authentication is temporarily unavailable');
  }
};

// Grant access to specific roles
export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return fail(res, 403, 'You are not allowed to access this route');
  }
  next();
};
