describe('areAllAncestorsEnabled', () => {
    let areAllAncestorsEnabled, parentMap, groupsById;

    beforeEach(() => {
        // Reset modules and global state before each test
        jest.resetModules();

        // Setup DOM mock for content.js
        global.window = { location: { pathname: '/notebook/testproject' } };
        global.document = { querySelector: () => null, querySelectorAll: () => [], body: {}, createElement: () => ({ attachShadow: () => ({}) }) };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.location = { href: 'http://localhost' };
        global.chrome = { i18n: { getMessage: () => '' } };

        // Mock setTimeout to avoid issues
        global.setTimeout = jest.fn();

        const mod = require('./content.js');

        areAllAncestorsEnabled = mod.areAllAncestorsEnabled;
        parentMap = mod.parentMap;
        groupsById = mod.groupsById;

        // Clear state before each test
        if (mod._resetState) mod._resetState();
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.location;
        delete global.setTimeout;
        delete global.chrome;
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

describe('executeBatchDelete', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();

        // Complex DOM mock
        global.window = { location: { pathname: '/notebook/testproject' } };

        // Mock document methods
        const mockBody = { contains: jest.fn(() => true), click: jest.fn() };
        global.document = {
            body: mockBody,
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            createElement: jest.fn(() => {
                const classList = {
                    add: jest.fn(),
                    remove: jest.fn()
                };
                return {
                    className: '',
                    textContent: '',
                    classList,
                    attachShadow: jest.fn(() => ({
                        querySelector: jest.fn(() => null),
                        appendChild: jest.fn()
                    }))
                };
            })
        };

        global.MutationObserver = class { observe() {} disconnect() {} };
        global.location = { href: 'http://localhost' };

        // Mock i18n
        global.chrome = { i18n: { getMessage: (key) => key } };

        // Mock setTimeout/Promise for async code
        global.setTimeout = (cb, ms) => cb();

        // Delay microtasks correctly so `freshRowCache` is valid during test block
        global.queueMicrotask = (cb) => {
            process.nextTick(cb);
        };

        // Ensure util functions are attached to global
        const utils = require('./src/utils.js');
        global.el = utils.el;
        global.debounce = utils.debounce;
        global.isDescendant = utils.isDescendant;

        // Mock console.warn and console.error
        global.console.warn = jest.fn();
        global.console.error = jest.fn();

        mod = require('./content.js');
        if (mod._resetState) mod._resetState();
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.location;
        delete global.setTimeout;
        delete global.chrome;
        delete global.queueMicrotask;
    });

    it('returns early if pendingDeleteKeys is empty', async () => {
        mod.pendingDeleteKeys.clear();
        await mod.executeBatchDelete();
        expect(mod._getIsDeletingSources()).toBe(false);
    });

    it('returns early if already deleting', async () => {
        mod.pendingDeleteKeys.add('key1');
        mod._setIsDeletingSources(true);
        await mod.executeBatchDelete();
        // Since it returns early, it shouldn't clear the keys
        expect(mod.pendingDeleteKeys.size).toBe(1);
    });

    it('processes keys, finds more options, clicks delete and confirm', async () => {
        mod.pendingDeleteKeys.add('key1');
        mod.state.isDeleteMode = true;

        const mockMoreBtn = { click: jest.fn() };
        const mockSourceElement = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.moreBtn.includes(sel)) return mockMoreBtn;
                return null;
            })
        };

        mod.sourcesByKey.set('key1', { key: 'key1', element: mockSourceElement, isDisabled: false });

        const mockDeleteMenuItem = { textContent: 'Delete', click: jest.fn(), querySelector: jest.fn() };
        const mockConfirmBtn = { textContent: 'Delete', className: 'primary', click: jest.fn(), querySelector: jest.fn(), getAttribute: jest.fn() };
        // We need an exact match for the array of buttons loop, so give it an iterator or make querySelectorAll return it directly.
        const mockDialog = {
            querySelectorAll: jest.fn(sel => {
                if (sel === 'button') return [mockConfirmBtn];
                return [];
            })
        };

        global.document.querySelectorAll = jest.fn(sel => {
            if (sel.includes('[role="menuitem"]')) return [mockDeleteMenuItem];
            if (sel.includes('dialog')) return [mockDialog];
            return [];
        });

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(mockDeleteMenuItem.click).toHaveBeenCalled();
        expect(mockConfirmBtn.click).toHaveBeenCalled();

        // Assert cleanup
        expect(mod._getIsDeletingSources()).toBe(false);
        expect(mod.pendingDeleteKeys.size).toBe(0);
        expect(mod.state.isDeleteMode).toBe(false);
    });

    it('falls back to findFreshCheckbox if more button is not found initially', async () => {
        mod.pendingDeleteKeys.add('key2');

        const mockMoreBtn = { click: jest.fn() };
        const mockFreshRow = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.moreBtn.includes(sel)) return mockMoreBtn;
                return null;
            })
        };
        const mockFreshCheckbox = {
            closest: jest.fn(() => mockFreshRow)
        };

        const mockTitleEl = { textContent: 'Test Source' };

        const mockRowElement = {
            querySelector: jest.fn(s => {
                if (mod.DEPS.title.includes(s)) return mockTitleEl;
                if (mod.DEPS.checkbox.includes(s)) return mockFreshCheckbox;
                if (mod.DEPS.moreBtn.includes(s)) return mockMoreBtn;
                return null;
            })
        };

        // Fix test logic around mockFreshCheckbox's closest call:
        // closest takes an array of strings like `['[data-testid="source-item"]', '.single-source-container']`
        // mockFreshCheckbox should return `mockFreshRow` when called.
        mockFreshCheckbox.closest = jest.fn((sel) => {
            // If it's searching for the row, return our mocked row
            if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) {
                return mockRowElement;
            }
            return null;
        });

        // Also ensure mockRowElement is returned by findElement(DEPS.row)
        // by making sure it has matching selector capabilities if querySelector is used.
        mockRowElement.matches = jest.fn((sel) => {
           if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) return true;
           return false;
        });

        // Add closest onto mockRowElement as well just in case
        mockRowElement.closest = jest.fn((sel) => {
            if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) {
                return mockRowElement;
            }
            return null;
        });

        // Setup cache structure correctly using our defined row and title
        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockRowElement]; // Just return normal array, the manual iterators were causing the actual issue
            }
            if (sel.includes('[role="menuitem"]')) return []; // No menu item to prevent further execution
            return [];
        });

        // The sourcesByKey element property MUST be truthy or `document.body.contains` will throw.
        // Actually it tests `source.element` not `!document.body.contains(nativeMoreBtn)` correctly
        // so we can give it an element, but one that fails contains.
        const disconnectedElement = {
            querySelector: jest.fn(() => null) // Simulate missing moreBtn
        };
        mod.sourcesByKey.set('key2', { key: 'key2', title: 'Test Source', element: disconnectedElement, isDisabled: false });
        // Make body.contains return false for this specific source
        global.document.body.contains = jest.fn(() => false);

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(global.document.body.click).toHaveBeenCalled(); // Because menu item wasn't found
    });

    it('skips disabled sources', async () => {
        mod.pendingDeleteKeys.add('disabledKey');
        mod.sourcesByKey.set('disabledKey', { key: 'disabledKey', element: {}, isDisabled: true });

        await mod.executeBatchDelete();

        expect(global.document.querySelectorAll).not.toHaveBeenCalled();
        expect(mod.pendingDeleteKeys.size).toBe(0); // Should still cleanup
    });

    it('clicks document.body if delete menu item is not found', async () => {
        mod.pendingDeleteKeys.add('key3');
        const mockMoreBtn = { click: jest.fn() };
        mod.sourcesByKey.set('key3', { key: 'key3', element: { querySelector: () => mockMoreBtn }, isDisabled: false });

        global.document.querySelectorAll = jest.fn(() => []); // Return empty for everything

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(global.document.body.click).toHaveBeenCalled();
    });

    it('clicks document.body if confirm button is not found', async () => {
        mod.pendingDeleteKeys.add('key4');
        const mockMoreBtn = { click: jest.fn() };
        mod.sourcesByKey.set('key4', { key: 'key4', element: { querySelector: () => mockMoreBtn }, isDisabled: false });

        const mockDeleteMenuItem = { textContent: 'Delete', click: jest.fn() };
        const mockDialog = {
            querySelectorAll: jest.fn(() => []) // No buttons found
        };

        global.document.querySelectorAll = jest.fn(sel => {
            if (sel.includes('[role="menuitem"]')) return [mockDeleteMenuItem];
            if (sel.includes('dialog')) return [mockDialog];
            return [];
        });

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(mockDeleteMenuItem.click).toHaveBeenCalled();
        expect(global.document.body.click).toHaveBeenCalled();
    });
});

