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

describe('closeMoveToFolderModal', () => {
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

        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.location;
        delete global.chrome;
    });

    it('returns early if shadowRoot is null', () => {
        mod._setShadowRoot(null);
        expect(() => mod.closeMoveToFolderModal()).not.toThrow();
    });

    it('adds closing classes and removes elements after 300ms', () => {
        const mockBackdropParent = { removeChild: jest.fn() };
        const mockModalParent = { removeChild: jest.fn() };

        const mockBackdrop = {
            classList: { remove: jest.fn(), add: jest.fn() },
            parentNode: mockBackdropParent,
            remove: jest.fn()
        };

        const mockModal = {
            classList: { remove: jest.fn(), add: jest.fn() },
            parentNode: mockModalParent,
            remove: jest.fn()
        };

        const mockShadowRoot = {
            getElementById: jest.fn(id => {
                if (id === 'sp-move-backdrop') return mockBackdrop;
                if (id === 'sp-move-modal') return mockModal;
                return null;
            })
        };

        mod._setShadowRoot(mockShadowRoot);

        mod.closeMoveToFolderModal();

        expect(mockModal.classList.remove).toHaveBeenCalledWith('visible');
        expect(mockModal.classList.add).toHaveBeenCalledWith('closing');
        expect(mockBackdrop.classList.remove).toHaveBeenCalledWith('visible');

        // Elements shouldn't be removed immediately
        expect(mockBackdropParent.removeChild).not.toHaveBeenCalled();
        expect(mockModalParent.removeChild).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);

        // After 300ms, they should be removed via parentNode.removeChild
        expect(mockBackdropParent.removeChild).toHaveBeenCalledWith(mockBackdrop);
        expect(mockModalParent.removeChild).toHaveBeenCalledWith(mockModal);
    });

    it('does not throw when elements have no parentNode after 300ms', () => {
        const mockBackdrop = {
            classList: { remove: jest.fn(), add: jest.fn() },
            parentNode: null, // Missing parentNode
            remove: jest.fn()
        };

        const mockModal = {
            classList: { remove: jest.fn(), add: jest.fn() },
            parentNode: null, // Missing parentNode
            remove: jest.fn()
        };

        const mockShadowRoot = {
            getElementById: jest.fn(id => {
                if (id === 'sp-move-backdrop') return mockBackdrop;
                if (id === 'sp-move-modal') return mockModal;
                return null;
            })
        };

        mod._setShadowRoot(mockShadowRoot);

        expect(() => {
            mod.closeMoveToFolderModal();
            jest.advanceTimersByTime(300);
        }).not.toThrow();

        // Ensure parentNode is null and we didn't call any remove methods
        expect(mockBackdrop.remove).not.toHaveBeenCalled();
    });

    it('falls back to remove() if modal or backdrop are present but not both', () => {
        const mockBackdrop = {
            remove: jest.fn()
        };

        const mockShadowRoot = {
            getElementById: jest.fn(id => {
                if (id === 'sp-move-backdrop') return mockBackdrop;
                return null; // missing modal
            })
        };

        mod._setShadowRoot(mockShadowRoot);

        mod.closeMoveToFolderModal();

        // The else block handles fallback cleanup immediately
        expect(mockBackdrop.remove).toHaveBeenCalled();
    });
});
