document.addEventListener('DOMContentLoaded', function () {
  // Already signed in: skip the form
  if (MOMAuth.redirectIfAuthenticated('/')) return;

  const next = MOMAuth.safeNext(new URLSearchParams(window.location.search).get('next'));
  const signupForm = document.getElementById('signup-form');
  const signupBtn = document.getElementById('signup-btn');
  const errorMessage = document.getElementById('error-message');

  const showLoading = () => { signupBtn.disabled = true; signupBtn.innerHTML = '<svg class="icon spinner" aria-hidden="true"><use href="#i-loader"/></svg> Creating account…'; };
  const hideLoading = () => { signupBtn.disabled = false; signupBtn.textContent = 'Create account'; };

  const showError = m => {
    errorMessage.textContent = m;
    errorMessage.className = 'error-message error';
    errorMessage.style.display = 'block';
  };
  const showSuccess = m => {
    errorMessage.textContent = m;
    errorMessage.className = 'error-message success';
    errorMessage.style.display = 'block';
  };
  const hideError = () => { errorMessage.textContent = ''; errorMessage.style.display = 'none'; };

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault(); hideError();
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const termsAccepted = document.getElementById('terms').checked;

    // Same limits as the server (routes/auth.js)
    if (!firstName || !lastName) { showError('Please enter your full name'); return; }
    if (firstName.length + lastName.length + 1 > 50) { showError('Name cannot be more than 50 characters'); return; }
    if (!email) { showError('Please enter your email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showError('Please enter a valid email address'); return; }
    if (password.length < 8) { showError('Password must be at least 8 characters long'); return; }
    if (new TextEncoder().encode(password).length > 72) { showError('Password is too long (maximum 72 bytes)'); return; }
    if (password.toLowerCase() === email.toLowerCase()) { showError('Password cannot be the same as your email'); return; }
    if (password !== confirmPassword) { showError('Passwords do not match'); return; }
    if (!termsAccepted) { showError('You must accept the terms and privacy policy'); return; }

    showLoading();
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: firstName + ' ' + lastName, email, password })
      });
      const data = await response.json();
      if (response.ok) {
        showSuccess(data.message || 'Account created successfully! Redirecting to sign in…');
        hideLoading();
        setTimeout(() => { window.location.href = MOMAuth.loginUrl(next); }, 2000);
      } else {
        showError(data.message || 'Registration failed. Please try again.');
        hideLoading();
      }
    } catch { showError('An error occurred during registration. Please try again.'); hideLoading(); }
  });
});
