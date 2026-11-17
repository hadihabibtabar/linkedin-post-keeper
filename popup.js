const $ = (s) => document.querySelector(s);
const MAX_SHOWN = 50;
const fmt = (n) => n.toLocaleString('en-US');
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
let all = [];

// Makes Persian/Arabic typing variants match each other and ignores half-spaces.
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, '');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Regex that matches the search terms in the ORIGINAL text, tolerant to
// ی/ي, ک/ك and optional half-spaces between letters. Used for highlighting.
function termRegex(terms) {
  if (!terms.length) return null;
  const parts = terms.map((t) =>
    [...t].map((ch) => (ch === 'ی' ? '[یي]' : ch === 'ک' ? '[کك]' : esc(ch))).join('‌?')
  );
  return new RegExp(parts.join('|'), 'giu');
}

function highlightInto(el, text, re) {
  if (!re) { el.textContent = text; return; }
  let last = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    el.append(text.slice(last, m.index));
    const mk = document.createElement('mark');
    mk.textContent = m[0];
    el.append(mk);
    last = m.index + m[0].length;
  }
  el.append(text.slice(last));
}

function snippetFor(text, re) {
  text = (text || '').replace(/\n{3,}/g, '\n\n');
  let start = 0;
  if (re) {
    re.lastIndex = 0;
    const f = re.exec(text);
    if (f && f.index > 70) start = f.index - 70;
  }
  const end = start + 280;
  return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(ts) {
  const s = (ts - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'Just now';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 2592000) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function initial(name) {
  const m = (name || '').match(/\p{L}/u);
  return m ? m[0].toUpperCase() : '?';
}
function hue(name) {
  let h = 0;
  for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

async function load() {
  const data = await chrome.storage.local.get(null);
  all = Object.entries(data)
    .filter(([k]) => k.startsWith('p:'))
    .map(([, v]) => ({ ...v, _n: norm((v.author || '') + ' ' + (v.text || '')) }))
    .sort((a, b) => (b.seen || 0) - (a.seen || 0));
  $('#count').textContent = `${plural(all.length, 'post', 'posts')} in archive`;
  render();
}

function emptyState(title, hint) {
  const d = document.createElement('div');
  d.className = 'empty';
  d.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
    '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
  const b = document.createElement('b');
  b.textContent = title;
  d.append(b, hint);
  return d;
}

function render() {
  const raw = $('#q').value;
  const terms = norm(raw).split(/\s+/).filter(Boolean);
  const re = termRegex(terms);
  const hits = all.filter((r) => terms.every((t) => r._n.includes(t)));
  const box = $('#results');
  box.textContent = '';

  $('#status').textContent = terms.length
    ? `${plural(hits.length, 'result', 'results')} for “${raw.trim()}”`
    : hits.length > MAX_SHOWN
      ? `Showing the latest ${fmt(MAX_SHOWN)} of ${fmt(hits.length)} posts`
      : '';
  $('#status').style.display = $('#status').textContent ? '' : 'none';

  if (!hits.length) {
    box.append(
      all.length
        ? emptyState('No matches found', 'Try a different word or phrase.')
        : emptyState('Your archive is empty', 'Scroll your LinkedIn feed for a few minutes. Posts you see are saved here.')
    );
    return;
  }

  for (const rec of hits.slice(0, MAX_SHOWN)) {
    const item = document.createElement('div');
    item.className = 'item';

    const av = document.createElement('div');
    av.className = 'avatar';
    av.style.background = `hsl(${hue(rec.author)}, 52%, 42%)`;
    av.textContent = initial(rec.author);

    const body = document.createElement('div');
    body.style.minWidth = '0';

    const head = document.createElement('div');
    head.className = 'head';
    const author = document.createElement('div');
    author.className = 'author';
    author.dir = 'auto';
    highlightInto(author, rec.author || '(No name)', re);
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = ago(rec.seen || 0);
    time.title = new Date(rec.seen || 0).toLocaleString('en-US');
    head.append(author, time);

    const snip = document.createElement('div');
    snip.className = 'snippet';
    snip.dir = 'auto';
    highlightInto(snip, snippetFor(rec.text, re), re);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const open = document.createElement('a');
    open.className = 'btn primary';
    open.href = rec.url;
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open post';
    const copy = document.createElement('button');
    copy.className = 'btn';
    copy.type = 'button';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rec.url);
        copy.textContent = 'Copied ✓';
        setTimeout(() => (copy.textContent = 'Copy link'), 1200);
      } catch (e) {}
    });
    actions.append(open, copy);

    body.append(head, snip, actions);
    item.append(av, body);
    box.append(item);
  }
}

$('#q').addEventListener('input', render);

$('#export').addEventListener('click', () => {
  const rows = all.map(({ _n, ...rest }) => rest);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'linkedin-posts.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#clear').addEventListener('click', async () => {
  if (!confirm('Delete all saved posts?')) return;
  await chrome.storage.local.remove(all.map((r) => 'p:' + r.urn));
  load();
});

load();
