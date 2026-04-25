/* ================================================
   KARIPAP BONDA — Auth Module
   Passwords are stored as SHA-256 hashes only.
   Plain-text passwords are never kept in source.
   ================================================ */

'use strict';

const AUTH_KEY   = 'kb_session';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

// SHA-256 hashes of each user's password.
// To add/change a user, run this in the browser console to get the hash:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
const CREDENTIALS = {
  admin:   '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  manager: '2677c6f3699b4f263ed8160ceba4cb62c6d66ac8dd75f62c299489ad84d0b47b',
};

async function _sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const Auth = {
  async login(username, password) {
    const storedHash = CREDENTIALS[username.toLowerCase()];
    if (!storedHash) return false;
    const inputHash = await _sha256(password);
    if (inputHash !== storedHash) return false;
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({
      user:        username.toLowerCase(),
      displayName: username.charAt(0).toUpperCase() + username.slice(1),
      at:          Date.now(),
    }));
    return true;
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

  guard() {
    if (!this.isLoggedIn()) window.location.href = 'login.html';
  },

  redirectIfLoggedIn(dest = 'documents.html') {
    if (this.isLoggedIn()) window.location.href = dest;
  },
};
