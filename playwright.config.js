const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/smoke',
    outputDir: './output/playwright',
    fullyParallel: false,
    retries: 0,
    workers: 1,
    timeout: 90_000,
    expect: {
        timeout: 15_000
    },
    use: {
        headless: false,
        viewport: {
            width: 1440,
            height: 1024
        },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    }
});
