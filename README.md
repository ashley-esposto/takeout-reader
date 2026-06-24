# Google Takeout Reader

A client-side React app for browsing your **Google Takeout** export. Mail, Calendar, Contacts, Chat, and Activity — all parsed and rendered in your browser. No server, no upload: your data never leaves your machine.

## Getting Started

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Usage

1. Create an export at [Google Takeout](https://takeout.google.com) — select the products you want (Mail, Calendar, Contacts, Chat, My Activity) and download the `.zip`.
2. Drop the `.zip` directly into the app (or an extracted file such as a `.mbox`).
3. The app scans the archive and parses each data type in a background thread — the UI stays responsive even for large mailboxes.
4. Switch between categories in the top nav and explore.

## Features

- **Multi-category** — Mail (`.mbox`), Calendar (`.ics`), Contacts (`.vcf`), Chat / Hangouts (JSON), and My Activity (HTML/JSON)
- **Drag-and-drop** `.zip` or individual file loading
- **Resilient file reading** — falls back through `arrayBuffer` → `FileReader` → chunked `slice` → `stream` to handle Chrome-on-Windows read failures on large archives
- **Web Worker mail parser** — large mailboxes (50k+ emails) stay non-blocking, with a live progress bar and cancel support
- **Gmail labels** — sidebar nav filters mail by `X-Gmail-Labels`
- **Search** by sender, subject, or body snippet
- **Mail reading views** — Plain Text, rendered HTML, and Raw Headers tabs
- **Flexible layout** — collapsible label sidebar and a layout toggle (side-by-side split / horizontal split / list-only)
- **Export** filtered search results as JSON
- **Keyboard shortcuts** — `/` search, `j`/`k` navigate, `?` help
- **Dark editorial theme** with Celigo branding

## Deployment

Configured for Netlify (`netlify.toml`, `public/_redirects`). `npm run build` emits a static bundle in `dist/`.

## Ideas / backlog

- **Attachment detection** — identify MIME parts with `Content-Disposition: attachment` and offer download
- **CSV export** — alongside the existing JSON export
- **Virtualized list** — `react-window` for smoother scrolling in very large mailboxes
- **Thread grouping** — group mail by `In-Reply-To` / `References` headers
- **Tests** — parser unit tests for each data type
