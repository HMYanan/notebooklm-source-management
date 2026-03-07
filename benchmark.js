const { performance } = require('perf_hooks');

// Mock data
const groupsById = new Map();
const parentMap = new Map();

// Create 1000 groups, each with 10 sources
for (let i = 0; i < 1000; i++) {
  const groupId = `group_${i}`;
  const children = [];
  for (let j = 0; j < 10; j++) {
    const key = `source_${i}_${j}`;
    children.push({ type: 'source', key });
    parentMap.set(key, groupId);
  }
  groupsById.set(groupId, { id: groupId, children });
}

// Target key to find (worst case, last group)
const targetKey = 'source_999_9';

function oldFindParentGroupOfSource(key) {
  for (const group of groupsById.values()) {
    if (group.children.some(c => c.type === 'source' && c.key === key)) return group;
  }
  return null;
}

function newFindParentGroupOfSource(key) {
  const parentId = parentMap.get(key);
  return parentId ? (groupsById.get(parentId) || null) : null;
}

// Benchmark
const iterations = 100000;

const startOld = performance.now();
for (let i = 0; i < iterations; i++) {
  oldFindParentGroupOfSource(targetKey);
}
const endOld = performance.now();
const timeOld = endOld - startOld;

const startNew = performance.now();
for (let i = 0; i < iterations; i++) {
  newFindParentGroupOfSource(targetKey);
}
const endNew = performance.now();
const timeNew = endNew - startNew;

console.log(`Old method time: ${timeOld.toFixed(2)} ms`);
console.log(`New method time: ${timeNew.toFixed(2)} ms`);
console.log(`Improvement: ${(timeOld / timeNew).toFixed(2)}x faster`);
