global.Node = class {};
const loadContentModule = require('./helpers/load-content-module');

const setupGlobalMocks = () => {
    global.__resizeObserverInstances = [];
    global.__rafCallbacks = [];

    const getComputedStyle = jest.fn((target) => ({
        display: target?.__computedStyle?.display ?? target?.style?.display ?? 'block',
        visibility: target?.__computedStyle?.visibility ?? target?.style?.visibility ?? 'visible',
        opacity: target?.__computedStyle?.opacity ?? target?.style?.opacity ?? '1',
        height: target?.__computedStyle?.height ?? target?.style?.height ?? '0px',
        backgroundColor: target?.__computedStyle?.backgroundColor ?? target?.style?.backgroundColor ?? ''
    }));

    global.window = {
        location: {
            pathname: '/notebook/testproject',
            origin: 'https://notebooklm.google.com',
            reload: jest.fn()
        },
        confirm: jest.fn(() => true),
        prompt: jest.fn(() => ''),
        getComputedStyle,
        requestAnimationFrame: jest.fn((cb) => {
            global.__rafCallbacks.push(cb);
            return global.__rafCallbacks.length;
        }),
        cancelAnimationFrame: jest.fn((id) => {
            if (id > 0 && id <= global.__rafCallbacks.length) {
                global.__rafCallbacks[id - 1] = null;
            }
        }),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    };

    const mockElement = () => ({
        attachShadow: jest.fn(() => ({
            querySelector: jest.fn(() => null),
            querySelectorAll: jest.fn(() => []),
            getElementById: jest.fn(() => ({ addEventListener: jest.fn() })),
            appendChild: jest.fn(),
        })),
        appendChild: jest.fn(),
        cloneNode: jest.fn(function cloneNode() { return this; }),
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
        createDocumentFragment: jest.fn(() => ({
            childNodes: [],
            appendChild(node) {
                this.childNodes.push(node);
                return node;
            }
        })),
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
        defaultView: {
            getComputedStyle
        },
        documentElement: {
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        visibilityState: 'visible',
    };

    global.MutationObserver = class { observe() {} disconnect() {} };
    global.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observe = jest.fn();
            this.disconnect = jest.fn();
            global.__resizeObserverInstances.push(this);
        }
    };
    global.location = { href: 'http://localhost' };
    global.history = {
        pushState: jest.fn(),
        replaceState: jest.fn()
    };
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
    global.getMessage = utils.getMessage;
};

const createMockSourceRow = ({
    title,
    ariaLabel = '',
    checked = false,
    disabled = false,
    iconName = 'article',
    stableToken = null,
    href = null,
    ariaControls = null,
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

    const ariaControlsNode = ariaControls ? {
        getAttribute: jest.fn((attr) => (attr === 'aria-controls' ? ariaControls : null))
    } : null;

    const hrefNode = href ? {
        getAttribute: jest.fn((attr) => (attr === 'href' ? href : null))
    } : null;

    const row = {
        getAttribute: jest.fn((attr) => {
            if (attr === 'data-source-id') return stableToken;
            if (attr === 'href') return href;
            if (attr === 'aria-controls') return ariaControls;
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
            if (selector === '[aria-controls]' && ariaControlsNode) return [ariaControlsNode];
            return [];
        })
    };

    return { row, checkbox, titleEl, iconEl };
};

const createSearchUiMock = () => {
    const controls = {
        classList: {
            toggle: jest.fn()
        }
    };
    const searchContainer = {
        classList: {
            toggle: jest.fn()
        }
    };
    const searchInput = {
        value: '',
        tabIndex: 0,
        focus: jest.fn(),
        blur: jest.fn(),
        setAttribute: jest.fn()
    };
    const searchButton = {
        setAttribute: jest.fn()
    };
    const shadowRoot = {
        host: { isConnected: true, remove: jest.fn() },
        querySelector: jest.fn((selector) => {
            if (selector === '.sp-controls') return controls;
            if (selector === '.sp-search-container') return searchContainer;
            return null;
        }),
        getElementById: jest.fn((id) => {
            if (id === 'sp-search') return searchInput;
            if (id === 'sp-search-btn') return searchButton;
            return null;
        })
    };

    return { shadowRoot, controls, searchContainer, searchInput, searchButton };
};

const createTreeEl = (tag, attrs = {}, children = []) => ({
    tag,
    attrs,
    children
});

const createMockPanel = ({
    visible = true,
    width = 320,
    height = 640,
    contentVisible = visible,
    contentWidth = width,
    contentHeight = height
} = {}) => {
    const header = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        insertAdjacentElement: jest.fn()
    };
    const content = {
        isConnected: true,
        hidden: false,
        style: {
            display: contentVisible ? 'block' : 'none',
            visibility: contentVisible ? 'visible' : 'hidden'
        },
        __computedStyle: {
            display: contentVisible ? 'block' : 'none',
            visibility: contentVisible ? 'visible' : 'hidden'
        },
        getBoundingClientRect: jest.fn(() => ({
            width: contentVisible ? contentWidth : 0,
            height: contentVisible ? contentHeight : 0
        })),
        getAttribute: jest.fn(() => null),
        matches: jest.fn(() => false)
    };
    const panel = {
        isConnected: true,
        hidden: false,
        style: {
            display: visible ? 'block' : 'none',
            visibility: visible ? 'visible' : 'hidden'
        },
        __computedStyle: {
            display: visible ? 'block' : 'none',
            visibility: visible ? 'visible' : 'hidden'
        },
        getBoundingClientRect: jest.fn(() => ({
            width: visible ? width : 0,
            height: visible ? height : 0
        })),
        getAttribute: jest.fn(() => null),
        matches: jest.fn(() => false),
        querySelector: jest.fn((selector) => {
            if (selector === '.panel-header') return header;
            if (
                selector === '[data-testid="scroll-area"]' ||
                selector === '.scroll-area-desktop' ||
                selector === '.sources-list-container' ||
                selector === '.scroll-area'
            ) {
                return content;
            }
            return null;
        }),
        firstElementChild: header
    };

    return { panel, header, content };
};

