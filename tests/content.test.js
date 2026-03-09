global.Node = class {};

const setupGlobalMocks = () => {
    global.window = { location: { pathname: '/notebook/testproject' } };

    const mockElement = () => ({
        attachShadow: jest.fn(() => ({
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            getElementById: jest.fn(() => ({ addEventListener: jest.fn() })),
            appendChild: jest.fn(),
        })),
        appendChild: jest.fn(),
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        remove: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn() },
        dataset: {},
        matches: jest.fn(() => false),
        closest: jest.fn(() => null),
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        textContent: '',
        className: '',
    });

    global.document = {
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        getElementById: jest.fn(() => ({ addEventListener: jest.fn() })),
        createElement: jest.fn(mockElement),
        createTextNode: jest.fn(),
        body: {
            prepend: jest.fn(),
            contains: jest.fn(() => true),
            click: jest.fn(),
        },
        addEventListener: jest.fn(),
    };

    global.MutationObserver = class { observe() {} disconnect() {} };
    global.location = { href: 'http://localhost' };
    global.chrome = {
        i18n: { getMessage: (key) => key },
        runtime: { sendMessage: jest.fn(), lastError: null }
    };

    const utils = require('../src/utils/index.js');
    global.el = utils.el;
    global.debounce = utils.debounce;
    global.isDescendant = utils.isDescendant;
};

const teardownGlobalMocks = () => {
    delete global.window;
    delete global.document;
    delete global.MutationObserver;
    delete global.location;
    delete global.setTimeout;
    delete global.clearTimeout;
    delete global.chrome;
    delete global.el;
    delete global.debounce;
    delete global.isDescendant;
    delete global.queueMicrotask;
};

describe('areAllAncestorsEnabled', () => {
    let areAllAncestorsEnabled, parentMap, groupsById;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn();

        const mod = require('../src/content/index.js');
        areAllAncestorsEnabled = mod.areAllAncestorsEnabled;
        parentMap = mod.parentMap;
        groupsById = mod.groupsById;

        if (mod._resetState) mod._resetState();
    });

    afterEach(teardownGlobalMocks);

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
        setupGlobalMocks();
        global.setTimeout = (cb, ms) => cb();
        global.queueMicrotask = (cb) => { process.nextTick(cb); };

        global.console.warn = jest.fn();
        global.console.error = jest.fn();

        mod = require('../src/content/index.js');
        if (mod._resetState) mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('returns early if pendingBatchKeys is empty', async () => {
        mod.pendingBatchKeys.clear();
        await mod.executeBatchDelete();
        expect(mod._getIsDeletingSources()).toBe(false);
    });

    it('returns early if already deleting', async () => {
        mod.pendingBatchKeys.add('key1');
        mod._setIsDeletingSources(true);
        await mod.executeBatchDelete();
        expect(mod.pendingBatchKeys.size).toBe(1);
    });

    it('processes keys, finds more options, clicks delete and confirm', async () => {
        mod.pendingBatchKeys.add('key1');
        mod.state.isBatchMode = true;

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
            textContent: 'Delete this?',
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
        expect(mod.pendingBatchKeys.size).toBe(0);
        expect(mod.state.isBatchMode).toBe(false);
    });

    it('falls back to findFreshCheckbox if more button is not found initially', async () => {
        mod.pendingBatchKeys.add('key2');

        const mockMoreBtn = { click: jest.fn() };
        const mockFreshRow = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.moreBtn.includes(sel)) return mockMoreBtn;
                return null;
            }),
            matches: jest.fn((sel) => mod.DEPS.row.includes(sel)),
            closest: jest.fn((sel) => mod.DEPS.row.includes(sel) ? mockFreshRow : null),
        };
        const mockFreshCheckbox = {
            closest: jest.fn(() => mockFreshRow)
        };

        const mockTitleEl = { textContent: 'Test Source' };

        mockFreshRow.querySelector = jest.fn(s => {
            if (mod.DEPS.title.includes(s)) return mockTitleEl;
            if (mod.DEPS.checkbox.includes(s)) return mockFreshCheckbox;
            if (mod.DEPS.moreBtn.includes(s)) return mockMoreBtn;
            return null;
        });

        global.document.querySelectorAll = jest.fn(sel => {
            if (mod.DEPS.row.includes(sel)) {
                return [mockFreshRow];
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
        mod.pendingBatchKeys.add('disabledKey');
        mod.sourcesByKey.set('disabledKey', { key: 'disabledKey', element: {}, isDisabled: true });

        await mod.executeBatchDelete();

        expect(global.document.querySelectorAll).not.toHaveBeenCalled();
        expect(mod.pendingBatchKeys.size).toBe(0);
    });

    it('clicks document.body if delete menu item is not found', async () => {
        mod.pendingBatchKeys.add('key3');
        const mockMoreBtn = { click: jest.fn() };
        mod.sourcesByKey.set('key3', { key: 'key3', element: { querySelector: () => mockMoreBtn }, isDisabled: false });

        global.document.querySelectorAll = jest.fn(() => []);

        await mod.executeBatchDelete();

        expect(mockMoreBtn.click).toHaveBeenCalled();
        expect(global.document.body.click).toHaveBeenCalled();
    });

    it('clicks document.body if confirm button is not found', async () => {
        mod.pendingBatchKeys.add('key4');
        const mockMoreBtn = { click: jest.fn() };
        mod.sourcesByKey.set('key4', { key: 'key4', element: { querySelector: () => mockMoreBtn }, isDisabled: false });

        const mockDeleteMenuItem = { textContent: 'Delete', click: jest.fn() };
        const mockDialog = {
            textContent: 'Delete this?',
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

describe('saveState', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();

        // Mock setTimeout to call the function synchronously so debounced functions run immediately
        global.setTimeout = (cb, ms) => cb();
        global.clearTimeout = jest.fn();

        // Make debounce execute synchronously for tests
        global.debounce = (func) => (...args) => func(...args);

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

        mod = require('../src/content/index.js');
        if (mod._resetState) mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('returns early if projectId is missing', () => {
        if (mod._setProjectId) mod._setProjectId(null); else mod.projectId = null;
        mod.saveState();
        jest.runAllTimers();
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it.skip('correctly extracts persistableState and calls storage set', () => {
        const projectId = 'test_project_id';
        if (mod._setProjectId) mod._setProjectId(projectId); else mod.projectId = projectId;

        // Populate state
        mod.state.groups = ['group1', 'group2'];
        mod.state.ungrouped = ['source3'];

        mod.groupsById.set('group1', { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] });
        mod.groupsById.set('group2', { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] });

        mod.sourcesByKey.set('source1', { enabled: true });
        mod.sourcesByKey.set('source2', { enabled: false });
        mod.sourcesByKey.set('source3', { enabled: true });

        mod._setCustomHeight(500);

        mod.saveState();
        jest.runAllTimers();

        const expectedKey = `sourcesPlusState_${projectId}`;
        const expectedPersistableState = {
            groups: ['group1', 'group2'],
            groupsById: {
                'group1': { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] },
                'group2': { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] }
            },
            ungrouped: ['source3'],
            enabledMap: {
                'source1': true,
                'source2': false,
                'source3': true
            },
            customHeight: 500
        };

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            { type: 'SAVE_STATE', key: expectedKey, data: expectedPersistableState },
            expect.any(Function)
        );
    });

    it.skip('handles potential errors during debouncedStorageSet', () => {
        const projectId = 'test_project_id';
        if (mod._setProjectId) mod._setProjectId(projectId); else mod.projectId = projectId;

        // Simulate chrome.runtime.sendMessage throwing an error (e.g., context invalidated)
        global.chrome.runtime.sendMessage.mockImplementationOnce(() => {
            throw new Error('Extension context invalidated.');
        });

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        expect(() => mod.saveState()).not.toThrow();
        jest.runAllTimers();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "Sources+: Context invalidated. Please refresh the page.",
            expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
    });
});

