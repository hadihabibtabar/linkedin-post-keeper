// Runs in the page's own JS world at document_start, before LinkedIn's scripts.
// Goal: make the page believe the tab is always visible, so it has no reason to
// reload the feed when you come back to the tab.
(() => {
  try {
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get() { return false; },
    });
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get() { return 'visible'; },
    });
  } catch (e) {}

  // Swallow visibility events before the page's own listeners see them.
  const swallow = (e) => e.stopImmediatePropagation();
  for (const name of ['visibilitychange', 'webkitvisibilitychange']) {
    document.addEventListener(name, swallow, true);
    window.addEventListener(name, swallow, true);
  }
})();
