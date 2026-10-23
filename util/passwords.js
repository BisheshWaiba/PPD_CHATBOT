import bcrypt from 'bcryptjs';

// 12 rounds by default. Tests lower it with BCRYPT_ROUNDS to stay fast.
export const bcryptRounds = () => Number(process.env.BCRYPT_ROUNDS) || 12;

export const hashPassword = password => bcrypt.hash(password, bcryptRounds());

export const comparePassword = (password, hash) => bcrypt.compare(password, hash);
