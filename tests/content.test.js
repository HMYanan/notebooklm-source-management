global.Node = class {};
const loadContentModule = require('./helpers/load-content-module');

const setupGlobalMocks = () => {
    global.window = {
        location: {
            pathname: '/notebook/testproject',
            origin: 'https://notebooklm.google.com',
            reload: jest.fn()
        }
    };

    const mockElement = () => ({
        attachShadow: jest.fn(() => ({
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            getElementById: jest.fn(() => ({ addEventListener: jest.fn() })),
            appendChild: jest.fn(),
        })),
        appendChild: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(() => null),
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
        head: {
            appendChild: jest.fn()
        },
        body: {
            children: [],
            prepend: jest.fn(),
            contains: jest.fn(() => true),
            click: jest.fn(),
        },
        documentElement: {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    };

    global.MutationObserver = class { observe() {} disconnect() {} };
    global.location = { href: 'http://localhost' };
    global.chrome = {
        i18n: { getMessage: (key) => key },
        runtime: {
            sendMessage: jest.fn(),
            lastError: null,
            onMessage: { addListener: jest.fn() }
        }
    };

    const utils = require('../src/utils/index.js');
    global.el = utils.el;
    global.debounce = utils.debounce;
    global.isDescendant = utils.isDescendant;
};

const createMockSourceRow = ({
    title,
    ariaLabel = '',
    checked = false,
    disabled = false,
    iconName = 'article',
    stableToken = null,
    href = null,
    loading = false
}) => {
    const checkbox = {
        checked,
        disabled,
        click: jest.fn(),
        getAttribute: jest.fn((attr) => (attr === 'aria-label' ? ariaLabel : null))
    };
    const titleEl = { textContent: title };
    const iconEl = {
        textContent: iconName,
        classList: []
    };

    const tokenNode = stableToken ? {
        getAttribute: jest.fn((attr) => {
            if (attr === 'data-source-id') return stableToken;
            if (attr === 'href') return href;
            return null;
        })
    } : null;

    const hrefNode = href ? {
        getAttribute: jest.fn((attr) => (attr === 'href' ? href : null))
    } : null;

    const row = {
        getAttribute: jest.fn((attr) => {
            if (attr === 'data-source-id') return stableToken;
            if (attr === 'href') return href;
            return null;
        }),
        querySelector: jest.fn((selector) => {
            if (selector.includes('source-title')) return titleEl;
            if (selector.includes('checkbox')) return checkbox;
            if (selector.includes('mat-icon')) return iconEl;
            if (loading && selector.includes('[role="progressbar"]')) return { role: 'progressbar' };
            return null;
        }),
        querySelectorAll: jest.fn((selector) => {
            if (selector === '[data-source-id]' && tokenNode) return [tokenNode];
            if (selector === '[href]' && hrefNode) return [hrefNode];
            return [];
        })
    };

    return { row, checkbox, titleEl, iconEl };
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
    delete global.NSM_CONTENT_CONFIG;
    delete global.NSM_CONTENT_STYLE_TEXT;
    delete global.NSM_GLOBAL_OVERLAY_STYLE_TEXT;
    delete global.NSM_CREATE_MANAGER_SHELL;
};

describe('areAllAncestorsEnabled', () => {
    let areAllAncestorsEnabled, parentMap, groupsById;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn();

        const mod = loadContentModule();
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

        mod = loadContentModule();
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

        mod = loadContentModule();
        if (mod._resetState) mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('returns early if projectId is missing', () => {
        if (mod._setProjectId) mod._setProjectId(null); else mod.projectId = null;
        mod.saveState();
        jest.runAllTimers();
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('correctly extracts persistableState and calls storage set', () => {
        const projectId = 'test_project_id';
        if (mod._setProjectId) mod._setProjectId(projectId); else mod.projectId = projectId;

        // Populate state
        mod.state.groups = ['group1', 'group2'];
        mod.state.ungrouped = ['source3'];

        mod.groupsById.set('group1', { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] });
        mod.groupsById.set('group2', { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] });

        mod.sourcesByKey.set('source1', { enabled: true, title: 'Source 1', normalizedTitle: 'source 1', fingerprint: 'source 1||article', identityType: 'stable-token' });
        mod.sourcesByKey.set('source2', { enabled: false, title: 'Source 2', normalizedTitle: 'source 2', fingerprint: 'source 2||article', identityType: 'stable-token' });
        mod.sourcesByKey.set('source3', { enabled: true, title: 'Source 3', normalizedTitle: 'source 3', fingerprint: 'source 3||article', identityType: 'fingerprint' });

        mod._setCustomHeight(500);

        mod.saveState();
        jest.runAllTimers();

        const expectedKey = `sourcesPlusState_${projectId}`;
        const expectedPersistableState = {
            schemaVersion: 2,
            groups: ['group1', 'group2'],
            groupsById: {
                'group1': { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] },
                'group2': { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] }
            },
            ungrouped: ['source3'],
            sourceStateById: {
                'source1': {
                    enabled: true,
                    title: 'Source 1',
                    normalizedTitle: 'source 1',
                    fingerprint: 'source 1||article',
                    identityType: 'stable-token'
                },
                'source2': {
                    enabled: false,
                    title: 'Source 2',
                    normalizedTitle: 'source 2',
                    fingerprint: 'source 2||article',
                    identityType: 'stable-token'
                },
                'source3': {
                    enabled: true,
                    title: 'Source 3',
                    normalizedTitle: 'source 3',
                    fingerprint: 'source 3||article',
                    identityType: 'fingerprint'
                }
            },
            customHeight: 500
        };

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            { type: 'SAVE_STATE', key: expectedKey, data: expectedPersistableState },
            expect.any(Function)
        );
    });

    it('handles potential errors during debouncedStorageSet', () => {
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
            "NotebookLM Source Management: Context invalidated. Please refresh the page.",
            expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
    });
});

