/* ================================================
   KARIPAP BONDA — Auth Module
   ================================================ */

'use strict';

const AUTH_KEY = 'kb_session';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

// Credentials store — extend this object to add more users
const CREDENTIALS = {
  admin:   'admin123',
  manager: 'karipap2024',
};

const Auth = {
  login(username, password) {
    const pass = CREDENTIALS[username.toLowerCase()];
    if (pass && pass === password) {
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({
        user: username.toLowerCase(),
        displayName: username.charAt(0).toUpperCase() + username.slice(1),
        at: Date.now(),
      }));
      return true;
    }
    return false;
  },

  isLoggedIn() {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    try {
      const { at } = JSON.parse(raw);
      return (Date.now() - at) < SESSION_TTL;
    } catch {
      return false;
    }
  },

  session() {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  logout() {
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = 'login.html';
  },

  // Call at the top of any protected page
  guard() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
    }
  },

  // Call on login.html — skip login screen if already in
  redirectIfLoggedIn(dest = 'documents.html') {
    if (this.isLoggedIn()) {
      window.location.href = dest;
    }
  },
};
