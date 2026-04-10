# Google Takeout Reader

A client-side React app for reading Gmail exports from Google Takeout. No server required — everything runs in your browser.

## Getting Started

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Usage

1. Export your Gmail from [Google Takeout](https://takeout.google.com) — select **Mail** and download the `.zip`
2. Drop the `.zip` directly into the app (or an extracted `.mbox` file)
3. The app parses your emails in a background thread — no UI freezing even for large mailboxes
4. Click any email to read it in Plain Text, HTML, or Raw Headers view

## Features

- Drag-and-drop `.zip` or `.mbox` file loading
- Web Worker parser — large mailboxes (50k+ emails) stay non-blocking
- Live progress bar with cancel support
- Search by sender, subject, or body snippet
- Plain text, rendered HTML, and raw headers tabs
- Dark editorial theme

## Extension Points (good Cursor tasks)

- **Gmail label parsing** — extract `X-Gmail-Labels` header and filter by label
- **Attachment detection** — identify MIME parts with `Content-Disposition: attachment`
- **Export** — download filtered results as CSV or JSON
- **Virtualized list** — add `react-window` for smoother scrolling in very large mailboxes
- **Thread grouping** — group by `In-Reply-To` / `References` headers