describe('loadState', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = (cb) => {
            cb();
            return 1;
        };
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('returns null when projectId is missing', () => {
        const callback = jest.fn();
        mod._setProjectId(null);

        mod.loadState(callback);

        expect(callback).toHaveBeenCalledWith(null);
    });

    it('restores v2 state and custom height', () => {
        const callback = jest.fn();
        const container = { style: {} };
        mod._setProjectId('test-project');
        mod._setShadowRootForTest({
            host: { isConnected: true },
            querySelector: jest.fn((selector) => (selector === '.sp-container' ? container : null))
        });

        global.chrome.runtime.sendMessage.mockImplementationOnce((message, cb) => {
            cb({
                data: {
                    schemaVersion: 2,
                    groups: ['group1'],
                    groupsById: {
                        group1: { id: 'group1', title: 'Group', children: [] }
                    },
                    ungrouped: ['source1'],
                    sourceStateById: {
                        source1: {
                            enabled: true,
                            title: 'Source 1',
                            normalizedTitle: 'source 1',
                            fingerprint: 'source 1||article',
                            identityType: 'stable-token'
                        }
                    },
                    customHeight: 420
                }
            });
        });

        mod.loadState(callback);

        expect(callback).toHaveBeenCalledWith({
            schemaVersion: 2,
            groups: ['group1'],
            groupsById: {
                group1: { id: 'group1', title: 'Group', children: [] }
            },
            ungrouped: ['source1'],
            sourceStateById: {
                source1: {
                    enabled: true,
                    title: 'Source 1',
                    normalizedTitle: 'source 1',
                    fingerprint: 'source 1||article',
                    identityType: 'stable-token'
                }
            },
            customHeight: 420
        });
        expect(container.style.height).toBe('420px');
        expect(mod._getPendingStorageUpgrade()).toBe(false);
    });

    it('normalizes legacy state and marks it for migration', () => {
        const callback = jest.fn();
        mod._setProjectId('test-project');

        global.chrome.runtime.sendMessage.mockImplementationOnce((message, cb) => {
            cb({
                data: {
                    groups: ['group1'],
                    groupsById: {
                        group1: { id: 'group1', title: 'Group', children: [{ type: 'source', key: 'source_legacy' }] }
                    },
                    ungrouped: ['source_legacy_2'],
                    enabledMap: {
                        source_legacy: false
                    },
                    customHeight: 300
                }
            });
        });

        mod.loadState(callback);

        expect(callback).toHaveBeenCalledWith({
            schemaVersion: 1,
            groups: ['group1'],
            groupsById: {
                group1: { id: 'group1', title: 'Group', children: [{ type: 'source', key: 'source_legacy' }] }
            },
            ungrouped: ['source_legacy_2'],
            legacyEnabledMap: {
                source_legacy: false
            },
            customHeight: 300
        });
        expect(mod._getPendingStorageUpgrade()).toBe(true);
    });

    it('falls back to null when runtime messaging fails', () => {
        const callback = jest.fn();
        mod._setProjectId('test-project');

        global.chrome.runtime.sendMessage.mockImplementationOnce((message, cb) => {
            global.chrome.runtime.lastError = { message: 'Extension unavailable' };
            cb({});
        });

        mod.loadState(callback);

        expect(callback).toHaveBeenCalledWith(null);
        global.chrome.runtime.lastError = null;
    });
});