const createInitShadowRoot = () => {
    const container = {
        style: {},
        classList: {
            add: jest.fn(),
            remove: jest.fn()
        },
        offsetWidth: 120
    };
    const resizer = {
        addEventListener: jest.fn()
    };
    const listContainer = {
        childNodes: [],
        addEventListener: jest.fn(),
        appendChild: jest.fn(),
        removeChild: jest.fn()
    };
    const viewStateContainer = {
        hidden: true,
        childNodes: [],
        addEventListener: jest.fn(),
        appendChild: jest.fn(),
        removeChild: jest.fn()
    };
    const searchInput = {
        value: '',
        tabIndex: 0,
        focus: jest.fn(),
        blur: jest.fn(),
        setAttribute: jest.fn(),
        addEventListener: jest.fn()
    };
    const searchButton = {
        setAttribute: jest.fn(),
        addEventListener: jest.fn()
    };
    const genericButton = {
        addEventListener: jest.fn()
    };
    const shadowRoot = {
        host: {
            isConnected: true,
            remove: jest.fn()
        },
        appendChild: jest.fn(),
        addEventListener: jest.fn(),
        querySelector: jest.fn((selector) => {
            if (selector === '.sp-container') return container;
            if (selector === '.sp-resizer') return resizer;
            if (selector === '#sources-list') return listContainer;
            if (selector === '.sp-controls') {
                return { classList: { toggle: jest.fn() } };
            }
            if (selector === '.sp-search-container') {
                return { classList: { toggle: jest.fn() } };
            }
            return null;
        }),
        getElementById: jest.fn((id) => {
            if (id === 'sp-new-group-btn' || id === 'sp-manage-tags-btn' || id === 'sp-batch-action-btn') {
                return genericButton;
            }
            if (id === 'sp-search') return searchInput;
            if (id === 'sp-search-btn') return searchButton;
            if (id === 'sp-view-state') return viewStateContainer;
            return genericButton;
        })
    };

    return {
        shadowRoot,
        host: shadowRoot.host,
        container,
        listContainer,
        viewStateContainer,
        searchInput,
        searchButton
    };
};

const teardownGlobalMocks = () => {
    delete global.window;
    delete global.document;
    delete global.MutationObserver;
    delete global.ResizeObserver;
    delete global.location;
    delete global.history;
    delete global.setTimeout;
    delete global.clearTimeout;
    delete global.chrome;
    delete global.el;
    delete global.debounce;
    delete global.isDescendant;
    delete global.getMessage;
    delete global.queueMicrotask;
    delete global.NSM_CONTENT_CONFIG;
    delete global.NSM_CONTENT_STYLE_TEXT;
    delete global.NSM_GLOBAL_OVERLAY_STYLE_TEXT;
    delete global.NSM_CREATE_MANAGER_SHELL;
    delete global.__resizeObserverInstances;
    delete global.__rafCallbacks;
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

        const mockDeleteIcon = { textContent: 'delete' };
        const mockDeleteMenuItem = {
            textContent: 'Delete',
            click: jest.fn(),
            querySelector: jest.fn(sel => sel === 'mat-icon' ? mockDeleteIcon : null),
            getAttribute: jest.fn(() => null)
        };
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

    it('uses i18n for the batch delete progress toast', async () => {
        mod.pendingBatchKeys.add('key1');
        mod.state.isBatchMode = true;
        global.chrome.i18n.getMessage = jest.fn((key, substitutions) => {
            if (key === 'ui_deleting_count') return `localized deleting ${substitutions[0]}`;
            if (key === 'ui_deleted_toast') return `localized deleted ${substitutions[0]}`;
            return key;
        });

        const mockMoreBtn = { click: jest.fn() };
        const mockSourceElement = {
            querySelector: jest.fn(sel => {
                if (mod.DEPS.moreBtn.includes(sel)) return mockMoreBtn;
                return null;
            })
        };
        const mockDeleteIcon = { textContent: 'delete' };
        const mockDeleteMenuItem = {
            textContent: 'Delete',
            click: jest.fn(),
            querySelector: jest.fn(sel => sel === 'mat-icon' ? mockDeleteIcon : null),
            getAttribute: jest.fn(() => null)
        };
        const mockConfirmBtn = { textContent: 'Delete', className: 'primary', click: jest.fn(), querySelector: jest.fn(), getAttribute: jest.fn() };
        const mockDialog = {
            textContent: 'Delete this?',
            querySelectorAll: jest.fn(sel => {
                if (sel === 'button') return [mockConfirmBtn];
                return [];
            })
        };

        mod.sourcesByKey.set('key1', { key: 'key1', element: mockSourceElement, isDisabled: false });
        global.document.querySelectorAll = jest.fn(sel => {
            if (sel.includes('[role="menuitem"]')) return [mockDeleteMenuItem];
            if (sel.includes('dialog')) return [mockDialog];
            return [];
        });

        await mod.executeBatchDelete();

        expect(global.chrome.i18n.getMessage).toHaveBeenCalledWith('ui_deleting_count', ['1']);
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

        const mockDeleteIcon = { textContent: 'delete' };
        const mockDeleteMenuItem = {
            textContent: 'Delete',
            click: jest.fn(),
            querySelector: jest.fn(sel => sel === 'mat-icon' ? mockDeleteIcon : null),
            getAttribute: jest.fn(() => null)
        };
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
    let expectedPersistableState;

    const seedPersistedState = () => {
        const projectId = 'test_project_id';
        if (mod._setProjectId) mod._setProjectId(projectId); else mod.projectId = projectId;

        mod.state.groups = ['group1', 'group2'];
        mod.state.ungrouped = ['source3'];

        mod.groupsById.set('group1', { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] });
        mod.groupsById.set('group2', { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] });

        mod.sourcesByKey.set('source1', { enabled: true, title: 'Source 1', normalizedTitle: 'source 1', fingerprint: 'source 1||article', identityType: 'stable-token' });
        mod.sourcesByKey.set('source2', { enabled: false, title: 'Source 2', normalizedTitle: 'source 2', fingerprint: 'source 2||article', identityType: 'stable-token' });
        mod.sourcesByKey.set('source3', { enabled: true, title: 'Source 3', normalizedTitle: 'source 3', fingerprint: 'source 3||article', identityType: 'fingerprint' });

        mod._setCustomHeight(500);

        expectedPersistableState = {
            schemaVersion: 3,
            groups: ['group1', 'group2'],
            groupsById: {
                group1: { id: 'group1', title: 'Group 1', children: [{ type: 'source', key: 'source1' }] },
                group2: { id: 'group2', title: 'Group 2', children: [{ type: 'source', key: 'source2' }] }
            },
            ungrouped: ['source3'],
            sourceStateById: {
                source1: {
                    enabled: true,
                    title: 'Source 1',
                    normalizedTitle: 'source 1',
                    fingerprint: 'source 1||article',
                    identityType: 'stable-token'
                },
                source2: {
                    enabled: false,
                    title: 'Source 2',
                    normalizedTitle: 'source 2',
                    fingerprint: 'source 2||article',
                    identityType: 'stable-token'
                },
                source3: {
                    enabled: true,
                    title: 'Source 3',
                    normalizedTitle: 'source 3',
                    fingerprint: 'source 3||article',
                    identityType: 'fingerprint'
                }
            },
            customHeight: 500,
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        };

        return projectId;
    };

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();

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

    it('debounces saves by default and persists the expected state', () => {
        const projectId = seedPersistedState();
        mod.saveState();
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

        const expectedKey = `sourcesPlusState_${projectId}`;
        jest.advanceTimersByTime(1500);

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            { type: 'SAVE_STATE', key: expectedKey, data: expectedPersistableState },
            expect.any(Function)
        );
    });

    it('handles potential errors during debouncedStorageSet', () => {
        seedPersistedState();

        // Simulate chrome.runtime.sendMessage throwing an error (e.g., context invalidated)
        global.chrome.runtime.sendMessage.mockImplementationOnce(() => {
            throw new Error('Extension context invalidated.');
        });

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        expect(() => mod.saveState()).not.toThrow();
        jest.advanceTimersByTime(1500);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "NotebookLM Source Management: Context invalidated. Please refresh the page.",
            expect.any(Error)
        );

        consoleWarnSpy.mockRestore();
    });

    it('immediately persists move-to-folder changes without waiting for timers', () => {
        mod._setProjectId('project-move');
        mod._setShadowRootForTest({
            host: { isConnected: true },
            querySelector: jest.fn(() => null),
            getElementById: jest.fn(() => null)
        });
        mod.state.ungrouped = ['source1'];
        mod.groupsById.set('group1', { id: 'group1', title: 'Pinned', children: [] });
        mod.sourcesByKey.set('source1', {
            key: 'source1',
            enabled: true,
            title: 'Source 1',
            normalizedTitle: 'source 1',
            fingerprint: 'source 1||article',
            identityType: 'stable-token'
        });

        mod.executeMoveToFolder('source1', 'group1');

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(mod.state.ungrouped).toEqual([]);
        expect(mod.groupsById.get('group1').children).toEqual([{ type: 'source', key: 'source1' }]);
    });

    it('immediately persists new folders without waiting for timers', () => {
        mod._setProjectId('project-group');

        mod.handleAddNewGroup();

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(mod.state.groups).toHaveLength(1);
        expect(mod.groupsById.get(mod.state.groups[0])).toMatchObject({
            title: 'ui_new_group',
            enabled: true,
            collapsed: false
        });
    });

    it('flushes a pending save when the page becomes hidden', () => {
        seedPersistedState();

        mod.saveState();
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

        mod.handlePageLifecyclePersistence({ type: 'visibilitychange' });
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

        global.document.visibilityState = 'hidden';
        mod.handlePageLifecyclePersistence({ type: 'visibilitychange' });

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
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
            customHeight: 420,
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        });
        expect(container.style.height).toBe('420px');
        expect(mod._getPendingStorageUpgrade()).toBe(true);
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
            customHeight: 300,
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
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

