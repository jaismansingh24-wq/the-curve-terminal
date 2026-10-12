/* The bridge to the Rust side of the app. When the interface is opened in an
   ordinary browser (a design preview during development), there is no bridge:
   every call says so plainly instead of failing silently. */

const T = window.__TAURI__;

export const isNative = !!(T && T.core && T.core.invoke);

export function invoke(cmd, args) {
  if (!isNative) return Promise.reject(new Error('preview'));
  return T.core.invoke(cmd, args);
}

export function listen(event, fn) {
  if (!isNative || !T.event) return Promise.resolve(() => {});
  return T.event.listen(event, (e) => fn(e.payload));
}

export function currentWindow() {
  if (!isNative || !T.window) return null;
  return T.window.getCurrentWindow();
}

/* Outside links go through a fixed list on the Rust side (see links.rs), so
   the interface can never be made to open an arbitrary address. */
export function openLink(which) {
  if (isNative) return invoke('open_link', { which });
  const PREVIEW = { site: 'https://thecurve.in', discord: 'https://discord.gg/RKpuDyf2b' };
  if (PREVIEW[which]) window.open(PREVIEW[which], '_blank', 'noopener');
  return Promise.resolve();
}

/* Raw bytes both ways (Replay's bars): the body goes as an ArrayBuffer with
   headers, and a command that answers with bytes gives an ArrayBuffer. */
export function invokeRaw(cmd, bytes, headers = {}) {
  if (!isNative) return Promise.reject(new Error('preview'));
  return T.core.invoke(cmd, bytes, { headers });
}
