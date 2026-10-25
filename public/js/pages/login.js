document.addEventListener('DOMContentLoaded', function () {
  // Where to go after signing in (set when a protected page sent the user here).
  // Only same-site paths are accepted.
  const params = new URLSearchParams(window.location.search);
  const next = MOMAuth.safeNext(params.get('next'));
  const notice = document.getElementById('login-notice');
  if (params.get('deleted') === '1') {
    notice.textContent = 'Your account and everything saved with it have been deleted.';
    notice.hidden = false;
  } else if (next) {
    notice.hidden = false;
  }

  // Already signed in: skip the form
  if (MOMAuth.redirectIfAuthenticated('/')) return;

  const loginForm = document.getElementById('login-form');
  const signinBtn = document.getElementById('signin-btn');
  const errorMessage = document.getElementById('error-message');

  const showLoading = () => { signinBtn.disabled = true; signinBtn.innerHTML = '<svg class="icon spinner" aria-hidden="true"><use href="#i-loader"/></svg> Signing in…'; };
  const hideLoading = () => { signinBtn.disabled = false; signinBtn.textContent = 'Sign in'; };
  const showError = m => { errorMessage.textContent = m; errorMessage.style.display = 'block'; };
  const hideError = () => { errorMessage.textContent = ''; errorMessage.style.display = 'none'; };

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault(); hideError();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;

    if (!email || !password) { showError('Please enter both email and password'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showError('Please enter a valid email address'); return; }

    showLoading();
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) { showError(data.message || 'Login failed. Please check your credentials.'); hideLoading(); return; }
      if (!data.token || !data.user) { showError('Authentication failed. Please try again.'); hideLoading(); return; }

      // "Remember me" keeps the session after the browser closes
      MOMAuth.saveSession(data.token, data.user, rememberMe);
      window.location.href = next || '/';
    } catch { showError('An error occurred during login. Please try again.'); hideLoading(); }
  });
});
