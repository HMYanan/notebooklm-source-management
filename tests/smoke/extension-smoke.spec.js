const path = require('path');

const { test, expect } = require('@playwright/test');

const {
    closeExtensionContext,
    launchExtensionContext,
    openExtensionPage,
    waitForExtensionId
} = require('./helpers/extension-context');
const {
    installNotebookFixture,
    defaultSourcesForNotebook
} = require('./helpers/notebooklm-fixture');

const repoRoot = path.resolve(__dirname, '../..');

test.describe.serial('extension smoke', () => {
    let env;

    async function resolveExtensionIdAfterBootstrap(targetPath = '/notebook/bootstrap') {
        const bootstrapPage = await env.context.newPage();
        await bootstrapPage.goto(`https://notebooklm.google.com${targetPath}`);
        env.extensionId = await waitForExtensionId(env.context, env.userDataDir, repoRoot);
        await bootstrapPage.close();
    }

    test.beforeEach(async () => {
        env = await launchExtensionContext(repoRoot);
        await installNotebookFixture(env.context);
    });

    test.afterEach(async () => {
        await closeExtensionContext(env);
        env = null;
    });

    test('boots extension and renders the popup shell', async () => {
        const errors = [];
        await resolveExtensionIdAfterBootstrap();
        const popupPage = await openExtensionPage(env.context, env.extensionId, 'src/popup/popup.html');

        popupPage.on('pageerror', (error) => errors.push(error));
        popupPage.on('console', (message) => {
            if (message.type() === 'error') {
                errors.push(new Error(message.text()));
            }
        });

        await expect(popupPage.locator('#popup-badge')).toBeVisible();
        await expect(popupPage.locator('#popup-title')).toBeVisible();
        await expect(popupPage.locator('#popup-primary-btn')).toBeVisible();
        await expect(popupPage.locator('#popup-primary-btn')).not.toHaveText('');

        expect(errors).toEqual([]);
    });

    test('injects the manager and handles the message bridge on the notebook fixture', async () => {
        const pageErrors = [];
        const notebookPage = await env.context.newPage();

        notebookPage.on('pageerror', (error) => pageErrors.push(error));
        notebookPage.on('console', (message) => {
            if (message.type() === 'error') {
                pageErrors.push(new Error(message.text()));
            }
        });

        await notebookPage.goto('https://notebooklm.google.com/notebook/a');
        env.extensionId = await waitForExtensionId(env.context, env.userDataDir, repoRoot);
        const bridgePage = await openExtensionPage(env.context, env.extensionId, 'src/popup/popup.html');

        await expect(notebookPage.locator('#sources-plus-root')).toBeVisible({ timeout: 20_000 });
        await expect(notebookPage.locator('[data-testid="source-panel"]')).toBeVisible();

        const status = await bridgePage.evaluate(async () => {
            const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
            const targetTab = tabs.find((tab) => tab.url && tab.url.includes('/notebook/a'));

            if (!targetTab || typeof targetTab.id !== 'number') {
                throw new Error('Notebook tab was not found.');
            }

            return chrome.tabs.sendMessage(targetTab.id, { type: 'GET_MANAGER_STATUS' });
        });

        expect(status).toEqual({ ready: true, reason: 'ready' });

        const focusResult = await bridgePage.evaluate(async () => {
            const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
            const targetTab = tabs.find((tab) => tab.url && tab.url.includes('/notebook/a'));

            if (!targetTab || typeof targetTab.id !== 'number') {
                throw new Error('Notebook tab was not found.');
            }

            return chrome.tabs.sendMessage(targetTab.id, { type: 'FOCUS_MANAGER' });
        });

        expect(focusResult).toEqual({ success: true });
        await expect.poll(async () => notebookPage.evaluate(() => Boolean(
            document.querySelector('#sources-plus-root')?.shadowRoot?.querySelector('.sp-focus-ring')
        ))).toBeTruthy();
        expect(pageErrors).toEqual([]);
    });

    test('reattaches after a same-tab notebook route switch', async () => {
        const notebookPage = await env.context.newPage();

        await notebookPage.goto('https://notebooklm.google.com/notebook/a');
        env.extensionId = await waitForExtensionId(env.context, env.userDataDir, repoRoot);
        const bridgePage = await openExtensionPage(env.context, env.extensionId, 'src/popup/popup.html');

        await expect(notebookPage.locator('#sources-plus-root')).toBeVisible({ timeout: 20_000 });
        await expect(notebookPage.locator('[data-testid="source-title"]').first()).toHaveText('Notebook a source A');

        const navigationCountBefore = await notebookPage.evaluate(() => performance.getEntriesByType('navigation').length);

        await notebookPage.evaluate((nextSources) => {
            window.__swapNotebook({
                notebookId: 'b',
                sources: nextSources
            });
        }, defaultSourcesForNotebook('b'));

        await expect(notebookPage.locator('[data-testid="source-title"]').first()).toHaveText('Notebook b source A', { timeout: 20_000 });
        await expect(notebookPage.locator('#sources-plus-root')).toBeVisible();

        const status = await bridgePage.evaluate(async () => {
            const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
            const targetTab = tabs.find((tab) => tab.url && tab.url.includes('/notebook/b'));

            if (!targetTab || typeof targetTab.id !== 'number') {
                throw new Error('Swapped notebook tab was not found.');
            }

            return chrome.tabs.sendMessage(targetTab.id, { type: 'GET_MANAGER_STATUS' });
        });

        const navigationCountAfter = await notebookPage.evaluate(() => performance.getEntriesByType('navigation').length);

        expect(status).toEqual({ ready: true, reason: 'ready' });
        expect(navigationCountAfter).toBe(navigationCountBefore);
    });
});
