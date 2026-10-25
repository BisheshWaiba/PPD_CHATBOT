document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('reset-form');
  const problem = document.getElementById('problem');
  const done = document.getElementById('done');
  const resetBtn = document.getElementById('reset-btn');
  const message = document.getElementById('error-message');

  // The link's secret is kept in memory only. Taking it out of the address bar keeps it out of the
  // browser history and out of anything a person copies from the address bar.
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);

  const showError = text => { message.textContent = text; message.className = 'error-message'; message.style.display = 'block'; };
  const hideError = () => { message.textContent = ''; message.style.display = 'none'; };
  const busy = () => { resetBtn.disabled = true; resetBtn.innerHTML = '<svg class="icon spinner" aria-hidden="true"><use href="#i-loader"/></svg> Changing…'; };
  const idle = () => { resetBtn.disabled = false; resetBtn.textContent = 'Change password'; };

  const showProblem = text => {
    if (text) document.getElementById('problem-text').textContent = text;
    form.hidden = true;
    problem.hidden = false;
  };

  // Same shape as the server's check: a link that was cut short never reaches it
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    showProblem('The link looks incomplete. Please use the whole link from your email, or ask for a new one.');
    return;
  }

  // Say so now if the link is already used up or has expired, before a new password is typed.
  // (If this check cannot be made, the form is simply left for the person to use.)
  fetch('/api/v1/auth/check-reset-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  }).then(response => {
    if (response.status === 400) showProblem();
  }).catch(() => { /* the form will report any real problem when it is sent */ });

  form.addEventListener('submit', async function (e) {
    e.preventDefault(); hideError();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Same limits as the server (util/validation.js)
    if (password.length < 8) { showError('Password must be at least 8 characters long'); return; }
    if (new TextEncoder().encode(password).length > 72) { showError('Password is too long (maximum 72 bytes)'); return; }
    if (password !== confirmPassword) { showError('Passwords do not match'); return; }

    busy();
    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();
      if (response.ok) {
        form.hidden = true;
        done.hidden = false;
        done.querySelector('a').focus();
        return;
      }
      showError(data.message || 'We could not change your password. Please try again.');
    } catch { showError('We could not reach the server. Please try again.'); }
    idle();
  });
});
