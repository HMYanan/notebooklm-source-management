// --- Setup Global Mocks for content.js ---
global.window = {
    location: {
        pathname: '/notebook/12345'
    }
};
global.location = {
    href: 'https://notebooklm.google.com/notebook/12345'
};
global.document = {
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    createElement: jest.fn(() => ({})),
    body: {
        appendChild: jest.fn()
    }
};
global.MutationObserver = class {
    observe() {}
    disconnect() {}
};

// Require the content script module
const { removeSourceFromTree, state, groupsById, parentMap, _resetState } = require('./content.js');

describe('content.js: removeSourceFromTree', () => {
    beforeEach(() => {
        // Reset all relevant state before each test to ensure test isolation
        _resetState();
    });

    it('should remove a source that is ungrouped', () => {
        const sourceKey = 'source-1';

        // Setup state: source is ungrouped
        state.ungrouped.push(sourceKey);

        // Ensure source exists before removal
        expect(state.ungrouped).toContain(sourceKey);

        // Action
        removeSourceFromTree(sourceKey);

        // Assertion
        expect(state.ungrouped).not.toContain(sourceKey);
        expect(state.ungrouped.length).toBe(0);
    });

    it('should remove a source that is in a group', () => {
        const sourceKey = 'source-2';
        const groupId = 'group-1';
        const otherSourceKey = 'source-3';
        const nestedGroupId = 'group-2';

        // Setup state: group exists with multiple children
        groupsById.set(groupId, {
            id: groupId,
            children: [
                { type: 'source', key: sourceKey },
                { type: 'source', key: otherSourceKey },
                { type: 'group', id: nestedGroupId }
            ]
        });

        // Map the source to its parent group
        parentMap.set(sourceKey, groupId);
        parentMap.set(otherSourceKey, groupId);

        // Ensure initial state is correct
        expect(groupsById.get(groupId).children.length).toBe(3);

        // Action
        removeSourceFromTree(sourceKey);

        // Assertion
        const parentGroup = groupsById.get(groupId);
        // The source should be removed
        expect(parentGroup.children.find(c => c.type === 'source' && c.key === sourceKey)).toBeUndefined();

        // The other source should remain
        expect(parentGroup.children.find(c => c.type === 'source' && c.key === otherSourceKey)).toBeDefined();

        // The nested group should remain (filter allows c.type === 'group' unconditionally)
        expect(parentGroup.children.find(c => c.type === 'group' && c.id === nestedGroupId)).toBeDefined();

        // Total children should be 2
        expect(parentGroup.children.length).toBe(2);

        // Ungrouped state should remain untouched
        expect(state.ungrouped.length).toBe(0);
    });

    it('should handle removing a non-existent source gracefully', () => {
        const existingSourceKey = 'existing-source';
        state.ungrouped.push(existingSourceKey);

        // Action
        removeSourceFromTree('non-existent-source');

        // Assertion: State is unaffected
        expect(state.ungrouped).toContain(existingSourceKey);
        expect(state.ungrouped.length).toBe(1);
        expect(groupsById.size).toBe(0);
    });

    it('should handle removing a source whose parent group is missing from groupsById gracefully', () => {
        const sourceKey = 'source-4';
        const missingGroupId = 'group-missing';

        // Setup state: parentMap points to a group that doesn't exist in groupsById
        parentMap.set(sourceKey, missingGroupId);
        state.ungrouped.push(sourceKey);

        // Action
        removeSourceFromTree(sourceKey);

        // Assertion: Since parentGroup wasn't found, it falls back to removing from state.ungrouped
        expect(state.ungrouped).not.toContain(sourceKey);
    });
});