describe('findFreshCheckbox', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();

        // Setup DOM mock
        global.document = {
            querySelectorAll: jest.fn(() => []),
            querySelector: jest.fn(() => null),
            createElement: jest.fn(() => ({ attachShadow: () => ({}) }))
        };

        // Microtask queue processing control
        let queuedTask = null;
        global.queueMicrotask = jest.fn((cb) => {
            queuedTask = cb;
        });

        global.processMicrotasks = () => {
            if (queuedTask) {
                queuedTask();
                queuedTask = null;
            }
        };

        // Prevent errors for missing globals
        global.window = { location: { pathname: '/notebook/testproject' } };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.location = { href: 'http://localhost' };
        global.chrome = { i18n: { getMessage: (key) => key } };

        mod = require('./content.js');
        if (mod._resetState) mod._resetState();
    });

    afterEach(() => {
        delete global.document;
        delete global.queueMicrotask;
        delete global.processMicrotasks;
        delete global.window;
        delete global.MutationObserver;
        delete global.location;
        delete global.chrome;
    });

    it('returns null if sourceKey is not found in sourcesByKey', () => {
        expect(mod.findFreshCheckbox('invalidKey')).toBeNull();
    });

    it('populates freshRowCache and finds the correct checkbox', () => {
        const sourceTitle = 'Test Document';
        mod.sourcesByKey.set('source1', { key: 'source1', title: sourceTitle });

        const mockCheckbox = { type: 'checkbox' };
        const mockTitleEl = { textContent: `  ${sourceTitle}  ` };
        const mockRow = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.title.includes(sel)) return mockTitleEl;
                if (mod.DEPS.checkbox.includes(sel)) return mockCheckbox;
                return null;
            })
        };

        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockRow];
            }
            return [];
        });

        const result = mod.findFreshCheckbox('source1');

        expect(result).toBe(mockCheckbox);
        expect(mod._getFreshRowCache()).toBeInstanceOf(Map);
        expect(mod._getFreshRowCache().get(sourceTitle)).toBe(mockRow);
        expect(global.queueMicrotask).toHaveBeenCalled();
    });

    it('returns null if no fresh row is found matching the title', () => {
        mod.sourcesByKey.set('source2', { key: 'source2', title: 'Looking For This' });

        const mockTitleEl = { textContent: 'Completely Different Title' };
        const mockRow = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.title.includes(sel)) return mockTitleEl;
                return null;
            })
        };

        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockRow];
            }
            return [];
        });

        const result = mod.findFreshCheckbox('source2');

        expect(result).toBeNull();
    });

    it('clears freshRowCache after microtasks execute', () => {
        const sourceTitle = 'Temp Title';
        mod.sourcesByKey.set('source3', { key: 'source3', title: sourceTitle });

        const mockTitleEl = { textContent: sourceTitle };
        const mockRow = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.title.includes(sel)) return mockTitleEl;
                return null; // Don't even need a checkbox to test cache clearing
            })
        };

        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockRow];
            }
            return [];
        });

        // First call populates cache and queues microtask
        mod.findFreshCheckbox('source3');
        expect(mod._getFreshRowCache()).toBeInstanceOf(Map);

        // Simulate microtask execution
        global.processMicrotasks();

        // Cache should be cleared
        expect(mod._getFreshRowCache()).toBeNull();
    });
});
