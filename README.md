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

- **Overview screen** — after upload, see every data type in the archive with counts; pick where to start (nothing is parsed until you open it)
- **Multi-category** — Mail (`.mbox`), Calendar (`.ics`), Contacts (`.vcf`), Chat / Hangouts (JSON), My Activity (HTML/JSON), plus an **Other files** fallback that surfaces and exports *any* remaining file in the archive
- **Drag-and-drop** `.zip` or individual file loading
- **Resilient file reading** — falls back through `arrayBuffer` → `FileReader` → chunked `slice` → `stream` to handle Chrome-on-Windows read failures on large archives
- **Streaming Web Worker mail parser** — large mailboxes (50k+ emails) stay non-blocking via byte-offset indexing; zip-extracted mailboxes are scanned as Blobs (no giant-string blow-up). Live progress bar with cancel.
- **Accurate message boundaries** — `From ` envelope lines are validated so body text beginning with "From " never splits a message
- **Gmail labels** — sidebar nav filters mail by `X-Gmail-Labels`
- **Search** by sender, subject, or body snippet
- **Mail reading views** — Plain Text, rendered HTML, and Raw Headers tabs
- **Privacy-first HTML** — remote images/trackers blocked by default (CSP in a sandboxed iframe, scripts disabled); one-click to load remote content
- **CSV & JSON export everywhere** — Mail, Calendar, Contacts, Chat, Activity, and the file inventory. CSV is Excel-safe and guarded against formula injection.
- **Flexible layout** — collapsible label sidebar and a layout toggle (side-by-side split / horizontal split / list-only)
- **Keyboard shortcuts** — `/` search, `j`/`k` navigate, `?` help
- **Dark editorial theme** with Celigo branding

## Testing

```bash
npm test          # run unit + worker integration tests (Vitest)
npm run test:watch
```

## Deployment

Configured for Netlify (`netlify.toml`, `public/_redirects`). `npm run build` emits a static bundle in `dist/`.

## Ideas / backlog

- **Google Voice** — dedicated conversation parser for Voice texts/calls/voicemails (currently viewable via *Other files*)
- **Attachment detection** — identify MIME parts with `Content-Disposition: attachment` and offer download
- **Virtualized list** — `react-window` for smoother scrolling in very large mailboxes
- **Thread grouping** — group mail by `In-Reply-To` / `References` headers
- **Worker-side unzip** — move zip decompression off the main thread to remove the remaining load pause on very large archives