describe('toolbar search UI', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn();
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('stays collapsed by default and expands on the first magnifier click', () => {
        const { shadowRoot, controls, searchContainer, searchInput, searchButton } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);

        mod._syncSearchUi();
        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', false);
        expect(searchContainer.classList.toggle).toHaveBeenCalledWith('is-expanded', false);
        expect(searchInput.tabIndex).toBe(-1);
        expect(searchButton.setAttribute).toHaveBeenCalledWith('aria-expanded', 'false');

        controls.classList.toggle.mockClear();
        searchContainer.classList.toggle.mockClear();
        const result = mod._handleSearchButtonClick(jest.fn());

        expect(result).toBe('expanded');
        expect(mod._getIsSearchExpanded()).toBe(true);
        expect(searchInput.focus).toHaveBeenCalled();
        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', true);
        expect(searchContainer.classList.toggle).toHaveBeenCalledWith('is-expanded', true);
    });

    it('collapses on a second magnifier click when the query is empty', () => {
        const { shadowRoot, controls, searchInput } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);
        mod._setIsSearchExpanded(true);
        searchInput.value = '';

        const result = mod._handleSearchButtonClick(jest.fn());

        expect(result).toBe('collapsed');
        expect(mod._getIsSearchExpanded()).toBe(false);
        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', false);
    });

    it('keeps the search expanded and triggers filtering when the query has content', () => {
        const { shadowRoot, controls, searchInput } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);
        mod._setIsSearchExpanded(true);
        mod.state.filterQuery = 'report';
        searchInput.value = 'report';

        const triggerSearch = jest.fn(() => {
            mod._syncSearchUi();
        });
        const result = mod._handleSearchButtonClick(triggerSearch);

        expect(result).toBe('searched');
        expect(triggerSearch).toHaveBeenCalledTimes(1);
        expect(mod._getIsSearchExpanded()).toBe(true);
        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', true);
    });

    it('keeps toolbar actions hidden when a persisted query is still active', () => {
        const { shadowRoot, controls, searchContainer, searchInput } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);
        mod._setIsSearchExpanded(false);
        mod.state.filterQuery = 'alpha';
        searchInput.value = 'alpha';

        mod._syncSearchUi();

        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', true);
        expect(searchContainer.classList.toggle).toHaveBeenCalledWith('is-expanded', true);
    });

    it('collapses on outside clicks only when the query is empty', () => {
        const { shadowRoot, controls, searchInput } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);
        mod._setIsSearchExpanded(true);

        expect(mod._handleSearchOutsideClick({
            target: { closest: jest.fn(() => null) }
        })).toBe(true);
        expect(mod._getIsSearchExpanded()).toBe(false);
        expect(controls.classList.toggle).toHaveBeenCalledWith('is-search-expanded', false);

        mod._setIsSearchExpanded(true);
        mod.state.filterQuery = 'alpha';
        searchInput.value = 'alpha';
        expect(mod._handleSearchOutsideClick({
            target: { closest: jest.fn(() => null) }
        })).toBe(false);
        expect(mod._getIsSearchExpanded()).toBe(true);
    });

    it('resets expanded search state during notebook route changes', () => {
        const { shadowRoot } = createSearchUiMock();
        mod._setProjectId('old-project');
        mod._setShadowRootForTest(shadowRoot);
        mod._setIsSearchExpanded(true);
        global.window.location.pathname = '/notebook/new-project';

        mod.handleRouteChanged();

        expect(mod._getIsSearchExpanded()).toBe(false);
    });
});

