# NotebookLM Source Management

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.6.3-green.svg)

A Chrome extension that makes source management inside Google NotebookLM less awkward.

It runs directly inside NotebookLM's source panel. The toolbar icon is only a launcher that helps you jump back to the in-page manager; it is not a separate popup app.

## What It Does

- Group sources into custom folders.
- Reorder sources or whole groups with drag and drop.
- Delete multiple sources at once.
- Switch between English and Simplified Chinese.

If one of your notebooks has started to fill up with PDFs, links, and uploads, this extension is meant to make that list easier to work with.

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on `Developer mode`.
4. Click `Load unpacked` and choose the repository root.
5. If you want quicker access, pin the extension to the toolbar.

After installation:

- If you are already inside a NotebookLM notebook, clicking the toolbar icon will try to bring you straight to the in-page source manager.
- If you are not inside a notebook yet, it will open NotebookLM first so you can choose one.

NotebookLM is a single-page app, so switching notebooks does not always trigger a full reload. This extension tries to tear down and rebuild itself in place. A full page refresh is only used as a fallback when the source panel cannot be reattached after repeated retries.

## Permissions

- `storage`: saves folder membership, ordering, per-source enabled state, and custom panel height for each notebook.
- `tabs`: lets the launcher find, focus, or open the correct NotebookLM tab instead of guessing.

## Privacy

This extension does not send NotebookLM content to external servers. State stays in the browser, and this release does not include analytics, telemetry, or crash reporting.

See [PRIVACY.md](PRIVACY.md) for the full privacy note.

## Troubleshooting

- **The manager disappears after you switch notebooks.** Give the page a moment to finish the in-place rebuild. If it still does not come back, refresh once and try again.
- **Batch actions are disabled.** Make sure the source list has finished loading. Controls stay disabled while NotebookLM is still rendering placeholders.
- **The popup still says a refresh is needed, or it cannot find the source panel.** Refresh the page, then open the launcher again so the extension can rebuild its state.
- **A source loses its saved enabled state.** The extension prefers stable DOM identifiers when it can find them. If NotebookLM does not expose one, it falls back to a normalized fingerprint based on `title + aria-label + icon`. That works most of the time, but duplicate or unnamed sources can still be matched imperfectly after a major UI change.

## License

MIT
