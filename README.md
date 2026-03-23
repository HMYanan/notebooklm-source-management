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

## Automated Checks

Use these commands when you want to verify the repository without doing a full manual smoke pass:

- `npm run test:unit` runs the Jest unit suite.
- `npm run test:smoke` runs the Playwright browser smoke suite.
- `npm run verify:full` runs both suites in sequence.
- `npm run playwright:install` installs the Chromium browser used by Playwright smoke.

The current Playwright smoke coverage is intentionally small:

- extension popup shell renders without startup errors
- unpacked extension loads and injects the manager into a NotebookLM-style fixture
- `GET_MANAGER_STATUS` and `FOCUS_MANAGER` work across the extension message bridge
- same-tab notebook route switches reattach the manager without a full reload

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

## Development Smoke Checklist

Use this checklist after changes to the content script, popup launcher, or source list rendering.

1. Load the repository from `chrome://extensions` with `Developer mode` enabled.
2. Open an existing NotebookLM notebook and confirm the in-page manager mounts under the source panel.
3. Verify source rows still show the correct icon:
   - regular source icons render normally
   - the native more-options button icon is not reused as the source icon
   - at least one source that uses a background or mask-based icon still renders correctly
4. Open the toolbar popup in three contexts and confirm the primary CTA is correct:
   - inside a notebook
   - on the NotebookLM home page
   - on a non-NotebookLM page
5. Switch between notebooks without closing the tab and confirm the manager reattaches.
6. Walk through the core interactions once:
   - create a group
   - rename a group
   - drag a source or group
   - enter batch mode
   - open the batch delete flow
   - confirm untitled sources or groups show localized fallback text

## License

MIT
