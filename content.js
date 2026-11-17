// Saves the text of every feed post you actually see on screen into
// chrome.storage.local, so you can search it later from the extension popup.
//
// LinkedIn's current markup uses hashed class names (they change often), so we
// rely on stable attributes instead: role="listitem", componentkey, data-testid
// and aria-label. Older data-urn markup is still supported as a fallback.
(() => {
  const OLD_POST_SELECTOR = [
    '[data-urn^="urn:li:activity:"]',
    '[data-urn^="urn:li:share:"]',
    '[data-urn^="urn:li:ugcPost:"]',
    '[data-id^="urn:li:activity:"]',
  ].join(',');
  const CARD_SELECTOR = '[role="listitem"][componentkey^="update-card"]';
  const POST_SELECTOR = CARD_SELECTOR + ',' + OLD_POST_SELECTOR;
  const TEXT_BOX = '[data-testid="expandable-text-box"]';

  const URN_TYPES = { shareId: 'share', ugcPostId: 'ugcPost', activityId: 'activity' };

  const cache = new Map();   // key -> record (this page load only)
  const pending = new Map(); // storage key -> record waiting to be written
  let scanTimer = null;
  let flushTimer = null;

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function urnOf(el) {
    const old = el.getAttribute('data-urn') || el.getAttribute('data-id');
    if (old) return old;
    // New markup: the id looks like "...shareUrn=ShareUrn(shareId=7527671804530696192)..."
    // Not every post has it, so we also scan every id/componentkey inside the card.
    const holders = el.querySelectorAll('[id*="Id="], [componentkey*="Id="]');
    for (const h of holders) {
      const s = (h.id || '') + ' ' + (h.getAttribute('componentkey') || '');
      const m = s.match(/(shareId|ugcPostId|activityId)=(\d+)/);
      if (m) return `urn:li:${URN_TYPES[m[1]]}:${m[2]}`;
    }
    return null;
  }

  function textOf(el) {
    const box = el.querySelector(TEXT_BOX);
    if (box) {
      const c = box.cloneNode(true);
      c.querySelectorAll('button').forEach((b) => b.remove()); // the "…more" button
      c.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
      const t = c.textContent.trim();
      if (t) return t;
    }
    for (const s of ['.update-components-text', '.feed-shared-update-v2__description']) {
      const n = el.querySelector(s);
      const t = n && n.innerText && n.innerText.trim();
      if (t) return t;
    }
    return '';
  }

  function authorOf(el) {
    // aria-label of the post menu button: "Open control menu for post by <Name>"
    const b = el.querySelector(
      'button[aria-label^="Open control menu for post by"], button[aria-label^="Hide post by"]'
    );
    const m = b && (b.getAttribute('aria-label') || '').match(/post by (.+)$/);
    if (m) return m[1].trim();
    for (const s of [
      '.update-components-actor__title span[aria-hidden="true"]',
      '.update-components-actor__name span[aria-hidden="true"]',
    ]) {
      const n = el.querySelector(s);
      const t = n && n.innerText && n.innerText.trim();
      if (t) return t.split('\n')[0];
    }
    return '';
  }

  function linkOf(el, urn, author) {
    if (urn.startsWith('urn:')) return `https://www.linkedin.com/feed/update/${urn}/`;
    const a = el.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
    if (a) return a.href;
    // No permalink in the markup: link to the author's profile instead.
    const profiles = [...el.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')];
    const mine = author && profiles.find((p) => p.innerHTML.includes(author));
    const p = mine || profiles[0];
    return p ? p.href : 'https://www.linkedin.com/feed/';
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function remember(el) {
    const text = textOf(el);
    if (!text) return false; // image-only post, nothing searchable
    const author = authorOf(el);
    // Posts without a numeric id get a key from author + start of text.
    const urn = urnOf(el) || 'h:' + hash(author + '|' + text.slice(0, 120));

    const prev = cache.get(urn);
    if (prev && prev.text.length >= text.length) return false;

    const rec = {
      urn,
      author,
      text: text.slice(0, 5000),
      url: linkOf(el, urn, author),
      seen: Date.now(),
    };
    cache.set(urn, rec);
    pending.set('p:' + urn, rec);
    scheduleFlush();
    return true;
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 2000);
  }

  async function flush() {
    if (!pending.size) return;
    const batch = new Map(pending);
    pending.clear();
    try {
      const old = await chrome.storage.local.get([...batch.keys()]);
      const out = {};
      for (const [key, rec] of batch) {
        const o = old[key];
        // Never replace a longer saved text with a shorter one.
        out[key] = o && o.text && o.text.length > rec.text.length
          ? { ...rec, text: o.text, author: rec.author || o.author }
          : rec;
      }
      await chrome.storage.local.set(out);
    } catch (e) {
      // Extension was reloaded/updated while the page was open; ignore.
    }
  }

  function candidates() {
    const set = new Set(document.querySelectorAll(POST_SELECTOR));
    // Also find posts through their text box, in case the card markup changed.
    document.querySelectorAll(TEXT_BOX).forEach((box) => {
      const card =
        box.closest(CARD_SELECTOR) ||
        box.closest(OLD_POST_SELECTOR) ||
        box.closest('[role="listitem"]');
      if (card) set.add(card);
    });
    // Drop posts nested inside another candidate (reshares) to avoid duplicates.
    const arr = [...set];
    return arr.filter((el) => !arr.some((o) => o !== el && o.contains(el)));
  }

  function scan() {
    const list = candidates();
    let visible = 0;
    let saved = 0;
    for (const el of list) {
      if (!isVisible(el)) continue;
      visible++;
      if (remember(el)) saved++;
    }
    if (list.length) {
      console.debug(`[LinkedIn Post Keeper] posts: ${list.length}, visible: ${visible}, new: ${saved}`);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 800);
  }

  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
  });
  // capture:true also catches scrolling inside inner containers, not just the page.
  window.addEventListener('scroll', scheduleScan, { passive: true, capture: true });
  // Backup: re-scan regularly while the tab is in front.
  setInterval(() => { if (!document.hidden) scheduleScan(); }, 2500);
  window.addEventListener('pagehide', flush);
  scheduleScan();
})();
