const { performance } = require('perf_hooks');

// Dummy state
let state = { ungrouped: [] };
let groupsById = new Map();
let parentMap = new Map();

// Setup large tree
const NUM_GROUPS = 10000;
const NUM_SOURCES_PER_GROUP = 10;

for (let i = 0; i < NUM_GROUPS; i++) {
    const groupId = `group_${i}`;
    const children = [];
    for (let j = 0; j < NUM_SOURCES_PER_GROUP; j++) {
        const key = `source_${i}_${j}`;
        children.push({ type: 'source', key });
        parentMap.set(key, groupId);
    }
    groupsById.set(groupId, { id: groupId, children });
}

// Old implementation
function oldFindParentGroupOfSource(key) {
    for (const group of groupsById.values()) {
        if (group.children.some(c => c.type === 'source' && c.key === key)) return group;
    }
    return null;
}
function oldRemoveSourceFromTree(key) {
    state.ungrouped = state.ungrouped.filter(k => k !== key);
    groupsById.forEach(g => {
        g.children = g.children.filter(c => c.type === 'group' || c.key !== key);
    });
}

// New implementation
function newFindParentGroupOfSource(key) {
    const parentId = parentMap.get(key);
    return parentId ? (groupsById.get(parentId) || null) : null;
}
function newRemoveSourceFromTree(key) {
    const parentGroup = newFindParentGroupOfSource(key);
    if (parentGroup) {
        parentGroup.children = parentGroup.children.filter(c => c.type === 'group' || c.key !== key);
    } else {
        state.ungrouped = state.ungrouped.filter(k => k !== key);
    }
}

// Keys to remove
const keysToRemove = [];
for (let i = 0; i < 1000; i++) {
    keysToRemove.push(`source_${Math.floor(Math.random() * NUM_GROUPS)}_0`);
}

// Measure old
let startOld = performance.now();
for (const key of keysToRemove) {
    oldRemoveSourceFromTree(key);
}
let endOld = performance.now();
console.log(`Old removeSourceFromTree took ${endOld - startOld} ms`);

// Restore state
groupsById.clear();
for (let i = 0; i < NUM_GROUPS; i++) {
    const groupId = `group_${i}`;
    const children = [];
    for (let j = 0; j < NUM_SOURCES_PER_GROUP; j++) {
        const key = `source_${i}_${j}`;
        children.push({ type: 'source', key });
    }
    groupsById.set(groupId, { id: groupId, children });
}

// Measure new
let startNew = performance.now();
for (const key of keysToRemove) {
    newRemoveSourceFromTree(key);
}
let endNew = performance.now();
console.log(`New removeSourceFromTree took ${endNew - startNew} ms`);
