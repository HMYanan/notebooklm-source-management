const fs = require('fs');
const os = require('os');
const path = require('path');

const { chromium } = require('@playwright/test');

function resolveChromiumExecutablePath() {
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
        return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }

    const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
    if (fs.existsSync(cacheRoot)) {
        const chromiumDirs = fs.readdirSync(cacheRoot)
            .filter((entry) => /^chromium-\d+$/.test(entry))
            .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]));

        for (const dir of chromiumDirs) {
            const candidates = [
                path.join(
                    cacheRoot,
                    dir,
                    'chrome-mac',
                    'Chromium.app',
                    'Contents',
                    'MacOS',
                    'Chromium'
                ),
                path.join(
                    cacheRoot,
                    dir,
                    'chrome-mac-arm64',
                    'Chromium.app',
                    'Contents',
                    'MacOS',
                    'Chromium'
                ),
                path.join(
                    cacheRoot,
                    dir,
                    'chrome-mac-arm64',
                    'Google Chrome for Testing.app',
                    'Contents',
                    'MacOS',
                    'Google Chrome for Testing'
                )
            ];

            for (const executablePath of candidates) {
                if (fs.existsSync(executablePath)) {
                    return executablePath;
                }
            }
        }
    }

    const systemChromePath = path.join(
        '/Applications',
        'Google Chrome.app',
        'Contents',
        'MacOS',
        'Google Chrome'
    );
    if (fs.existsSync(systemChromePath)) {
        return systemChromePath;
    }

    return undefined;
}

function createUserDataDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'nlm-source-smoke-'));
}

function ensurePlaywrightArtifactDirs() {
    const artifactsRoot = path.join(
        process.cwd(),
        'output',
        'playwright',
        '.playwright-artifacts-0'
    );

    fs.mkdirSync(path.join(artifactsRoot, 'traces'), { recursive: true });
    fs.mkdirSync(path.join(artifactsRoot, 'resources'), { recursive: true });
}

function readExtensionIdFromPreferences(userDataDir, repoRoot) {
    const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
    if (!fs.existsSync(preferencesPath)) {
        return null;
    }

    const preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    const extensionSettings = preferences?.extensions?.settings;
    if (!extensionSettings || typeof extensionSettings !== 'object') {
        return null;
    }

    const normalizedRepoRoot = fs.realpathSync(repoRoot);
    for (const [extensionId, settings] of Object.entries(extensionSettings)) {
        if (!settings || typeof settings !== 'object' || !settings.path) {
            continue;
        }

        try {
            if (fs.realpathSync(settings.path) === normalizedRepoRoot) {
                return extensionId;
            }
        } catch (error) {
            // Ignore stale paths while polling for the extension registration.
        }
    }

    return null;
}

async function waitForExtensionId(context, userDataDir, repoRoot, timeoutMs = 15000) {
    const probePage = await context.newPage();
    const session = await context.newCDPSession(probePage);
    const startTime = Date.now();

    try {
        while (Date.now() - startTime < timeoutMs) {
            const { targetInfos = [] } = await session.send('Target.getTargets');
            const extensionTarget = targetInfos.find((targetInfo) => (
                typeof targetInfo.url === 'string' &&
                targetInfo.url.startsWith('chrome-extension://')
            ));
            if (extensionTarget) {
                return new URL(extensionTarget.url).host;
            }

            const extensionId = readExtensionIdFromPreferences(userDataDir, repoRoot);
            if (extensionId) {
                return extensionId;
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    } finally {
        if (probePage) {
            await probePage.close().catch(() => {});
        }
    }

    throw new Error('Timed out waiting for the unpacked extension to register.');
}

async function launchExtensionContext(repoRoot) {
    const userDataDir = createUserDataDir();
    ensurePlaywrightArtifactDirs();
    const context = await chromium.launchPersistentContext(userDataDir, {
        executablePath: resolveChromiumExecutablePath(),
        headless: false,
        ignoreDefaultArgs: ['--disable-extensions'],
        args: [
            `--disable-extensions-except=${repoRoot}`,
            `--load-extension=${repoRoot}`
        ]
    });

    return {
        context,
        userDataDir
    };
}

async function closeExtensionContext(env) {
    if (!env) {
        return;
    }

    if (env.context) {
        await env.context.close();
    }

    if (env.userDataDir) {
        fs.rmSync(env.userDataDir, { recursive: true, force: true });
    }
}

async function openExtensionPage(context, extensionId, pagePath) {
    const page = await context.newPage();
    const normalizedPath = String(pagePath || '').replace(/^\/+/, '');
    await page.goto(`chrome-extension://${extensionId}/${normalizedPath}`);
    return page;
}

module.exports = {
    closeExtensionContext,
    launchExtensionContext,
    openExtensionPage,
    waitForExtensionId
};
