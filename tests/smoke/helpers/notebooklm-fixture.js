function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function defaultSourcesForNotebook(notebookId) {
    return [
        {
            id: `${notebookId}-source-a`,
            title: `Notebook ${notebookId} source A`,
            token: `${notebookId}-source-a`
        },
        {
            id: `${notebookId}-source-b`,
            title: `Notebook ${notebookId} source B`,
            token: `${notebookId}-source-b`
        }
    ];
}

function normalizeSources(notebookId, sources) {
    if (Array.isArray(sources) && sources.length > 0) {
        return sources.map((source, index) => ({
            id: source.id || `${notebookId}-source-${index + 1}`,
            title: source.title || `Notebook ${notebookId} source ${index + 1}`,
            token: source.token || source.id || `${notebookId}-source-${index + 1}`
        }));
    }

    return defaultSourcesForNotebook(notebookId);
}

function renderNotebookHtml(notebookId, sources) {
    const renderedSources = normalizeSources(notebookId, sources);

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Notebook ${escapeHtml(notebookId)}</title>
    <style>
        html, body {
            margin: 0;
            min-height: 100%;
            font-family: Arial, sans-serif;
        }

        body {
            min-height: 100vh;
            background: #f6f7fb;
            color: #1f2937;
        }

        .app-shell {
            min-height: 100vh;
            padding: 24px;
            box-sizing: border-box;
        }

        [data-testid="source-panel"] {
            display: block;
            min-height: 260px;
            border: 1px solid #cfd6e4;
            border-radius: 12px;
            background: #fff;
            overflow: hidden;
        }

        .panel-header {
            display: flex;
            align-items: center;
            min-height: 56px;
            padding: 0 16px;
            font-weight: 700;
            border-bottom: 1px solid #e5e7eb;
            background: #ffffff;
        }

        [data-testid="scroll-area"] {
            display: block;
            padding: 12px 16px 20px;
        }

        [data-testid="source-item"] {
            display: block;
            margin-bottom: 10px;
        }

        .source-row-shell {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 44px;
            padding: 8px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            background: #fbfdff;
        }

        .source-title {
            flex: 1;
        }
    </style>
    <script>
        (function () {
            const initialNotebookId = ${JSON.stringify(notebookId)};
            const initialSources = ${JSON.stringify(renderedSources)};

            function createSourceItem(source) {
                const wrapper = document.createElement('div');
                wrapper.className = 'single-source-container';
                wrapper.setAttribute('data-testid', 'source-item');
                wrapper.setAttribute('data-source-id', source.token);

                const row = document.createElement('div');
                row.className = 'source-row-shell';

                const icon = document.createElement('mat-icon');
                icon.className = 'source-icon description-icon-color';
                icon.textContent = 'description';

                const title = document.createElement('span');
                title.className = 'source-title';
                title.setAttribute('data-testid', 'source-title');
                title.textContent = source.title;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.setAttribute('aria-label', source.title);

                const moreButton = document.createElement('button');
                moreButton.type = 'button';
                moreButton.setAttribute('aria-label', 'More options');

                const moreIcon = document.createElement('mat-icon');
                moreIcon.textContent = 'more_vert';
                moreButton.appendChild(moreIcon);

                row.appendChild(icon);
                row.appendChild(title);
                row.appendChild(checkbox);
                row.appendChild(moreButton);
                wrapper.appendChild(row);

                return wrapper;
            }

            function renderNotebook(nextNotebookId, nextSources) {
                const sources = Array.isArray(nextSources) && nextSources.length > 0 ? nextSources : initialSources;
                const title = nextNotebookId ? 'Notebook ' + nextNotebookId : 'Notebook';

                document.title = title;
                document.body.innerHTML = '';

                const appShell = document.createElement('main');
                appShell.className = 'app-shell';

                const sourcePanel = document.createElement('section');
                sourcePanel.className = 'source-panel';
                sourcePanel.setAttribute('data-testid', 'source-panel');

                const header = document.createElement('header');
                header.className = 'panel-header';
                header.textContent = 'Sources for ' + title;

                const scrollArea = document.createElement('div');
                scrollArea.className = 'scroll-area';
                scrollArea.setAttribute('data-testid', 'scroll-area');

                sources.forEach((source) => {
                    scrollArea.appendChild(createSourceItem(source));
                });

                sourcePanel.appendChild(header);
                sourcePanel.appendChild(scrollArea);
                appShell.appendChild(sourcePanel);
                document.body.appendChild(appShell);
            }

            window.__swapNotebook = function swapNotebook(nextNotebook) {
                const notebookId = nextNotebook && nextNotebook.notebookId ? String(nextNotebook.notebookId) : initialNotebookId;
                const sources = nextNotebook && Array.isArray(nextNotebook.sources) ? nextNotebook.sources : initialSources;
                history.pushState({}, '', '/notebook/' + encodeURIComponent(notebookId));
                renderNotebook(notebookId, sources);
                return { notebookId, sourceCount: Array.isArray(sources) ? sources.length : 0 };
            };

            window.__getNotebookId = function () {
                return document.title.replace(/^Notebook\\s+/, '');
            };

            function renderInitialNotebook() {
                renderNotebook(initialNotebookId, initialSources);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', renderInitialNotebook, { once: true });
            } else {
                renderInitialNotebook();
            }
        })();
    </script>
</head>
<body>
</body>
</html>`;
}

function renderHomeHtml() {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>NotebookLM Home</title>
    <style>
        html, body {
            margin: 0;
            min-height: 100%;
            font-family: Arial, sans-serif;
        }

        body {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f6f7fb;
            color: #1f2937;
        }

        .home-shell {
            padding: 40px;
            border: 1px solid #d7dde8;
            border-radius: 16px;
            background: #fff;
        }
    </style>
</head>
<body>
    <main class="home-shell">NotebookLM Home</main>
</body>
</html>`;
}

async function installNotebookFixture(context) {
    await context.route('https://notebooklm.google.com/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (request.resourceType() !== 'document') {
            await route.fulfill({
                status: 204,
                body: ''
            });
            return;
        }

        if (url.pathname === '/' || url.pathname === '') {
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: renderHomeHtml()
            });
            return;
        }

        const parts = url.pathname.split('/').filter(Boolean);
        const notebookIndex = parts.indexOf('notebook');
        const notebookId = notebookIndex > -1 && notebookIndex + 1 < parts.length
            ? parts[notebookIndex + 1]
            : 'a';

        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: renderNotebookHtml(notebookId)
        });
    });
}

module.exports = {
    defaultSourcesForNotebook,
    installNotebookFixture,
    renderHomeHtml,
    renderNotebookHtml
};
