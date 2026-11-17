# LinkedIn Post Keeper

A small Chrome extension (Manifest V3) that solves two annoyances with the LinkedIn web feed:

1. **The feed reloads when you come back to the tab.** You switch to another tab or app, return, and the page jumps to the top with a fresh set of posts. The post you were reading is gone.
2. **LinkedIn search is poor at finding posts by their text.** If you only remember a phrase, you usually can't find the post again.

This extension stops the automatic reload and keeps a **local, searchable archive** of the posts you have seen in your feed.

> Not affiliated with, endorsed by, or sponsored by LinkedIn. "LinkedIn" is a trademark of LinkedIn Corporation.

## Features

- Prevents the feed from refreshing when the tab becomes visible again.
- Saves the author, text and link of every post that appears on screen while you browse.
- Popup with instant search over the saved text and author names, with highlighted matches.
- Persian/Arabic friendly search: `ی`/`ي`, `ک`/`ك` and zero-width non-joiners are treated as equivalent.
- Open a post, copy its link, export everything as JSON, or clear the archive.
- Keeps the most recent 5,000 posts and drops the oldest.
- Light and dark mode.

## Install (from source)

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Open LinkedIn and scroll your feed for a few minutes.
5. Click the extension icon to search your archive. Pin it from the puzzle-piece menu to keep it visible.

Only posts you see **after installing** are saved.

## Privacy

Everything stays on your computer. Posts are stored in `chrome.storage.local` in your own browser profile. The extension makes no network requests and has no server, analytics or tracking. See [PRIVACY.md](PRIVACY.md).

## How it works

| File | Purpose |
| --- | --- |
| `guard.js` | Runs in the page context before LinkedIn's scripts. Makes the page believe the tab is always visible and blocks `visibilitychange` events, so the feed has no reason to reload. |
| `content.js` | Finds posts on screen, extracts author/text/link, and saves them in batches. |
| `background.js` | Prunes the archive to the most recent 5,000 posts. |
| `popup.html` / `popup.js` | The search UI. |

LinkedIn's markup uses hashed class names that change often, so `content.js` relies on more stable attributes (`role="listitem"`, `componentkey`, `data-testid`, `aria-label`). If posts stop being saved, the selectors at the top of `content.js` are the first place to look. The content script logs a short line to the browser console (filter by `LinkedIn Post Keeper`) showing how many posts it found, how many were visible and how many were new.

## Limitations

- Chrome's own **Memory Saver** can discard and reload background tabs. This extension cannot prevent that. Add `linkedin.com` under *Settings → Performance → Memory Saver → Always keep these sites active*.
- Posts that contain only an image or video, with no text, are not saved.
- LinkedIn can change its page structure at any time.

## Use at your own risk

LinkedIn's terms restrict scraping and automated activity with third-party tools. This extension does not click, post, message or crawl anything. It only records what is already displayed to you in your own feed. Still, LinkedIn decides how its rules apply, so you use it at your own risk. Read LinkedIn's [User Agreement](https://www.linkedin.com/legal/user-agreement) and help pages first.

## Contributing

Issues and pull requests are welcome. Selector fixes after LinkedIn markup changes are especially useful. When reporting that posts are not being saved, please include the console line described above and the relevant (anonymized) HTML of one post.

## License

[MIT](LICENSE)
