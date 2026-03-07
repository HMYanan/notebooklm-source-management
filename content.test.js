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
        if (mod._resetState) {
            mod._resetState();
        } else {
            parentMap.clear();
            groupsById.clear();
        }
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

describe('scanAndSyncSources', () => {
    let scanAndSyncSources, sourcesByKey, state, DEPS, mod;

    class LocalHTMLElement {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.className = '';
            this.attributes = new Map();
            this.dataset = {};
            this.disabled = false;
            this.checked = false;
            this.childNodes = [];
            this.parentNode = null;
            this.classList = {
                contains: (cls) => this.className.split(' ').includes(cls),
                add: (cls) => { if (!this.classList.contains(cls)) this.className += ` ${cls}`; },
                remove: (cls) => { this.className = this.className.split(' ').filter(c => c !== cls).join(' '); }
            };
        }
        appendChild(child) {
            child.parentNode = this;
            this.childNodes.push(child);
            return child;
        }
        prepend(child) {
            child.parentNode = this;
            this.childNodes.unshift(child);
            return child;
        }
        setAttribute(key, value) {
            this.attributes.set(key, String(value));
            if (key === 'id') this.id = value;
            if (key === 'role') this.role = value;
        }
        getAttribute(key) { const val = this.attributes.get(key); return val === undefined ? null : val; }
        hasAttribute(key) { return this.attributes.has(key); }
        addEventListener() {}
        remove() {}
        click() {}
        contains(node) {
            let current = node;
            while (current) {
                if (current === this) return true;
                current = current.parentNode;
            }
            return false;
        }
        matches(selector) {
            if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
            if (selector.startsWith('[') && selector.endsWith(']')) {
                const attr = selector.slice(1, -1).split('=');
                if (attr.length === 1) return this.hasAttribute(attr[0]);
                return this.getAttribute(attr[0]) === attr[1].replace(/"/g, '');
            }
            if (selector.includes('[')) {
                const parts = selector.split('[');
                const tag = parts[0].toUpperCase();
                if (this.tagName !== tag) return false;
                const attr = parts[1].slice(0, -1).split('=');
                if (attr.length === 1) return this.hasAttribute(attr[0]);
                return this.getAttribute(attr[0]) === attr[1].replace(/"/g, '');
            }
            return this.tagName === selector.toUpperCase();
        }
        closest(selector) {
            let el = this;
            while (el) {
                if (el.matches(selector)) return el;
                el = el.parentNode;
            }
            return null;
        }
        querySelector(selector) {
            // Very simple comma-separated selector support for the mock
            const selectors = selector.split(',').map(s => s.trim());
            for (let sel of selectors) {
                if (this.matches(sel)) return this;
                for (let child of this.childNodes) {
                    if (child.querySelector) {
                        let found = child.querySelector(sel);
                        if (found) return found;
                    }
                }
            }
            return null;
        }
        querySelectorAll(selector) {
            let results = [];
            const selectors = selector.split(',').map(s => s.trim());
            for (let sel of selectors) {
                if (this.matches(sel)) results.push(this);
                for (let child of this.childNodes) {
                    if (child.querySelectorAll) {
                        results = results.concat(child.querySelectorAll(sel));
                    }
                }
            }
            return results;
        }
    }

    beforeEach(() => {
        jest.resetModules();

        global.document = {
            body: new LocalHTMLElement('body'),
            createElement: (tag) => new LocalHTMLElement(tag),
            createTextNode: (text) => ({ textContent: text, appendChild: () => {} }),
            getElementById: (id) => {
                const findId = (el) => {
                    if (el.id === id) return el;
                    if (el.attributes && el.attributes.get('id') === id) return el;
                    if (el.dataset && el.dataset.id === id) return el;
                    for (let child of el.childNodes || []) {
                        let found = findId(child);
                        if (found) return found;
                    }
                    return null;
                };
                let result = findId(global.document.body);
                if (!result) {
                    // Create dummy element if not found to avoid null errors in JEST env mocks
                    result = new LocalHTMLElement('div');
                    result.id = id;
                    global.document.body.appendChild(result);
                }
                return result;
            }
        };
        global.document.querySelector = (selector) => global.document.body.querySelector(selector);
        global.document.querySelectorAll = (selector) => global.document.body.querySelectorAll(selector);

        global.window = { location: { pathname: '/notebook/testproject' } };
        global.location = { href: 'http://localhost' };
        global.MutationObserver = class { observe() {} disconnect() {} };
        global.chrome = {
            i18n: {
                getMessage: (key) => key
            }
        };
        global.setTimeout = jest.fn();

        mod = require('./content.js');
        scanAndSyncSources = mod.scanAndSyncSources;
        sourcesByKey = mod.sourcesByKey;
        state = mod.state;
        DEPS = mod.DEPS || {
            row: ['[data-testid="source-item"]', '.single-source-container'],
            title: ['[data-testid="source-title"]', '.source-title'],
            checkbox: ['input[type="checkbox"]', '.select-checkbox input[type="checkbox"]'],
            icon: ['mat-icon[class*="-icon-color"]', 'mat-icon']
        };

        if (mod && mod._resetState) {
            mod._resetState();
        }
    });

    afterEach(() => {
        delete global.window;
        delete global.document;
        delete global.MutationObserver;
        delete global.location;
        delete global.chrome;
        delete global.setTimeout;
    });

    const createMockSourceRow = (titleText, isChecked = false, iconClass = '', isLoading = false) => {
        const rowClass = DEPS.row ? DEPS.row[0].replace(/\[|\]|data-testid=|"|\./g, '') : 'source-item';
        const titleClass = DEPS.title ? DEPS.title[0].replace(/\[|\]|data-testid=|"|\./g, '') : 'source-title';
        const iconClassBase = 'mat-icon';

        const row = global.document.createElement('div');
        row.setAttribute('data-testid', 'source-item');
        row.className = rowClass;

        const titleEl = global.document.createElement('div');
        titleEl.setAttribute('data-testid', 'source-title');
        titleEl.className = titleClass;
        titleEl.textContent = titleText;

        const checkbox = global.document.createElement('input');
        checkbox.setAttribute('type', 'checkbox');
        checkbox.checked = isChecked;

        const icon = global.document.createElement('mat-icon');
        icon.className = iconClass ? `${iconClassBase} ${iconClass}` : iconClassBase;
        icon.classList.add(iconClassBase);
        if (iconClass) {
            icon.classList.add(iconClass);
        }
        icon.classList[Symbol.iterator] = function* () {
            const classes = this.className.split(' ').filter(Boolean);
            for (let c of classes) {
                yield c;
            }
        }.bind(icon);
        icon.textContent = 'article';

        row.appendChild(titleEl);
        row.appendChild(checkbox);
        row.appendChild(icon);

        if (isLoading) {
            const spinner = global.document.createElement('mat-spinner');
            row.appendChild(spinner);
        }

        return row;
    };

    it('scans DOM and populates sourcesByKey with correct properties on first load', () => {
        const row1 = createMockSourceRow('Source 1', true, 'pdf-icon-color');
        const row2 = createMockSourceRow('Source 2', false, 'youtube-icon-color');

        global.document.body.appendChild(row1);
        global.document.body.appendChild(row2);

        // Run with isFirstLoad = true, and empty loadedEnabledMap so it falls back to native checkbox
        scanAndSyncSources({}, true);

        expect(sourcesByKey.size).toBe(2);

        // First source checks
        const source1Key = Array.from(sourcesByKey.keys())[0];
        const source1 = sourcesByKey.get(source1Key);
        expect(source1.title).toBe('Source 1');
        expect(source1.enabled).toBe(true);
        expect(source1.iconColorClass).toBe('pdf-icon-color');
        expect(source1.isDisabled).toBe(false);
        expect(source1.isLoading).toBe(false);

        // Second source checks
        const source2Key = Array.from(sourcesByKey.keys())[1];
        const source2 = sourcesByKey.get(source2Key);
        expect(source2.title).toBe('Source 2');
        expect(source2.enabled).toBe(false);
        expect(source2.iconColorClass).toBe('youtube-icon-color');
    });

    it('respects loadedEnabledMap on first load', () => {
        const row1 = createMockSourceRow('Loaded Source', false); // DOM says false
        global.document.body.appendChild(row1);

        // Run it once to get the key
        scanAndSyncSources({}, true);
        const sourceKey = Array.from(sourcesByKey.keys())[0];

        mod._resetState();

        const loadedMap = { [sourceKey]: true }; // Loaded map says true
        scanAndSyncSources(loadedMap, true);

        const source = sourcesByKey.get(sourceKey);
        expect(source.enabled).toBe(true); // Should prefer loaded map
    });

    it('preserves existing state on re-render instead of trusting DOM', () => {
        // Initial load setup
        const row1 = createMockSourceRow('Persisted Source', true);
        global.document.body.appendChild(row1);
        scanAndSyncSources({}, true);

        const sourceKey = Array.from(sourcesByKey.keys())[0];
        const source = sourcesByKey.get(sourceKey);
        expect(source.enabled).toBe(true);

        // Now simulate a DOM re-render where native checkbox is unchecked
        global.document.body.childNodes = [];
        const newRow1 = createMockSourceRow('Persisted Source', false);
        global.document.body.appendChild(newRow1);

        // Run re-render sync
        scanAndSyncSources({}, false);

        // Should preserve the previous state (true)
        const updatedSource = sourcesByKey.get(sourceKey);
        expect(updatedSource.enabled).toBe(true);
    });

    it('flags sources as loading and disabled when loading element is present', () => {
        const row = createMockSourceRow('Loading Source', true, '', true); // isLoading = true
        global.document.body.appendChild(row);

        scanAndSyncSources({}, true);

        const sourceKey = Array.from(sourcesByKey.keys())[0];
        const source = sourcesByKey.get(sourceKey);

        expect(source.isLoading).toBe(true);
        expect(source.isDisabled).toBe(true); // Loading sources should be disabled
    });

    it('handles missing elements gracefully', () => {
        // Create an empty div that just matches the row selector
        const emptyRow = global.document.createElement('div');
        emptyRow.setAttribute('data-testid', 'source-item');
        global.document.body.appendChild(emptyRow);

        expect(() => scanAndSyncSources({}, true)).not.toThrow();

        const sourceKey = Array.from(sourcesByKey.keys())[0];
        const source = sourcesByKey.get(sourceKey);

        expect(source.title).toBe('Untitled Source');
        expect(source.enabled).toBe(false);
        expect(source.isDisabled).toBe(true); // No checkbox means disabled
    });
});
