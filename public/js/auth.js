// Sign-in state shared by every page.
//
// The login page stores the session in localStorage ("Remember me") or sessionStorage.
// Every check here looks in both. Pages that need a signed-in user put the attribute
// data-require-auth on <body>; this script then checks the session with the server
// and sends visitors to the login page when it is not valid.
(function () {
  'use strict';

  var TOKEN_KEY = 'token';
  var USER_KEY = 'user';

  // What the chat keeps in this browser about a person's check-in. Cleared on logout so
  // the next person on a shared computer cannot open the results. ("chatSessionId" is an old key
  // that nothing writes any more; it is cleared for browsers that still have it.)
  var CHECKIN_KEYS = [
    'chatSessionId', 'childBirthdate', 'epdsAnswers', 'epdsCompletedAt', 'epdsCurrentQuestion',
    'epdsLanguage', 'epdsScore', 'isLessThanTwoWeeks', 'maritalStatus', 'userAge',
    'userBirthTiming', 'userEmotionalState', 'userMentalState', 'userPhysicalCondition',
    'userSleepPattern', 'userSymptoms'
  ];

  function readStored(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  }

  // Reads the expiry from the token so an expired session is dropped without a request.
  // This is only a convenience: the server is the one that really verifies tokens.
  function tokenPayload(token) {
    try {
      var part = token.split('.')[1];
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    [localStorage, sessionStorage].forEach(function (storage) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
    });
  }

  function getToken() {
    var token = readStored(TOKEN_KEY);
    if (!token) return null;
    var payload = tokenPayload(token);
    if (!payload || (payload.exp && payload.exp * 1000 <= Date.now())) {
      clearSession();
      return null;
    }
    return token;
  }

  function getUser() {
    try {
      var user = JSON.parse(readStored(USER_KEY));
      return user && typeof user === 'object' ? user : null;
    } catch (e) {
      return null;
    }
  }

  function isAuthenticated() {
    return !!(getToken() && getUser());
  }

  function saveSession(token, user, remember) {
    clearSession();
    var storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
  }

  // options.sessionAlreadyEnded: the server has already ended this session (the account was
  // just deleted), so there is nothing to tell it.
  function logout(redirectTo, options) {
    // Tell the server to end this token, so a copy of it stops working too. Best effort:
    // signing out in this browser never waits for the answer, and never fails because of it.
    var token = getToken();
    if (token && !(options && options.sessionAlreadyEnded)) {
      try {
        fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          keepalive: true
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
    clearSession();
    CHECKIN_KEYS.forEach(function (key) { localStorage.removeItem(key); });
    window.location.assign(redirectTo || '/');
  }

  // Only same-site paths are accepted as a place to go after signing in
  function safeNext(value) {
    if (typeof value !== 'string') return null;
    if (value.charAt(0) !== '/' || value.charAt(1) === '/' || value.indexOf('\\') !== -1) return null;
    return value;
  }

  function loginUrl(next) {
    return '/login.html' + (next ? '?next=' + encodeURIComponent(next) : '');
  }

  function redirectToLogin() {
    window.location.replace(loginUrl(window.location.pathname));
  }

  function redirectIfAuthenticated(fallback) {
    if (!isAuthenticated()) return false;
    var next = safeNext(new URLSearchParams(window.location.search).get('next'));
    window.location.replace(next || fallback || '/');
    return true;
  }

  // fetch() with the token attached. A 401 means the session is no longer valid.
  function apiFetch(url, options) {
    options = options || {};
    var wait = options.timeoutMs || 10000;
    options = Object.assign({}, options);
    delete options.timeoutMs;
    var headers = Object.assign({}, options.headers);
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, wait);
    return fetch(url, Object.assign({}, options, { headers: headers, signal: controller.signal }))
      .then(function (response) {
        if (response.status === 401) clearSession();
        return response;
      })
      .finally(function () { clearTimeout(timer); });
  }

  // Asks the server whether the session is still good.
  //   { status: 'valid', user }  signed in
  //   { status: 'invalid' }      expired, forged, or the account is gone (session cleared)
  //   { status: 'unknown' }      the server could not say (down or unreachable)
  function verifySession() {
    if (!getToken()) return Promise.resolve({ status: 'invalid' });
    return apiFetch('/api/v1/auth/me')
      .then(function (response) {
        if (response.status === 401) return { status: 'invalid' };
        if (!response.ok) return { status: 'unknown' };
        return response.json().then(function (body) {
          var user = body && body.data;
          if (!user) return { status: 'unknown' };
          // Keep the stored copy fresh, in the same place the session lives
          (localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage)
            .setItem(USER_KEY, JSON.stringify(user));
          return { status: 'valid', user: user };
        });
      })
      .catch(function () { return { status: 'unknown' }; });
  }

  // For protected pages. Resolves to the user, or redirects to the login page.
  function requireAuth() {
    if (!isAuthenticated()) {
      redirectToLogin();
      return Promise.resolve(null);
    }
    return verifySession().then(function (result) {
      if (result.status === 'invalid') {
        redirectToLogin();
        return null;
      }
      // 'unknown' (server hiccup): the token is unexpired locally, so let the page load
      return result.user || getUser();
    });
  }

  function getInitials(name) {
    var letters = String(name || '').trim().split(/\s+/).map(function (part) { return part.charAt(0); }).join('');
    return (letters.slice(0, 2) || 'U').toUpperCase();
  }

  /* ---------- Header: login buttons or the account menu ---------- */

  function initHeader(user) {
    var authButtons = document.querySelector('.auth-buttons');
    var section = document.querySelector('.profile-section');
    if (!authButtons || !section) return;
    var icon = section.querySelector('.profile-icon');
    var dropdown = section.querySelector('.profile-dropdown');

    if (!user) {
      authButtons.style.display = 'flex';
      section.style.display = 'none';
      dropdown.classList.remove('active');
      return;
    }

    authButtons.style.display = 'none';
    section.style.display = 'block';
    icon.textContent = getInitials(user.name || user.email);

    // Built with textContent so a name can never inject markup
    dropdown.textContent = '';
    var meta = document.createElement('div');
    meta.className = 'profile-meta';
    var name = document.createElement('strong');
    name.textContent = user.name || 'Signed in';
    var email = document.createElement('span');
    email.textContent = user.email || '';
    meta.append(name, email);

    var logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.id = 'logoutBtn';
    logoutButton.className = 'profile-dropdown-item';
    logoutButton.textContent = 'Log out';
    logoutButton.addEventListener('click', function () { logout('/'); });

    var accountLink = document.createElement('a');
    accountLink.href = '/account.html';
    accountLink.className = 'profile-dropdown-item';
    accountLink.textContent = 'Account & privacy';

    var historyLink = document.createElement('a');
    historyLink.href = '/history.html';
    historyLink.className = 'profile-dropdown-item';
    historyLink.textContent = 'Chat history';
    dropdown.append(meta, accountLink, historyLink, logoutButton);

    if (section.dataset.wired) return;
    section.dataset.wired = 'true';
    icon.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      dropdown.classList.toggle('active', open);
      icon.setAttribute('aria-expanded', String(open));
    }
    icon.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(!dropdown.classList.contains('active'));
    });
    document.addEventListener('click', function (event) {
      if (!section.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Show the stored state straight away, then confirm it with the server
    initHeader(isAuthenticated() ? getUser() : null);

    if (document.body.hasAttribute('data-require-auth')) {
      requireAuth().then(function (user) {
        if (!user) return; // already redirecting
        document.body.classList.add('auth-ready');
        initHeader(user);
      });
    } else if (isAuthenticated()) {
      verifySession().then(function (result) {
        if (result.status === 'invalid') initHeader(null);
        else if (result.user) initHeader(result.user);
      });
    }
  });

  window.MOMAuth = {
    getToken: getToken,
    getUser: getUser,
    isAuthenticated: isAuthenticated,
    saveSession: saveSession,
    clearSession: clearSession,
    logout: logout,
    apiFetch: apiFetch,
    verifySession: verifySession,
    requireAuth: requireAuth,
    redirectIfAuthenticated: redirectIfAuthenticated,
    safeNext: safeNext,
    loginUrl: loginUrl,
    initHeader: initHeader
  };
})();
