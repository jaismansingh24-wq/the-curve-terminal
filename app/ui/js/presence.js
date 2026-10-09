/* Discord status, as the interface sees it. The Rust side (presence.rs) does
   the talking to the Discord app on this computer; this module asks it to
   start or stop and shows its state in plain words. Every state says what
   is actually happening, including "not set up" and "not open". */

import { invoke, listen, isNative } from '../shared/js/native.js';

const COPY = {
  connected: {
    title: 'Showing on Discord',
    text: 'Your profile shows The Curve Terminal and a short rotating line. Never your trades.',
    status: 'Connected',
    on: true,
  },
  connecting: {
    title: 'Looking for Discord',
    text: 'Checking whether the Discord app is open on this computer.',
    status: 'Checking',
  },
  not_running: {
    title: 'Discord is not open',
    text: 'The status appears once the Discord app is running on this computer. The app checks again every 15 seconds.',
    status: 'Discord is not open',
  },
  off: {
    title: 'Switched off',
    text: 'Nothing is sent to Discord.',
    status: 'Off',
  },
  not_configured: {
    title: 'Not set up yet',
    text: 'This build has no Discord application ID yet, so nothing is sent.',
    status: 'Not set up in this build',
  },
  preview: {
    title: 'Not in the preview',
    text: 'Discord status works in the installed app, not in the design preview.',
    status: 'Not available in the design preview',
  },
  error: {
    title: 'Discord did not answer',
    text: 'The app will try again in a moment.',
    status: 'Discord did not answer',
  },
};

let status = 'connecting';
const subs = [];

function set(s) {
  if (!COPY[s]) s = 'error';
  status = s;
  subs.forEach((fn) => fn(s, COPY[s]));
}

export function onStatus(fn) {
  subs.push(fn);
  fn(status, COPY[status]);
}

export async function configure(enabled) {
  if (!isNative) { set('preview'); return 'preview'; }
  if (enabled) set('connecting');
  try {
    const s = await invoke('presence_set', { enabled });
    set(s);
    return s;
  } catch (e) {
    set('error');
    return 'error';
  }
}

listen('presence-status', set);

export function bindUI() {
  const dot = document.querySelector('[data-presence-dot]');
  const title = document.querySelector('[data-presence-title]');
  const text = document.querySelector('[data-presence-text]');
  const line = document.querySelector('[data-presence-status]');
  onStatus((s, c) => {
    if (dot) dot.classList.toggle('is-on', !!c.on);
    if (title) title.textContent = c.title;
    if (text) text.textContent = c.text;
    if (line) line.textContent = 'Status: ' + c.status;
  });
}