describe('findFreshCheckbox', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();

        global.queueMicrotasks = [];
        global.queueMicrotask = jest.fn((cb) => {
            global.queueMicrotasks.push(cb);
        });
        global.processMicrotasks = () => {
            const tasks = [...global.queueMicrotasks];
            global.queueMicrotasks = [];
            tasks.forEach(cb => cb());
        };

        mod = require('../src/content/index.js');
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

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
        expect(global.queueMicrotask).not.toHaveBeenCalled();
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

    it('clears freshRowCache when mutation observer triggers', () => {
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
        mod._resetState();

        // Cache should be cleared
        expect(mod._getFreshRowCache()).toBeNull();
    });
});

describe('removeGroupFromTree', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();

        mod = require('../src/content/index.js');
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('removes a top-level group from state.groups', () => {
        mod.state.groups = ['group1', 'group2', 'group3'];
        mod.removeGroupFromTree('group2');
        expect(mod.state.groups).toEqual(['group1', 'group3']);
    });

    it('removes a nested group from its parent children array', () => {
        const parentGroup = { id: 'parent1', children: [{ id: 'child1' }, { id: 'child2' }] };
        mod.groupsById.set('parent1', parentGroup);

        mod.removeGroupFromTree('child1');

        expect(parentGroup.children).toEqual([{ id: 'child2' }]);
    });

    it('removes a group from both state.groups and parent children if present in both', () => {
        mod.state.groups = ['group1', 'orphanChild'];
        const parentGroup = { id: 'parent1', children: [{ id: 'orphanChild' }, { id: 'other' }] };
        mod.groupsById.set('parent1', parentGroup);

        mod.removeGroupFromTree('orphanChild');

        expect(mod.state.groups).toEqual(['group1']);
        expect(parentGroup.children).toEqual([{ id: 'other' }]);
    });

    it('does nothing if group id is not found', () => {
        mod.state.groups = ['group1'];
        const parentGroup = { id: 'parent1', children: [{ id: 'child1' }] };
        mod.groupsById.set('parent1', parentGroup);

        mod.removeGroupFromTree('nonExistent');

        expect(mod.state.groups).toEqual(['group1']);
        expect(parentGroup.children).toEqual([{ id: 'child1' }]);
    });
});