describe('source action menu', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn();
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('opens and closes the active source action menu from the single action button state', () => {
        mod.sourcesByKey.set('source-1', {
            key: 'source-1',
            title: 'Source One',
            enabled: true,
            isLoading: false,
            isDisabled: false
        });

        expect(mod.toggleSourceActionMenu('source-1')).toBe('source-1');
        expect(mod._getActiveSourceActionSourceKey()).toBe('source-1');

        expect(mod.toggleSourceActionMenu('source-1')).toBeNull();
        expect(mod._getActiveSourceActionSourceKey()).toBeNull();
    });

    it('routes tags and move actions through the new unified menu and closes the menu afterwards', () => {
        const openTags = jest.fn();
        const moveToFolder = jest.fn();
        mod.sourcesByKey.set('source-1', {
            key: 'source-1',
            title: 'Source One',
            enabled: true,
            isLoading: false,
            isDisabled: false
        });
        mod._setSourceActionInvokerForTest('openTags', openTags);
        mod._setSourceActionInvokerForTest('moveToFolder', moveToFolder);

        mod._setActiveSourceActionSourceKey('source-1');
        expect(mod.handleSourceActionSelection('source-1', 'tags')).toBe(true);
        expect(openTags).toHaveBeenCalledWith('source-1');
        expect(mod._getActiveSourceActionSourceKey()).toBeNull();

        mod._setActiveSourceActionSourceKey('source-1');
        expect(mod.handleSourceActionSelection('source-1', 'move')).toBe(true);
        expect(moveToFolder).toHaveBeenCalledWith('source-1');
        expect(mod._getActiveSourceActionSourceKey()).toBeNull();
    });

    it('opens the native NotebookLM menu from the unified action menu', () => {
        const nativeMenuButton = { click: jest.fn() };
        mod.sourcesByKey.set('source-1', {
            key: 'source-1',
            title: 'Source One',
            enabled: true,
            isLoading: false,
            isDisabled: false,
            element: {
                querySelector: jest.fn((selector) => (
                    mod.DEPS.moreBtn.includes(selector) ? nativeMenuButton : null
                ))
            }
        });

        expect(mod.handleSourceActionSelection('source-1', 'native-more')).toBe(true);
        expect(nativeMenuButton.click).toHaveBeenCalledTimes(1);
        expect(mod._getActiveSourceActionSourceKey()).toBeNull();
    });

    it('closes the action menu on outside clicks without breaking search-container clicks', () => {
        const { shadowRoot } = createSearchUiMock();
        mod._setShadowRootForTest(shadowRoot);
        mod._setActiveSourceActionSourceKey('source-1');
        mod._setIsSearchExpanded(true);

        expect(mod._handleSearchOutsideClick({
            target: {
                closest: jest.fn((selector) => (selector === '.sp-search-container' ? {} : null))
            }
        })).toBe(true);
        expect(mod._getActiveSourceActionSourceKey()).toBeNull();
        expect(mod._getIsSearchExpanded()).toBe(true);
    });

    it('does not toggle the source checkbox when clicking the new action button or menu item', () => {
        const source = {
            key: 'source-1',
            title: 'Source One',
            enabled: true,
            isLoading: false,
            isDisabled: false
        };
        const openTags = jest.fn();
        const checkbox = { checked: true };
        const sourceRow = {
            dataset: { sourceKey: 'source-1' },
            querySelector: jest.fn(() => checkbox)
        };

        mod.sourcesByKey.set('source-1', source);
        mod._setSourceActionInvokerForTest('openTags', openTags);

        mod._handleInteractionForTest({
            target: {
                classList: { contains: jest.fn(() => false) },
                closest: jest.fn((selector) => {
                    if (selector === '.group-container') return null;
                    if (selector === '.source-item') return sourceRow;
                    if (selector === '.sp-source-actions-button') {
                        return { dataset: { sourceKey: 'source-1' } };
                    }
                    return null;
                })
            }
        });

        expect(source.enabled).toBe(true);
        expect(mod._getActiveSourceActionSourceKey()).toBe('source-1');
        expect(sourceRow.querySelector).not.toHaveBeenCalled();

        mod._handleInteractionForTest({
            target: {
                classList: { contains: jest.fn(() => false) },
                closest: jest.fn((selector) => {
                    if (selector === '.group-container') return null;
                    if (selector === '.source-item') return sourceRow;
                    if (selector === '.sp-source-actions-menu-item') {
                        return { dataset: { sourceKey: 'source-1', action: 'tags' } };
                    }
                    return null;
                })
            }
        });

        expect(source.enabled).toBe(true);
        expect(openTags).toHaveBeenCalledWith('source-1');
        expect(sourceRow.querySelector).not.toHaveBeenCalled();
    });

    it('localizes the non-empty group delete confirmation message', () => {
        global.chrome.i18n.getMessage = jest.fn((key, substitutions) => {
            if (key === 'ui_ungrouped') return 'Ungrouped Localized';
            if (key === 'ui_delete_group_confirm_non_empty') {
                return `Folder ${substitutions[0]} -> ${substitutions[1]}`;
            }
            return key;
        });
        global.window.confirm = jest.fn(() => false);

        const groupContainer = {
            dataset: { groupId: 'group-1' }
        };

        mod.groupsById.set('group-1', {
            id: 'group-1',
            title: 'Archive',
            children: [{ type: 'source', key: 'source-1' }]
        });

        mod._handleInteractionForTest({
            target: {
                classList: { contains: jest.fn(() => false) },
                closest: jest.fn((selector) => {
                    if (selector === '.group-container') return groupContainer;
                    if (selector === '.sp-delete-button') return {};
                    return null;
                })
            }
        });

        expect(global.window.confirm).toHaveBeenCalledWith('Folder Archive -> Ungrouped Localized');
    });

    it('localizes the crash banner chrome', () => {
        const dismissButton = {
            addEventListener: jest.fn()
        };
        global.chrome.i18n.getMessage = jest.fn((key) => {
            if (key === 'ui_crash_banner_prefix') return 'Localized Error';
            if (key === 'ui_dismiss') return 'Localized Dismiss';
            return key;
        });
        global.el = createTreeEl;
        global.document.getElementById = jest.fn((id) => {
            if (id === 'sp-error-banner') return null;
            if (id === 'sp-dismiss-error') return dismissButton;
            return null;
        });

        mod._showCrashBannerForTest('Localized Body');

        const banner = global.document.body.prepend.mock.calls[0][0];
        expect(banner.children[0].children[0]).toBe('Localized Error ');
        expect(banner.children[1]).toBe('Localized Body ');
        expect(banner.children[2].children[0]).toBe('Localized Dismiss');
    });
});

describe('source panel surface color', () => {
    let mod;

    beforeEach(() => {
        jest.resetModules();
        setupGlobalMocks();
        global.setTimeout = jest.fn();
        global.clearTimeout = jest.fn();
        mod = loadContentModule();
        mod._resetState();
    });

    afterEach(teardownGlobalMocks);

    it('prefers the native panel header background color', () => {
        const { panel, header } = createMockPanel();
        header.__computedStyle = {
            backgroundColor: 'rgb(35, 40, 48)'
        };
        panel.__computedStyle = {
            ...panel.__computedStyle,
            backgroundColor: 'rgb(39, 44, 51)'
        };

        expect(mod.resolveSourcePanelSurfaceColor(panel)).toBe('rgb(35, 40, 48)');
    });

    it('falls back to the panel background when the header is transparent', () => {
        const { panel, header } = createMockPanel();
        header.__computedStyle = {
            backgroundColor: 'transparent'
        };
        panel.__computedStyle = {
            ...panel.__computedStyle,
            backgroundColor: 'rgb(39, 44, 51)'
        };

        expect(mod.resolveSourcePanelSurfaceColor(panel)).toBe('rgb(39, 44, 51)');
    });

    it('applies the resolved surface color to the extension host variable', () => {
        const { panel, header } = createMockPanel();
        const host = {
            style: {
                setProperty: jest.fn(),
                removeProperty: jest.fn()
            }
        };

        header.__computedStyle = {
            backgroundColor: 'rgb(35, 40, 48)'
        };

        expect(mod._applySourcePanelSurfaceColorForTest(host, panel)).toBe('rgb(35, 40, 48)');
        expect(host.style.setProperty).toHaveBeenCalledWith('--sp-panel-bg', 'rgb(35, 40, 48)');
        expect(host.style.removeProperty).not.toHaveBeenCalled();
    });
});