describe('scanAndSyncSources', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = (cb) => {
            cb();
            return 1;
        };
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('hydrates v2 state, appends new sources, and preserves loading metadata', () => {
        const first = createMockSourceRow({ title: 'First Source', stableToken: 'doc-1', checked: true });
        const second = createMockSourceRow({ title: 'First Source', stableToken: null, iconName: 'video_youtube', loading: true });
        const descriptorA = mod.createSourceDescriptor(first.row, new Map(), new Map());

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [first.row, second.row] : []
        ));

        const shouldUpgrade = mod.scanAndSyncSources({
            schemaVersion: 2,
            groups: ['group1'],
            groupsById: {
                group1: { id: 'group1', title: 'Pinned', children: [{ type: 'source', key: descriptorA.key }] }
            },
            ungrouped: [],
            sourceStateById: {
                [descriptorA.key]: {
                    enabled: false,
                    title: 'First Source',
                    normalizedTitle: 'first source',
                    fingerprint: descriptorA.fingerprint,
                    identityType: descriptorA.identityType
                }
            }
        }, true);

        const secondKey = mod.state.ungrouped[0];
        expect(shouldUpgrade).toBe(false);
        expect(mod.sourcesByKey.get(descriptorA.key).enabled).toBe(false);
        expect(mod.groupsById.get('group1').children[0].key).toBe(descriptorA.key);
        expect(secondKey).toBeDefined();
        expect(mod.sourcesByKey.get(secondKey).iconName).toBe('smart_display');
        expect(mod.sourcesByKey.get(secondKey).isDisabled).toBe(true);
        expect(mod.sourcesByKey.get(secondKey).isLoading).toBe(true);
    });

    it('migrates legacy source keys to v2 ids and marks storage for rewrite', () => {
        const legacyRow = createMockSourceRow({ title: 'Legacy Source', ariaLabel: 'Legacy Source', stableToken: 'legacy-doc', checked: true });
        const descriptor = mod.createSourceDescriptor(legacyRow.row, new Map(), new Map());

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [legacyRow.row] : []
        ));

        const shouldUpgrade = mod.scanAndSyncSources(mod.normalizeLoadedState({
            groups: ['group1'],
            groupsById: {
                group1: { id: 'group1', title: 'Migrated', children: [{ type: 'source', key: descriptor.legacyKey }] }
            },
            ungrouped: [],
            enabledMap: {
                [descriptor.legacyKey]: false
            }
        }), true);

        expect(shouldUpgrade).toBe(true);
        expect(mod.groupsById.get('group1').children[0].key).toBe(descriptor.key);
        expect(mod.sourcesByKey.get(descriptor.key).enabled).toBe(false);
    });

    it('keeps local enabled state across DOM re-renders', () => {
        const firstPass = createMockSourceRow({ title: 'Persistent Source', stableToken: 'stable-doc', checked: false });
        const secondPass = createMockSourceRow({ title: 'Persistent Source', stableToken: 'stable-doc', checked: false });
        const descriptor = mod.createSourceDescriptor(firstPass.row, new Map(), new Map());

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [firstPass.row] : []
        ));
        mod.scanAndSyncSources(null, true);
        mod.sourcesByKey.get(descriptor.key).enabled = true;

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [secondPass.row] : []
        ));
        mod.scanAndSyncSources(null, false);

        expect(mod.sourcesByKey.get(descriptor.key).enabled).toBe(true);
    });
});

