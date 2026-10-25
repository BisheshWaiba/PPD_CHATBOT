import bcrypt from 'bcryptjs';
import { isProduction } from './paths.js';

// 12 rounds by default. Tests lower it with BCRYPT_ROUNDS to stay fast. In production a lower
// value is ignored (never fewer than 10), so a setting left over from testing cannot make every
// password cheap to crack.
export const bcryptRounds = () => {
  const configured = Number(process.env.BCRYPT_ROUNDS) || 12;
  return isProduction() ? Math.max(configured, 10) : configured;
};

export const hashPassword = password => bcrypt.hash(password, bcryptRounds());

export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