describe('manager shell structure', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('wraps toolbar buttons in a shared action group for animation', () => {
        const createManagerShell = require('../src/content/content-template.js');
        const shell = createManagerShell(createTreeEl, {
            i18n: {
                getMessage: (key) => key
            }
        });

        const controls = shell.children[0];
        const actionsGroup = controls.children[0];

        expect(controls.attrs.className).toBe('sp-controls');
        expect(actionsGroup.attrs.className).toBe('sp-toolbar-actions');
        expect(actionsGroup.children).toHaveLength(3);
        expect(actionsGroup.children.map((child) => child.attrs.id)).toEqual([
            'sp-new-group-btn',
            'sp-manage-tags-btn',
            'sp-batch-action-btn'
        ]);
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

    it('ignores aria-controls when deriving stable source ids', () => {
        const firstPass = createMockSourceRow({ title: 'Menu Source', ariaControls: 'mat-menu-panel-3', checked: true });
        const secondPass = createMockSourceRow({ title: 'Menu Source', ariaControls: 'mat-menu-panel-19', checked: true });

        const firstDescriptor = mod.createSourceDescriptor(firstPass.row, new Map(), new Map());
        const secondDescriptor = mod.createSourceDescriptor(secondPass.row, new Map(), new Map());

        expect(firstDescriptor.identityType).toBe('fingerprint');
        expect(secondDescriptor.identityType).toBe('fingerprint');
        expect(firstDescriptor.key).toBe(secondDescriptor.key);
    });

    it('keeps grouped sources mapped during non-initial rescans when source keys change', () => {
        const firstPass = createMockSourceRow({ title: 'Mapped Source', stableToken: 'doc-old', checked: true });
        const secondPass = createMockSourceRow({ title: 'Mapped Source', stableToken: 'doc-new', checked: true });
        const firstDescriptor = mod.createSourceDescriptor(firstPass.row, new Map(), new Map());
        const secondDescriptor = mod.createSourceDescriptor(secondPass.row, new Map(), new Map());

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [firstPass.row] : []
        ));
        mod.scanAndSyncSources(null, true);

        mod.state.groups = ['group1'];
        mod.state.ungrouped = [];
        mod.groupsById.set('group1', {
            id: 'group1',
            title: 'Pinned',
            children: [{ type: 'source', key: firstDescriptor.key }]
        });
        mod.sourcesByKey.get(firstDescriptor.key).enabled = false;
        const tagId = mod.createTag('Pinned');
        mod.setSourceTagIds(firstDescriptor.key, [tagId]);

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [secondPass.row] : []
        ));
        mod.scanAndSyncSources(null, false);

        expect(firstDescriptor.key).not.toBe(secondDescriptor.key);
        expect(mod.groupsById.get('group1').children).toEqual([{ type: 'source', key: secondDescriptor.key }]);
        expect(mod.state.ungrouped).toEqual([]);
        expect(mod.sourcesByKey.get(secondDescriptor.key).enabled).toBe(false);
        expect(mod.getSourceTagIds(secondDescriptor.key)).toEqual([tagId]);
    });

    it('leaves ambiguous remaps ungrouped instead of guessing', () => {
        const oldRows = [
            createMockSourceRow({ title: 'Duplicate Source', stableToken: 'doc-a', checked: true }),
            createMockSourceRow({ title: 'Duplicate Source', stableToken: 'doc-b', checked: true })
        ];
        const newRows = [
            createMockSourceRow({ title: 'Duplicate Source', stableToken: null, checked: true }),
            createMockSourceRow({ title: 'Duplicate Source', stableToken: null, checked: true })
        ];

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? oldRows.map(({ row }) => row) : []
        ));
        mod.scanAndSyncSources(null, true);

        const oldKeys = Array.from(mod.sourcesByKey.keys());
        mod.state.groups = ['group1'];
        mod.state.ungrouped = [];
        mod.groupsById.set('group1', {
            id: 'group1',
            title: 'Pinned',
            children: [{ type: 'source', key: oldKeys[0] }]
        });

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? newRows.map(({ row }) => row) : []
        ));
        mod.scanAndSyncSources(null, false);

        expect(mod.groupsById.get('group1').children).toEqual([]);
        expect(mod.state.ungrouped).toHaveLength(2);
    });

    it('detects persisted source refs even when the DOM is not ready yet', () => {
        expect(mod.hasPersistedSourceRefs({
            groupsById: {
                group1: {
                    id: 'group1',
                    children: [{ type: 'source', key: 'source1' }]
                }
            }
        })).toBe(true);

        expect(mod.hasPersistedSourceRefs({
            groupsById: {},
            ungrouped: [],
            sourceStateById: {}
        })).toBe(false);
    });

    it('preserves loaded state until source rows exist on the first restore', () => {
        const loadedState = {
            schemaVersion: 3,
            groups: ['group1'],
            groupsById: {
                group1: {
                    id: 'group1',
                    title: 'Pinned',
                    children: [{ type: 'source', key: 'source_id_doc-1' }]
                }
            },
            ungrouped: [],
            sourceStateById: {
                'source_id_doc-1': {
                    enabled: false,
                    title: 'Deferred Source',
                    normalizedTitle: 'deferred source',
                    fingerprint: 'deferred source||article',
                    identityType: 'stable-token'
                }
            },
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        };

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [] : []
        ));

        expect(mod.hasRenderableSourceRows()).toBe(false);
        expect(mod.hasPersistedSourceRefs(loadedState)).toBe(true);
        expect(mod._getPendingInitialLoadedState()).toBe(null);

        const result = mod.restoreInitialLoadedState(loadedState);

        expect(result).toEqual({ deferred: true, shouldUpgradeStorage: false });
        expect(mod._getPendingInitialLoadedState()).toEqual(loadedState);
        expect(mod.state.groups).toEqual([]);
        expect(mod.state.ungrouped).toEqual([]);
    });

    it('restores deferred initial source refs once source rows become available', () => {
        const loadedState = {
            schemaVersion: 3,
            groups: ['group1'],
            groupsById: {
                group1: {
                    id: 'group1',
                    title: 'Pinned',
                    children: [{ type: 'source', key: 'source_id_doc-1' }]
                }
            },
            ungrouped: [],
            sourceStateById: {
                'source_id_doc-1': {
                    enabled: false,
                    title: 'Deferred Source',
                    normalizedTitle: 'deferred source',
                    fingerprint: 'deferred source||article',
                    identityType: 'stable-token'
                }
            },
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        };
        const row = createMockSourceRow({ title: 'Deferred Source', stableToken: 'doc-1', checked: true });

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [] : []
        ));
        mod.restoreInitialLoadedState(loadedState);

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [row.row] : []
        ));
        const result = mod._flushPendingInitialLoadedStateForTest();
        const restoredKey = Array.from(mod.sourcesByKey.keys())[0];

        expect(result).toEqual({ restored: true, deferred: false, shouldUpgradeStorage: false });
        expect(mod._getPendingInitialLoadedState()).toBe(null);
        expect(mod.groupsById.get('group1').children).toEqual([{ type: 'source', key: restoredKey }]);
        expect(mod.state.ungrouped).toEqual([]);
        expect(mod.sourcesByKey.get(restoredKey).enabled).toBe(false);
    });
});

