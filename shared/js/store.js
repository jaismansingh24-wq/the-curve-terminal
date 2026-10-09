/* Everything the app keeps lives in this computer's local storage, under its
   own namespace. Every key is listed in plain words on the Privacy panel;
   scripts/check.mjs fails the build if one is missing there.

   Storage can be unavailable or throw (a locked profile, a full disk), so
   every read and write is guarded and the app still runs without it. */

const NS = 'thecurve.terminal.';

export function get(key, fallback = null) {
  try {
    const v = window.localStorage.getItem(NS + key);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function set(key, value) {
  try {
    window.localStorage.setItem(NS + key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export function del(key) {
  try { window.localStorage.removeItem(NS + key); } catch (e) { /* nothing to undo */ }
}

export function getJSON(key, fallback) {
  const raw = get(key);
  if (raw === null) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

export function setJSON(key, value) {
  return set(key, JSON.stringify(value));
}
