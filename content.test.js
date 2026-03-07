describe('areAllAncestorsEnabled', () => {
    let areAllAncestorsEnabled, parentMap, groupsById;

    beforeEach(() => {
        jest.resetModules();

        global.window = { location: { pathname: '/notebook/testproject' } };
        global.document = { querySelector: () => null, querySelectorAll: () => [], body: {}, createElement: () => ({ attachShadow: () => ({}) }) };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.location = { href: 'http://localhost' };
        global.chrome = { i18n: { getMessage: () => '' } };
        global.setTimeout = jest.fn();

        const mod = require('./content.js');

        areAllAncestorsEnabled = mod.areAllAncestorsEnabled;
        parentMap = mod.parentMap;
        groupsById = mod.groupsById;

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
        expect(areAllAncestorsEnabled('child1')).toBe(false);
    });
});

describe('executeBatchDelete', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();

        global.window = { location: { pathname: '/notebook/testproject' } };
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
        global.chrome = { i18n: { getMessage: (key) => key } };
        global.setTimeout = (cb, ms) => cb();
        global.queueMicrotask = (cb) => { process.nextTick(cb); };

        const utils = require('./src/utils.js');
        global.el = utils.el;
        global.debounce = utils.debounce;
        global.isDescendant = utils.isDescendant;

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

        mockFreshCheckbox.closest = jest.fn((sel) => {
            if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) {
                return mockRowElement;
            }
            return null;
        });

        mockRowElement.matches = jest.fn((sel) => {
           if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) return true;
           return false;
        });

        mockRowElement.closest = jest.fn((sel) => {
            if (sel === mod.DEPS.row[0] || sel === mod.DEPS.row[1]) {
                return mockRowElement;
            }
            return null;
        });

        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockRowElement];
            }
            if (sel.includes('[role="menuitem"]')) return [];
            return [];
        });

        const disconnectedElement = {
            querySelector: jest.fn(() => null)
        };
        mod.sourcesByKey.set('key2', { key: 'key2', title: 'Test Source', element: disconnectedElement, isDisabled: false });
        global.document.body.contains = jest.fn(() => false);

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(global.document.body.click).toHaveBeenCalled();
    });

    it('skips disabled sources', async () => {
        mod.pendingDeleteKeys.add('disabledKey');
        mod.sourcesByKey.set('disabledKey', { key: 'disabledKey', element: {}, isDisabled: true });

        await mod.executeBatchDelete();

        expect(global.document.querySelectorAll).not.toHaveBeenCalled();
        expect(mod.pendingDeleteKeys.size).toBe(0);
    });

    it('clicks document.body if delete menu item is not found', async () => {
        mod.pendingDeleteKeys.add('key3');
        const mockMoreBtn = { click: jest.fn() };
        mod.sourcesByKey.set('key3', { key: 'key3', element: { querySelector: () => mockMoreBtn }, isDisabled: false });

        global.document.querySelectorAll = jest.fn(() => []);

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
            querySelectorAll: jest.fn(() => [])
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

describe('renderMoveToFolderModal', () => {
    let mod;
    let mockShadowRoot;

    beforeEach(() => {
        jest.resetModules();

        global.window = { location: { pathname: '/notebook/testproject' } };
        global.document = {
            getElementById: jest.fn(() => ({ addEventListener: () => {} })),
            body: { prepend: jest.fn(), click: jest.fn() },
            createElement: jest.fn(tag => {
                const el = {
                    tagName: tag.toUpperCase(),
                    className: '',
                    id: '',
                    textContent: '',
                    dataset: {},
                    classList: {
                        add: jest.fn(),
                        remove: jest.fn(),
                        contains: jest.fn()
                    },
                    style: {},
                    setAttribute: jest.fn(),
                    appendChild: jest.fn(child => child),
                    querySelector: jest.fn(() => ({ addEventListener: jest.fn() })),
                    querySelectorAll: jest.fn(() => []),
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                    remove: jest.fn(),
                    parentNode: {
                        removeChild: jest.fn()
                    },
                    attachShadow: jest.fn(() => ({
                        querySelector: jest.fn(),
                        appendChild: jest.fn()
                    }))
                };
                return el;
            }),
            createTextNode: jest.fn(text => text)
        };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.Node = class {};
        global.location = { href: 'http://localhost' };
        global.chrome = { i18n: { getMessage: (key) => key } };
        global.setTimeout = (cb, ms) => cb();
        global.requestAnimationFrame = (cb) => cb();

        const utils = require('./src/utils.js');
        global.el = utils.el;
        global.debounce = utils.debounce;
        global.isDescendant = utils.isDescendant;

        global.console.warn = jest.fn();
        global.console.error = jest.fn();

        mod = require('./content.js');
        if (mod._resetState) mod._resetState();

        mockShadowRoot = mod._getShadowRoot();
        if (mockShadowRoot) {
            mockShadowRoot.appendChild = jest.fn();
            mockShadowRoot.getElementById = jest.fn(() => null);
        }
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.Node;
        delete global.location;
        delete global.setTimeout;
        delete global.requestAnimationFrame;
        delete global.chrome;
    });

    it('returns early if shadowRoot is null', () => {
        global.document.createElement = jest.fn(() => ({
            attachShadow: () => null
        }));
        mod._resetState();
        mod.sourcesByKey.set('someKey', { key: 'someKey', title: 'Test' });

        expect(() => mod.renderMoveToFolderModal('someKey')).not.toThrow();
        if (mod._resetState) mod._resetState();
    });

    it('returns early if source is not found', () => {
        mockShadowRoot.getElementById.mockReturnValue(null);
        mod.sourcesByKey.clear();

        mod.renderMoveToFolderModal('nonexistentKey');

        expect(mockShadowRoot.appendChild).not.toHaveBeenCalled();
    });

    it('renders empty state when no folders exist', () => {
        mod.sourcesByKey.set('source1', { key: 'source1', title: 'Test Source' });
        mod.state.groups = [];

        mod.renderMoveToFolderModal('source1');

        expect(mockShadowRoot.appendChild).toHaveBeenCalled();
        const appendedElements = mockShadowRoot.appendChild.mock.calls.map(call => call[0]);
        const modalEl = appendedElements.find(el => el.className === 'sp-folder-modal');
        expect(modalEl).toBeDefined();

        const contentEl = modalEl.appendChild.mock.calls.find(call => call[0].className === 'sp-folder-modal-content')[0];
        const emptyStateEl = contentEl.appendChild.mock.calls.find(call => call[0].className === 'sp-folder-empty');
        expect(emptyStateEl).toBeDefined();
    });

    it('renders folder options when folders exist', () => {
        mod.sourcesByKey.set('source1', { key: 'source1', title: 'Test Source' });
        mod.state.groups = ['group1'];
        mod.groupsById.set('group1', { id: 'group1', title: 'Test Folder', children: [] });

        mod.renderMoveToFolderModal('source1');

        expect(mockShadowRoot.appendChild).toHaveBeenCalled();
        const appendedElements = mockShadowRoot.appendChild.mock.calls.map(call => call[0]);
        const modalEl = appendedElements.find(el => el.className === 'sp-folder-modal');
        expect(modalEl).toBeDefined();

        const contentEl = modalEl.appendChild.mock.calls.find(call => call[0].className === 'sp-folder-modal-content')[0];
        const folderOptionEl = contentEl.appendChild.mock.calls.find(call => call[0].className === 'sp-folder-option');
        expect(folderOptionEl).toBeDefined();
    });
});
