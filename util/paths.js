import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Folder for local development data (user file, generated JWT secret). Ignored by git.
// Read at call time so tests can point AUTH_DATA_DIR somewhere temporary.
export const dataDir = () => process.env.AUTH_DATA_DIR || path.join(root, 'data');

export const isProduction = () => process.env.NODE_ENV === 'production';
