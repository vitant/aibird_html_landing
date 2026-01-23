# AI Bird Website

Static landing pages with a lightweight Node server that serves files and
accepts lead submissions for Telegram notifications.

## Quick Start

1. Create `.env` and set `TELEGRAM_BOT_TOKEN`.
2. Optionally set `TELEGRAM_RECIPIENTS` (comma-separated chat IDs or @channel usernames).
2. Run `node server.js`.
3. Open `http://localhost:8000`.

## Lead Flow

- Forms send JSON to `POST /api/lead`.
- The server broadcasts the lead to all subscribers stored in
  `data/subscribers.json`.
- Users must message the bot first (e.g. send `/start`) to be added.
- `TELEGRAM_RECIPIENTS` allows a fixed list of recipients without waiting for subscriptions.

## Files

- `index.html` - main landing page
- `cases.html`, `about.html`, `blog.html` - secondary pages
- `privacy.html`, `offer.html`, `404.html`
- `styles.css`, `script.js`
- `server.js` - static server + Telegram broadcast

## Notes

- Requires Node 18+ for global `fetch`.
- Use `PORT=8080 node server.js` to change the port.
