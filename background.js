// Keeps the archive from growing forever: drops the oldest posts beyond MAX.
const MAX = 5000;

async function prune() {
  const data = await chrome.storage.local.get(null);
  const posts = Object.entries(data).filter(([k]) => k.startsWith('p:'));
  if (posts.length <= MAX) return;
  posts.sort((a, b) => (a[1].seen || 0) - (b[1].seen || 0));
  const drop = posts.slice(0, posts.length - MAX).map(([k]) => k);
  await chrome.storage.local.remove(drop);
}

chrome.runtime.onStartup.addListener(prune);
chrome.runtime.onInstalled.addListener(prune);
