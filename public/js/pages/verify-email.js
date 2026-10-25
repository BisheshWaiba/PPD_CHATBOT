document.addEventListener('DOMContentLoaded', function () {
  const confirmBox = document.getElementById('confirm');
  const done = document.getElementById('done');
  const problem = document.getElementById('problem');
  const confirmBtn = document.getElementById('confirm-btn');
  const message = document.getElementById('error-message');

  // The link's secret is kept in memory only, out of the address bar and the browser history
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname);

  // Someone who is already signed in goes straight back to their account afterwards
  const signedIn = MOMAuth.isAuthenticated();
  document.getElementById('continue-link').href = signedIn ? '/account.html' : '/login.html';
  if (signedIn) {
    document.getElementById('problem-link').href = '/account.html';
    document.getElementById('problem-link').textContent = 'Go to your account to get a new link';
  }

  const showProblem = text => {
    if (text) document.getElementById('problem-text').textContent = text;
    confirmBox.hidden = true;
    problem.hidden = false;
  };

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    showProblem('The link looks incomplete. Please use the whole link from your email.');
    return;
  }

  // Confirming takes a click, not just opening the page: mail programs that look inside links
  // ahead of time would otherwise use the link up before the person ever saw it.
  confirmBtn.addEventListener('click', async function () {
    message.style.display = 'none';
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<svg class="icon spinner" aria-hidden="true"><use href="#i-loader"/></svg> Confirming…';
    try {
      const response = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (response.ok) {
        confirmBox.hidden = true;
        done.hidden = false;
        document.getElementById('continue-link').focus();
        return;
      }
      if (response.status === 400) { showProblem(); return; }
      message.textContent = data.message || 'We could not confirm your email. Please try again.';
    } catch { message.textContent = 'We could not reach the server. Please try again.'; }
    message.className = 'error-message';
    message.style.display = 'block';
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm my email';
  });
});