describe('syncSourceToPage', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = (cb) => {
            cb();
            return 1;
        };
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('recovers detached checkboxes via findFreshCheckbox and drains the queue', () => {
        const staleCheckbox = { checked: false, click: jest.fn() };
        const freshCheckbox = { checked: false, click: jest.fn(), closest: jest.fn(() => freshRow) };
        const titleEl = { textContent: 'Synced Source' };
        const freshRow = {
            querySelector: jest.fn((selector) => {
                if (mod.DEPS.title.includes(selector)) return titleEl;
                if (mod.DEPS.checkbox.includes(selector)) return freshCheckbox;
                return null;
            })
        };
        const source = {
            key: 'source_sync',
            title: 'Synced Source',
            element: {
                querySelector: jest.fn(() => staleCheckbox)
            }
        };

        mod.sourcesByKey.set('source_sync', source);
        global.document.body.contains = jest.fn((node) => node !== staleCheckbox);
        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [freshRow] : []
        ));

        mod.syncSourceToPage(source, true);

        expect(freshCheckbox.click).toHaveBeenCalledTimes(1);
        expect(staleCheckbox.click).not.toHaveBeenCalled();
        expect(mod._getClickQueueLength()).toBe(0);
        expect(mod._getIsSyncingState()).toBe(false);
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

        mod = loadContentModule();
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

        mod = loadContentModule();
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

describe('manager launcher messaging', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn(() => 1);
        global.clearTimeout = jest.fn();

        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('reports source_panel_missing when the notebook UI is unavailable', () => {
        mod._setProjectId('test-project');
        global.document.querySelector = jest.fn(() => null);

        expect(mod.getManagerStatus()).toEqual({
            ready: false,
            reason: 'source_panel_missing'
        });
    });

    it('returns ready and focuses the manager when the injected panel exists', () => {
        const mockContainer = {
            classList: {
                add: jest.fn(),
                remove: jest.fn()
            },
            offsetWidth: 120
        };
        const mockHost = {
            isConnected: true,
            scrollIntoView: jest.fn()
        };
        const mockShadowRoot = {
            host: mockHost,
            querySelector: jest.fn((selector) => selector === '.sp-container' ? mockContainer : null)
        };

        mod._setProjectId('test-project');
        mod._setShadowRootForTest(mockShadowRoot);

        expect(mod.getManagerStatus()).toEqual({
            ready: true,
            reason: 'ready'
        });

        expect(mod.focusManagerPanel()).toEqual({ success: true });
        expect(mockHost.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
        expect(mockContainer.classList.add).toHaveBeenCalledWith('sp-focus-ring');
    });

    it('routes runtime messages for popup status and focus requests', () => {
        const sendResponse = jest.fn();
        mod._setProjectId('test-project');

        mod.handleManagerMessage({ type: 'GET_MANAGER_STATUS' }, {}, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({
            ready: false,
            reason: 'source_panel_missing'
        });

        sendResponse.mockClear();
        mod.handleManagerMessage({ type: 'FOCUS_MANAGER' }, {}, sendResponse);
        expect(sendResponse).toHaveBeenCalledWith({
            success: false,
            reason: 'source_panel_missing'
        });
    });

    it('reinitializes without immediate reload when the user enters a notebook route through SPA navigation', () => {
        mod._setProjectId(null);
        global.window.location.pathname = '/notebook/fresh-project';

        mod.handleRouteChanged();

        expect(global.window.location.reload).not.toHaveBeenCalled();
    });

    it('reinitializes without immediate reload when the user switches between notebook routes', () => {
        mod._setProjectId('old-project');
        global.window.location.pathname = '/notebook/new-project';

        mod.handleRouteChanged();

        expect(global.window.location.reload).not.toHaveBeenCalled();
    });

    it('falls back to reload only after repeated route recovery failures', async () => {
        global.setTimeout = (cb) => {
            cb();
            return 1;
        };
        mod._setProjectId('old-project');
        global.document.querySelector = jest.fn(() => null);
        global.window.location.pathname = '/notebook/new-project';

        mod.handleRouteChanged();

        await Promise.resolve();
        await Promise.resolve();

        expect(global.window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('tears down without reloading when the user leaves a notebook route', () => {
        const mockHost = {
            isConnected: true,
            remove: jest.fn()
        };
        const mockShadowRoot = {
            host: mockHost,
            querySelector: jest.fn(() => null)
        };

        mod._setProjectId('old-project');
        mod._setShadowRootForTest(mockShadowRoot);
        global.window.location.pathname = '/home';

        mod.handleRouteChanged();

        expect(global.window.location.reload).not.toHaveBeenCalled();
        expect(mockHost.remove).toHaveBeenCalled();
        expect(mod.getManagerStatus()).toEqual({
            ready: false,
            reason: 'not_on_notebook_page'
        });
    });
});
