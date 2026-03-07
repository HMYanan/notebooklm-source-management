const iterations = 10000;
const sourcesCount = 1000;
const filterQuery = 'test';

const sourcesByKey = new Map();
const groupsById = new Map();
const groupChildren = [];

// Setup mock data
for (let i = 0; i < sourcesCount; i++) {
    const key = `source_${i}`;
    sourcesByKey.set(key, { key, title: `Test Source Title ${i}`, lowercaseTitle: `test source title ${i}` });
    groupChildren.push({ type: 'source', key });
}

groupsById.set('group_1', { id: 'group_1', children: groupChildren });

function runBaseline() {
    const hasMatchingDescendant = (group) => {
        if (!filterQuery) return true;
        for (const child of group.children) {
            if (child.type === 'source') {
                const source = sourcesByKey.get(child.key);
                if (source && source.title && source.title.toLowerCase().includes(filterQuery)) return true;
            }
        }
        return false;
    };

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        hasMatchingDescendant(groupsById.get('group_1'));
    }
    const end = process.hrtime.bigint();
    console.log(`Baseline time: ${(end - start) / 1000000n}ms`);
}

function runOptimized() {
    const hasMatchingDescendant = (group) => {
        if (!filterQuery) return true;
        for (const child of group.children) {
            if (child.type === 'source') {
                const source = sourcesByKey.get(child.key);
                if (source && source.lowercaseTitle && source.lowercaseTitle.includes(filterQuery)) return true;
            }
        }
        return false;
    };

    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        hasMatchingDescendant(groupsById.get('group_1'));
    }
    const end = process.hrtime.bigint();
    console.log(`Optimized time: ${(end - start) / 1000000n}ms`);
}

runBaseline();
runOptimized();