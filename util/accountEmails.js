import { appUrl, sendMail, mailMode } from './mailer.js';
import { issueToken } from './authTokens.js';
import { getUserStore } from './userStore.js';

// The emails Sutkeri sends about an account. Each one is written for someone who may be tired and
// worried: short, plain, and clear about what to do and what to ignore.

const FOOTER = '\nSutkeri, your postpartum care companion\nSutkeri is not a substitute for professional medical advice.';
const greeting = user => `Hello ${String(user.name || '').split(' ')[0] || 'there'},`;

// Runs in the background and never breaks the request that started it. A failure is logged without
// the person's address or the link in it: a mail server's own message often repeats the address,
// so only its error code is kept.
export function inBackground(work, what) {
  work.catch(error => {
    const code = [error?.code || error?.name || 'error', error?.responseCode].filter(Boolean).join(' ');
    console.error(`[mail] could not send the ${what} email: ${code}`);
  });
}

export async function sendResetEmail(user) {
  const token = await issueToken(getUserStore(), user.id, 'reset');
  const link = `${appUrl()}/reset-password.html?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your Sutkeri password',
    text: `${greeting(user)}

Someone asked to reset the password for your Sutkeri account. To choose a new password, open this link:

${link}

The link works for 1 hour and only once.

If this was not you, you can ignore this email. Your password has not changed and nobody can use this link without the email.
${FOOTER}`
  });
}

export async function sendVerificationEmail(user) {
  const token = await issueToken(getUserStore(), user.id, 'verify');
  const link = `${appUrl()}/verify-email.html?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Confirm your email address for Sutkeri',
    text: `${greeting(user)}

Please confirm that this is your email address, so that you can get back into your account if you ever forget your password:

${link}

The link works for 2 days. If you did not create a Sutkeri account, you can ignore this email.
${FOOTER}`
  });
}

export async function sendPasswordChangedEmail(user) {
  await sendMail({
    to: user.email,
    subject: 'Your Sutkeri password was changed',
    text: `${greeting(user)}

The password for your Sutkeri account was just changed, and you were signed out everywhere.

If you did this, there is nothing more to do.

If you did not, someone else may have access to your email. Please reset your password again from the sign-in page, and secure your email account.
${FOOTER}`
  });
}

export const emailEnabled = () => mailMode() !== 'off';
