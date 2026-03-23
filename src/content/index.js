(function () {
    'use strict';

    // --- Selectors & Dependencies ---
    const contentConfig = globalThis.NSM_CONTENT_CONFIG;
    const sourceDescriptorHelpers = globalThis.NSM_SOURCE_DESCRIPTOR_HELPERS;
    const contentStyleText = globalThis.NSM_CONTENT_STYLE_TEXT;
    const globalOverlayStyleText = globalThis.NSM_GLOBAL_OVERLAY_STYLE_TEXT;
    const createManagerShell = globalThis.NSM_CREATE_MANAGER_SHELL;

    if (
        !contentConfig ||
        !sourceDescriptorHelpers ||
        typeof contentStyleText !== 'string' ||
        typeof globalOverlayStyleText !== 'string' ||
        typeof createManagerShell !== 'function'
    ) {
        throw new Error('NotebookLM Source Management: Content helpers are missing.');
    }

    const {
        DEPS,
        SCROLL_AREA_SELECTOR,
        SOURCE_TITLE_SELECTOR,
        SOURCE_CHECKBOX_SELECTOR,
        SOURCE_ICON_SELECTOR,
        STORAGE_SCHEMA_VERSION,
        GLOBAL_OVERLAY_STYLE_ID,
        ROUTE_REINIT_MAX_ATTEMPTS,
        ROUTE_REINIT_RETRY_DELAY_MS
    } = contentConfig;
    const {
        createSourceDescriptor,
        extractSourceIconImageUrl,
        generateSourceKey,
        normalizeSourceText
    } = sourceDescriptorHelpers;

    // --- State Management ---
    let state = {
        groups: [], // Holds top-level group IDs
        ungrouped: [],
        filterQuery: '',
        isBatchMode: false,
        tagOrder: [],
        activeTagId: null
    };
    let pendingBatchKeys = new Set();
    let isDeletingSources = false;
    let groupsById = new Map(); // Flat map of ALL group objects for easy lookup
    let sourcesByKey = new Map();
    let tagsById = new Map();
    let sourceTagsById = new Map();
    let keyByElement = new WeakMap();
    let shadowRoot = null;
    let projectId = getProjectId();
    let parentMap = new Map();
    let isSyncingState = false;
    let clickQueue = [];
    let isProcessingQueue = false;
    let customHeight = null; // Store user defined height
    let scrollObserver = null; // Store MutationObserver globally for teardown
    let extensionHost = null;
    let managerStatusReason = 'manager_not_ready';
    let focusHighlightTimeout = null;
    let pendingStorageUpgrade = false;
    let activeRouteRecoveryToken = 0;
    let routeRecoveryTimeout = null;
    let activeIsolationGroupId = null;
    let isSearchExpanded = false;
    let pendingInitialLoadedState = null;
    let pendingPanelReattachState = null;
    let attachedSourcePanel = null;
    let attachedPanelHeader = null;
    let panelResizeObserver = null;
    let panelLifecycleAnimationFrame = null;
    let panelLifecycleTimeout = null;
    let activeSourceActionSourceKey = null;
    let sourceActionMenuPosition = null;

    const TAG_COLOR_PRESETS = [
        '#007AFF',
        '#34C759',
        '#FF9500',
        '#FF3B30',
        '#AF52DE',
        '#5AC8FA',
        '#FF2D55',
        '#8E8E93'
    ];
    const TAG_COLOR_HEX_PATTERN = /^#([0-9A-F]{6})$/;

    const SOURCE_PANEL_CONTENT_SELECTORS = Array.from(new Set([
        '[data-testid="scroll-area"]',
        '.scroll-area-desktop',
        '.sources-list-container',
        SCROLL_AREA_SELECTOR,
        ...(Array.isArray(DEPS.scroll) ? DEPS.scroll : [])
    ].filter(Boolean)));

    // --- Helper Functions ---

    function findElement(selectors, parent = document) {
        for (const sel of selectors) {
            const el = parent.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function queryAllElements(selectors, parent = document) {
        for (const sel of selectors) {
            const els = parent.querySelectorAll(sel);
            if (els.length > 0) return els;
        }
        return [];
    }

    function waitForElement(selectors, options = {}) {
        const {
            observerRoot = document.body,
            timeoutMs = 0
        } = options;

        return new Promise(resolve => {
            const check = () => findElement(selectors);
            const el = check();
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const found = check();
                if (found) {
                    resolve(found);
                    observer.disconnect();
                }
            });

            observer.observe(observerRoot || document.body, {
                childList: true,
                subtree: true
            });

            if (timeoutMs > 0) {
                setTimeout(() => {
                    observer.disconnect();
                    resolve(check() || null);
                }, timeoutMs);
            }
        });
    }

    function cloneSerializableData(value) {
        if (value == null) return value;
        if (typeof globalThis.structuredClone === 'function') {
            try {
                return globalThis.structuredClone(value);
            } catch (error) {
                // Fallback to JSON cloning for plain persisted state objects.
            }
        }
        return JSON.parse(JSON.stringify(value));
    }

    function findSourcePanel(parent = document) {
        return findElement(DEPS.panel, parent);
    }

    function findSourcePanelContent(panel = findSourcePanel()) {
        if (!panel) return null;
        return findElement(SOURCE_PANEL_CONTENT_SELECTORS, panel);
    }

    function getSourcePanelHeader(panel = findSourcePanel()) {
        if (!panel) return null;
        return panel.querySelector('.panel-header') || panel.firstElementChild || null;
    }

    function getElementComputedStyle(target) {
        if (!target) return null;
        if (window && typeof window.getComputedStyle === 'function') {
            return window.getComputedStyle(target);
        }
        if (document?.defaultView && typeof document.defaultView.getComputedStyle === 'function') {
            return document.defaultView.getComputedStyle(target);
        }
        return target.style || null;
    }

    function isTransparentColor(value) {
        const normalizedValue = String(value || '').trim().toLowerCase();
        if (!normalizedValue || normalizedValue === 'transparent') {
            return true;
        }

        const rgbaMatch = normalizedValue.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        if (rgbaMatch) {
            return Number(rgbaMatch[1]) === 0;
        }

        const hslaMatch = normalizedValue.match(/^hsla\(\s*[-\d.]+\s*,\s*[-\d.]+%\s*,\s*[-\d.]+%\s*,\s*([0-9.]+)\s*\)$/);
        if (hslaMatch) {
            return Number(hslaMatch[1]) === 0;
        }

        return false;
    }

    function resolveSourcePanelSurfaceColor(panel = findSourcePanel()) {
        const sourcePanel = panel || findSourcePanel();
        if (!sourcePanel) return '';

        const candidates = [
            getSourcePanelHeader(sourcePanel),
            sourcePanel,
            sourcePanel.parentElement
        ].filter(Boolean);

        for (const candidate of candidates) {
            const computedStyle = getElementComputedStyle(candidate);
            const backgroundColor = computedStyle?.backgroundColor || candidate?.style?.backgroundColor || '';
            if (!isTransparentColor(backgroundColor)) {
                return backgroundColor;
            }
        }

        return '';
    }

    function applySourcePanelSurfaceColor(host = extensionHost, panel = findSourcePanel()) {
        const targetHost = host || extensionHost;
        const hostStyle = targetHost?.style;
        if (!hostStyle || typeof hostStyle.setProperty !== 'function') {
            return '';
        }

        const resolvedColor = resolveSourcePanelSurfaceColor(panel);
        if (resolvedColor) {
            hostStyle.setProperty('--sp-panel-bg', resolvedColor);
        } else if (typeof hostStyle.removeProperty === 'function') {
            hostStyle.removeProperty('--sp-panel-bg');
        }

        return resolvedColor;
    }

    function getElementBoundingRect(target) {
        if (!target || typeof target.getBoundingClientRect !== 'function') return null;
        try {
            return target.getBoundingClientRect();
        } catch (error) {
            return null;
        }
    }

    function hasRenderableBox(target) {
        const rect = getElementBoundingRect(target);
        if (rect && (rect.width > 0 || rect.height > 0)) {
            return true;
        }

        const widths = [
            Number(target?.offsetWidth) || 0,
            Number(target?.clientWidth) || 0,
            Number(target?.scrollWidth) || 0
        ];
        const heights = [
            Number(target?.offsetHeight) || 0,
            Number(target?.clientHeight) || 0,
            Number(target?.scrollHeight) || 0
        ];
        return Math.max(...widths) > 0 || Math.max(...heights) > 0;
    }

    function isElementRenderable(target) {
        if (!target) return false;
        if ('isConnected' in target && target.isConnected === false) return false;
        if (target.hidden === true) return false;
        if (typeof target.getAttribute === 'function' && target.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        if (typeof target.matches === 'function' && target.matches('[hidden], [aria-hidden="true"]')) {
            return false;
        }

        const computedStyle = getElementComputedStyle(target);
        if (computedStyle) {
            // We intentionally hide the native source list with visibility:hidden
            // while keeping its layout box alive, so visibility alone should not
            // be treated as a collapsed panel signal.
            if (computedStyle.display === 'none') {
                return false;
            }
        }

        return hasRenderableBox(target);
    }

    function isSourcePanelCollapsed(panel) {
        const sourcePanel = panel || findSourcePanel();
        if (!sourcePanel || !isElementRenderable(sourcePanel)) return true;
        const panelContent = findSourcePanelContent(sourcePanel);
        return !panelContent || !isElementRenderable(panelContent);
    }

    function isSourcePanelRenderable(panel) {
        const sourcePanel = panel || findSourcePanel();
        return Boolean(sourcePanel) && !isSourcePanelCollapsed(sourcePanel);
    }

    function isManagerAttachedToPanel(panel) {
        return Boolean(
            panel &&
            attachedSourcePanel === panel &&
            extensionHost &&
            (!('isConnected' in extensionHost) || extensionHost.isConnected !== false) &&
            shadowRoot &&
            shadowRoot.host &&
            (!('isConnected' in shadowRoot.host) || shadowRoot.host.isConnected !== false)
        );
    }

    function clearScheduledPanelLifecycleSync() {
        if (typeof debouncedPanelLifecycleSync?.cancel === 'function') {
            debouncedPanelLifecycleSync.cancel();
        }
        if (panelLifecycleAnimationFrame != null && window && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(panelLifecycleAnimationFrame);
        }
        panelLifecycleAnimationFrame = null;
        if (panelLifecycleTimeout != null) {
            clearTimeout(panelLifecycleTimeout);
            panelLifecycleTimeout = null;
        }
    }

    function schedulePanelLifecycleSync(options = {}) {
        const { immediate = false } = options;
        if (immediate) {
            if (typeof debouncedPanelLifecycleSync?.cancel === 'function') {
                debouncedPanelLifecycleSync.cancel();
            }
            syncManagerWithPanelLifecycle();
            return;
        }
        debouncedPanelLifecycleSync();
    }

    function handleSourcePanelHeaderInteraction() {
        schedulePanelLifecycleSync({ immediate: true });
        if (window && typeof window.requestAnimationFrame === 'function') {
            if (panelLifecycleAnimationFrame != null && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(panelLifecycleAnimationFrame);
            }
            panelLifecycleAnimationFrame = window.requestAnimationFrame(() => {
                panelLifecycleAnimationFrame = null;
                schedulePanelLifecycleSync();
            });
        } else {
            schedulePanelLifecycleSync();
        }

        if (panelLifecycleTimeout != null) {
            clearTimeout(panelLifecycleTimeout);
        }
        panelLifecycleTimeout = setTimeout(() => {
            panelLifecycleTimeout = null;
            schedulePanelLifecycleSync();
        }, 120);
    }

    function canOpenSourceActionMenu(source) {
        return Boolean(source && !state.isBatchMode && !source.isLoading && !source.isDisabled);
    }

    function getViewportSize() {
        const docEl = document?.documentElement;
        return {
            width: Number(window?.innerWidth) || Number(docEl?.clientWidth) || 1280,
            height: Number(window?.innerHeight) || Number(docEl?.clientHeight) || 720
        };
    }

    function findSourceActionButton(sourceKey) {
        if (!shadowRoot || !sourceKey) return null;
        const buttons = shadowRoot.querySelectorAll('.sp-source-actions-button');
        return Array.from(buttons).find((button) => button?.dataset?.sourceKey === sourceKey) || null;
    }

    function getSourceActionMenuPosition(triggerElement) {
        const triggerRect = getElementBoundingRect(triggerElement);
        if (!triggerRect) return null;

        const MENU_WIDTH = 220;
        const MENU_HEIGHT = 146;
        const VIEWPORT_PADDING = 8;
        const MENU_GAP = 8;
        const viewport = getViewportSize();

        let left = triggerRect.left - 4;
        left = Math.min(Math.max(left, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, viewport.width - MENU_WIDTH - VIEWPORT_PADDING));

        let top = triggerRect.bottom + MENU_GAP;
        let placement = 'bottom';
        if (top + MENU_HEIGHT > viewport.height - VIEWPORT_PADDING) {
            const topPlacement = triggerRect.top - MENU_HEIGHT - MENU_GAP;
            if (topPlacement >= VIEWPORT_PADDING) {
                top = topPlacement;
                placement = 'top';
            } else {
                top = Math.max(VIEWPORT_PADDING, viewport.height - MENU_HEIGHT - VIEWPORT_PADDING);
            }
        }

        return { top, left, placement };
    }

    function closeSourceActionMenu() {
        activeSourceActionSourceKey = null;
        sourceActionMenuPosition = null;
    }

    function dismissSourceActionMenuAndRender() {
        if (!activeSourceActionSourceKey) return false;
        closeSourceActionMenu();
        render();
        return true;
    }

    function toggleSourceActionMenu(sourceKey, triggerElement = null) {
        if (!sourceKey) {
            closeSourceActionMenu();
            return activeSourceActionSourceKey;
        }

        const source = sourcesByKey.get(sourceKey);
        if (!canOpenSourceActionMenu(source)) {
            closeSourceActionMenu();
            return activeSourceActionSourceKey;
        }

        if (activeSourceActionSourceKey === sourceKey) {
            closeSourceActionMenu();
            return activeSourceActionSourceKey;
        }

        activeSourceActionSourceKey = sourceKey;
        sourceActionMenuPosition = getSourceActionMenuPosition(triggerElement || findSourceActionButton(sourceKey));
        return activeSourceActionSourceKey;
    }

    function syncActiveSourceActionMenuState() {
        if (!activeSourceActionSourceKey) return false;

        const activeSource = sourcesByKey.get(activeSourceActionSourceKey);
        if (
            !canOpenSourceActionMenu(activeSource) ||
            !sourceMatchesCurrentFilters(activeSource)
        ) {
            closeSourceActionMenu();
            return true;
        }

        const actionButton = findSourceActionButton(activeSourceActionSourceKey);
        if (!actionButton) {
            closeSourceActionMenu();
            return true;
        }

        sourceActionMenuPosition = getSourceActionMenuPosition(actionButton);
        return false;
    }

    function triggerNativeSourceMenu(sourceKey) {
        const source = sourcesByKey.get(sourceKey);
        if (!source?.element) return false;

        const nativeBtn = findElement(DEPS.moreBtn, source.element);
        if (!nativeBtn) return false;

        nativeBtn.click();
        return true;
    }

    const sourceActionInvokers = {
        openTags: (sourceKey) => renderTagModal(sourceKey),
        moveToFolder: (sourceKey) => renderMoveToFolderModal(sourceKey),
        openNativeMenu: (sourceKey) => triggerNativeSourceMenu(sourceKey)
    };

    function handleSourceActionSelection(sourceKey, action) {
        const source = sourcesByKey.get(sourceKey);
        if (!sourceKey || !canOpenSourceActionMenu(source)) {
            closeSourceActionMenu();
            return false;
        }

        closeSourceActionMenu();

        switch (action) {
        case 'tags':
            sourceActionInvokers.openTags(sourceKey);
            return true;
        case 'move':
            sourceActionInvokers.moveToFolder(sourceKey);
            return true;
        case 'native-more':
            return sourceActionInvokers.openNativeMenu(sourceKey);
        default:
            return false;
        }
    }

    function bindPanelLifecycleHooks(panel = findSourcePanel()) {
        if (!panel) {
            if (panelResizeObserver) {
                panelResizeObserver.disconnect();
                panelResizeObserver = null;
            }
            if (attachedPanelHeader && typeof attachedPanelHeader.removeEventListener === 'function') {
                attachedPanelHeader.removeEventListener('click', handleSourcePanelHeaderInteraction, true);
            }
            attachedPanelHeader = null;
            clearScheduledPanelLifecycleSync();
            return;
        }

        const panelHeader = getSourcePanelHeader(panel);
        if (attachedPanelHeader !== panelHeader) {
            if (attachedPanelHeader && typeof attachedPanelHeader.removeEventListener === 'function') {
                attachedPanelHeader.removeEventListener('click', handleSourcePanelHeaderInteraction, true);
            }
            attachedPanelHeader = panelHeader;
            if (attachedPanelHeader && typeof attachedPanelHeader.addEventListener === 'function') {
                attachedPanelHeader.addEventListener('click', handleSourcePanelHeaderInteraction, true);
            }
        }

        if (typeof ResizeObserver !== 'function') return;

        if (!panelResizeObserver) {
            panelResizeObserver = new ResizeObserver(() => {
                schedulePanelLifecycleSync();
            });
        }
        panelResizeObserver.disconnect();
        panelResizeObserver.observe(panel);
        const panelContent = findSourcePanelContent(panel);
        if (panelContent) {
            panelResizeObserver.observe(panelContent);
        }
    }

    function getProjectId() {
        const pathSegments = window.location.pathname.split('/');
        const notebookIndex = pathSegments.indexOf('notebook');
        if (notebookIndex > -1 && notebookIndex + 1 < pathSegments.length) {
            return pathSegments[notebookIndex + 1];
        }
        return null;
    }

    function normalizeTagLabel(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 48);
    }

    function normalizeTagColor(value) {
        const rawValue = String(value || '').trim().toUpperCase();
        if (!rawValue) return null;

        const normalizedValue = rawValue.startsWith('#') ? rawValue : `#${rawValue}`;
        const match = normalizedValue.match(TAG_COLOR_HEX_PATTERN);
        return match ? `#${match[1]}` : null;
    }

    function getDefaultTagColor() {
        return TAG_COLOR_PRESETS[0];
    }

    function normalizeTagColorInputValue(value) {
        const compactValue = String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[^#0-9A-F]/g, '');
        if (!compactValue) return '';

        const withoutPrefix = compactValue.startsWith('#') ? compactValue.slice(1) : compactValue;
        return `#${withoutPrefix.slice(0, 6)}`;
    }

    function getSerializedTag(tag) {
        if (!tag) return null;

        const serializedTag = {
            id: tag.id,
            label: normalizeTagLabel(tag.label)
        };
        const normalizedColor = normalizeTagColor(tag.color);
        if (normalizedColor) {
            serializedTag.color = normalizedColor;
        }
        return serializedTag;
    }

    function getTagColorRgb(color) {
        const normalizedColor = normalizeTagColor(color);
        if (!normalizedColor) return null;

        return {
            r: parseInt(normalizedColor.slice(1, 3), 16),
            g: parseInt(normalizedColor.slice(3, 5), 16),
            b: parseInt(normalizedColor.slice(5, 7), 16)
        };
    }

    function getTagColorRgba(color, alpha) {
        const rgb = getTagColorRgb(color);
        if (!rgb) return '';
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    function getTagStyleVars(tag, isActive = false) {
        const normalizedColor = normalizeTagColor(tag && tag.color);
        if (!normalizedColor) return '';

        return [
            `--sp-tag-text:${normalizedColor}`,
            `--sp-tag-border:${getTagColorRgba(normalizedColor, isActive ? 0.38 : 0.22)}`,
            `--sp-tag-bg:${getTagColorRgba(normalizedColor, isActive ? 0.18 : 0.1)}`,
            `--sp-tag-hover-text:${normalizedColor}`,
            `--sp-tag-hover-border:${getTagColorRgba(normalizedColor, isActive ? 0.42 : 0.32)}`,
            `--sp-tag-hover-bg:${getTagColorRgba(normalizedColor, isActive ? 0.22 : 0.16)}`,
            `--sp-tag-active-text:${normalizedColor}`,
            `--sp-tag-active-border:${getTagColorRgba(normalizedColor, 0.42)}`,
            `--sp-tag-active-bg:${getTagColorRgba(normalizedColor, 0.2)}`
        ].join(';');
    }

    function getTagColorPreviewStyle(color) {
        const normalizedColor = normalizeTagColor(color);
        if (!normalizedColor) return '';

        return [
            `background:${normalizedColor}`,
            `border-color:${getTagColorRgba(normalizedColor, 0.28)}`
        ].join(';');
    }

    function generateTagId() {
        return `tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getSortedTagIds(tagIds = []) {
        const orderIndex = new Map();
        state.tagOrder.forEach((tagId, index) => orderIndex.set(tagId, index));
        return Array.from(new Set(tagIds))
            .filter((tagId) => tagsById.has(tagId))
            .sort((left, right) => (orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER));
    }

    function getSourceTagIds(sourceKey) {
        return getSortedTagIds(sourceTagsById.get(sourceKey) || []);
    }

    function getTagUsageCounts() {
        const counts = new Map();
        sourceTagsById.forEach((tagIds) => {
            getSortedTagIds(tagIds).forEach((tagId) => {
                counts.set(tagId, (counts.get(tagId) || 0) + 1);
            });
        });
        return counts;
    }

    function findExistingTagIdByLabel(label) {
        const normalizedLabel = normalizeTagLabel(label).toLowerCase();
        if (!normalizedLabel) return null;

        for (const [tagId, tag] of tagsById.entries()) {
            if (normalizeTagLabel(tag.label).toLowerCase() === normalizedLabel) {
                return tagId;
            }
        }

        return null;
    }

    function createTag(label, options = {}) {
        const normalizedOptions = typeof options === 'string' ? { color: options } : options;
        const normalizedLabel = normalizeTagLabel(label);
        if (!normalizedLabel) {
            showToast(getMessage('ui_tag_name_required'));
            return null;
        }

        const duplicateTagId = findExistingTagIdByLabel(normalizedLabel);
        if (duplicateTagId) {
            showToast(getMessage('ui_tag_create_duplicate'));
            return duplicateTagId;
        }

        const tagId = generateTagId();
        tagsById.set(tagId, {
            id: tagId,
            label: normalizedLabel,
            color: normalizeTagColor(normalizedOptions && normalizedOptions.color)
        });
        state.tagOrder.push(tagId);
        return tagId;
    }

    function updateTag(tagId, updates = {}) {
        const tag = tagsById.get(tagId);
        if (!tag) return null;

        const normalizedLabel = normalizeTagLabel(updates.label !== undefined ? updates.label : tag.label);
        if (!normalizedLabel) {
            showToast(getMessage('ui_tag_name_required'));
            return null;
        }

        const duplicateTagId = findExistingTagIdByLabel(normalizedLabel);
        if (duplicateTagId && duplicateTagId !== tagId) {
            showToast(getMessage('ui_tag_create_duplicate'));
            return duplicateTagId;
        }

        tag.label = normalizedLabel;
        tag.color = normalizeTagColor(updates.color);
        return tagId;
    }

    function setSourceTagIds(sourceKey, tagIds) {
        const normalizedIds = getSortedTagIds(tagIds);
        if (normalizedIds.length === 0) {
            sourceTagsById.delete(sourceKey);
            return;
        }
        sourceTagsById.set(sourceKey, normalizedIds);
    }

    function deleteTag(tagId) {
        if (!tagsById.has(tagId)) return;

        tagsById.delete(tagId);
        state.tagOrder = state.tagOrder.filter((id) => id !== tagId);
        if (state.activeTagId === tagId) {
            state.activeTagId = null;
        }

        sourceTagsById.forEach((tagIds, sourceKey) => {
            const nextTagIds = tagIds.filter((id) => id !== tagId);
            setSourceTagIds(sourceKey, nextTagIds);
        });
    }

    function buildSourceLookup(sourceList) {
        const byId = new Map();
        const byLegacyKey = new Map();
        const fingerprintBuckets = new Map();
        const titleBuckets = new Map();

        for (const source of sourceList) {
            byId.set(source.key, source.key);
            byLegacyKey.set(source.legacyKey, source.key);

            if (!fingerprintBuckets.has(source.fingerprint)) fingerprintBuckets.set(source.fingerprint, []);
            fingerprintBuckets.get(source.fingerprint).push(source.key);

            if (!titleBuckets.has(source.normalizedTitle)) titleBuckets.set(source.normalizedTitle, []);
            titleBuckets.get(source.normalizedTitle).push(source.key);
        }

        const uniqueByFingerprint = new Map();
        const uniqueByTitle = new Map();

        fingerprintBuckets.forEach((keys, fingerprint) => {
            if (keys.length === 1) uniqueByFingerprint.set(fingerprint, keys[0]);
        });
        titleBuckets.forEach((keys, title) => {
            if (keys.length === 1) uniqueByTitle.set(title, keys[0]);
        });

        return {
            byId,
            byLegacyKey,
            uniqueByFingerprint,
            uniqueByTitle
        };
    }

    function resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord = null) {
        if (!storedKey || !sourceLookup) return null;
        if (sourceLookup.byId.has(storedKey)) return sourceLookup.byId.get(storedKey);
        if (sourceLookup.byLegacyKey.has(storedKey)) return sourceLookup.byLegacyKey.get(storedKey);

        if (sourceRecord && sourceRecord.fingerprint && sourceLookup.uniqueByFingerprint.has(sourceRecord.fingerprint)) {
            return sourceLookup.uniqueByFingerprint.get(sourceRecord.fingerprint);
        }

        const normalizedTitle = normalizeSourceText(
            sourceRecord && (sourceRecord.normalizedTitle || sourceRecord.title)
        );
        if (normalizedTitle && sourceLookup.uniqueByTitle.has(normalizedTitle)) {
            return sourceLookup.uniqueByTitle.get(normalizedTitle);
        }

        return null;
    }

    function snapshotExistingSourceRecords() {
        const sourceRecordsByKey = new Map();
        sourcesByKey.forEach((source, key) => {
            sourceRecordsByKey.set(key, {
                enabled: Boolean(source.enabled),
                title: source.title,
                normalizedTitle: source.normalizedTitle || normalizeSourceText(source.title),
                fingerprint: source.fingerprint || '',
                identityType: source.identityType || 'fingerprint'
            });
        });
        return sourceRecordsByKey;
    }

    function remapExistingStateToCurrentSources(sourceLookup, previousState) {
        const nextGroups = [];
        const nextUngrouped = [];
        const nextGroupsById = new Map();
        const nextSourceStateById = new Map();
        const nextSourceTagsById = new Map();
        const seenSourceRefs = new Set();

        groupsById.forEach((group, groupId) => {
            nextGroupsById.set(groupId, {
                ...group,
                children: []
            });
        });

        groupsById.forEach((group, groupId) => {
            const nextGroup = nextGroupsById.get(groupId);
            if (!nextGroup) return;

            group.children.forEach((child) => {
                if (child.type === 'group' && nextGroupsById.has(child.id) && child.id !== groupId) {
                    nextGroup.children.push({ type: 'group', id: child.id });
                    return;
                }

                if (child.type !== 'source') return;

                const sourceRecord = previousState.sourceRecordsByKey.get(child.key) || null;
                const resolvedKey = resolveStoredSourceKey(child.key, sourceLookup, sourceRecord);
                if (!resolvedKey || seenSourceRefs.has(resolvedKey)) return;

                nextGroup.children.push({ type: 'source', key: resolvedKey });
                seenSourceRefs.add(resolvedKey);

                if (!nextSourceStateById.has(resolvedKey) && sourceRecord) {
                    nextSourceStateById.set(resolvedKey, sourceRecord);
                }

                if (!nextSourceTagsById.has(resolvedKey) && previousState.sourceTagsById.has(child.key)) {
                    nextSourceTagsById.set(resolvedKey, [...previousState.sourceTagsById.get(child.key)]);
                }
            });
        });

        state.groups.forEach((groupId) => {
            if (nextGroupsById.has(groupId)) {
                nextGroups.push(groupId);
            }
        });

        state.ungrouped.forEach((storedKey) => {
            const sourceRecord = previousState.sourceRecordsByKey.get(storedKey) || null;
            const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
            if (!resolvedKey || seenSourceRefs.has(resolvedKey)) return;

            nextUngrouped.push(resolvedKey);
            seenSourceRefs.add(resolvedKey);

            if (!nextSourceStateById.has(resolvedKey) && sourceRecord) {
                nextSourceStateById.set(resolvedKey, sourceRecord);
            }

            if (!nextSourceTagsById.has(resolvedKey) && previousState.sourceTagsById.has(storedKey)) {
                nextSourceTagsById.set(resolvedKey, [...previousState.sourceTagsById.get(storedKey)]);
            }
        });

        previousState.sourceRecordsByKey.forEach((sourceRecord, storedKey) => {
            const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
            if (!resolvedKey || nextSourceStateById.has(resolvedKey)) return;
            nextSourceStateById.set(resolvedKey, sourceRecord);
        });

        previousState.sourceTagsById.forEach((tagIds, storedKey) => {
            const sourceRecord = previousState.sourceRecordsByKey.get(storedKey) || null;
            const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
            if (!resolvedKey || nextSourceTagsById.has(resolvedKey)) return;
            nextSourceTagsById.set(resolvedKey, [...tagIds]);
        });

        return {
            groups: nextGroups,
            ungrouped: nextUngrouped,
            groupsById: nextGroupsById,
            sourceStateById: nextSourceStateById,
            sourceTagsById: nextSourceTagsById,
            seenSourceRefs
        };
    }

    function buildResolvedSourceStateById(sourceLookup, loadedState) {
        const resolvedSourceState = new Map();
        if (!loadedState) return resolvedSourceState;

        if (loadedState.sourceStateById) {
            Object.entries(loadedState.sourceStateById).forEach(([storedKey, sourceRecord]) => {
                const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
                if (resolvedKey && !resolvedSourceState.has(resolvedKey)) {
                    resolvedSourceState.set(resolvedKey, sourceRecord);
                }
            });
            return resolvedSourceState;
        }

        if (loadedState.legacyEnabledMap) {
            Object.entries(loadedState.legacyEnabledMap).forEach(([legacyKey, enabled]) => {
                const resolvedKey = resolveStoredSourceKey(legacyKey, sourceLookup);
                if (resolvedKey && !resolvedSourceState.has(resolvedKey)) {
                    resolvedSourceState.set(resolvedKey, { enabled: Boolean(enabled) });
                }
            });
        }

        return resolvedSourceState;
    }

    function buildNormalizedTagState(loadedState) {
        const nextTagsById = new Map();
        const rawTagsById = loadedState && typeof loadedState.tagsById === 'object' ? loadedState.tagsById : {};
        const preferredOrder = Array.isArray(loadedState && loadedState.tagOrder) ? loadedState.tagOrder : [];
        const seenTagIds = new Set();
        const nextTagOrder = [];

        const registerTag = (tagId) => {
            if (!tagId || seenTagIds.has(tagId)) return;
            const rawTag = rawTagsById[tagId];
            const label = normalizeTagLabel(rawTag && (rawTag.label || rawTag.title || rawTag.name || ''));
            if (!label) return;
            seenTagIds.add(tagId);
            nextTagOrder.push(tagId);
            nextTagsById.set(tagId, {
                id: tagId,
                label,
                color: normalizeTagColor(rawTag && rawTag.color)
            });
        };

        preferredOrder.forEach(registerTag);
        Object.keys(rawTagsById).forEach(registerTag);

        return { nextTagsById, nextTagOrder };
    }

    function buildResolvedSourceTagsById(sourceLookup, loadedState) {
        const resolvedSourceTags = new Map();
        if (!loadedState || !loadedState.sourceTagsById) return resolvedSourceTags;

        Object.entries(loadedState.sourceTagsById).forEach(([storedKey, rawTagIds]) => {
            const sourceRecord = loadedState.sourceStateById ? loadedState.sourceStateById[storedKey] : null;
            const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
            if (!resolvedKey || resolvedSourceTags.has(resolvedKey)) return;

            resolvedSourceTags.set(
                resolvedKey,
                Array.from(new Set(Array.isArray(rawTagIds) ? rawTagIds.filter(Boolean) : []))
            );
        });

        return resolvedSourceTags;
    }

    function reconcilePersistedTree(loadedState, sourceLookup) {
        const nextGroupsById = new Map();
        const seenSourceRefs = new Set();
        const rawGroupsById = loadedState && loadedState.groupsById ? loadedState.groupsById : {};

        Object.entries(rawGroupsById).forEach(([groupId, rawGroup]) => {
            nextGroupsById.set(groupId, {
                ...rawGroup,
                enabled: rawGroup.enabled !== undefined ? rawGroup.enabled : true,
                collapsed: rawGroup.collapsed === true,
                children: []
            });
        });

        Object.entries(rawGroupsById).forEach(([groupId, rawGroup]) => {
            const nextGroup = nextGroupsById.get(groupId);
            if (!nextGroup) return;

            (Array.isArray(rawGroup.children) ? rawGroup.children : []).forEach((child) => {
                if (child.type === 'group' && nextGroupsById.has(child.id) && child.id !== groupId) {
                    nextGroup.children.push({ type: 'group', id: child.id });
                    return;
                }

                if (child.type !== 'source') return;

                const sourceRecord = loadedState && loadedState.sourceStateById
                    ? loadedState.sourceStateById[child.key]
                    : null;
                const resolvedKey = resolveStoredSourceKey(child.key, sourceLookup, sourceRecord);
                if (!resolvedKey || seenSourceRefs.has(resolvedKey)) return;

                nextGroup.children.push({ type: 'source', key: resolvedKey });
                seenSourceRefs.add(resolvedKey);
            });
        });

        const nextGroups = Array.isArray(loadedState && loadedState.groups)
            ? loadedState.groups.filter(groupId => nextGroupsById.has(groupId))
            : [];
        const nextUngrouped = [];

        (Array.isArray(loadedState && loadedState.ungrouped) ? loadedState.ungrouped : []).forEach((storedKey) => {
            const sourceRecord = loadedState && loadedState.sourceStateById
                ? loadedState.sourceStateById[storedKey]
                : null;
            const resolvedKey = resolveStoredSourceKey(storedKey, sourceLookup, sourceRecord);
            if (!resolvedKey || seenSourceRefs.has(resolvedKey)) return;

            nextUngrouped.push(resolvedKey);
            seenSourceRefs.add(resolvedKey);
        });

        return {
            groups: nextGroups,
            groupsById: nextGroupsById,
            ungrouped: nextUngrouped,
            seenSourceRefs
        };
    }

    let toastTimeout = null;
    function showToast(message) {
        let toast = shadowRoot.querySelector('.sp-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'sp-toast';
            shadowRoot.appendChild(toast);
        }
        toast.textContent = message;
        
        // Force reflow to restart animation if needed
        toast.classList.remove('show');
        void toast.offsetWidth; 
        toast.classList.add('show');
        
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function showCrashBanner(message) {
        const existingError = document.getElementById('sp-error-banner');
        if (existingError) return;
        const banner = el('div', {
            id: 'sp-error-banner',
            style: 'position: fixed; top: 0; left: 0; right: 0; background: #ea4335; ' +
                   'color: white; padding: 12px; text-align: center; z-index: 999999; ' +
                   'font-family: "Google Sans", sans-serif; box-shadow: 0 2px 4px rgba(0,0,0,0.2);'
        }, [
            el('strong', {}, [getMessage('ui_crash_banner_prefix') + ' ']),
            message + ' ',
            el('button', {
                id: 'sp-dismiss-error',
                style: 'background: rgba(255,255,255,0.2); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 12px; cursor: pointer;'
            }, [getMessage('ui_dismiss')])
        ]);

        document.body.prepend(banner);
        document.getElementById('sp-dismiss-error').addEventListener('click', () => banner.remove());
    }

    function getManagerStatus() {
        const sourcePanel = findSourcePanel();
        const isReady = Boolean(
            shadowRoot &&
            shadowRoot.host &&
            shadowRoot.host.isConnected &&
            shadowRoot.querySelector('.sp-container') &&
            sourcePanel &&
            isSourcePanelRenderable(sourcePanel) &&
            isManagerAttachedToPanel(sourcePanel)
        );

        if (isReady) {
            managerStatusReason = 'ready';
            return { ready: true, reason: 'ready' };
        }

        if (!projectId) {
            managerStatusReason = 'not_on_notebook_page';
            return { ready: false, reason: 'not_on_notebook_page' };
        }

        if (!sourcePanel) {
            managerStatusReason = 'source_panel_missing';
            return { ready: false, reason: 'source_panel_missing' };
        }

        if (!isSourcePanelRenderable(sourcePanel)) {
            managerStatusReason = 'manager_not_ready';
            return { ready: false, reason: 'manager_not_ready' };
        }

        return { ready: false, reason: managerStatusReason || 'manager_not_ready' };
    }

    function focusManagerPanel() {
        const status = getManagerStatus();
        if (!status.ready) {
            return { success: false, reason: status.reason };
        }

        const container = shadowRoot.querySelector('.sp-container');
        shadowRoot.host.scrollIntoView({ behavior: 'smooth', block: 'start' });

        container.classList.remove('sp-focus-ring');
        void container.offsetWidth;
        container.classList.add('sp-focus-ring');

        if (focusHighlightTimeout) {
            clearTimeout(focusHighlightTimeout);
        }

        focusHighlightTimeout = setTimeout(() => {
            if (container && container.classList) {
                container.classList.remove('sp-focus-ring');
            }
        }, 1800);

        return { success: true };
    }

    function handleManagerMessage(request, sender, sendResponse) {
        if (!request || typeof request.type !== 'string') return;

        if (request.type === 'GET_MANAGER_STATUS') {
            sendResponse(getManagerStatus());
            return;
        }

        if (request.type === 'FOCUS_MANAGER') {
            sendResponse(focusManagerPanel());
        }
    }

    let freshRowCache = null;

    function findFreshCheckbox(sourceKey) {
        // Find the fresh row element from the DOM using the source title
        const sourceData = sourcesByKey.get(sourceKey);
        if (!sourceData) return null;

        if (!freshRowCache) {
            freshRowCache = new Map();
            const sourceElements = queryAllElements(DEPS.row);
            for (const el of sourceElements) {
                const titleEl = findElement(DEPS.title, el);
                if (titleEl) {
                    const titleText = titleEl.textContent.trim();
                    // only store the first matching element for a title (preserves original logic)
                    if (!freshRowCache.has(titleText)) {
                        freshRowCache.set(titleText, el);
                    }
                }
            }
        }

        const freshRow = freshRowCache.get(sourceData.title);
        if (freshRow) {
            return findElement(DEPS.checkbox, freshRow);
        }

        return null;
    }

    function buildParentMap() {
        parentMap.clear();
        groupsById.forEach(group => {
            group.children.forEach(child => {
                parentMap.set(child.id || child.key, group.id);
            });
        });
    }

    function getEffectivelyEnabledSources() {
        const effectivelyEnabled = new Map();
        const visit = (g, ancestorsEnabled) => {
            const currentEffectivelyEnabled = ancestorsEnabled && g.enabled;
            for (const child of g.children) {
                if (child.type === 'source') {
                    const s = sourcesByKey.get(child.key);
                    if (s && s.enabled && currentEffectivelyEnabled) {
                        effectivelyEnabled.set(child.key, true);
                    }
                } else if (child.type === 'group') {
                    const subGroup = groupsById.get(child.id);
                    if (subGroup) visit(subGroup, currentEffectivelyEnabled);
                }
            }
        };

        state.groups.forEach(gid => {
            const g = groupsById.get(gid);
            if (g) visit(g, true);
        });

        state.ungrouped.forEach(key => {
            const s = sourcesByKey.get(key);
            if (s && s.enabled) effectivelyEnabled.set(key, true);
        });

        return effectivelyEnabled;
    }

    function areAllAncestorsEnabled(keyOrId) {
        let parentId = parentMap.get(keyOrId);
        while (parentId) {
            const parentGroup = groupsById.get(parentId);
            if (!parentGroup || !parentGroup.enabled) {
                return false;
            }
            parentId = parentMap.get(parentId);
        }
        return true;
    }

    // --- Batch Delete Deletion Engine ---
    async function executeBatchDelete() {
        if (pendingBatchKeys.size === 0 || isDeletingSources) return;
        isDeletingSources = true;

        const keysToDelete = Array.from(pendingBatchKeys);
        const total = keysToDelete.length;
        let deletedCount = 0;

        showToast(getMessage('ui_deleting_count', [total.toString()]));

        for (const key of keysToDelete) {
            const source = sourcesByKey.get(key);
            if (!source || source.isDisabled) continue;

            // Step 1: Find and click the native more options button
            let nativeMoreBtn = findElement(DEPS.moreBtn, source.element);

            // Fallback: If disconnected, try to re-query the DOM
            if (!nativeMoreBtn || !document.body.contains(nativeMoreBtn)) {
                const freshCheckbox = findFreshCheckbox(key);
                if (freshCheckbox) {
                    const freshRow = freshCheckbox.closest(DEPS.row[0]) || freshCheckbox.closest(DEPS.row[1]);
                    if (freshRow) {
                        nativeMoreBtn = findElement(DEPS.moreBtn, freshRow);
                    }
                }
            }

            if (!nativeMoreBtn) continue;

            nativeMoreBtn.click();

            // Step 2: Wait for the CDK overlay menu to appear and contain the Delete option
            try {
                // The delay is important to let the UI react (framework animation/rendering)
                await new Promise(resolve => setTimeout(resolve, 150));

                // Usually the delete button has an aria-label="Delete" or text content "Delete" / "移除"
                // The exact DOM structure depends on NotebookLM's locale. We look for a menu item
                // containing the delete icon or the word "delete" (case insensitive in english).
                const menuItems = document.querySelectorAll('.cdk-overlay-container [role="menuitem"]');
                let deleteMenuItem = null;
                for (const item of menuItems) {
                    const iconText = (item.querySelector('mat-icon')?.textContent || '').trim().toLowerCase();
                    if (iconText === 'delete' || iconText === 'delete_forever' || iconText === 'remove_circle') {
                        deleteMenuItem = item;
                        break;
                    }
                    const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();
                    const testId = item.getAttribute('data-testid') || '';
                    if (ariaLabel.includes('delete') || ariaLabel.includes('remove') || testId.includes('delete') || testId.includes('remove')) {
                        deleteMenuItem = item;
                        break;
                    }
                    const text = item.textContent.toLowerCase();
                    if (text.includes('delete') || text.includes('remove') ||
                        text.includes('删除') || text.includes('移除') ||
                        text.includes('supprimer') || text.includes('löschen') || text.includes('eliminar') ||
                        text.includes('削除') || text.includes('삭제')) {
                        deleteMenuItem = item;
                        break;
                    }
                }

                if (deleteMenuItem) {
                    deleteMenuItem.click();

                    // Wait for the confirmation dialog to appear after clicking delete
                    await new Promise(resolve => setTimeout(resolve, 150));

                    const dialogs = document.querySelectorAll('mat-dialog-container, [role="dialog"], .cdk-dialog-container');
                    let confirmBtn = null;
                    for (const dialog of dialogs) {
                        const buttons = dialog.querySelectorAll('button');
                        const cancelPatterns = /cancel|取消|annuler|abbrechen|cancelar|キャンセル|취소/;

                        for (const btn of buttons) {
                            const btnText = btn.textContent.toLowerCase();
                            if (cancelPatterns.test(btnText)) continue;

                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const isPrimaryButton = btn.className.includes('primary') || btn.className.includes('warn');
                            const hasCheckIcon = btn.querySelector('mat-icon')?.textContent.trim() === 'check';
                            const deleteConfirmPattern = /delete|remove|削除|삭제|删除|移除|supprimer|löschen|eliminar|yes|ok|confirm|确定|确认/;

                            if (isPrimaryButton || hasCheckIcon || deleteConfirmPattern.test(btnText) || deleteConfirmPattern.test(ariaLabel)) {
                                confirmBtn = btn;
                                break;
                            }
                        }

                        if (!confirmBtn && buttons.length > 0) {
                            const warnBtn = Array.from(buttons).find(b => {
                                const t = b.textContent.toLowerCase();
                                return !cancelPatterns.test(t) && (b.className.includes('warn') || b.className.includes('primary'));
                            });
                            if (warnBtn) {
                                confirmBtn = warnBtn;
                            }
                        }

                        if (confirmBtn) break;
                    }

                    if (confirmBtn) {
                        confirmBtn.click();
                        deletedCount++;
                        // Limit delay to 50ms for hyper-fast batch delete visual effect while still allowing DOM tear down
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } else {
                        console.warn(`NotebookLM Source Management: Could not find confirmation button in dialog for source key: ${key}`);
                        // Try to close dialog by clicking escape or backdrop if possible, fallback to body click
                        document.body.click();
                    }

                } else {
                    // Close menu if delete button wasn't found (safety)
                    document.body.click();
                    console.warn(`NotebookLM Source Management: Could not find delete menu item for source key: ${key}`);
                }
            } catch (err) {
                console.error("NotebookLM Source Management: Error during automated deletion step", err);
                document.body.click(); // ensure menu is closed
            }
        }

        // Cleanup after all deletions are processed
        isDeletingSources = false;
        pendingBatchKeys.clear();
        state.isBatchMode = false;
        closeSourceActionMenu();

        showToast(getMessage('ui_deleted_toast', [deletedCount.toString()]));
        render(); // The heartbeat observer will catch the actual DOM removals eventually
    }


    function isSourceEffectivelyEnabled(source) {
        if (!source) return false;
        return source.enabled && areAllAncestorsEnabled(source.key) && isSourceWithinActiveIsolation(source.key);
    }

    function isGroupWithinActiveIsolation(groupId) {
        if (!activeIsolationGroupId) return true;
        const group = groupsById.get(groupId);
        const isolatedGroup = groupsById.get(activeIsolationGroupId);
        if (!group || !isolatedGroup) return false;
        return isDescendant(group, isolatedGroup, groupsById);
    }

    function isSourceWithinActiveIsolation(sourceKey) {
        if (!activeIsolationGroupId) return true;

        let currentParentId = parentMap.get(sourceKey);
        while (currentParentId) {
            if (currentParentId === activeIsolationGroupId) {
                return true;
            }
            currentParentId = parentMap.get(currentParentId);
        }

        return false;
    }

    function sourceMatchesCurrentFilters(source) {
        if (!source) return false;

        const filterQuery = (state.filterQuery || '').toLowerCase();
        if (filterQuery && (!source.lowercaseTitle || !source.lowercaseTitle.includes(filterQuery))) {
            return false;
        }

        if (state.activeTagId && !getSourceTagIds(source.key).includes(state.activeTagId)) {
            return false;
        }

        return true;
    }

    function hasActiveRenderFilters() {
        return Boolean((state.filterQuery || '').trim() || state.activeTagId);
    }

    function groupHasRenderableDescendant(group) {
        if (!group) return false;

        for (const child of group.children) {
            if (child.type === 'source') {
                const source = sourcesByKey.get(child.key);
                if (source && sourceMatchesCurrentFilters(source)) {
                    return true;
                }
                continue;
            }

            const childGroup = groupsById.get(child.id);
            if (childGroup && groupHasRenderableDescendant(childGroup)) {
                return true;
            }
        }

        return false;
    }

    function shouldRenderGroup(group) {
        if (!group) return false;
        if (!hasActiveRenderFilters()) return true;
        return groupHasRenderableDescendant(group);
    }

    function getSearchUiElements() {
        if (!shadowRoot) return {};

        return {
            controls: shadowRoot.querySelector('.sp-controls'),
            searchContainer: shadowRoot.querySelector('.sp-search-container'),
            searchInput: shadowRoot.getElementById('sp-search'),
            searchButton: shadowRoot.getElementById('sp-search-btn')
        };
    }

    function getCurrentSearchValue(searchInput) {
        if (searchInput && typeof searchInput.value === 'string') {
            return searchInput.value;
        }

        return state.filterQuery || '';
    }

    function hasCurrentSearchValue(searchInput) {
        return Boolean(getCurrentSearchValue(searchInput).trim());
    }

    function isSearchUiCurrentlyExpanded(searchInput) {
        return isSearchExpanded || hasCurrentSearchValue(searchInput);
    }

    function syncSearchUi() {
        const { controls, searchContainer, searchInput, searchButton } = getSearchUiElements();
        if (!controls || !searchContainer || !searchInput || !searchButton) return;

        const expanded = isSearchUiCurrentlyExpanded(searchInput);
        const label = getMessage('ui_filter_sources');

        controls.classList.toggle('is-search-expanded', expanded);
        searchContainer.classList.toggle('is-expanded', expanded);
        if (searchInput.value !== (state.filterQuery || '')) {
            searchInput.value = state.filterQuery || '';
        }
        searchInput.tabIndex = expanded ? 0 : -1;
        searchInput.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        searchButton.setAttribute('title', label);
        searchButton.setAttribute('aria-label', label);
        searchButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');

        if (!expanded && typeof searchInput.blur === 'function') {
            searchInput.blur();
        }
    }

    function expandSearch(options = {}) {
        const { focus = false } = options;
        isSearchExpanded = true;
        syncSearchUi();

        if (!focus) return;

        const { searchInput } = getSearchUiElements();
        if (searchInput && typeof searchInput.focus === 'function') {
            searchInput.focus();
        }
    }

    function collapseSearchIfEmpty() {
        const { searchInput } = getSearchUiElements();
        if (hasCurrentSearchValue(searchInput)) return false;

        isSearchExpanded = false;
        syncSearchUi();
        return true;
    }

    function handleSearchButtonClick(triggerSearch) {
        const { searchInput } = getSearchUiElements();
        if (!isSearchUiCurrentlyExpanded(searchInput)) {
            expandSearch({ focus: true });
            return 'expanded';
        }

        if (!hasCurrentSearchValue(searchInput)) {
            collapseSearchIfEmpty();
            return 'collapsed';
        }

        if (typeof triggerSearch === 'function') {
            triggerSearch();
        }

        return 'searched';
    }

    function handleSearchOutsideClick(event) {
        const target = event?.target;
        let didCloseAnyUi = false;

        if (
            activeSourceActionSourceKey &&
            target &&
            typeof target.closest === 'function' &&
            !target.closest('.sp-source-actions-button') &&
            !target.closest('.sp-source-actions-menu')
        ) {
            closeSourceActionMenu();
            didCloseAnyUi = true;
        }

        const { searchContainer, searchInput } = getSearchUiElements();
        if (
            searchContainer &&
            isSearchUiCurrentlyExpanded(searchInput) &&
            !hasCurrentSearchValue(searchInput)
        ) {
            if (target && typeof target.closest === 'function' && target.closest('.sp-search-container')) {
                if (didCloseAnyUi) {
                    render();
                }
                return didCloseAnyUi;
            }

            isSearchExpanded = false;
            syncSearchUi();
            didCloseAnyUi = true;
        }

        if (didCloseAnyUi) {
            render();
        }

        return didCloseAnyUi;
    }

    function handleDocumentOutsideClick(event) {
        if (!activeSourceActionSourceKey || !extensionHost) return false;

        const composedPath = typeof event?.composedPath === 'function' ? event.composedPath() : [];
        if (Array.isArray(composedPath) && composedPath.includes(extensionHost)) {
            return false;
        }

        return dismissSourceActionMenuAndRender();
    }

    function handleSourceActionMenuViewportChange() {
        return dismissSourceActionMenuAndRender();
    }

    function collectEffectiveSourceStates() {
        const effectiveStates = new Map();
        sourcesByKey.forEach((source, sourceKey) => {
            effectiveStates.set(sourceKey, isSourceEffectivelyEnabled(source));
        });
        return effectiveStates;
    }

    function syncSourcesToEffectiveState(previousStates = null) {
        const nextStates = collectEffectiveSourceStates();

        if (!previousStates) {
            nextStates.forEach((desiredState, sourceKey) => {
                syncSourceToPage(sourcesByKey.get(sourceKey), desiredState);
            });
            return nextStates;
        }

        nextStates.forEach((desiredState, sourceKey) => {
            if (previousStates.get(sourceKey) !== desiredState) {
                syncSourceToPage(sourcesByKey.get(sourceKey), desiredState);
            }
        });

        return nextStates;
    }

    // --- Persistence Functions ---
    function sendStateToStorage(key, data) {
        try {
            chrome.runtime.sendMessage({ type: 'SAVE_STATE', key, data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("NotebookLM Source Management 通信失败:", chrome.runtime.lastError);
                }
            });
        } catch (e) {
            console.warn("NotebookLM Source Management: Context invalidated. Please refresh the page.", e);
        }
    }

    const debouncedStorageSet = debounce((key, data) => {
        sendStateToStorage(key, data);
    }, 1500);

    function flushPendingStateSave() {
        if (typeof debouncedStorageSet.flush === 'function') {
            return debouncedStorageSet.flush();
        }
        return false;
    }

    function cancelPendingStateSave() {
        if (typeof debouncedStorageSet.cancel === 'function') {
            debouncedStorageSet.cancel();
        }
    }

    function buildPersistableState() {
        const sourceStateById = {};
        const persistedSourceTagsById = {};

        sourcesByKey.forEach((source, sourceKey) => {
            sourceStateById[sourceKey] = {
                enabled: Boolean(source.enabled),
                title: source.title,
                normalizedTitle: source.normalizedTitle || normalizeSourceText(source.title),
                fingerprint: source.fingerprint || '',
                identityType: source.identityType || 'fingerprint'
            };

            const tagIds = getSourceTagIds(sourceKey);
            if (tagIds.length > 0) {
                persistedSourceTagsById[sourceKey] = tagIds;
            }
        });

        return {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            groups: state.groups,
            groupsById: Object.fromEntries(groupsById),
            ungrouped: state.ungrouped,
            sourceStateById,
            customHeight,
            tagsById: Object.fromEntries(
                Array.from(tagsById.entries())
                    .map(([tagId, tag]) => [tagId, getSerializedTag(tag)])
                    .filter(([, tag]) => Boolean(tag))
            ),
            tagOrder: state.tagOrder.filter((tagId) => tagsById.has(tagId)),
            sourceTagsById: persistedSourceTagsById
        };
    }

    function saveState(options = {}) {
        if (!projectId) return;
        const { immediate = false } = options;
        const key = `sourcesPlusState_${projectId}`;
        const persistableState = buildPersistableState();

        if (immediate) {
            cancelPendingStateSave();
            sendStateToStorage(key, persistableState);
            return;
        }

        debouncedStorageSet(key, persistableState);
    }

    function handlePageLifecyclePersistence(event) {
        if (event?.type === 'visibilitychange' && document.visibilityState !== 'hidden') {
            return;
        }

        flushPendingStateSave();
    }

    function normalizeLoadedState(stateData) {
        if (!stateData || typeof stateData !== 'object') return null;

        if (stateData.schemaVersion === STORAGE_SCHEMA_VERSION) {
            pendingStorageUpgrade = false;
            return {
                schemaVersion: STORAGE_SCHEMA_VERSION,
                groups: Array.isArray(stateData.groups) ? stateData.groups : [],
                groupsById: stateData.groupsById || {},
                ungrouped: Array.isArray(stateData.ungrouped) ? stateData.ungrouped : [],
                sourceStateById: stateData.sourceStateById || {},
                customHeight: stateData.customHeight ?? null,
                tagsById: stateData.tagsById || {},
                tagOrder: Array.isArray(stateData.tagOrder) ? stateData.tagOrder : [],
                sourceTagsById: stateData.sourceTagsById || {}
            };
        }

        pendingStorageUpgrade = true;
        if (stateData.schemaVersion === 2) {
            return {
                schemaVersion: 2,
                groups: Array.isArray(stateData.groups) ? stateData.groups : [],
                groupsById: stateData.groupsById || {},
                ungrouped: Array.isArray(stateData.ungrouped) ? stateData.ungrouped : [],
                sourceStateById: stateData.sourceStateById || {},
                customHeight: stateData.customHeight ?? null,
                tagsById: {},
                tagOrder: [],
                sourceTagsById: {}
            };
        }

        return {
            schemaVersion: 1,
            groups: Array.isArray(stateData.groups) ? stateData.groups : [],
            groupsById: stateData.groupsById || {},
            ungrouped: Array.isArray(stateData.ungrouped) ? stateData.ungrouped : [],
            legacyEnabledMap: stateData.enabledMap || {},
            customHeight: stateData.customHeight ?? null,
            tagsById: {},
            tagOrder: [],
            sourceTagsById: {}
        };
    }

    function getSourceElements(parent = document) {
        return Array.from(queryAllElements(DEPS.row, parent));
    }

    function hasRenderableSourceRows(parent = document) {
        return getSourceElements(parent).length > 0;
    }

    function hasPersistedSourceRefs(loadedState) {
        if (!loadedState || typeof loadedState !== 'object') return false;

        const hasGroupedSources = Object.values(loadedState.groupsById || {}).some((group) => (
            Array.isArray(group?.children) && group.children.some((child) => child?.type === 'source')
        ));
        if (hasGroupedSources) return true;

        if (Array.isArray(loadedState.ungrouped) && loadedState.ungrouped.length > 0) {
            return true;
        }

        return Boolean(
            loadedState.sourceStateById &&
            Object.keys(loadedState.sourceStateById).length > 0
        );
    }

    function hasPersistableManagerState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        if (hasPersistedSourceRefs(snapshot)) return true;
        if (Array.isArray(snapshot.groups) && snapshot.groups.length > 0) return true;
        if (snapshot.groupsById && Object.keys(snapshot.groupsById).length > 0) return true;
        if (snapshot.tagsById && Object.keys(snapshot.tagsById).length > 0) return true;
        if (Array.isArray(snapshot.tagOrder) && snapshot.tagOrder.length > 0) return true;
        return snapshot.customHeight != null;
    }

    function capturePendingPanelReattachState() {
        const liveSnapshot = buildPersistableState();
        if (hasPersistableManagerState(liveSnapshot)) {
            return cloneSerializableData(liveSnapshot);
        }

        if (pendingInitialLoadedState && hasPersistableManagerState(pendingInitialLoadedState)) {
            return cloneSerializableData(pendingInitialLoadedState);
        }

        return null;
    }

    function restoreInitialLoadedState(loadedState) {
        if (loadedState && hasPersistedSourceRefs(loadedState) && !hasRenderableSourceRows()) {
            pendingInitialLoadedState = loadedState;
            return { deferred: true, shouldUpgradeStorage: false };
        }

        const shouldUpgradeStorage = scanAndSyncSources(loadedState, true);
        pendingInitialLoadedState = null;
        return { deferred: false, shouldUpgradeStorage };
    }

    function flushPendingInitialLoadedState() {
        if (!pendingInitialLoadedState) {
            return { restored: false, deferred: false, shouldUpgradeStorage: false };
        }

        if (!hasRenderableSourceRows()) {
            return { restored: false, deferred: true, shouldUpgradeStorage: false };
        }

        const shouldUpgradeStorage = scanAndSyncSources(pendingInitialLoadedState, true);
        pendingInitialLoadedState = null;
        return { restored: true, deferred: false, shouldUpgradeStorage };
    }

    function applyLoadedStateToManager(loadedState) {
        if (loadedState && loadedState.customHeight != null) {
            customHeight = loadedState.customHeight;
            const container = shadowRoot?.querySelector('.sp-container');
            if (container) container.style.height = `${customHeight}px`;
        }

        const initialRestore = restoreInitialLoadedState(loadedState);
        if (initialRestore.deferred) {
            render();
            return;
        }

        render();
        if (initialRestore.shouldUpgradeStorage) {
            pendingStorageUpgrade = false;
            saveState();
        }
    }

    function loadState(callback) {
        if (!projectId) {
            pendingStorageUpgrade = false;
            return callback(null);
        }

        const key = `sourcesPlusState_${projectId}`;
        try {
            chrome.runtime.sendMessage({ type: 'LOAD_STATE', key }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("NotebookLM Source Management 未能连接后台:", chrome.runtime.lastError);
                    pendingStorageUpgrade = false;
                    return callback(null);
                }

                const loadedState = normalizeLoadedState(response && response.data);
                if (loadedState && loadedState.customHeight != null) {
                    customHeight = loadedState.customHeight;
                    const container = shadowRoot.querySelector('.sp-container');
                    if (container) container.style.height = `${customHeight}px`;
                }

                callback(loadedState);
            });
        } catch (e) {
            console.warn("NotebookLM Source Management: Context invalidated during load. Please refresh the page.", e);
            pendingStorageUpgrade = false;
            callback(null);
        }
    }

    // ==========================================
    // UI RENDERING - MODALS
    // ==========================================

    function renderMoveToFolderModal(sourceKeys) {
        if (!shadowRoot) return;

        // Normalize single key to array for unified processing
        const keys = Array.isArray(sourceKeys) ? sourceKeys : (typeof sourceKeys === 'string' ? [sourceKeys] : Array.from(sourceKeys));
        if (keys.length === 0) return;

        // Cleanup existing modal if any
        closeMoveToFolderModal();

        const backdrop = el('div', { className: 'sp-overlay-backdrop', id: 'sp-move-backdrop' });
        const modal = el('div', { className: 'sp-folder-modal', id: 'sp-move-modal' });

        const header = el('div', { className: 'sp-folder-modal-header' }, [
            el('h3', { className: 'sp-folder-modal-title' }, [getMessage('ui_move_to_folder')])
        ]);

        const content = el('div', { className: 'sp-folder-modal-content' });

        let folderFound = false;
        // Collect all groups from root
        state.groups.forEach(groupId => { // Iterate through top-level group IDs
            const group = groupsById.get(groupId);
            if (group) { // Ensure group exists
                folderFound = true;
                const folderBtn = el('button', { className: 'sp-folder-option' }, [
                    el('span', { className: 'google-symbols' }, ['folder']),
                    el('span', { className: 'sp-folder-option-title' }, [group.title || getMessage('ui_group_untitled')])
                ]);

                folderBtn.addEventListener('click', () => {
                    executeMoveToFolder(keys, group.id);
                });
                content.appendChild(folderBtn);
            }
        });


        if (!folderFound) {
            const emptyText = getMessage('ui_empty_folders');
            content.appendChild(el('div', { className: 'sp-folder-empty' }, [emptyText]));
        }

        const footer = el('div', { className: 'sp-folder-modal-footer' }, [
            el('button', { className: 'sp-modal-cancel' }, [getMessage('ui_cancel')])
        ]);

        footer.querySelector('.sp-modal-cancel').addEventListener('click', closeMoveToFolderModal);
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeMoveToFolderModal();
        });

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);

        shadowRoot.appendChild(backdrop);
        shadowRoot.appendChild(modal);

        // Animate in
        // Small delay to ensure DOM is updated before adding visible class for transition
        requestAnimationFrame(() => {
            backdrop.classList.add('visible');
            modal.classList.add('visible');
        });
    }

    function closeMoveToFolderModal() {
        if (!shadowRoot) return;
        const backdrop = shadowRoot.getElementById('sp-move-backdrop');
        const modal = shadowRoot.getElementById('sp-move-modal');

        if (modal && backdrop) {
            modal.classList.remove('visible');
            modal.classList.add('closing');
            backdrop.classList.remove('visible');

            // Wait for animation to finish before removing from DOM
            setTimeout(() => {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            }, 300); // match transition length
        } else {
            // Fallback cleanup
            if (backdrop) backdrop.remove();
            if (modal) modal.remove();
        }
    }

    function executeMoveToFolder(sourceKeys, targetGroupId) {
        const targetGroup = groupsById.get(targetGroupId);
        if (!targetGroup) {
            closeMoveToFolderModal();
            return;
        }

        const keys = Array.isArray(sourceKeys) ? sourceKeys : (typeof sourceKeys === 'string' ? [sourceKeys] : Array.from(sourceKeys));

        keys.forEach(sourceKey => {
            const sourceData = sourcesByKey.get(sourceKey);
            if (sourceData) {
                // Remove from its current place in the tree (ungrouped or group)
                removeSourceFromTree(sourceKey);

                // Add to target group
                targetGroup.children.push({
                    type: 'source',
                    key: sourceKey
                });
            }
        });

        // After moving from batch mode, exit batch mode
        if (state.isBatchMode && pendingBatchKeys.size > 0) {
            state.isBatchMode = false;
            pendingBatchKeys.clear();
        }

        closeSourceActionMenu();
        buildParentMap();
        saveState({ immediate: true });
        render();
        closeMoveToFolderModal();
    }

    function closeTagModal() {
        if (!shadowRoot) return;
        const backdrop = shadowRoot.getElementById('sp-tag-backdrop');
        const modal = shadowRoot.getElementById('sp-tag-modal');

        if (modal && backdrop) {
            modal.classList.remove('visible');
            modal.classList.add('closing');
            backdrop.classList.remove('visible');

            setTimeout(() => {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                if (modal.parentNode) modal.parentNode.removeChild(modal);
            }, 300);
            return;
        }

        if (backdrop) backdrop.remove();
        if (modal) modal.remove();
    }

    function createTagColorControl(initialColor, options = {}) {
        const {
            allowUnset = false,
            inputIdPrefix = 'sp-tag-color'
        } = options;

        let currentColor = normalizeTagColor(initialColor);
        let fallbackColor = currentColor || getDefaultTagColor();
        if (!currentColor && !allowUnset) {
            currentColor = fallbackColor;
        }

        const presetButtons = [];
        const presetChildren = [];

        if (allowUnset) {
            const neutralButton = el('button', {
                type: 'button',
                className: 'sp-tag-color-swatch sp-tag-color-swatch-none',
                title: getMessage('ui_tag_color_none')
            }, [el('span', { className: 'google-symbols' }, ['block'])]);
            neutralButton.addEventListener('click', () => {
                currentColor = null;
                syncColorUi();
            });
            presetButtons.push({ button: neutralButton, color: null });
            presetChildren.push(neutralButton);
        }

        TAG_COLOR_PRESETS.forEach((presetColor) => {
            const presetButton = el('button', {
                type: 'button',
                className: 'sp-tag-color-swatch',
                title: presetColor,
                style: getTagColorPreviewStyle(presetColor)
            });
            presetButton.addEventListener('click', () => {
                currentColor = presetColor;
                fallbackColor = presetColor;
                syncColorUi();
            });
            presetButtons.push({ button: presetButton, color: presetColor });
            presetChildren.push(presetButton);
        });

        const presetContainer = el('div', {
            className: 'sp-tag-color-presets',
            role: 'list'
        }, presetChildren);
        const colorInput = el('input', {
            id: `${inputIdPrefix}-native`,
            className: 'sp-tag-color-native-input',
            type: 'color',
            value: currentColor || fallbackColor,
            'aria-label': getMessage('ui_tag_color_custom')
        });
        const colorTriggerSwatch = el('span', {
            className: 'sp-tag-color-trigger-swatch',
            style: getTagColorPreviewStyle(currentColor || fallbackColor)
        });
        const colorTrigger = el('button', {
            type: 'button',
            className: 'sp-button sp-tag-color-trigger',
            title: getMessage('ui_tag_color_custom')
        }, [
            colorTriggerSwatch,
            el('span', {}, [getMessage('ui_tag_color_custom')])
        ]);
        const hexInput = el('input', {
            id: `${inputIdPrefix}-hex`,
            className: 'sp-tag-input sp-tag-color-hex',
            type: 'text',
            value: currentColor || '',
            placeholder: getMessage('ui_tag_color_hex'),
            'aria-label': getMessage('ui_tag_color_hex'),
            maxlength: '7',
            autocapitalize: 'characters',
            spellcheck: 'false'
        });

        colorTrigger.addEventListener('click', () => {
            if (typeof colorInput.click === 'function') {
                colorInput.click();
            }
        });

        colorInput.addEventListener('input', () => {
            const nextColor = normalizeTagColor(colorInput.value);
            if (!nextColor) return;
            currentColor = nextColor;
            fallbackColor = nextColor;
            syncColorUi();
        });

        hexInput.addEventListener('input', () => {
            const nextValue = normalizeTagColorInputValue(hexInput.value);
            if (hexInput.value !== nextValue) {
                hexInput.value = nextValue;
            }

            const nextColor = normalizeTagColor(nextValue);
            if (nextColor) {
                currentColor = nextColor;
                fallbackColor = nextColor;
                syncColorUi();
                return;
            }

            if (!nextValue && allowUnset) {
                currentColor = null;
                syncColorUi();
            }
        });

        hexInput.addEventListener('blur', () => {
            syncColorUi();
        });

        const root = el('div', { className: 'sp-tag-color-group' }, [
            el('div', { className: 'sp-tag-color-heading' }, [getMessage('ui_tag_color')]),
            presetContainer,
            el('div', { className: 'sp-tag-color-input-row' }, [
                colorTrigger,
                colorInput,
                hexInput
            ])
        ]);

        function syncColorUi() {
            presetButtons.forEach(({ button, color }) => {
                const isActive = color === currentColor || (!color && !currentColor);
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });

            const displayColor = currentColor || fallbackColor || getDefaultTagColor();
            colorInput.value = displayColor;
            colorTriggerSwatch.setAttribute('style', getTagColorPreviewStyle(displayColor));
            hexInput.value = currentColor || '';
        }

        syncColorUi();

        return {
            root,
            hexInput,
            colorInput,
            getValue: () => currentColor
        };
    }

    function createTagEditor(options = {}) {
        const {
            className = '',
            initialLabel = '',
            initialColor = null,
            submitLabel,
            submitButtonId = '',
            submitButtonClassName = 'sp-button',
            inputId = '',
            allowUnsetColor = false,
            onSubmit,
            onCancel = null
        } = options;

        const labelInput = el('input', {
            id: inputId || null,
            className: 'sp-tag-input',
            placeholder: getMessage('ui_create_tag_placeholder'),
            value: initialLabel
        });
        const colorControl = createTagColorControl(initialColor, {
            allowUnset: allowUnsetColor,
            inputIdPrefix: inputId || 'sp-tag-color'
        });
        const actionChildren = [];

        if (typeof onCancel === 'function') {
            const cancelButton = el('button', {
                type: 'button',
                className: 'sp-modal-cancel'
            }, [getMessage('ui_cancel')]);
            cancelButton.addEventListener('click', onCancel);
            actionChildren.push(cancelButton);
        }

        const submitButton = el('button', {
            type: 'button',
            id: submitButtonId || null,
            className: submitButtonClassName
        }, [submitLabel]);
        actionChildren.push(submitButton);

        const root = el('div', {
            className: ['sp-tag-editor', className].filter(Boolean).join(' ')
        }, [
            labelInput,
            colorControl.root,
            el('div', { className: 'sp-tag-editor-actions' }, actionChildren)
        ]);

        const handleSubmit = () => {
            if (typeof onSubmit === 'function') {
                onSubmit({
                    label: labelInput.value,
                    color: colorControl.getValue()
                });
            }
        };
        const handleEditorKeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
                return;
            }

            if (event.key === 'Escape' && typeof onCancel === 'function') {
                event.preventDefault();
                onCancel();
            }
        };

        submitButton.addEventListener('click', handleSubmit);
        labelInput.addEventListener('keydown', handleEditorKeydown);
        colorControl.hexInput.addEventListener('keydown', handleEditorKeydown);

        return {
            root,
            labelInput,
            colorControl
        };
    }

    function renderTagModal(sourceKey = null, modalState = null) {
        if (!shadowRoot) return;

        const normalizedModalState = Array.isArray(modalState)
            ? { draftTagIds: modalState }
            : (modalState && typeof modalState === 'object' ? modalState : {});
        const source = sourceKey ? sourcesByKey.get(sourceKey) : null;
        const selectedTagIds = new Set(sourceKey
            ? (normalizedModalState.draftTagIds || getSourceTagIds(sourceKey))
            : []);
        const usageCounts = getTagUsageCounts();
        const editingTagId = !source ? normalizedModalState.editingTagId || null : null;

        closeTagModal();

        const backdrop = el('div', { className: 'sp-overlay-backdrop', id: 'sp-tag-backdrop' });
        const modal = el('div', { className: 'sp-folder-modal sp-tag-modal', id: 'sp-tag-modal' });
        const title = source ? getMessage('ui_edit_tags') : getMessage('ui_manage_tags');
        const header = el('div', { className: 'sp-folder-modal-header' }, [
            el('h3', { className: 'sp-folder-modal-title' }, [title])
        ]);
        const content = el('div', { className: 'sp-folder-modal-content sp-tag-modal-content' });

        const createEditor = createTagEditor({
            className: 'sp-tag-create-row',
            submitLabel: getMessage('ui_create_tag'),
            submitButtonId: 'sp-create-tag-btn',
            inputId: 'sp-tag-name-input',
            initialColor: getDefaultTagColor(),
            onSubmit: ({ label, color }) => {
                const newTagId = createTag(label, { color });
                if (!newTagId) return;

                createEditor.labelInput.value = '';
                if (source) {
                    selectedTagIds.add(newTagId);
                    render();
                    saveState({ immediate: true });
                    renderTagModal(sourceKey, { draftTagIds: Array.from(selectedTagIds) });
                    return;
                }

                saveState({ immediate: true });
                render();
                renderTagModal();
            }
        });
        content.appendChild(createEditor.root);

        if (state.tagOrder.length === 0) {
            content.appendChild(el('div', { className: 'sp-folder-empty' }, [
                source ? getMessage('ui_no_tags_for_source') : getMessage('ui_no_tags')
            ]));
        } else if (source) {
            state.tagOrder.forEach((tagId) => {
                const tag = tagsById.get(tagId);
                if (!tag) return;

                content.appendChild(el('label', { className: 'sp-tag-option' }, [
                    el('input', {
                        type: 'checkbox',
                        className: 'sp-tag-option-checkbox',
                        dataset: { tagId },
                        checked: selectedTagIds.has(tagId)
                    }),
                    el('span', { className: 'sp-tag-option-label' }, [tag.label])
                ]));
            });
        } else {
            state.tagOrder.forEach((tagId) => {
                const tag = tagsById.get(tagId);
                if (!tag) return;

                const editButton = el('button', {
                    type: 'button',
                    className: 'sp-tag-row-button sp-edit-tag-btn',
                    dataset: { tagId },
                    title: getMessage('ui_tag_edit_title')
                }, [el('span', { className: 'google-symbols' }, ['edit'])]);
                editButton.addEventListener('click', () => {
                    renderTagModal(null, { editingTagId: tagId });
                });

                const deleteButton = el('button', {
                    type: 'button',
                    className: 'sp-tag-row-button sp-delete-tag-btn',
                    dataset: { tagId },
                    title: getMessage('ui_tag_delete')
                }, [el('span', { className: 'google-symbols' }, ['delete'])]);
                deleteButton.addEventListener('click', () => {
                    const shouldDelete = typeof window.confirm !== 'function'
                        ? true
                        : window.confirm(getMessage('ui_tag_delete_confirm', [tag.label]));
                    if (!shouldDelete) return;

                    deleteTag(tagId);
                    saveState({ immediate: true });
                    render();
                    renderTagModal();
                });

                const item = el('div', {
                    className: 'sp-tag-manage-item' + (editingTagId === tagId ? ' is-editing' : '')
                }, [
                    el('div', { className: 'sp-tag-row' }, [
                        el('span', {
                            className: 'sp-tag-row-color' + (tag.color ? '' : ' is-neutral'),
                            title: tag.color || getMessage('ui_tag_color_none'),
                            style: getTagColorPreviewStyle(tag.color)
                        }),
                        el('span', { className: 'sp-tag-row-label' }, [tag.label]),
                        el('span', { className: 'sp-tag-row-count' }, [String(usageCounts.get(tagId) || 0)]),
                        editButton,
                        deleteButton
                    ])
                ]);

                if (editingTagId === tagId) {
                    const editEditor = createTagEditor({
                        className: 'sp-tag-edit-row',
                        initialLabel: tag.label,
                        initialColor: tag.color,
                        submitLabel: getMessage('ui_tag_update'),
                        submitButtonClassName: 'sp-button',
                        inputId: `sp-edit-tag-${tagId}`,
                        allowUnsetColor: true,
                        onCancel: () => renderTagModal(),
                        onSubmit: ({ label, color }) => {
                            const result = updateTag(tagId, { label, color });
                            if (!result || result !== tagId) return;

                            saveState({ immediate: true });
                            render();
                            renderTagModal();
                        }
                    });
                    item.appendChild(editEditor.root);
                }

                content.appendChild(item);
            });
        }

        const footerChildren = [
            el('button', { className: 'sp-modal-cancel' }, [getMessage('ui_cancel')])
        ];
        if (source) {
            footerChildren.push(el('button', { className: 'sp-button', id: 'sp-save-tags-btn' }, [getMessage('ui_save')]));
        }
        const footer = el('div', { className: 'sp-folder-modal-footer' }, footerChildren);

        footer.querySelector('.sp-modal-cancel').addEventListener('click', closeTagModal);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) {
                closeTagModal();
            }
        });

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(footer);
        shadowRoot.appendChild(backdrop);
        shadowRoot.appendChild(modal);

        if (source) {
            modal.querySelector('#sp-save-tags-btn').addEventListener('click', () => {
                const nextTagIds = Array.from(modal.querySelectorAll('.sp-tag-option-checkbox:checked'))
                    .reduce((acc, input) => {
                        const tagId = input.dataset.tagId;
                        if (tagId) acc.push(tagId);
                        return acc;
                    }, []);
                setSourceTagIds(sourceKey, nextTagIds);
                saveState({ immediate: true });
                render();
                closeTagModal();
            });
        }

        requestAnimationFrame(() => {
            backdrop.classList.add('visible');
            modal.classList.add('visible');

            const focusTarget = editingTagId
                ? modal.querySelector(`#sp-edit-tag-${editingTagId}`)
                : modal.querySelector('#sp-tag-name-input');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }
        });
    }

    // ==========================================
    // DATA AND UTILS
    // ==========================================

    // --- Core Render & Logic ---
    function getGroupEffectiveState(group) {
        const descendantKeys = [];
        const getKeys = (g) => {
            if (!g) return;
            g.children.forEach(c => {
                if (c.type === 'source') descendantKeys.push(c.key);
                else getKeys(groupsById.get(c.id));
            });
        };
        getKeys(group);

        const total = descendantKeys.length;
        const on = descendantKeys.filter(key => {
            return isSourceEffectivelyEnabled(sourcesByKey.get(key));
        }).length;

        // MODIFIED: This function now only returns the counts, not a tri-state value.
        return { on, total };
    }

    // --- DOM Diffing Helpers ---
    function patchNode(target, source) {
        if (target.nodeType !== source.nodeType) {
            target.parentNode.replaceChild(source.cloneNode(true), target);
            return;
        }
        if (target.nodeType === Node.TEXT_NODE) {
            if (target.textContent !== source.textContent) {
                target.textContent = source.textContent;
            }
            return;
        }
        if (target.nodeName !== source.nodeName) {
            target.parentNode.replaceChild(source.cloneNode(true), target);
            return;
        }
        
        const targetAttrs = target.attributes;
        const sourceAttrs = source.attributes;
        for (let i = targetAttrs.length - 1; i >= 0; i--) {
            const name = targetAttrs[i].name;
            if (!source.hasAttribute(name)) {
                target.removeAttribute(name);
            }
        }
        for (let i = 0; i < sourceAttrs.length; i++) {
            const name = sourceAttrs[i].name;
            const value = sourceAttrs[i].value;
            if (target.getAttribute(name) !== value) {
                target.setAttribute(name, value);
            }
        }
        
        if (target.tagName === 'INPUT') {
            if (target.checked !== source.checked) target.checked = source.checked;
            if (target.value !== source.value) target.value = source.value;
            if (target.disabled !== source.disabled) target.disabled = source.disabled;
        }
        
        const targetChildren = Array.from(target.childNodes);
        const sourceChildren = Array.from(source.childNodes);
        const maxLength = Math.max(targetChildren.length, sourceChildren.length);
        
        for (let i = 0; i < maxLength; i++) {
            if (i >= targetChildren.length) {
                target.appendChild(sourceChildren[i].cloneNode(true));
            } else if (i >= sourceChildren.length) {
                target.removeChild(targetChildren[i]);
            } else {
                patchNode(targetChildren[i], sourceChildren[i]);
            }
        }
    }

    function patchChildren(target, sourceFragment) {
        const targetChildren = Array.from(target.childNodes);
        const sourceChildren = Array.from(sourceFragment.childNodes);
        const maxLength = Math.max(targetChildren.length, sourceChildren.length);
        
        for (let i = 0; i < maxLength; i++) {
            if (i >= targetChildren.length) {
                target.appendChild(sourceChildren[i].cloneNode(true));
            } else if (i >= sourceChildren.length) {
                target.removeChild(targetChildren[i]);
            } else {
                patchNode(targetChildren[i], sourceChildren[i]);
            }
        }
    }

    function renderViewStateBar() {
        if (!shadowRoot) return;
        const container = shadowRoot.getElementById('sp-view-state');
        if (!container) return;

        const fragment = document.createDocumentFragment();
        const isolatedGroup = activeIsolationGroupId ? groupsById.get(activeIsolationGroupId) : null;
        const activeTag = state.activeTagId ? tagsById.get(state.activeTagId) : null;

        if (isolatedGroup) {
            fragment.appendChild(el('div', { className: 'sp-view-banner' }, [
                el('div', { className: 'sp-view-banner-copy' }, [
                    el('span', { className: 'sp-view-banner-label' }, [getMessage('ui_isolation_active', [isolatedGroup.title])])
                ]),
                el('button', { className: 'sp-button sp-view-banner-btn', id: 'sp-clear-isolate-btn' }, [getMessage('ui_exit_isolate')])
            ]));
        }

        if (activeTag) {
            fragment.appendChild(el('div', { className: 'sp-view-banner' }, [
                el('div', { className: 'sp-view-banner-copy' }, [
                    el('span', { className: 'sp-view-banner-label' }, [getMessage('ui_tag_filter_active', [activeTag.label])])
                ]),
                el('button', { className: 'sp-button sp-view-banner-btn', id: 'sp-clear-tag-filter-btn' }, [getMessage('ui_clear_tag_filter')])
            ]));
        }

        container.hidden = fragment.childNodes.length === 0;
        patchChildren(container, fragment);
    }

    function getSourceActionMenuLayer() {
        if (!shadowRoot) return null;

        let layer = shadowRoot.getElementById('sp-source-actions-layer');
        if (layer) return layer;

        layer = document.createElement('div');
        layer.id = 'sp-source-actions-layer';
        layer.className = 'sp-source-actions-layer';
        layer.addEventListener('click', handleInteraction);
        shadowRoot.appendChild(layer);
        return layer;
    }

    function renderSourceActionMenuLayer() {
        const layer = getSourceActionMenuLayer();
        if (
            !layer ||
            !layer.childNodes ||
            typeof layer.appendChild !== 'function' ||
            typeof layer.removeChild !== 'function'
        ) {
            return;
        }

        const fragment = document.createDocumentFragment();
        const sourceKey = activeSourceActionSourceKey;
        const source = sourceKey ? sourcesByKey.get(sourceKey) : null;

        if (sourceKey && source && canOpenSourceActionMenu(source)) {
            const actionButton = findSourceActionButton(sourceKey);
            sourceActionMenuPosition = getSourceActionMenuPosition(actionButton);
        }

        if (sourceKey && source && sourceActionMenuPosition && canOpenSourceActionMenu(source)) {
            fragment.appendChild(el('div', {
                className: 'sp-source-actions-menu' + (sourceActionMenuPosition.placement === 'top' ? ' is-top' : ''),
                role: 'menu',
                'aria-label': getMessage('ui_source_actions'),
                style: `top:${Math.round(sourceActionMenuPosition.top)}px;left:${Math.round(sourceActionMenuPosition.left)}px;`
            }, [
                el('button', {
                    type: 'button',
                    className: 'sp-source-actions-menu-item',
                    dataset: { sourceKey, action: 'tags' },
                    role: 'menuitem',
                    title: getMessage('ui_edit_tags')
                }, [
                    el('span', { className: 'google-symbols' }, ['sell']),
                    el('span', { className: 'sp-source-actions-menu-label' }, [getMessage('ui_edit_tags')])
                ]),
                el('button', {
                    type: 'button',
                    className: 'sp-source-actions-menu-item',
                    dataset: { sourceKey, action: 'move' },
                    role: 'menuitem',
                    title: getMessage('ui_move_to_folder')
                }, [
                    el('span', { className: 'google-symbols' }, ['drive_file_move']),
                    el('span', { className: 'sp-source-actions-menu-label' }, [getMessage('ui_move_to_folder')])
                ]),
                el('button', {
                    type: 'button',
                    className: 'sp-source-actions-menu-item',
                    dataset: { sourceKey, action: 'native-more' },
                    role: 'menuitem',
                    title: getMessage('ui_open_native_menu')
                }, [
                    el('span', { className: 'google-symbols' }, ['open_in_new']),
                    el('span', { className: 'sp-source-actions-menu-label' }, [getMessage('ui_open_native_menu')])
                ])
            ]));
        }

        patchChildren(layer, fragment);
    }

    function createSourceGlyphIcon(iconName, iconColorClass) {
        return el('mat-icon', { className: `${iconColorClass || 'icon-color'} mat-icon google-symbols` }, [iconName]);
    }

    function createGroupTitleIconElement() {
        return el('span', { className: 'sp-group-title-icon', 'aria-hidden': 'true' }, [
            el('span', { className: 'google-symbols' }, ['folder'])
        ]);
    }

    function replaceSourceIconWithFallback(imageElement, source) {
        if (!imageElement || imageElement.__spFallbackApplied) return;
        imageElement.__spFallbackApplied = true;

        const parent = imageElement.parentNode;
        if (!parent) return;

        const fallbackIcon = createSourceGlyphIcon(source.iconName, source.iconColorClass);
        if (typeof parent.replaceChildren === 'function') {
            parent.replaceChildren(fallbackIcon);
            return;
        }

        if (Array.isArray(parent.childNodes)) {
            parent.childNodes.length = 0;
        }
        if (Array.isArray(parent.children)) {
            parent.children.length = 0;
        }
        if (typeof parent.appendChild === 'function') {
            parent.appendChild(fallbackIcon);
        }
    }

    function createSourceIconElement(source, isFailed = false) {
        if (source?.isLoading) {
            return el('div', { className: 'sp-spinner' });
        }

        if (isFailed) {
            return createSourceGlyphIcon('error', source?.iconColorClass);
        }

        if (!source?.iconImageUrl) {
            return createSourceGlyphIcon(source?.iconName || 'article', source?.iconColorClass);
        }

        const imageEl = el('img', {
            className: 'source-icon-image',
            src: source.iconImageUrl,
            alt: '',
            draggable: 'false',
            referrerpolicy: 'no-referrer'
        });
        if (typeof imageEl.addEventListener === 'function') {
            imageEl.addEventListener('error', () => replaceSourceIconWithFallback(imageEl, source));
        }
        return imageEl;
    }

    function render() {
        if (!shadowRoot) return;
        const listContainer = shadowRoot.querySelector('#sources-list');
        if (!listContainer) return;

        syncActiveSourceActionMenuState();
        syncSearchUi();
        renderViewStateBar();

        const fragment = document.createDocumentFragment();
        const activeFilters = hasActiveRenderFilters();

        const renderSourceItem = (source) => {
            if (!source || !sourceMatchesCurrentFilters(source)) return null;
            const isGated = !areAllAncestorsEnabled(source.key) || !isSourceWithinActiveIsolation(source.key);
            const isFailed = source.isDisabled && !source.isLoading;
            const isLoading = source.isLoading;
            const showSourceActionButton = !state.isBatchMode;
            const canOpenActions = canOpenSourceActionMenu(source);
            const isSourceActionMenuOpen = canOpenActions && activeSourceActionSourceKey === source.key;
            const orderedSourceTags = getSourceTagIds(source.key)
                .map((tagId) => tagsById.get(tagId))
                .filter(Boolean);

            let extraClasses = '';
            if (isGated) extraClasses += ' gated';
            if (isFailed) extraClasses += ' failed-source';
            if (isLoading) extraClasses += ' loading-source';
            if (state.isBatchMode && pendingBatchKeys.has(source.key)) extraClasses += ' selected-for-batch';

            let titleAttr = false;
            if (isFailed) titleAttr = getMessage('ui_source_import_failed');
            if (isLoading) titleAttr = getMessage('ui_source_parsing');

            return el('div', {
                className: 'source-item' + extraClasses,
                draggable: !state.isBatchMode && !isFailed && !isLoading ? 'true' : 'false',
                dataset: { sourceKey: source.key },
                title: titleAttr
            }, [
                el('div', { className: 'icon-container' }, [
                    createSourceIconElement(source, isFailed)
                ]),
                showSourceActionButton ? el('div', {
                    className: 'sp-source-actions-anchor' + (isSourceActionMenuOpen ? ' is-open' : '')
                }, [
                    el('button', {
                        type: 'button',
                        className: 'sp-source-actions-button',
                        dataset: { sourceKey: source.key },
                        title: getMessage('ui_source_actions'),
                        'aria-label': getMessage('ui_source_actions'),
                        'aria-haspopup': 'menu',
                        'aria-expanded': isSourceActionMenuOpen ? 'true' : 'false',
                        disabled: !canOpenActions
                    }, [
                        el('span', { className: 'google-symbols' }, ['more_horiz'])
                    ])
                ]) : '',
                el('div', { className: 'title-container' }, [
                    el('div', { className: 'source-title-text' }, [source.title]),
                    orderedSourceTags.length > 0 ? el('div', { className: 'source-tag-list' }, orderedSourceTags.map((tag) => (
                        el('button', {
                            className: 'sp-tag-pill' + (state.activeTagId === tag.id ? ' is-active' : ''),
                            dataset: { tagId: tag.id },
                            title: getMessage('ui_tag_filter_active', [tag.label]),
                            style: getTagStyleVars(tag, state.activeTagId === tag.id)
                        }, [tag.label])
                    ))) : ''
                ]),
                el('div', { className: 'checkbox-container' }, [
                    state.isBatchMode
                        ? el('input', {
                            type: 'checkbox',
                            className: 'sp-batch-checkbox sp-checkbox',
                            dataset: { sourceKey: source.key },
                            checked: pendingBatchKeys.has(source.key),
                            disabled: isFailed || isLoading
                        })
                        : el('input', {
                            type: 'checkbox',
                            className: 'sp-checkbox',
                            dataset: { sourceKey: source.key },
                            checked: source.enabled,
                            disabled: isFailed || isLoading
                        })
                ])
            ]);
        };

        const renderGroup = (group, level) => {
            if (!shouldRenderGroup(group)) return null;

            const isGated = !group.enabled || !areAllAncestorsEnabled(group.id) || !isGroupWithinActiveIsolation(group.id);
            const { on, total } = getGroupEffectiveState(group);
            const groupTitle = group.title || getMessage('ui_group_untitled');
            const childrenElements = [];

            group.children.forEach((child) => {
                if (child.type === 'source') {
                    const sourceElement = renderSourceItem(sourcesByKey.get(child.key));
                    if (sourceElement) childrenElements.push(sourceElement);
                    return;
                }

                const childGroup = groupsById.get(child.id);
                if (!childGroup) return;
                const childElement = renderGroup(childGroup, level + 1);
                if (childElement) childrenElements.push(childElement);
            });

            if (childrenElements.length === 0 && !activeFilters) {
                childrenElements.push(el('div', { className: 'sp-empty-state' }, [getMessage('ui_empty_group')]));
            }

            const groupEl = el('div', {
                className: 'group-container' + (isGated ? ' gated' : '') + (group.isNewlyCreated ? ' sp-folder-enter' : ''),
                dataset: { groupId: group.id },
                style: `padding-left: ${level * 20}px`
            }, [
                el('div', { className: 'group-header', draggable: !state.isBatchMode ? 'true' : 'false', dataset: { dragType: 'group', groupId: group.id } }, [
                    el('button', {
                        className: 'sp-caret' + (group.collapsed ? ' collapsed' : ''),
                        title: group.collapsed ? getMessage('ui_expand') : getMessage('ui_collapse')
                    }, [
                        el('span', { className: 'google-symbols' }, ['arrow_drop_down'])
                    ]),
                    !state.isBatchMode ? el('label', {
                        className: 'sp-toggle-switch',
                        title: group.enabled ? getMessage('ui_disable_group') : getMessage('ui_enable_group')
                    }, [
                        el('input', { type: 'checkbox', className: 'sp-group-toggle-checkbox', dataset: { groupId: group.id }, checked: group.enabled }),
                        el('span', { className: 'sp-toggle-slider' })
                    ]) : '',
                    createGroupTitleIconElement(),
                    el('span', { className: 'group-title' }, [groupTitle]),
                    el('span', { className: 'badge' }, [` ${on} / ${total} `]),
                    el('button', { className: 'sp-add-subgroup-button', title: getMessage('ui_add_subgroup') }, [el('span', { className: 'google-symbols' }, ['create_new_folder'])]),
                    el('button', {
                        className: 'sp-isolate-button' + (activeIsolationGroupId === group.id ? ' is-active' : ''),
                        title: getMessage('ui_isolate_group')
                    }, [el('span', { className: 'google-symbols' }, ['filter_center_focus'])]),
                    el('button', { className: 'sp-edit-button', title: getMessage('ui_rename') }, [el('span', { className: 'google-symbols' }, ['edit'])]),
                    el('button', { className: 'sp-delete-button', title: getMessage('ui_delete_group') }, [el('span', { className: 'google-symbols' }, ['delete'])])
                ]),
                el('div', { className: 'group-children' + (group.collapsed ? ' collapsed' : '') }, childrenElements)
            ]);

            if (group.isNewlyCreated) {
                delete group.isNewlyCreated;
            }

            return groupEl;
        };

        const rootGroupIds = activeIsolationGroupId && groupsById.has(activeIsolationGroupId)
            ? [activeIsolationGroupId]
            : state.groups;

        rootGroupIds.forEach((groupId) => {
            const group = groupsById.get(groupId);
            const groupElement = renderGroup(group, 0);
            if (groupElement) {
                fragment.appendChild(groupElement);
            }
        });

        if (!activeIsolationGroupId) {
            const matchingUngrouped = state.ungrouped.filter((key) => {
                const source = sourcesByKey.get(key);
                return source && sourceMatchesCurrentFilters(source);
            });

            if (matchingUngrouped.length > 0) {
                const ungroupedHeader = document.createElement('h4');
                ungroupedHeader.className = 'ungrouped-header';
                ungroupedHeader.textContent = getMessage('ui_ungrouped');
                fragment.appendChild(ungroupedHeader);

                matchingUngrouped.forEach((key) => {
                    const sourceElement = renderSourceItem(sourcesByKey.get(key));
                    if (sourceElement) {
                        fragment.appendChild(sourceElement);
                    }
                });
            }
        }

        if (fragment.childNodes.length === 0) {
            fragment.appendChild(el('div', { className: 'sp-empty-state' }, [getMessage('ui_no_matching_sources')]));
        }

        if (state.isBatchMode) {
            const actionBar = el('div', { className: 'sp-batch-action-bar' }, [
                el('button', { className: 'sp-button sp-cancel-batch-btn' }, [getMessage('ui_cancel')]),
                el('div', { className: 'sp-batch-actions' }, [
                    el('button', {
                        className: 'sp-button sp-batch-add-folder-btn',
                        disabled: pendingBatchKeys.size === 0 || isDeletingSources
                    }, [getMessage('ui_batch_add_count', [pendingBatchKeys.size.toString()])]),
                    el('button', {
                        className: 'sp-button sp-confirm-delete-btn',
                        disabled: pendingBatchKeys.size === 0 || isDeletingSources
                    }, [isDeletingSources ? getMessage('ui_deleting') : getMessage('ui_delete_count', [pendingBatchKeys.size.toString()])])
                ])
            ]);
            fragment.appendChild(actionBar);
        }

        patchChildren(listContainer, fragment);
        renderSourceActionMenuLayer();
    }

    // --- Action & Event Handlers ---
    function handleAddNewGroup(parentGroupId = null) {
        // Inject the one-time isNewlyCreated flag for the entry animation
        const newGroup = {
            id: `group_${Date.now()}`,
            title: parentGroupId ? getMessage('ui_new_subgroup') : getMessage('ui_new_group'),
            children: [],
            enabled: true,
            collapsed: false,
            isNewlyCreated: true
        };
        groupsById.set(newGroup.id, newGroup);
        if (parentGroupId) {
            const parent = groupsById.get(parentGroupId);
            if (parent) parent.children.push({ type: 'group', id: newGroup.id });
        } else {
            state.groups.push(newGroup.id);
        }
        buildParentMap();
        render();
        saveState({ immediate: true });
    }

    function syncSourceToPage(source, desiredState) {
        if (!source || !source.element) return;
        let checkbox = source.element.querySelector(SOURCE_CHECKBOX_SELECTOR);

        if (!checkbox || !document.body.contains(checkbox)) {
            // Recover from detached DOM state
            const freshCheckbox = findFreshCheckbox(source.key);
            if (freshCheckbox) {
                checkbox = freshCheckbox;
                // Update the cached element to point to the fresh row
                source.element = freshCheckbox.closest(DEPS.row[0]) || freshCheckbox.closest(DEPS.row[1]) || source.element;
            } else {
                return; // Can't find it
            }
        }

        if (checkbox && checkbox.checked !== desiredState) {
            clickQueue.push({ checkbox, desiredState, sourceKey: source.key });
        }
        if (!isProcessingQueue) processClickQueue();
    }

    function processClickQueue() {
        if (clickQueue.length === 0) {
            isProcessingQueue = false;
            isSyncingState = false; // Sync finished
            return;
        }
        isProcessingQueue = true;
        isSyncingState = true;

        const batchSize = 5; // Reduced from 10 to give framework more time
        for (let i = 0; i < batchSize && clickQueue.length > 0; i++) {
            const item = clickQueue.shift();
            let checkbox = item.checkbox;

            // Re-verify it's in the DOM before clicking
            if (!document.body.contains(checkbox)) {
                const freshCheckbox = findFreshCheckbox(item.sourceKey);
                if (freshCheckbox) {
                    checkbox = freshCheckbox;
                } else {
                    continue; // Skip if we completely lost the element
                }
            }

            // Re-verify state is still wrong before clicking
            if (checkbox.checked !== item.desiredState) {
                checkbox.click();
            }
        }

        // Use setTimeout instead of requestAnimationFrame to add a slight delay
        setTimeout(processClickQueue, 20);
    }
    function findParentGroupOfSource(key) {
        const parentId = parentMap.get(key);
        return parentId ? (groupsById.get(parentId) || null) : null;
    }
    function removeSourceFromTree(key) {
        const parentGroup = findParentGroupOfSource(key);
        if (parentGroup) {
            parentGroup.children = parentGroup.children.filter(c => c.type === 'group' || c.key !== key);
        } else {
            state.ungrouped = state.ungrouped.filter(k => k !== key);
        }
    }

    function removeGroupFromTree(id) {
        state.groups = state.groups.filter(gid => gid !== id);
        groupsById.forEach(g => {
            g.children = g.children.filter(c => c.id !== id);
        });
    }

    function toggleGroupCollapse(group, groupContainer) {
        if (!group || !groupContainer) return;
        group.collapsed = !group.collapsed;

        const caret = groupContainer.querySelector('.sp-caret');
        const childrenContainer = groupContainer.querySelector('.group-children');

        if (group.collapsed) {
            caret.classList.add('collapsed');
            childrenContainer.style.overflow = 'hidden';
            childrenContainer.style.height = childrenContainer.scrollHeight + 'px';
            childrenContainer.offsetHeight;
            childrenContainer.style.height = '0px';
            childrenContainer.classList.add('collapsed');
        } else {
            caret.classList.remove('collapsed');
            childrenContainer.classList.remove('collapsed');
            childrenContainer.style.overflow = 'hidden';
            childrenContainer.style.height = childrenContainer.scrollHeight + 'px';

            childrenContainer.addEventListener('transitionend', function handler() {
                childrenContainer.style.height = 'auto';
                childrenContainer.style.overflow = 'visible';
                childrenContainer.removeEventListener('transitionend', handler);
            });
        }

        saveState();
    }

    function handleInteraction(event) {
        const target = event.target;
        const groupContainer = target.closest('.group-container');
        const groupId = groupContainer?.dataset.groupId;
        const sourceRow = target.closest('.source-item');
        const sourceKey = sourceRow?.dataset.sourceKey;
        const sourceActionsButton = target.closest('.sp-source-actions-button');
        const sourceActionsMenuItem = target.closest('.sp-source-actions-menu-item');

        if (sourceActionsMenuItem) {
            handleSourceActionSelection(sourceActionsMenuItem.dataset.sourceKey, sourceActionsMenuItem.dataset.action);
            render();
            return;
        }

        if (sourceActionsButton) {
            toggleSourceActionMenu(sourceActionsButton.dataset.sourceKey, sourceActionsButton);
            render();
            return;
        }

        if (target.closest('.sp-tag-pill')) {
            const tagId = target.closest('.sp-tag-pill').dataset.tagId;
            state.activeTagId = state.activeTagId === tagId ? null : tagId;
            render();
            return;
        }

        if (target.closest('#sp-clear-isolate-btn')) {
            const oldStates = collectEffectiveSourceStates();
            activeIsolationGroupId = null;
            syncSourcesToEffectiveState(oldStates);
            render();
            showToast(getMessage('ui_isolation_cleared_toast'));
            return;
        }

        if (target.closest('#sp-clear-tag-filter-btn')) {
            state.activeTagId = null;
            render();
            return;
        }

        if (target.closest('.sp-add-subgroup-button')) { handleAddNewGroup(groupId); return; }
        if (target.closest('.sp-caret')) {
            toggleGroupCollapse(groupsById.get(groupId), groupContainer);
            return;
        }
        if (target.closest('.sp-isolate-button')) {
            const oldStates = collectEffectiveSourceStates();
            activeIsolationGroupId = activeIsolationGroupId === groupId ? null : groupId;
            syncSourcesToEffectiveState(oldStates);
            render();
            showToast(
                activeIsolationGroupId
                    ? getMessage('ui_isolated_toast', [groupsById.get(groupId).title])
                    : getMessage('ui_isolation_cleared_toast')
            );
            return;
        }

        if (target.classList.contains('sp-group-toggle-checkbox')) {
            const targetGroupId = target.dataset.groupId;
            const group = groupsById.get(targetGroupId);
            if (group) {
                const oldEffectiveStates = collectEffectiveSourceStates();
                group.enabled = target.checked;
                syncSourcesToEffectiveState(oldEffectiveStates);
                saveState();
                render();
            }
            return;
        }

        if (target.classList.contains('sp-checkbox')) {
            const checkboxSourceKey = target.dataset.sourceKey;
            if (checkboxSourceKey) {
                const source = sourcesByKey.get(checkboxSourceKey);
                if (source && !source.isDisabled) {
                    source.enabled = target.checked;
                    syncSourceToPage(source, isSourceEffectivelyEnabled(source));
                    saveState();
                    render();
                }
            }
            return;
        }

        if (target.closest('.group-header') && !target.closest('.sp-caret, .sp-toggle-switch, .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button, input')) {
            toggleGroupCollapse(groupsById.get(groupId), groupContainer);
            return;
        }

        if (sourceRow && !target.closest('.sp-source-actions-anchor, .sp-source-actions-menu, .sp-tag-pill, input, .sp-batch-checkbox')) {
            const source = sourcesByKey.get(sourceKey);

            if (source && source.isDisabled) {
                return;
            }

            if (state.isBatchMode) {
                if (pendingBatchKeys.has(sourceKey)) {
                    pendingBatchKeys.delete(sourceKey);
                } else {
                    pendingBatchKeys.add(sourceKey);
                }
                render(); // Re-render to show selection styling
                return;
            }

            if (target.closest('.icon-container') && !source.isLoading) {
                 const titleEl = findElement(DEPS.title, source.element);
                 if (titleEl) {
                     titleEl.click();
                 }
                 return;
            }

            const checkbox = sourceRow.querySelector('.sp-checkbox');

            if (sourceKey && checkbox) {
                checkbox.checked = !checkbox.checked;

                if (source) {
                    source.enabled = checkbox.checked;
                    syncSourceToPage(source, isSourceEffectivelyEnabled(source));
                    saveState();
                    render();
                }
            }
            return;
        }

        const batchCheckbox = target.closest('.sp-batch-checkbox');
        if (batchCheckbox) {
            const batchSourceKey = batchCheckbox.dataset.sourceKey;
            if (pendingBatchKeys.has(batchSourceKey)) {
                pendingBatchKeys.delete(batchSourceKey);
            } else {
                pendingBatchKeys.add(batchSourceKey);
            }
            render();
            return;
        }

        if (target.closest('.sp-cancel-batch-btn')) {
            state.isBatchMode = false;
            pendingBatchKeys.clear();
            render();
            return;
        }

        if (target.closest('.sp-confirm-delete-btn') && !isDeletingSources && pendingBatchKeys.size > 0) {
            executeBatchDelete();
            return;
        }

        if (target.closest('.sp-batch-add-folder-btn') && pendingBatchKeys.size > 0) {
            renderMoveToFolderModal(pendingBatchKeys);
            return;
        }
        const editButton = target.closest('.sp-edit-button');
        if (editButton) {
            triggerRename(groupContainer);
            return;
        }

        const deleteButton = target.closest('.sp-delete-button');
        if (deleteButton) {
            const group = groupsById.get(groupId);
            if (!group) return;

            if (group.children.length === 0) {
                removeGroupFromTree(groupId);
                groupsById.delete(groupId);
            } else {
                const deleteContents = window.confirm(
                    getMessage('ui_delete_group_confirm_non_empty', [group.title, getMessage('ui_ungrouped')])
                );

                if (deleteContents) {
                    const extractChildren = (g) => {
                        g.children.forEach(c => {
                            if (c.type === 'source') {
                                state.ungrouped.push(c.key);
                            } else {
                                state.groups.push(c.id);
                            }
                        });
                    };
                    extractChildren(group);
                    removeGroupFromTree(groupId);
                    groupsById.delete(groupId);
                } else {
                    return;
                }
            }
            if (activeIsolationGroupId === groupId) {
                activeIsolationGroupId = null;
            }
            buildParentMap();
            saveState({ immediate: true });
            render();
            return;
        }

    }

    function handleOriginalCheckboxChange(event) {
        if (isSyncingState) return;
        const checkbox = event.target;
        // Verify target is an actual checkbox by checking if it matches DEPS.checkbox
        let validCheckbox = false;
        for (const sel of DEPS.checkbox) {
            if (checkbox.matches?.(sel)) {
                validCheckbox = true; break;
            }
        }
        if (!validCheckbox) return;

        let sourceRow = null;
        for (const sel of DEPS.row) {
            sourceRow = checkbox.closest(sel);
            if (sourceRow) break;
        }

        if (!sourceRow) return;
        const key = keyByElement.get(sourceRow);
        if (key) {
            const source = sourcesByKey.get(key);
            if (source && source.enabled !== checkbox.checked) {
                source.enabled = checkbox.checked;
                const desiredState = isSourceEffectivelyEnabled(source);

                const virtualCheckbox = shadowRoot.querySelector(`.sp-checkbox[data-source-key="${key}"]`);
                if (virtualCheckbox) {
                    virtualCheckbox.checked = source.enabled;
                }

                if (checkbox.checked !== desiredState) {
                    syncSourceToPage(source, desiredState);
                }

                saveState();
                render();
            }
        }
    }

    function triggerRename(groupContainer) {
        const groupId = groupContainer.dataset.groupId;
        const group = groupsById.get(groupId);
        if (!group) return;
        const titleSpan = groupContainer.querySelector('.group-title');
        const originalTitle = group.title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalTitle;
        titleSpan.replaceChildren(input);
        input.focus();
        input.select();
        const cleanup = () => {
            input.removeEventListener('blur', handleSave);
            input.removeEventListener('keydown', handleKey);
            render();
        };
        const handleSave = () => {
            const newTitle = input.value.trim();
            if (newTitle) group.title = newTitle;
            cleanup();
            saveState({ immediate: true });
        };
        const handleKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                group.title = originalTitle;
                cleanup();
            }
        };
        input.addEventListener('blur', handleSave);
        input.addEventListener('keydown', handleKey);
    }

    function handleDragStart(e) {
        const sourceTarget = e.target.closest('.source-item');
        const groupTarget = e.target.closest('.group-header');
        if (sourceTarget) {
            const key = sourceTarget.dataset.sourceKey;
            if (key) {
                e.dataTransfer.setData('application/source-key', key);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => sourceTarget.classList.add('dragging'), 0);
            }
        } else if (groupTarget) {
            const key = groupTarget.dataset.groupId;
            if (key) {
                e.dataTransfer.setData('application/group-id', key);
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => groupTarget.classList.add('dragging'), 0);
            }
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
        const dropTarget = e.target.closest('.group-container, .source-item');
        if (!dropTarget) return;

        const rect = dropTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;

        dropTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into');

        if (dropTarget.classList.contains('group-container')) {
            if (offsetY < rect.height * 0.25) dropTarget.classList.add('drag-over-top');
            else if (offsetY > rect.height * 0.75) dropTarget.classList.add('drag-over-bottom');
            else dropTarget.classList.add('drag-into');
        } else {
            if (offsetY < rect.height / 2) dropTarget.classList.add('drag-over-top');
            else dropTarget.classList.add('drag-over-bottom');
        }
    }

    function handleDragLeave(e) {
        const dropTarget = e.target.closest('.group-container, .source-item');
        if (dropTarget) {
            dropTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into');
        }
    }

    function handleDrop(e) {
        const dropTarget = e.target.closest('.group-container, .source-item');
        if (!dropTarget) return;
        e.preventDefault();

        const isInto = dropTarget.classList.contains('drag-into');
        const isAbove = dropTarget.classList.contains('drag-over-top');
        dropTarget.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-into');

        const sourceKey = e.dataTransfer.getData('application/source-key');
        const draggedGroupId = e.dataTransfer.getData('application/group-id');

        let targetGroup = null;
        let insertIndex = -1;

        if (dropTarget.classList.contains('group-container')) {
            const targetGroupId = dropTarget.dataset.groupId;
            targetGroup = groupsById.get(targetGroupId);
            if (!isInto && targetGroup) {
                // We are dropping above or below a group, meaning we want to place it in the same parent
                const parentId = parentMap.get(targetGroupId);
                if (parentId) {
                    const parentGroup = groupsById.get(parentId);
                    insertIndex = parentGroup.children.findIndex(c => c.id === targetGroupId);
                    targetGroup = parentGroup; // The actual target is the parent
                } else {
                    // It's a top level group
                    insertIndex = state.groups.indexOf(targetGroupId);
                    targetGroup = null; // Denotes top-level insert
                }
                if (!isAbove && insertIndex !== -1) insertIndex++;
            }
        } else if (dropTarget.classList.contains('source-item')) {
            const targetSourceKey = dropTarget.dataset.sourceKey;
            targetGroup = findParentGroupOfSource(targetSourceKey);
            if (targetGroup) {
                insertIndex = targetGroup.children.findIndex(c => c.key === targetSourceKey);
            } else {
                insertIndex = state.ungrouped.indexOf(targetSourceKey);
            }
            if (!isAbove && insertIndex !== -1) insertIndex++;
        }

        if (sourceKey) {
            removeSourceFromTree(sourceKey);
            if (targetGroup) {
                if (insertIndex !== -1) targetGroup.children.splice(insertIndex, 0, { type: 'source', key: sourceKey });
                else targetGroup.children.push({ type: 'source', key: sourceKey });
            } else {
                if (insertIndex !== -1) state.ungrouped.splice(insertIndex, 0, sourceKey);
                else state.ungrouped.push(sourceKey);
            }
        } else if (draggedGroupId) {
            const draggedGroupObj = groupsById.get(draggedGroupId);
            if (!targetGroup) {
                // Moving a group to top level
                removeGroupFromTree(draggedGroupId);
                if (insertIndex !== -1) state.groups.splice(insertIndex, 0, draggedGroupId);
                else state.groups.push(draggedGroupId);
            } else if (draggedGroupId !== targetGroup.id && !isDescendant(targetGroup, draggedGroupObj, groupsById)) {
                removeGroupFromTree(draggedGroupId);
                if (insertIndex !== -1) targetGroup.children.splice(insertIndex, 0, { type: 'group', id: draggedGroupId });
                else targetGroup.children.push({ type: 'group', id: draggedGroupId });
            }
        }

        buildParentMap();
        render();
        saveState({ immediate: true });
    }

    function handleDragEnd(e) {
        const draggedItem = shadowRoot.querySelector('.dragging');
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
        }
    }

    // --- Initialization & Observation ---
    function scanAndSyncSources(loadedState, isFirstLoad = false) {
        const oldSourcesMap = new Map();
        const oldSourceTags = new Map();
        const previousSourceRecordsByKey = !isFirstLoad ? snapshotExistingSourceRecords() : new Map();
        if (!isFirstLoad) {
            sourcesByKey.forEach((source, key) => {
                oldSourcesMap.set(key, { enabled: source.enabled });
            });
            sourceTagsById.forEach((tagIds, key) => {
                oldSourceTags.set(key, [...tagIds]);
            });
        }

        sourcesByKey.clear();
        sourceTagsById.clear();
        keyByElement = new WeakMap();

        const sourceElements = getSourceElements();
        if (sourceElements.length === 0 && Array.from(document.body.children).length > 2) {
            // The native panel can be empty while NotebookLM is still loading initial results.
        }

        const seenSourceIds = new Map();
        const seenLegacyKeys = new Map();
        const currentSources = sourceElements.map((sourceElement) => (
            createSourceDescriptor(sourceElement, seenSourceIds, seenLegacyKeys)
        ));
        const sourceLookup = buildSourceLookup(currentSources);
        const normalizedTagState = isFirstLoad ? buildNormalizedTagState(loadedState) : null;
        const resolvedSourceStateById = isFirstLoad
            ? buildResolvedSourceStateById(sourceLookup, loadedState)
            : new Map();
        const resolvedSourceTagsById = isFirstLoad
            ? buildResolvedSourceTagsById(sourceLookup, loadedState)
            : new Map();

        if (isFirstLoad && normalizedTagState) {
            tagsById.clear();
            normalizedTagState.nextTagsById.forEach((tag, tagId) => {
                tagsById.set(tagId, tag);
            });
            state.tagOrder = normalizedTagState.nextTagOrder;
        }

        let knownSourceRefs = new Set();
        if (isFirstLoad) {
            const reconciledTree = reconcilePersistedTree(loadedState, sourceLookup);
            state.groups = reconciledTree.groups;
            state.ungrouped = reconciledTree.ungrouped;
            groupsById.clear();
            reconciledTree.groupsById.forEach((group, groupId) => {
                groupsById.set(groupId, group);
            });
            knownSourceRefs = reconciledTree.seenSourceRefs;
        } else {
            const remappedState = remapExistingStateToCurrentSources(sourceLookup, {
                sourceRecordsByKey: previousSourceRecordsByKey,
                sourceTagsById: oldSourceTags
            });
            state.groups = remappedState.groups;
            state.ungrouped = remappedState.ungrouped;
            groupsById.clear();
            remappedState.groupsById.forEach((group, groupId) => {
                groupsById.set(groupId, group);
            });
            oldSourcesMap.clear();
            remappedState.sourceStateById.forEach((sourceRecord, sourceKey) => {
                oldSourcesMap.set(sourceKey, { enabled: Boolean(sourceRecord.enabled) });
            });
            oldSourceTags.clear();
            remappedState.sourceTagsById.forEach((tagIds, sourceKey) => {
                oldSourceTags.set(sourceKey, [...tagIds]);
            });
            knownSourceRefs = remappedState.seenSourceRefs;
        }

        currentSources.forEach((source) => {
            let enabled;
            if (isFirstLoad) {
                enabled = resolvedSourceStateById.has(source.key)
                    ? Boolean(resolvedSourceStateById.get(source.key).enabled)
                    : Boolean(source.checkbox?.checked);
            } else {
                enabled = oldSourcesMap.has(source.key)
                    ? Boolean(oldSourcesMap.get(source.key).enabled)
                    : Boolean(source.checkbox?.checked);
            }

            const hydratedSource = {
                ...source,
                enabled
            };

            sourcesByKey.set(source.key, hydratedSource);
            keyByElement.set(source.element, source.key);
            setSourceTagIds(
                source.key,
                isFirstLoad
                    ? (resolvedSourceTagsById.get(source.key) || [])
                    : (oldSourceTags.get(source.key) || [])
            );

            if (!knownSourceRefs.has(source.key)) {
                state.ungrouped.push(source.key);
                knownSourceRefs.add(source.key);
            }
        });

        if (state.activeTagId && !tagsById.has(state.activeTagId)) {
            state.activeTagId = null;
        }

        buildParentMap();
        sourcesByKey.forEach((source) => {
            syncSourceToPage(source, isSourceEffectivelyEnabled(source));
        });

        return isFirstLoad && pendingStorageUpgrade;
    }

    const debouncedScanAndSync = debounce(() => {
        try {
            if (pendingInitialLoadedState) {
                const pendingRestore = flushPendingInitialLoadedState();
                if (pendingRestore.deferred) {
                    return;
                }

                render();
                if (pendingRestore.shouldUpgradeStorage) {
                    pendingStorageUpgrade = false;
                    saveState();
                }
                return;
            }

            // Pass false for isFirstLoad because this is triggered by DOM mutations
            scanAndSyncSources({}, false);
            render();
            saveState();
        } catch (e) {
            console.error("NotebookLM Source Management: Error syncing state during DOM change.", e);
        }
    }, 500);

    const debouncedPanelLifecycleSync = debounce(() => {
        try {
            syncManagerWithPanelLifecycle();
        } catch (error) {
            console.error("NotebookLM Source Management: Error syncing panel lifecycle.", error);
        }
    }, 80);

    function handleDomChanges(mutations) {
        try {
            let needsReSync = false;
            for (const mutation of mutations) {
                // Ignore mutations happening inside our own extension container to prevent infinite loops
                if (mutation.target && (mutation.target.id === 'sources-plus-root' || mutation.target.closest('#sources-plus-root'))) {
                    continue;
                }
                
                // We only care about nodes being added/removed in the native list
                if (mutation.type === 'childList') {
                    // Quick heuristic: did native rows change?
                    const addedNodes = Array.from(mutation.addedNodes);
                    const removedNodes = Array.from(mutation.removedNodes);
                    const hasRelevantChanges = [...addedNodes, ...removedNodes].some(node => {
                        return node.nodeType === 1 && (
                            node.hasAttribute('data-testid') || 
                            node.classList.contains('single-source-container') ||
                            node.querySelector('.single-source-container')
                        );
                    });
                    
                    if (hasRelevantChanges) {
                        needsReSync = true; 
                        break;
                    }
                }
            }
            if (needsReSync) {
                freshRowCache = null;
                debouncedScanAndSync();
            }
        } catch (e) {
            console.error("NotebookLM Source Management: Failed handling mutations.", e);
        }
    }

    // --- Lifecycle Management ---
    function removeGlobalOverlayStyle() {
        const globalStyle = document.getElementById(GLOBAL_OVERLAY_STYLE_ID);
        if (globalStyle && typeof globalStyle.remove === 'function') {
            globalStyle.remove();
        }
    }

    function resetManagerRuntimeState() {
        groupsById.clear();
        sourcesByKey.clear();
        tagsById.clear();
        sourceTagsById.clear();
        parentMap.clear();
        keyByElement = new WeakMap();
        state.groups = [];
        state.ungrouped = [];
        state.filterQuery = '';
        state.isBatchMode = false;
        state.tagOrder = [];
        state.activeTagId = null;
        pendingBatchKeys.clear();
        activeIsolationGroupId = null;
        isSearchExpanded = false;
        activeSourceActionSourceKey = null;
        sourceActionMenuPosition = null;
        isSyncingState = false;
        clickQueue = [];
        isProcessingQueue = false;
        freshRowCache = null;
        pendingStorageUpgrade = false;
        pendingInitialLoadedState = null;
        attachedSourcePanel = null;
        managerStatusReason = 'manager_not_ready';
    }

    function cleanupManagerResources() {
        if (scrollObserver) {
            scrollObserver.disconnect();
            scrollObserver = null;
        }
        document.removeEventListener('change', handleOriginalCheckboxChange, true);
        document.removeEventListener('click', handleDocumentOutsideClick, true);
        if (shadowRoot && typeof shadowRoot.removeEventListener === 'function') {
            shadowRoot.removeEventListener('scroll', handleSourceActionMenuViewportChange, true);
        }
        if (shadowRoot && shadowRoot.host) {
            shadowRoot.host.remove();
            shadowRoot = null;
        }
        extensionHost = null;
        if (focusHighlightTimeout) {
            clearTimeout(focusHighlightTimeout);
            focusHighlightTimeout = null;
        }
        if (window && typeof window.removeEventListener === 'function') {
            window.removeEventListener('pagehide', handlePageLifecyclePersistence);
            window.removeEventListener('resize', handleSourceActionMenuViewportChange);
        }
        document.removeEventListener('visibilitychange', handlePageLifecyclePersistence);
        cancelPendingStateSave();
        removeGlobalOverlayStyle();
        resetManagerRuntimeState();
    }

    function detachManagerForPanelCollapse() {
        flushPendingStateSave();
        pendingPanelReattachState = capturePendingPanelReattachState();
        cleanupManagerResources();
    }

    function teardown() {
        bindPanelLifecycleHooks(null);
        if (routeRecoveryTimeout) {
            clearTimeout(routeRecoveryTimeout);
            routeRecoveryTimeout = null;
        }
        cleanupManagerResources();
        pendingPanelReattachState = null;
    }

    function syncManagerWithPanelLifecycle() {
        if (!projectId) return;

        const sourcePanel = findSourcePanel();
        const hasManagerInstance = Boolean(extensionHost || shadowRoot || scrollObserver);

        if (!sourcePanel) {
            if (hasManagerInstance) {
                detachManagerForPanelCollapse();
            }
            bindPanelLifecycleHooks(null);
            managerStatusReason = 'source_panel_missing';
            return;
        }

        bindPanelLifecycleHooks(sourcePanel);

        if (isSourcePanelCollapsed(sourcePanel)) {
            if (hasManagerInstance) {
                detachManagerForPanelCollapse();
            }
            managerStatusReason = 'manager_not_ready';
            return;
        }

        if (isManagerAttachedToPanel(sourcePanel)) {
            applySourcePanelSurfaceColor(extensionHost, sourcePanel);
            managerStatusReason = 'ready';
            return;
        }

        if (hasManagerInstance) {
            detachManagerForPanelCollapse();
        }

        init(sourcePanel);
    }

    function recoverManagerForRoute(targetProjectId, attempt = 0, recoveryToken = activeRouteRecoveryToken) {
        waitForElement(DEPS.panel, {
            observerRoot: document.body,
            timeoutMs: ROUTE_REINIT_RETRY_DELAY_MS
        }).then((panel) => {
            if (recoveryToken !== activeRouteRecoveryToken) return;

            bindPanelLifecycleHooks(panel);

            if (panel && isSourcePanelRenderable(panel) && getProjectId() === targetProjectId) {
                init(panel);
                return;
            }

            if (attempt + 1 >= ROUTE_REINIT_MAX_ATTEMPTS) {
                if (window.location && typeof window.location.reload === 'function') {
                    window.location.reload();
                }
                return;
            }

            routeRecoveryTimeout = setTimeout(() => {
                recoverManagerForRoute(targetProjectId, attempt + 1, recoveryToken);
            }, ROUTE_REINIT_RETRY_DELAY_MS);
        });
    }

    function handleRouteChanged() {
        const newProjectId = getProjectId();
        if (!newProjectId) {
            if (projectId) {
                console.log(`NotebookLM Source Management: Route changed from notebook ${projectId} to a non-notebook page. Tearing down.`);
                flushPendingStateSave();
                activeRouteRecoveryToken += 1;
                projectId = null;
                teardown();
                managerStatusReason = 'not_on_notebook_page';
            }
            return;
        }

        if (newProjectId !== projectId) {
            console.log(`NotebookLM Source Management: Route changed from ${projectId} to ${newProjectId}. Reinitializing manager.`);
            flushPendingStateSave();
            activeRouteRecoveryToken += 1;
            projectId = newProjectId;
            managerStatusReason = 'manager_not_ready';
            teardown();
            recoverManagerForRoute(newProjectId, 0, activeRouteRecoveryToken);
        }
    }

    function init(sourcePanel) {
        if (!isSourcePanelRenderable(sourcePanel)) {
            managerStatusReason = 'manager_not_ready';
            return;
        }

        bindPanelLifecycleHooks(sourcePanel);

        const extensionRoot = document.createElement('div');
        extensionRoot.id = 'sources-plus-root';
        applySourcePanelSurfaceColor(extensionRoot, sourcePanel);
        extensionHost = extensionRoot;
        shadowRoot = extensionRoot.attachShadow({ mode: 'open' });
        managerStatusReason = 'manager_not_ready';
        const style = document.createElement('style');
        style.textContent = contentStyleText;
        shadowRoot.appendChild(style);

        const containerHtml = createManagerShell(el, chrome);
        shadowRoot.appendChild(containerHtml);

        if (window && typeof window.addEventListener === 'function') {
            window.addEventListener('pagehide', handlePageLifecyclePersistence);
            window.addEventListener('resize', handleSourceActionMenuViewportChange);
        }
        document.addEventListener('visibilitychange', handlePageLifecyclePersistence);

        // Handle Resizing
        const container = shadowRoot.querySelector('.sp-container');
        const resizer = shadowRoot.querySelector('.sp-resizer');
        let startY, startHeight;

        resizer.addEventListener('mousedown', (e) => {
            startY = e.clientY;
            startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);
            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
            container.style.userSelect = 'none'; // Prevent text selection during drag
        });

        function doDrag(e) {
            const newHeight = Math.max(150, startHeight + (e.clientY - startY));
            container.style.height = `${newHeight}px`;
        }

        function stopDrag() {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
            container.style.userSelect = '';
            customHeight = parseInt(container.style.height, 10);
            saveState(); // Save the new height
        }

        shadowRoot.getElementById('sp-new-group-btn').addEventListener('click', () => handleAddNewGroup());
        shadowRoot.getElementById('sp-manage-tags-btn').addEventListener('click', () => renderTagModal());

        shadowRoot.getElementById('sp-batch-action-btn').addEventListener('click', () => {
            if (isDeletingSources) return;
            state.isBatchMode = !state.isBatchMode;
            pendingBatchKeys.clear();
            closeSourceActionMenu();
            render();
        });

        const searchInput = shadowRoot.getElementById('sp-search');
        const handleSearchInput = debounce(() => { render(); }, 300);

        // Immediate search trigger
        const triggerImmediateSearch = () => {
            state.filterQuery = searchInput.value;
            render();
        };

        searchInput.addEventListener('input', (event) => {
            state.filterQuery = event.target.value;
            handleSearchInput();
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerImmediateSearch();
            }
        });
        shadowRoot.getElementById('sp-search-btn').addEventListener('click', (event) => {
            event.preventDefault();
            handleSearchButtonClick(triggerImmediateSearch);
        });
        shadowRoot.addEventListener('click', handleSearchOutsideClick);
        shadowRoot.addEventListener('scroll', handleSourceActionMenuViewportChange, true);
        document.addEventListener('click', handleDocumentOutsideClick, true);
        syncSearchUi();

        const listContainer = shadowRoot.querySelector('#sources-list');
        const viewStateContainer = shadowRoot.getElementById('sp-view-state');
        viewStateContainer.addEventListener('click', handleInteraction);
        listContainer.addEventListener('click', handleInteraction);
        listContainer.addEventListener('change', handleInteraction);
        listContainer.addEventListener('dragstart', handleDragStart);
        listContainer.addEventListener('dragover', handleDragOver);
        listContainer.addEventListener('dragleave', handleDragLeave);
        listContainer.addEventListener('drop', handleDrop);
        listContainer.addEventListener('dragend', handleDragEnd);

        const panelHeader = sourcePanel.querySelector('.panel-header') || sourcePanel.firstElementChild || sourcePanel;
        if (panelHeader) {
            panelHeader.insertAdjacentElement('afterend', extensionRoot);
            attachedSourcePanel = sourcePanel;
            managerStatusReason = 'ready';
            document.addEventListener('change', handleOriginalCheckboxChange, true);

            // --- Global Native Glassmorphism Injection ---
            if (!document.getElementById(GLOBAL_OVERLAY_STYLE_ID)) {
                const globalStyle = document.createElement('style');
                globalStyle.id = GLOBAL_OVERLAY_STYLE_ID;
                globalStyle.textContent = globalOverlayStyleText;
                document.head.appendChild(globalStyle);
            }

            // 1. Precise DOM Observation
            scrollObserver = new MutationObserver(handleDomChanges);
            try {
                // Find the native scroll area that holds the sources, rather than observing the entire panel
                const nativeScrollArea = findElement(DEPS.scroll, sourcePanel) || sourcePanel;
                // Only observe childList additions/removals, ignore deep attribute/text changes
                scrollObserver.observe(nativeScrollArea, { childList: true, subtree: true });
            } catch (e) {
                console.error("NotebookLM Source Management: Failed to observe source panel", e);
            }

            // 2. Removed CPU-intensive Heartbeat Polling
            // Relying purely on MutationObserver is much more efficient.

            const reattachState = pendingPanelReattachState
                ? normalizeLoadedState(cloneSerializableData(pendingPanelReattachState))
                : null;
            pendingPanelReattachState = null;

            if (reattachState) {
                applyLoadedStateToManager(reattachState);
                return;
            }

            loadState((loadedState) => {
                applyLoadedStateToManager(loadedState);
            });
        } else {
            attachedSourcePanel = null;
            managerStatusReason = 'panel_header_missing';
            showCrashBanner(getMessage('ui_crash_missing_header'));
        }
    }

    // --- Main execution ---
    if (chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
        chrome.runtime.onMessage.addListener(handleManagerMessage);
    }

    if (projectId) {
        waitForElement(DEPS.panel).then(panel => {
            if (!panel) {
                managerStatusReason = 'source_panel_missing';
                showCrashBanner(getMessage('ui_crash_missing_panel'));
                return;
            }
            bindPanelLifecycleHooks(panel);
            if (!isSourcePanelRenderable(panel)) {
                managerStatusReason = 'manager_not_ready';
                return;
            }
            init(panel);
        }).catch(err => {
            console.error("NotebookLM Source Management init error:", err);
            managerStatusReason = 'manager_not_ready';
            showCrashBanner(getMessage('ui_crash_init_error'));
        });
    }

    // Monitor for SPA route changes via History API interception
    let currentUrl = location.href;
    const onRouteChange = () => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            handleRouteChanged();
        }
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        onRouteChange();
    };
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        onRouteChange();
    };
    window.addEventListener('popstate', onRouteChange);

    // Narrower observer for panel lifecycle only (no subtree attribute watching)
    const panelLifecycleObserver = new MutationObserver(() => {
        schedulePanelLifecycleSync();
    });
    const sourcePanelParent = findSourcePanel()?.parentElement || document.body;
    panelLifecycleObserver.observe(sourcePanelParent, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });

    // Expose internals for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            areAllAncestorsEnabled,
            buildPersistableState,
            createTag,
            createGroupTitleIconElement,
            createSourceDescriptor,
            createSourceIconElement,
            deleteTag,
            extractSourceIconImageUrl,
            findFreshCheckbox,
            getTagStyleVars,
            getSourceTagIds,
            groupHasRenderableDescendant,
            hasActiveRenderFilters,
            isSourceEffectivelyEnabled,
            normalizeTagColor,
            normalizeLoadedState,
            processClickQueue,
            removeGroupFromTree,
            scanAndSyncSources,
            setSourceTagIds,
            shouldRenderGroup,
            sourceMatchesCurrentFilters,
            syncSourceToPage,
            updateTag,
            parentMap,
            groupsById,
            tagsById,
            sourceTagsById,
            executeBatchDelete,
            executeMoveToFolder,
            loadState,
            pendingBatchKeys,
            sourcesByKey,
            state,
            DEPS,
            saveState,
            flushPendingStateSave,
            getManagerStatus,
            focusManagerPanel,
            handleAddNewGroup,
            handleManagerMessage,
            handlePageLifecyclePersistence,
            handleRouteChanged,
            hasPersistedSourceRefs,
            hasRenderableSourceRows,
            findSourcePanel,
            findSourcePanelContent,
            bindPanelLifecycleHooks,
            isManagerAttachedToPanel,
            isSourcePanelCollapsed,
            isSourcePanelRenderable,
            recoverManagerForRoute,
            restoreInitialLoadedState,
            resolveSourcePanelSurfaceColor,
            schedulePanelLifecycleSync,
            syncManagerWithPanelLifecycle,
            toggleSourceActionMenu,
            closeSourceActionMenu,
            handleSourceActionSelection,
            _applySourcePanelSurfaceColorForTest: applySourcePanelSurfaceColor,
            _getClickQueueLength: () => clickQueue.length,
            _getIsDeletingSources: () => isDeletingSources,
            _getIsSyncingState: () => isSyncingState,
            _setIsDeletingSources: (val) => { isDeletingSources = val; },
            _getFreshRowCache: () => freshRowCache,
            _getPendingStorageUpgrade: () => pendingStorageUpgrade,
            _getPendingInitialLoadedState: () => pendingInitialLoadedState,
            _getPendingPanelReattachStateForTest: () => pendingPanelReattachState,
            _getAttachedSourcePanelForTest: () => attachedSourcePanel,
            _getAttachedPanelHeaderForTest: () => attachedPanelHeader,
            _getPanelResizeObserverForTest: () => panelResizeObserver,
            _flushPendingInitialLoadedStateForTest: flushPendingInitialLoadedState,
            _setCustomHeight: (val) => { customHeight = val; },
            _setManagerStatusReason: (val) => { managerStatusReason = val; },
            _setProjectId: (val) => { projectId = val; },
            _setAttachedSourcePanelForTest: (val) => { attachedSourcePanel = val; },
            _getActiveIsolationGroupId: () => activeIsolationGroupId,
            _setActiveIsolationGroupId: (val) => { activeIsolationGroupId = val; },
            _getIsSearchExpanded: () => isSearchExpanded,
            _setIsSearchExpanded: (val) => { isSearchExpanded = val; },
            _getActiveSourceActionSourceKey: () => activeSourceActionSourceKey,
            _setActiveSourceActionSourceKey: (val) => { activeSourceActionSourceKey = val; },
            _setSourceActionInvokerForTest: (name, fn) => {
                if (name && typeof fn === 'function' && Object.prototype.hasOwnProperty.call(sourceActionInvokers, name)) {
                    sourceActionInvokers[name] = fn;
                }
            },
            _handleInteractionForTest: handleInteraction,
            _setShadowRootForTest: (val) => { shadowRoot = val; extensionHost = val && val.host ? val.host : null; },
            _showCrashBannerForTest: showCrashBanner,
            _syncSearchUi: syncSearchUi,
            _handleSearchButtonClick: handleSearchButtonClick,
            _handleSearchOutsideClick: handleSearchOutsideClick,
            _resetState: () => {
                state.groups = [];
                state.ungrouped = [];
                state.filterQuery = '';
                state.isBatchMode = false;
                pendingBatchKeys.clear();
                isDeletingSources = false;
                groupsById.clear();
                sourcesByKey.clear();
                tagsById.clear();
                sourceTagsById.clear();
                parentMap.clear();
                customHeight = null;
                projectId = null;
                shadowRoot = document.createElement('div').attachShadow({ mode: 'open' }); // Mock shadowRoot for testing showToast
                extensionHost = shadowRoot.host;
                freshRowCache = null;
                clickQueue = [];
                isProcessingQueue = false;
                isSyncingState = false;
                cancelPendingStateSave();
                clearScheduledPanelLifecycleSync();
                pendingStorageUpgrade = false;
                pendingInitialLoadedState = null;
                pendingPanelReattachState = null;
                attachedSourcePanel = null;
                attachedPanelHeader = null;
                if (panelResizeObserver) {
                    panelResizeObserver.disconnect();
                    panelResizeObserver = null;
                }
                activeRouteRecoveryToken = 0;
                routeRecoveryTimeout = null;
                managerStatusReason = 'manager_not_ready';
                state.tagOrder = [];
                state.activeTagId = null;
                activeIsolationGroupId = null;
                isSearchExpanded = false;
                activeSourceActionSourceKey = null;
                sourceActionMenuPosition = null;
                sourceActionInvokers.openTags = (sourceKey) => renderTagModal(sourceKey);
                sourceActionInvokers.moveToFolder = (sourceKey) => renderMoveToFolderModal(sourceKey);
                sourceActionInvokers.openNativeMenu = (sourceKey) => triggerNativeSourceMenu(sourceKey);
                if (focusHighlightTimeout) {
                    clearTimeout(focusHighlightTimeout);
                    focusHighlightTimeout = null;
                }
            }
        };
    }

})();
