import { formatWhen } from '/js/history-format.js';
import { confirmable } from '/js/confirm-button.js';

// Account & privacy: what is kept, a download of it, and deleting the account.
// Everything is written with textContent, so nothing stored can ever act as markup.

const $ = id => document.getElementById(id);
const request = (path, options) => window.MOMAuth.apiFetch(path, options);

// ---------- What we keep ----------

async function showDetails() {
  const status = $('load-status');
  try {
    const [me, chats] = await Promise.all([request('/api/v1/auth/me'), request('/api/v1/conversations')]);
    if (me.status === 401 || chats.status === 401) return; // the shared script is sending the person to sign in
    if (!me.ok || !chats.ok) throw new Error('could not load');

    const user = (await me.json()).data;
    const list = await chats.json();
    $('fact-name').textContent = user.name;
    $('fact-email').textContent = user.email;
    $('fact-created').textContent = formatWhen(user.createdAt) || 'Unknown';
    $('fact-chats').textContent = String(list.data.length);

    if (list.retentionDays) {
      $('retention-note').textContent = `Chats are deleted automatically ${list.retentionDays} day${list.retentionDays === 1 ? '' : 's'} after their last message.`;
      $('retention-note').hidden = false;
    }
  } catch (error) {
    status.textContent = "We couldn't load your details just now. Please refresh the page.";
  }
}

// ---------- Download ----------

$('download').addEventListener('click', async () => {
  const status = $('download-status');
  const button = $('download');
  button.disabled = true;
  status.textContent = 'Preparing your file…';
  try {
    const response = await request('/api/v1/account/export', { timeoutMs: 30000 });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const file = new Blob([await response.text()], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `sutkeri-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status.textContent = 'Your file has been downloaded.';
  } catch (error) {
    status.textContent = "We couldn't prepare your file. Please try again.";
  } finally {
    button.disabled = false;
  }
});

// ---------- Delete ----------

const passwordField = $('confirm-password');

confirmable($('delete-account'), {
  idle: 'Delete my account',
  armedText: 'Click again to delete everything',
  question: 'Delete your account and every saved chat for good? This cannot be undone. Click the button again to confirm.',
  status: $('delete-status'),
  // The password has to be there before the button can be armed
  check() {
    if (passwordField.value) return true;
    $('delete-status').textContent = 'Please type your password first, to confirm that this is you.';
    passwordField.focus();
    return false;
  },
  async run() {
    const status = $('delete-status');
    status.textContent = 'Deleting…';
    try {
      const response = await request('/api/v1/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordField.value })
      });

      if (response.ok) {
        // Signing out also clears this browser's copy of the check-in. Then the login page says what happened.
        window.MOMAuth.logout('/login.html?deleted=1', { sessionAlreadyEnded: true });
        return;
      }
      if (response.status === 403) {
        status.textContent = 'That password is not correct. Nothing was deleted.';
        passwordField.select();
      } else if (response.status === 429) {
        status.textContent = (await response.json()).message;
      } else if (response.status !== 401) { // a 401 means the session ended: the shared script handles it
        status.textContent = "We couldn't delete your account just now. Nothing was deleted. Please try again.";
      }
    } catch (error) {
      status.textContent = "We couldn't reach the server. Nothing was deleted. Please try again.";
    }
  }
});

// ---------- Start ----------

// Without a session there is nothing to show: the shared script is already sending the person to sign in
if (window.MOMAuth.isAuthenticated()) showDetails();
