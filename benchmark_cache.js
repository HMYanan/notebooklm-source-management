const iterations = 1000;
const sourcesCount = 500;

// Mock DOM elements
const mockElements = [];
for (let i = 0; i < sourcesCount; i++) {
    mockElements.push({
        titleText: `Title ${i}`,
        checkbox: { type: 'checkbox' }
    });
}

// Baseline: cache clears every time (simulating the queueMicrotask clearing when accessed across macro-tasks)
function runBaseline() {
    let freshRowCache = null;

    function findFreshCheckboxBaseline(title) {
        if (!freshRowCache) {
            freshRowCache = new Map();
            // Simulating DOM query and iteration
            for (const el of mockElements) {
                if (!freshRowCache.has(el.titleText)) {
                    freshRowCache.set(el.titleText, el);
                }
            }
            // Simulating queueMicrotask clearing the cache before next usage batch
            freshRowCache = null;
        }
        // Normally returns el.checkbox, but for benchmark the rebuild overhead is what matters
    }

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        // Simulate a batch of clicks or operations
        for (let j = 0; j < 10; j++) {
            findFreshCheckboxBaseline(`Title ${Math.floor(Math.random() * sourcesCount)}`);
        }
    }
    const end = process.hrtime.bigint();
    console.log(`Baseline (uncached) time: ${(end - start) / 1000000n}ms`);
}

// Optimized: cache persists until manually invalidated
function runOptimized() {
    let freshRowCache = null;

    function findFreshCheckboxOptimized(title) {
        if (!freshRowCache) {
            freshRowCache = new Map();
            for (const el of mockElements) {
                if (!freshRowCache.has(el.titleText)) {
                    freshRowCache.set(el.titleText, el);
                }
            }
        }
        return freshRowCache.get(title)?.checkbox;
    }

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        for (let j = 0; j < 10; j++) {
            findFreshCheckboxOptimized(`Title ${Math.floor(Math.random() * sourcesCount)}`);
        }
    }
    const end = process.hrtime.bigint();
    console.log(`Optimized (cached) time: ${(end - start) / 1000000n}ms`);
}

console.log("Running Cache Benchmark...");
runBaseline();
runOptimized();
