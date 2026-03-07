describe('areAllAncestorsEnabled', () => {
    let areAllAncestorsEnabled, parentMap, groupsById;

    beforeEach(() => {
        // Reset modules and global state before each test
        jest.resetModules();

        // Setup DOM mock for content.js
        global.window = { location: { pathname: '/notebook/testproject' } };
        global.document = { querySelector: () => null, querySelectorAll: () => [], body: {} };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.location = { href: 'http://localhost' };

        // Mock setTimeout to avoid issues
        global.setTimeout = jest.fn();

        const mod = require('./content.js');

        areAllAncestorsEnabled = mod.areAllAncestorsEnabled;
        parentMap = mod.parentMap;
        groupsById = mod.groupsById;

        // Clear state before each test
        parentMap.clear();
        groupsById.clear();
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.location;
        delete global.setTimeout;
    });

    it('returns true if element has no parent', () => {
        expect(areAllAncestorsEnabled('child1')).toBe(true);
    });

    it('returns true if element parent is enabled', () => {
        parentMap.set('child1', 'parent1');
        groupsById.set('parent1', { id: 'parent1', enabled: true });
        expect(areAllAncestorsEnabled('child1')).toBe(true);
    });

    it('returns false if element parent is disabled', () => {
        parentMap.set('child1', 'parent1');
        groupsById.set('parent1', { id: 'parent1', enabled: false });
        expect(areAllAncestorsEnabled('child1')).toBe(false);
    });

    it('returns true if all ancestors are enabled in deep hierarchy', () => {
        parentMap.set('child1', 'parent1');
        parentMap.set('parent1', 'grandparent1');
        groupsById.set('parent1', { id: 'parent1', enabled: true });
        groupsById.set('grandparent1', { id: 'grandparent1', enabled: true });
        expect(areAllAncestorsEnabled('child1')).toBe(true);
    });

    it('returns false if any ancestor is disabled in deep hierarchy', () => {
        parentMap.set('child1', 'parent1');
        parentMap.set('parent1', 'grandparent1');
        groupsById.set('parent1', { id: 'parent1', enabled: true });
        groupsById.set('grandparent1', { id: 'grandparent1', enabled: false });
        expect(areAllAncestorsEnabled('child1')).toBe(false);
    });

    it('returns false if parent is not in groupsById (missing parent)', () => {
        parentMap.set('child1', 'parent1');
        // 'parent1' is missing from groupsById
        expect(areAllAncestorsEnabled('child1')).toBe(false);
    });
});