describe('group rendering rules', () => {
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

    it('keeps a new top-level empty group renderable when no filters are active', () => {
        const emptyGroup = { id: 'group1', title: 'Empty', enabled: true, children: [] };
        mod.state.groups = ['group1'];
        mod.groupsById.set('group1', emptyGroup);

        expect(mod.hasActiveRenderFilters()).toBe(false);
        expect(mod.shouldRenderGroup(emptyGroup)).toBe(true);
    });

    it('keeps parent and child groups renderable when they are both empty and no filters are active', () => {
        const childGroup = { id: 'group1a', title: 'Child', enabled: true, children: [] };
        const parentGroup = {
            id: 'group1',
            title: 'Parent',
            enabled: true,
            children: [{ type: 'group', id: 'group1a' }]
        };
        mod.groupsById.set('group1', parentGroup);
        mod.groupsById.set('group1a', childGroup);

        expect(mod.shouldRenderGroup(parentGroup)).toBe(true);
        expect(mod.shouldRenderGroup(childGroup)).toBe(true);
    });

    it('hides an empty group when a text filter is active and nothing matches', () => {
        const emptyGroup = { id: 'group1', title: 'Empty', enabled: true, children: [] };
        mod.groupsById.set('group1', emptyGroup);
        mod.state.filterQuery = 'alpha';

        expect(mod.hasActiveRenderFilters()).toBe(true);
        expect(mod.shouldRenderGroup(emptyGroup)).toBe(false);
    });

    it('keeps an isolated empty group renderable when no filters are active', () => {
        const emptyGroup = { id: 'group1', title: 'Empty', enabled: true, children: [] };
        mod.groupsById.set('group1', emptyGroup);
        mod._setActiveIsolationGroupId('group1');

        expect(mod.hasActiveRenderFilters()).toBe(false);
        expect(mod.shouldRenderGroup(emptyGroup)).toBe(true);
    });

    it('keeps the ancestor chain renderable when a deep descendant source matches filters', () => {
        const leafSource = { key: 'source1', title: 'Alpha source', lowercaseTitle: 'alpha source', enabled: true };
        const childGroup = {
            id: 'group1a',
            title: 'Child',
            enabled: true,
            children: [{ type: 'source', key: 'source1' }]
        };
        const parentGroup = {
            id: 'group1',
            title: 'Parent',
            enabled: true,
            children: [{ type: 'group', id: 'group1a' }]
        };

        mod.sourcesByKey.set('source1', leafSource);
        mod.groupsById.set('group1', parentGroup);
        mod.groupsById.set('group1a', childGroup);
        mod.state.filterQuery = 'alpha';

        expect(mod.groupHasRenderableDescendant(childGroup)).toBe(true);
        expect(mod.groupHasRenderableDescendant(parentGroup)).toBe(true);
        expect(mod.shouldRenderGroup(parentGroup)).toBe(true);
        expect(mod.shouldRenderGroup(childGroup)).toBe(true);
    });

    it('hides an empty group when a tag filter is active and nothing matches', () => {
        const emptyGroup = { id: 'group1', title: 'Empty', enabled: true, children: [] };
        mod.groupsById.set('group1', emptyGroup);
        mod.state.activeTagId = 'tag_alpha';

        expect(mod.hasActiveRenderFilters()).toBe(true);
        expect(mod.shouldRenderGroup(emptyGroup)).toBe(false);
    });
});

describe('isolate runtime state', () => {
    let mod;

    const seedIsolationState = () => {
        mod.state.groups = ['group1', 'group2'];
        mod.state.ungrouped = ['sourceU'];

        mod.groupsById.set('group1', {
            id: 'group1',
            enabled: true,
            children: [
                { type: 'source', key: 'sourceA' },
                { type: 'group', id: 'group1a' }
            ]
        });
        mod.groupsById.set('group1a', {
            id: 'group1a',
            enabled: true,
            children: [{ type: 'source', key: 'sourceNested' }]
        });
        mod.groupsById.set('group2', {
            id: 'group2',
            enabled: true,
            children: [{ type: 'source', key: 'sourceB' }]
        });

        mod.parentMap.set('sourceA', 'group1');
        mod.parentMap.set('group1a', 'group1');
        mod.parentMap.set('sourceNested', 'group1a');
        mod.parentMap.set('sourceB', 'group2');

        mod.sourcesByKey.set('sourceA', { key: 'sourceA', title: 'Source A', lowercaseTitle: 'source a', enabled: true });
        mod.sourcesByKey.set('sourceNested', { key: 'sourceNested', title: 'Source Nested', lowercaseTitle: 'source nested', enabled: true });
        mod.sourcesByKey.set('sourceB', { key: 'sourceB', title: 'Source B', lowercaseTitle: 'source b', enabled: true });
        mod.sourcesByKey.set('sourceU', { key: 'sourceU', title: 'Ungrouped Source', lowercaseTitle: 'ungrouped source', enabled: true });
    };

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
        seedIsolationState();
    });

    afterEach(teardownGlobalMocks);

    it('isolates a top-level group and excludes ungrouped sources', () => {
        mod._setActiveIsolationGroupId('group1');

        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceA'))).toBe(true);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceNested'))).toBe(true);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceB'))).toBe(false);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceU'))).toBe(false);
    });

    it('isolates a nested group subtree only', () => {
        mod._setActiveIsolationGroupId('group1a');

        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceA'))).toBe(false);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceNested'))).toBe(true);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceB'))).toBe(false);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceU'))).toBe(false);
    });

    it('does not persist active isolation runtime state', () => {
        mod._setActiveIsolationGroupId('group1');

        expect(mod.buildPersistableState()).not.toHaveProperty('activeIsolationGroupId');
    });

    it('clears isolation state when switching notebook routes', () => {
        mod._setProjectId('old-project');
        mod._setActiveIsolationGroupId('group1');
        global.window.location.pathname = '/notebook/new-project';

        mod.handleRouteChanged();

        expect(mod._getActiveIsolationGroupId()).toBeNull();
    });

    it('restores non-isolated sources when exiting isolation', () => {
        mod._setActiveIsolationGroupId('group1');
        mod.sourcesByKey.get('sourceA').enabled = false;
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceU'))).toBe(false);

        mod._setActiveIsolationGroupId(null);

        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceA'))).toBe(false);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceB'))).toBe(true);
        expect(mod.isSourceEffectivelyEnabled(mod.sourcesByKey.get('sourceU'))).toBe(true);
    });
});

