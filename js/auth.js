// =====================================================================
// auth.js — Session management (sessionStorage)
// =====================================================================

const TOKEN_KEY = 'maduras_token';
const NAME_KEY  = 'maduras_name';

export const getToken  = () => sessionStorage.getItem(TOKEN_KEY);
export const getName   = () => sessionStorage.getItem(NAME_KEY) || 'User';

export function saveSession(token, name) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(NAME_KEY, name);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(NAME_KEY);
}

/** Redirect to login if no token. Returns true if authenticated. */
export function requireAuth() {
  if (!getToken()) {
    window.location.href = './index.html';
    return false;
  }
  return true;
}
