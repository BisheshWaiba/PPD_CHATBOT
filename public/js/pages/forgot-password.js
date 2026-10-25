document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('forgot-form');
  const sendBtn = document.getElementById('send-btn');
  const emailInput = document.getElementById('email');
  const message = document.getElementById('error-message');

  const show = (text, ok) => {
    message.textContent = text;
    message.className = ok ? 'error-message success' : 'error-message';
    message.style.display = 'block';
  };
  const hide = () => { message.textContent = ''; message.style.display = 'none'; };
  const busy = () => { sendBtn.disabled = true; sendBtn.innerHTML = '<svg class="icon spinner" aria-hidden="true"><use href="#i-loader"/></svg> Sending…'; };
  const idle = () => { sendBtn.disabled = false; sendBtn.textContent = 'Send reset link'; };

  // A server without email settings says so up front, instead of failing after the person typed
  fetch('/api/v1/auth/features')
    .then(response => response.json())
    .then(data => {
      if (data && data.data && data.data.email === false) {
        show('Password reset by email is not available on this server.', false);
        emailInput.disabled = true;
        sendBtn.disabled = true;
      }
    })
    .catch(() => { /* the form will report any real problem when it is sent */ });

  form.addEventListener('submit', async function (e) {
    e.preventDefault(); hide();
    const email = emailInput.value.trim();
    if (!email) { show('Please enter your email address', false); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { show('Please enter a valid email address', false); return; }

    busy();
    try {
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (response.ok) {
        show(data.message + ' If it does not arrive in a few minutes, look in your spam folder.', true);
      } else {
        show(data.message || 'We could not send the link. Please try again.', false);
      }
    } catch { show('We could not reach the server. Please try again.', false); }
    idle();
  });
});