describe('tag persistence and filtering', () => {
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

    it('persists multiple tags for a single source', () => {
        mod.sourcesByKey.set('source1', {
            key: 'source1',
            title: 'Source 1',
            normalizedTitle: 'source 1',
            fingerprint: 'source 1||article',
            identityType: 'stable-token',
            enabled: true
        });
        mod.state.ungrouped = ['source1'];

        const researchTagId = mod.createTag('Research');
        const priorityTagId = mod.createTag('Priority');
        mod.setSourceTagIds('source1', [researchTagId, priorityTagId]);

        expect(mod.buildPersistableState()).toMatchObject({
            schemaVersion: 3,
            tagOrder: [researchTagId, priorityTagId],
            sourceTagsById: {
                source1: [researchTagId, priorityTagId]
            },
            tagsById: {
                [researchTagId]: { id: researchTagId, label: 'Research' },
                [priorityTagId]: { id: priorityTagId, label: 'Priority' }
            }
        });
    });

    it('normalizes v2 state into v3-compatible empty tag structures', () => {
        expect(mod.normalizeLoadedState({
            schemaVersion: 2,
            groups: ['group1'],
            groupsById: { group1: { id: 'group1', title: 'Group', children: [] } },
            ungrouped: []
        })).toEqual({
            schemaVersion: 2,
            groups: ['group1'],
            groupsById: { group1: { id: 'group1', title: 'Group', children: [] } },
            ungrouped: [],
            sourceStateById: {},
            customHeight: null,
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        });
    });

    it('migrates persisted tag assignments from legacy source keys to v3 ids', () => {
        const taggedRow = createMockSourceRow({ title: 'Tagged Source', ariaLabel: 'Tagged Source', stableToken: 'doc-tagged', checked: true });
        const descriptor = mod.createSourceDescriptor(taggedRow.row, new Map(), new Map());
        const tagId = 'tag_research';

        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [taggedRow.row] : []
        ));

        mod.scanAndSyncSources({
            schemaVersion: 3,
            groups: [],
            groupsById: {},
            ungrouped: [descriptor.legacyKey],
            sourceStateById: {
                [descriptor.legacyKey]: {
                    enabled: true,
                    title: 'Tagged Source',
                    normalizedTitle: 'tagged source',
                    fingerprint: descriptor.fingerprint,
                    identityType: descriptor.identityType
                }
            },
            tagsById: {
                [tagId]: { id: tagId, label: 'Research' }
            },
            tagOrder: [tagId],
            sourceTagsById: {
                [descriptor.legacyKey]: [tagId]
            }
        }, true);

        expect(mod.getSourceTagIds(descriptor.key)).toEqual([tagId]);
    });

    it('combines active tag filtering with text search', () => {
        const alphaTagId = mod.createTag('Alpha');
        const betaTagId = mod.createTag('Beta');

        mod.sourcesByKey.set('source1', { key: 'source1', title: 'Alpha notes', lowercaseTitle: 'alpha notes', enabled: true });
        mod.sourcesByKey.set('source2', { key: 'source2', title: 'Alpha draft', lowercaseTitle: 'alpha draft', enabled: true });
        mod.sourcesByKey.set('source3', { key: 'source3', title: 'Beta summary', lowercaseTitle: 'beta summary', enabled: true });

        mod.setSourceTagIds('source1', [alphaTagId]);
        mod.setSourceTagIds('source2', [betaTagId]);
        mod.setSourceTagIds('source3', [alphaTagId]);
        mod.state.activeTagId = alphaTagId;
        mod.state.filterQuery = 'alpha';

        expect(mod.sourceMatchesCurrentFilters(mod.sourcesByKey.get('source1'))).toBe(true);
        expect(mod.sourceMatchesCurrentFilters(mod.sourcesByKey.get('source2'))).toBe(false);
        expect(mod.sourceMatchesCurrentFilters(mod.sourcesByKey.get('source3'))).toBe(false);
    });

    it('removes deleted tags from every source assignment', () => {
        const tagId = mod.createTag('Delete Me');
        mod.setSourceTagIds('source1', [tagId]);
        mod.setSourceTagIds('source2', [tagId]);

        mod.deleteTag(tagId);

        expect(mod.getSourceTagIds('source1')).toEqual([]);
        expect(mod.getSourceTagIds('source2')).toEqual([]);
        expect(mod.tagsById.has(tagId)).toBe(false);
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
        const { panel } = createMockPanel({ visible: true });
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
        mod._setAttachedSourcePanelForTest(panel);
        global.document.querySelector = jest.fn(() => panel);

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

    it('treats a hidden native content area as a collapsed source panel', () => {
        const { panel, content } = createMockPanel({ visible: true, contentVisible: false });

        expect(mod.findSourcePanelContent(panel)).toBe(content);
        expect(mod.isSourcePanelCollapsed(panel)).toBe(true);
        expect(mod.isSourcePanelRenderable(panel)).toBe(false);
    });

    it('does not treat the manager hidden native list style as a collapsed source panel', () => {
        const { panel, content } = createMockPanel({ visible: true, contentVisible: true });

        content.style.visibility = 'hidden';
        content.__computedStyle.visibility = 'hidden';
        content.getBoundingClientRect.mockImplementation(() => ({ width: 320, height: 640 }));

        expect(mod.findSourcePanelContent(panel)).toBe(content);
        expect(mod.isSourcePanelCollapsed(panel)).toBe(false);
        expect(mod.isSourcePanelRenderable(panel)).toBe(true);
    });

    it('soft-tears down the manager when the native source panel becomes non-renderable', () => {
        const { panel } = createMockPanel({ visible: false });
        const mockHost = {
            isConnected: true,
            remove: jest.fn()
        };
        const mockShadowRoot = {
            host: mockHost,
            querySelector: jest.fn(() => null)
        };

        mod._setProjectId('test-project');
        mod._setShadowRootForTest(mockShadowRoot);
        mod._setAttachedSourcePanelForTest(panel);
        global.document.querySelector = jest.fn(() => panel);

        mod.saveState();
        expect(global.chrome.runtime.sendMessage).not.toHaveBeenCalled();

        mod.syncManagerWithPanelLifecycle();

        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'SAVE_STATE',
                key: 'sourcesPlusState_test-project'
            }),
            expect.any(Function)
        );
        expect(mockHost.remove).toHaveBeenCalledTimes(1);
        expect(mod._getAttachedSourcePanelForTest()).toBeNull();
        expect(global.window.location.reload).not.toHaveBeenCalled();
        expect(mod.getManagerStatus()).toEqual({
            ready: false,
            reason: 'manager_not_ready'
        });
    });

    it('reacts to resize observer updates when the native content area collapses without DOM mutations', () => {
        global.setTimeout = (cb) => {
            cb();
            return 1;
        };

        const { panel, content } = createMockPanel({ visible: true, contentVisible: true });
        const mockHost = {
            isConnected: true,
            remove: jest.fn()
        };
        const mockShadowRoot = {
            host: mockHost,
            querySelector: jest.fn(() => null)
        };

        mod._setProjectId('test-project');
        mod._setShadowRootForTest(mockShadowRoot);
        mod._setAttachedSourcePanelForTest(panel);
        mod.state.groups = ['group1'];
        mod.groupsById.set('group1', {
            id: 'group1',
            title: 'Pinned',
            children: [{ type: 'source', key: 'source_id_doc-1' }]
        });
        mod.sourcesByKey.set('source_id_doc-1', {
            key: 'source_id_doc-1',
            title: 'Pinned Source',
            normalizedTitle: 'pinned source',
            fingerprint: 'pinned source||article',
            identityType: 'stable-token',
            enabled: true
        });
        global.document.querySelector = jest.fn(() => panel);
        mod.bindPanelLifecycleHooks(panel);

        content.style.display = 'none';
        content.style.visibility = 'hidden';
        content.__computedStyle.display = 'none';
        content.__computedStyle.visibility = 'hidden';
        content.getBoundingClientRect.mockImplementation(() => ({ width: 0, height: 0 }));

        mod._getPanelResizeObserverForTest().callback([{ target: content }]);

        expect(mockHost.remove).toHaveBeenCalledTimes(1);
        expect(mod._getPendingPanelReattachStateForTest()).not.toBeNull();
    });

    it('schedules follow-up lifecycle checks from native header clicks', () => {
        const { panel, header } = createMockPanel({ visible: true });

        mod.bindPanelLifecycleHooks(panel);

        const listener = header.addEventListener.mock.calls.find(([type]) => type === 'click')[1];
        listener();

        expect(global.window.requestAnimationFrame).toHaveBeenCalledTimes(1);
        expect(global.setTimeout).toHaveBeenCalled();
    });

    it('reinitializes on the same notebook route when the native source panel returns', () => {
        const { panel, header } = createMockPanel({ visible: true });
        const initHarness = createInitShadowRoot();
        let firstDiv = true;

        mod._setProjectId('test-project');
        global.document.querySelector = jest.fn(() => panel);
        global.chrome.runtime.sendMessage.mockImplementation((message, cb) => {
            if (message.type === 'LOAD_STATE' && typeof cb === 'function') {
                return;
            }
            if (typeof cb === 'function') cb({});
        });
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'div' && firstDiv) {
                firstDiv = false;
                return {
                    id: '',
                    attachShadow: jest.fn(() => initHarness.shadowRoot),
                    remove: jest.fn(),
                    isConnected: true
                };
            }

            return {
                appendChild: jest.fn(),
                cloneNode: jest.fn(function cloneNode() { return this; }),
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
                style: {}
            };
        });

        mod.syncManagerWithPanelLifecycle();

        expect(header.insertAdjacentElement).toHaveBeenCalledTimes(1);
        expect(mod._getAttachedSourcePanelForTest()).toBe(panel);
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'LOAD_STATE',
                key: 'sourcesPlusState_test-project'
            }),
            expect.any(Function)
        );
        expect(global.window.location.reload).not.toHaveBeenCalled();
    });

    it('reopens from the in-memory panel snapshot before falling back to storage', () => {
        const { panel, header, content } = createMockPanel({ visible: true, contentVisible: true });
        const sourceRow = createMockSourceRow({ title: 'Pinned Source', stableToken: 'doc-1', checked: true });
        const detachHost = {
            isConnected: true,
            remove: jest.fn()
        };
        const detachShadowRoot = {
            host: detachHost,
            querySelector: jest.fn(() => null)
        };
        const initHarness = createInitShadowRoot();
        let firstDiv = true;

        mod._setProjectId('test-project');
        mod._setShadowRootForTest(detachShadowRoot);
        mod._setAttachedSourcePanelForTest(panel);
        mod.state.groups = ['group1'];
        mod.groupsById.set('group1', {
            id: 'group1',
            title: 'Pinned',
            children: [{ type: 'source', key: 'source_id_doc-1' }]
        });
        mod.sourcesByKey.set('source_id_doc-1', {
            key: 'source_id_doc-1',
            title: 'Pinned Source',
            normalizedTitle: 'pinned source',
            fingerprint: 'pinned source||article',
            identityType: 'stable-token',
            enabled: false
        });
        global.document.querySelector = jest.fn(() => panel);

        content.style.display = 'none';
        content.style.visibility = 'hidden';
        content.__computedStyle.display = 'none';
        content.__computedStyle.visibility = 'hidden';
        content.getBoundingClientRect.mockImplementation(() => ({ width: 0, height: 0 }));

        mod.syncManagerWithPanelLifecycle();

        expect(mod._getPendingPanelReattachStateForTest()).toEqual(expect.objectContaining({
            groups: ['group1']
        }));
        expect(detachHost.remove).toHaveBeenCalledTimes(1);

        content.style.display = 'block';
        content.style.visibility = 'visible';
        content.__computedStyle.display = 'block';
        content.__computedStyle.visibility = 'visible';
        content.getBoundingClientRect.mockImplementation(() => ({ width: 320, height: 640 }));
        global.document.querySelectorAll = jest.fn((selector) => (
            mod.DEPS.row.includes(selector) ? [sourceRow.row] : []
        ));
        global.chrome.runtime.sendMessage.mockImplementation((message, cb) => {
            if (typeof cb === 'function') cb({});
        });
        global.document.createElement = jest.fn((tag) => {
            if (tag === 'div' && firstDiv) {
                firstDiv = false;
                return {
                    id: '',
                    attachShadow: jest.fn(() => initHarness.shadowRoot),
                    remove: jest.fn(),
                    isConnected: true
                };
            }

            return {
                appendChild: jest.fn(),
                cloneNode: jest.fn(function cloneNode() { return this; }),
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
                style: {}
            };
        });

        mod.syncManagerWithPanelLifecycle();

        const runtimeMessages = global.chrome.runtime.sendMessage.mock.calls.map(([message]) => message);
        const restoredKey = Array.from(mod.sourcesByKey.keys())[0];
        expect(runtimeMessages.some((message) => message.type === 'LOAD_STATE')).toBe(false);
        expect(header.insertAdjacentElement).toHaveBeenCalledTimes(1);
        expect(mod._getPendingPanelReattachStateForTest()).toBeNull();
        expect(mod.groupsById.get('group1').children).toEqual([{ type: 'source', key: restoredKey }]);
        expect(mod.sourcesByKey.get(restoredKey).enabled).toBe(false);
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
