// Compatibility for older cached HTML. The current app registers its own update monitor.
(() => {
  if (!('serviceWorker' in navigator)) return;
  const script = document.currentScript;
  if (!script || !script.src) return;
  const base = new URL('./', script.src);
  if (base.origin !== location.origin) return;
  navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.pathname, updateViaCache: 'none' }).catch(() => {});
})();
