(function () {
    'use strict';

    // --- Selectors & Dependencies ---
    const contentConfig = globalThis.NSM_CONTENT_CONFIG;
    const contentStyleText = globalThis.NSM_CONTENT_STYLE_TEXT;
    const globalOverlayStyleText = globalThis.NSM_GLOBAL_OVERLAY_STYLE_TEXT;
    const createManagerShell = globalThis.NSM_CREATE_MANAGER_SHELL;

    if (
        !contentConfig ||
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

    // --- State Management ---
    let state = {
        groups: [], // Holds top-level group IDs
        ungrouped: [],
        filterQuery: '',
        isBatchMode: false,
    };
    let pendingBatchKeys = new Set();
    let isDeletingSources = false;
    let groupsById = new Map(); // Flat map of ALL group objects for easy lookup
    let sourcesByKey = new Map();
    let keyByElement = new WeakMap();
    let shadowRoot = null;
    let projectId = getProjectId();
    let parentMap = new Map();
    let isSyncingState = false;
    let clickQueue = [];
    let isProcessingQueue = false;
    let customHeight = null; // Store user defined height
    let scrollObserver = null; // Store MutationObserver globally for teardown
    let healthCheckInterval = null; // Store heartbeat interval for teardown
    let extensionHost = null;
    let managerStatusReason = 'manager_not_ready';
    let focusHighlightTimeout = null;
    let pendingStorageUpgrade = false;
    let activeRouteRecoveryToken = 0;
    let routeRecoveryTimeout = null;

    // --- Helper Functions ---


    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

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

    function getProjectId() {
        const pathSegments = window.location.pathname.split('/');
        const notebookIndex = pathSegments.indexOf('notebook');
        if (notebookIndex > -1 && notebookIndex + 1 < pathSegments.length) {
            return pathSegments[notebookIndex + 1];
        }
        return null;
    }

    function generateSourceKey(title) {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
            const char = title.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return `source_${hash}`;
    }

    function normalizeSourceText(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function sanitizeSourceToken(value) {
        return normalizeSourceText(value)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96);
    }

    function extractTokenFromUrl(url) {
        if (typeof url !== 'string' || !url) return null;

        try {
            const parsedUrl = new URL(url, window.location.origin);
            const preferredParams = [
                'source', 'sourceId', 'source_id',
                'documentId', 'document_id',
                'docId', 'doc_id',
                'fileId', 'file_id',
                'resourceId', 'resource_id',
                'id'
            ];

            for (const key of preferredParams) {
                const value = parsedUrl.searchParams.get(key);
                const sanitized = sanitizeSourceToken(value ? `${key}:${value}` : '');
                if (sanitized) return sanitized;
            }

            const segments = parsedUrl.pathname.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1];
            if (lastSegment && /[A-Za-z0-9_-]{6,}/.test(lastSegment)) {
                return sanitizeSourceToken(`${segments[segments.length - 2] || 'path'}:${lastSegment}`);
            }
        } catch (error) {
            return null;
        }

        return null;
    }

    function extractSourceStableToken(sourceRow) {
        if (!sourceRow) return null;

        const selectors = [
            '[data-source-id]',
            '[data-document-id]',
            '[data-doc-id]',
            '[data-resource-id]',
            '[data-item-id]',
            '[data-id]',
            '[href]',
            '[aria-controls]'
        ];
        const attributeKeys = [
            'data-source-id',
            'data-document-id',
            'data-doc-id',
            'data-resource-id',
            'data-item-id',
            'data-id',
            'aria-controls'
        ];
        const candidates = [sourceRow];

        for (const selector of selectors) {
            const nodes = sourceRow.querySelectorAll ? Array.from(sourceRow.querySelectorAll(selector)).slice(0, 8) : [];
            candidates.push(...nodes);
        }

        for (const candidate of candidates) {
            if (!candidate || typeof candidate.getAttribute !== 'function') continue;

            for (const attributeKey of attributeKeys) {
                const attributeValue = candidate.getAttribute(attributeKey);
                const sanitized = sanitizeSourceToken(attributeValue ? `${attributeKey}:${attributeValue}` : '');
                if (sanitized) return sanitized;
            }

            const hrefToken = extractTokenFromUrl(candidate.getAttribute('href'));
            if (hrefToken) return hrefToken;
        }

        return null;
    }

    function buildLegacySourceKey(keyTitle, seenLegacyKeys) {
        const baseKey = generateSourceKey(keyTitle);
        const duplicateIndex = seenLegacyKeys.get(baseKey) || 0;
        seenLegacyKeys.set(baseKey, duplicateIndex + 1);
        return duplicateIndex === 0 ? baseKey : `${baseKey}_${duplicateIndex}`;
    }

    function createSourceDescriptor(sourceElement, seenSourceIds, seenLegacyKeys) {
        const titleEl = findElement(DEPS.title, sourceElement);
        const checkbox = findElement(DEPS.checkbox, sourceElement);
        const ariaLabel = checkbox ? (checkbox.getAttribute('aria-label') || '') : '';
        const keyTitle = ariaLabel || titleEl?.textContent || '';
        const title = titleEl?.textContent.trim() || 'Untitled Source';

        let iconEl = findElement(DEPS.icon, sourceElement);
        let iconName = iconEl?.textContent.trim() || 'article';
        const iconMap = {
            'video_youtube': 'smart_display',
            'more_vert': 'article',
            'audiotrack': 'headphones',
            'picture_as_pdf': 'description',
            'drive_pdf': 'description',
            'link': 'link',
            'format_quote': 'format_quote',
            'text_snippet': 'article',
            'note': 'sticky_note_2'
        };

        if (iconMap[iconName]) {
            iconName = iconMap[iconName];
            if (iconName === 'article' && iconEl?.textContent.trim() === 'more_vert') {
                iconEl = null;
            }
        }

        const iconColorClass = Array.from(iconEl?.classList || []).find(cls => cls.endsWith('-icon-color')) || '';
        const stableToken = extractSourceStableToken(sourceElement);
        const fingerprint = [
            normalizeSourceText(title),
            normalizeSourceText(ariaLabel),
            normalizeSourceText(iconName)
        ].join('|');
        const identityType = stableToken ? 'stable-token' : 'fingerprint';
        const sourceIdBase = stableToken
            ? `source_id_${stableToken}`
            : `source_fp_${generateSourceKey(fingerprint)}`;
        const duplicateIndex = seenSourceIds.get(sourceIdBase) || 0;
        seenSourceIds.set(sourceIdBase, duplicateIndex + 1);
        const key = duplicateIndex === 0 ? sourceIdBase : `${sourceIdBase}_${duplicateIndex}`;
        const legacyKey = buildLegacySourceKey(keyTitle, seenLegacyKeys);
        const isLoading = Boolean(sourceElement.querySelector('[role="progressbar"], mat-spinner, svg animateTransform'));
        const isDisabled = !checkbox || checkbox.disabled || isLoading;

        return {
            key,
            legacyKey,
            title,
            normalizedTitle: normalizeSourceText(title),
            lowercaseTitle: normalizeSourceText(title),
            ariaLabel,
            fingerprint,
            identityType,
            element: sourceElement,
            iconName,
            iconColorClass,
            checkbox,
            isLoading,
            isDisabled
        };
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

    function buildResolvedSourceStateById(sourceLookup, loadedState) {
        const resolvedSourceState = new Map();
        if (!loadedState) return resolvedSourceState;

        if (loadedState.schemaVersion === STORAGE_SCHEMA_VERSION && loadedState.sourceStateById) {
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
            el('strong', {}, ['Error: ']),
            message + ' ',
            el('button', {
                id: 'sp-dismiss-error',
                style: 'background: rgba(255,255,255,0.2); border: 1px solid white; color: white; border-radius: 4px; padding: 4px 8px; margin-left: 12px; cursor: pointer;'
            }, ['Dismiss'])
        ]);

        document.body.prepend(banner);
        document.getElementById('sp-dismiss-error').addEventListener('click', () => banner.remove());
    }

    function getManagerStatus() {
        const isReady = Boolean(
            shadowRoot &&
            shadowRoot.host &&
            shadowRoot.host.isConnected &&
            shadowRoot.querySelector('.sp-container')
        );

        if (isReady) {
            managerStatusReason = 'ready';
            return { ready: true, reason: 'ready' };
        }

        if (!projectId) {
            managerStatusReason = 'not_on_notebook_page';
            return { ready: false, reason: 'not_on_notebook_page' };
        }

        if (!findElement(DEPS.panel)) {
            managerStatusReason = 'source_panel_missing';
            return { ready: false, reason: 'source_panel_missing' };
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

        showToast(`Deleting ${total} source(s)...`);

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
                    const text = item.textContent.toLowerCase();
                    // Checking for delete icon or common delete text
                    if (text.includes('delete') || text.includes('删除') || text.includes('移除') || item.querySelector('mat-icon')?.textContent.trim() === 'delete') {
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
                        const dialogText = dialog.textContent.toLowerCase();
                        // Only process dialogs that look like a deletion confirmation
                        if (!dialogText.includes('delete') && !dialogText.includes('remove') && !dialogText.includes('删除') && !dialogText.includes('移除')) {
                            continue;
                        }

                        // Find all buttons in the dialog
                        const buttons = dialog.querySelectorAll('button');
                        for (const btn of buttons) {
                            const btnText = btn.textContent.toLowerCase();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            // Stronger heuristic: Primary colored buttons or specific material structure
                            const isPrimaryButton = btn.className.includes('primary') || btn.className.includes('warn');
                            const hasCheckIcon = btn.querySelector('mat-icon')?.textContent.trim() === 'check';
                            const isCancelBtn = btnText.includes('cancel') || btnText.includes('取消') || btnText.includes('no') || btnText.includes('否');

                            if (
                                !isCancelBtn && (
                                    isPrimaryButton || hasCheckIcon ||
                                    btnText.includes('delete') || btnText.includes('删除') ||
                                    btnText.includes('remove') || ariaLabel.includes('delete') ||
                                    btnText.includes('yes') || btnText.includes('确定') ||
                                    btnText.includes('确认') || btnText.includes('confirm')
                                )
                            ) {
                                confirmBtn = btn;
                                break;
                            }
                        }

                        // Refined Fallback: If no explicit match, try to find a warn/primary button, but never blindly click the last button
                        if (!confirmBtn && buttons.length > 0) {
                            const warnBtn = Array.from(buttons).find(b => {
                                const t = b.textContent.toLowerCase();
                                const isCancel = t.includes('cancel') || t.includes('取消');
                                return !isCancel && (b.className.includes('warn') || b.className.includes('primary'));
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

        showToast(chrome.i18n.getMessage("ui_deleted_toast", [deletedCount.toString()]));
        render(); // The heartbeat observer will catch the actual DOM removals eventually
    }


    function isSourceEffectivelyEnabled(source) {
        if (!source) return false;
        return source.enabled && areAllAncestorsEnabled(source.key);
    }

    // --- Persistence Functions ---
    const debouncedStorageSet = debounce((key, data) => {
        try {
            chrome.runtime.sendMessage({ type: 'SAVE_STATE', key, data }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("NotebookLM Source Management 通信失败:", chrome.runtime.lastError);
                }
            });
        } catch (e) {
            console.warn("NotebookLM Source Management: Context invalidated. Please refresh the page.", e);
        }
    }, 1500);

    function buildPersistableState() {
        const sourceStateById = {};

        sourcesByKey.forEach((source, sourceKey) => {
            sourceStateById[sourceKey] = {
                enabled: Boolean(source.enabled),
                title: source.title,
                normalizedTitle: source.normalizedTitle || normalizeSourceText(source.title),
                fingerprint: source.fingerprint || '',
                identityType: source.identityType || 'fingerprint'
            };
        });

        return {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            groups: state.groups,
            groupsById: Object.fromEntries(groupsById),
            ungrouped: state.ungrouped,
            sourceStateById,
            customHeight
        };
    }

    function saveState() {
        if (!projectId) return;
        const key = `sourcesPlusState_${projectId}`;
        const persistableState = buildPersistableState();
        debouncedStorageSet(key, persistableState);
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
                customHeight: stateData.customHeight ?? null
            };
        }

        pendingStorageUpgrade = true;
        return {
            schemaVersion: 1,
            groups: Array.isArray(stateData.groups) ? stateData.groups : [],
            groupsById: stateData.groupsById || {},
            ungrouped: Array.isArray(stateData.ungrouped) ? stateData.ungrouped : [],
            legacyEnabledMap: stateData.enabledMap || {},
            customHeight: stateData.customHeight ?? null
        };
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
            el('h3', { className: 'sp-folder-modal-title' }, [chrome.i18n.getMessage("ui_move_to_folder") || "Move to folder"])
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
                    el('span', { className: 'sp-folder-option-title' }, [group.title || "Group"])
                ]);

                folderBtn.addEventListener('click', () => {
                    executeMoveToFolder(keys, group.id);
                });
                content.appendChild(folderBtn);
            }
        });


        if (!folderFound) {
            const emptyText = chrome.i18n.getMessage("ui_empty_folders") || "No folders available yet.\nCreate one first.";
            content.appendChild(el('div', { className: 'sp-folder-empty' }, [emptyText]));
        }

        const footer = el('div', { className: 'sp-folder-modal-footer' }, [
            el('button', { className: 'sp-modal-cancel' }, [chrome.i18n.getMessage("ui_cancel") || "Cancel"])
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

        buildParentMap();
        saveState();
        render();
        closeMoveToFolderModal();
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

    function render() {
        if (!shadowRoot) return;
        const listContainer = shadowRoot.querySelector('#sources-list');
        if (!listContainer) return;

        const filterQuery = (state.filterQuery || '').toLowerCase();
        const fragment = document.createDocumentFragment();

        const hasMatchingDescendant = (group) => {
            if (!filterQuery) return true;
            for (const child of group.children) {
                if (child.type === 'source') {
                    const source = sourcesByKey.get(child.key);
                    if (source && source.lowercaseTitle && source.lowercaseTitle.includes(filterQuery)) return true;
                } else if (child.type === 'group') {
                    const childGroup = groupsById.get(child.id);
                    if (childGroup && hasMatchingDescendant(childGroup)) return true;
                }
            }
            return false;
        };

        const renderSourceItem = (source) => {
            if (!source || (filterQuery && (!source.lowercaseTitle || !source.lowercaseTitle.includes(filterQuery)))) return null;
            const isGated = !areAllAncestorsEnabled(source.key);
            const isFailed = source.isDisabled && !source.isLoading;
            const isLoading = source.isLoading;

            let extraClasses = '';
            if (isGated) extraClasses += ' gated';
            if (isFailed) extraClasses += ' failed-source';
            if (isLoading) extraClasses += ' loading-source';
            if (state.isBatchMode && pendingBatchKeys.has(source.key)) extraClasses += ' selected-for-batch';

            let titleAttr = false;
            if (isFailed) titleAttr = chrome.i18n.getMessage("ui_source_import_failed");
            if (isLoading) titleAttr = chrome.i18n.getMessage("ui_source_parsing");

            return el('div', {
                className: 'source-item' + extraClasses,
                draggable: !state.isBatchMode && !isFailed && !isLoading ? 'true' : 'false',
                dataset: { sourceKey: source.key },
                title: titleAttr
            }, [
                el('div', { className: 'icon-container' }, [
                    isLoading ?
                        el('div', { className: 'sp-spinner' }) :
                        el('mat-icon', { className: `${source.iconColorClass || 'icon-color'} mat-icon google-symbols` }, [isFailed ? 'error' : source.iconName])
                ]),
                el('div', { className: 'menu-container' }, [
                    // Only show standard options buttons when not in delete mode AND not loading
                    !state.isBatchMode && !isLoading ? el('button', {
                        className: 'sp-move-to-folder-button',
                        dataset: { sourceKey: source.key },
                        title: chrome.i18n.getMessage("ui_move_to_folder") || "Move to folder"
                    }, [
                        el('span', { className: 'google-symbols' }, ['drive_file_move'])
                    ]) : '',
                    !state.isBatchMode && !isLoading ? el('button', { className: 'sp-more-button', dataset: { sourceKey: source.key } }, [
                        el('span', { className: 'google-symbols' }, ['more_vert'])
                    ]) : ''
                ]),
                el('div', { className: 'title-container' }, [source.title]),
                el('div', { className: 'checkbox-container' }, [
                    state.isBatchMode ?
                        el('input', {
                            type: 'checkbox',
                            className: 'sp-batch-checkbox sp-checkbox',
                            dataset: { sourceKey: source.key },
                            checked: pendingBatchKeys.has(source.key),
                            disabled: isFailed || isLoading
                        })
                        :
                        el('input', {
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
            if (!hasMatchingDescendant(group)) return null;

            const isGated = !group.enabled || !areAllAncestorsEnabled(group.id);
            const { on, total } = getGroupEffectiveState(group);

            const childrenElements = [];
            group.children.forEach(child => {
                if (child.type === 'source') {
                    const elNode = renderSourceItem(sourcesByKey.get(child.key));
                    if (elNode) childrenElements.push(elNode);
                } else if (child.type === 'group') {
                    const childGroup = groupsById.get(child.id);
                    if (childGroup) {
                        const childElement = renderGroup(childGroup, 0);
                        if (childElement) childrenElements.push(childElement);
                    }
                }
            });

            const groupEl = el('div', {
                className: 'group-container' + (isGated ? ' gated' : '') + (group.isNewlyCreated ? ' sp-folder-enter' : ''),
                dataset: { groupId: group.id },
                style: `padding-left: ${level * 20}px`
            }, [
                el('div', { className: 'group-header', draggable: !state.isBatchMode ? 'true' : 'false', dataset: { dragType: 'group', groupId: group.id } }, [
                    el('button', {
                        className: 'sp-caret' + (group.collapsed ? ' collapsed' : ''),
                        title: group.collapsed ? chrome.i18n.getMessage("ui_expand") : chrome.i18n.getMessage("ui_collapse")
                    }, [
                        el('span', { className: 'google-symbols' }, ['arrow_drop_down'])
                    ]),
                    !state.isBatchMode ? el('label', {
                        className: 'sp-toggle-switch',
                        title: group.enabled ? chrome.i18n.getMessage("ui_disable_group") : chrome.i18n.getMessage("ui_enable_group")
                    }, [
                        el('input', { type: 'checkbox', className: 'sp-group-toggle-checkbox', dataset: { groupId: group.id }, checked: group.enabled }),
                        el('span', { className: 'sp-toggle-slider' })
                    ]) : '',
                    el('span', { className: 'group-title' }, ['📁 ' + group.title]),
                    el('span', { className: 'badge' }, [` ${on} / ${total} `]),
                    el('button', { className: 'sp-add-subgroup-button', title: chrome.i18n.getMessage("ui_add_subgroup") }, [el('span', { className: 'google-symbols' }, ['create_new_folder'])]),
                    el('button', { className: 'sp-isolate-button', title: chrome.i18n.getMessage("ui_isolate_group") }, [el('span', { className: 'google-symbols' }, ['filter_center_focus'])]),
                    el('button', { className: 'sp-edit-button', title: chrome.i18n.getMessage("ui_rename") }, [el('span', { className: 'google-symbols' }, ['edit'])]),
                    el('button', { className: 'sp-delete-button', title: chrome.i18n.getMessage("ui_delete_group") }, [el('span', { className: 'google-symbols' }, ['delete'])])
                ]),
                el('div', { className: 'group-children' + (group.collapsed ? ' collapsed' : '') }, childrenElements)
            ]);

            // Remove the flag so it only animates once
            if (group.isNewlyCreated) {
                delete group.isNewlyCreated;
            }

            return groupEl;
        };

        state.groups.forEach(groupId => {
            const group = groupsById.get(groupId);
            if (group) {
                const groupElement = renderGroup(group, 0);
                if (groupElement) fragment.appendChild(groupElement);
            }
        });

        const matchingUngrouped = state.ungrouped.filter(key => {
            const source = sourcesByKey.get(key);
            return source && (!filterQuery || (source.lowercaseTitle && source.lowercaseTitle.includes(filterQuery)));
        });

        if (matchingUngrouped.length > 0) {
            const ungroupedHeader = document.createElement('h4');
            ungroupedHeader.className = 'ungrouped-header';
            ungroupedHeader.textContent = chrome.i18n.getMessage("ui_ungrouped");
            fragment.appendChild(ungroupedHeader);

            matchingUngrouped.forEach(key => {
                const sourceElement = renderSourceItem(sourcesByKey.get(key));
                if (sourceElement) {
                    fragment.appendChild(sourceElement);
                }
            });
        }

        // Render Batch Action Bar
        if (state.isBatchMode) {
            const actionBar = el('div', { className: 'sp-batch-action-bar' }, [
                el('button', { className: 'sp-button sp-cancel-batch-btn' }, [chrome.i18n.getMessage("ui_cancel")]),
                el('div', { className: 'sp-batch-actions' }, [
                    el('button', {
                        className: 'sp-button sp-batch-add-folder-btn',
                        disabled: pendingBatchKeys.size === 0 || isDeletingSources
                    }, [chrome.i18n.getMessage("ui_batch_add_count", [pendingBatchKeys.size.toString()])]),
                    el('button', {
                        className: 'sp-button sp-confirm-delete-btn',
                        disabled: pendingBatchKeys.size === 0 || isDeletingSources
                    }, [isDeletingSources ? chrome.i18n.getMessage("ui_deleting") : chrome.i18n.getMessage("ui_delete_count", [pendingBatchKeys.size.toString()])])
                ])
            ]);
            fragment.appendChild(actionBar);
        }

        patchChildren(listContainer, fragment);
    }

    // --- Action & Event Handlers ---
    function handleAddNewGroup(parentGroupId = null) {
        // Inject the one-time isNewlyCreated flag for the entry animation
        const newGroup = {
            id: `group_${Date.now()}`,
            title: parentGroupId ? chrome.i18n.getMessage("ui_new_subgroup") : chrome.i18n.getMessage("ui_new_group"),
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
        saveState();
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

    function isDescendant(possibleChild, possibleParent, groupsById) {
        if (!possibleChild || !possibleParent || possibleChild.id === possibleParent.id) return true;
        const visit = (g) => {
            if (!g) return false;
            return g.children.some(c => {
                if (c.type === 'group') {
                    if (c.id === possibleChild.id) return true;
                    return visit(groupsById.get(c.id));
                }
                return false;
            });
        };
        return visit(possibleParent);
    }

    function handleInteraction(event) {
        const target = event.target;
        const groupContainer = target.closest('.group-container');
        const groupId = groupContainer?.dataset.groupId;

        if (target.closest('.sp-add-subgroup-button')) { handleAddNewGroup(groupId); return; }
        if (target.closest('.sp-caret')) {
            const g = groupsById.get(groupId);
            if (g) {
                g.collapsed = !g.collapsed;

                // Animation Logic
                const caret = groupContainer.querySelector('.sp-caret');
                const childrenContainer = groupContainer.querySelector('.group-children');

                if (g.collapsed) {
                    caret.classList.add('collapsed');
                    // Set explicit height before transitioning to 0
                    childrenContainer.style.height = childrenContainer.scrollHeight + 'px';
                    // Force reflow
                    childrenContainer.offsetHeight;
                    childrenContainer.style.height = '0px';
                    childrenContainer.classList.add('collapsed');
                } else {
                    caret.classList.remove('collapsed');
                    childrenContainer.classList.remove('collapsed');
                    // Set height to scrollHeight for transition
                    childrenContainer.style.height = childrenContainer.scrollHeight + 'px';

                    // After transition, remove explicit height so it can grow/shrink dynamically
                    childrenContainer.addEventListener('transitionend', function handler() {
                        childrenContainer.style.height = 'auto';
                        childrenContainer.removeEventListener('transitionend', handler);
                    });
                }

                saveState();
            }
            return;
        }
        if (target.closest('.sp-isolate-button')) {
            const oldStates = getEffectivelyEnabledSources();

            groupsById.forEach(g => { g.enabled = (g.id === groupId); });

            const newStates = getEffectivelyEnabledSources();

            oldStates.forEach((_, key) => {
                if (!newStates.has(key)) {
                    syncSourceToPage(sourcesByKey.get(key), false);
                }
            });
            newStates.forEach((_, key) => {
                if (!oldStates.has(key)) {
                    syncSourceToPage(sourcesByKey.get(key), true);
                }
            });

            render();
            saveState();
            showToast(`Isolated "${groupsById.get(groupId).title}"`);
            return;
        }

        // MODIFIED: Logic is now split. This handles the new group toggle switch.
        if (target.classList.contains('sp-group-toggle-checkbox')) {
            const targetGroupId = target.dataset.groupId;
            const group = groupsById.get(targetGroupId);
            if (group) {
                const descendantKeys = [];
                const getKeys = (g) => {
                    if (!g) return;
                    g.children.forEach(c => {
                        if (c.type === 'source') descendantKeys.push(c.key);
                        else getKeys(groupsById.get(c.id));
                    });
                };
                getKeys(group);

                const oldEffectiveStates = new Map();
                descendantKeys.forEach(key => {
                    oldEffectiveStates.set(key, isSourceEffectivelyEnabled(sourcesByKey.get(key)));
                });

                group.enabled = target.checked;

                descendantKeys.forEach(key => {
                    const source = sourcesByKey.get(key);
                    const newEffectiveState = isSourceEffectivelyEnabled(source);
                    if (oldEffectiveStates.get(key) !== newEffectiveState) {
                        syncSourceToPage(source, newEffectiveState);
                    }
                });

                saveState();
                render();
            }
        }
        // MODIFIED: This now only handles individual source checkboxes.
        else if (target.classList.contains('sp-checkbox')) {
            const sourceKey = target.dataset.sourceKey;
            if (sourceKey) {
                const source = sourcesByKey.get(sourceKey);
                if (source && !source.isDisabled) {
                    source.enabled = target.checked;
                    if (areAllAncestorsEnabled(sourceKey)) {
                        syncSourceToPage(source, source.enabled);
                    }
                    saveState();

                    // Localized Badge Update instead of full re-render
                    const groupObj = findParentGroupOfSource(sourceKey);
                    if (groupObj) {
                        const { on, total } = getGroupEffectiveState(groupObj);
                        const badgeEl = shadowRoot.querySelector(`[data-group-id="${groupObj.id}"] .badge`);
                        if (badgeEl) badgeEl.textContent = ` ${on} / ${total} `;
                    }
                }
            }
        }
        // Handle clicking on the group header to toggle collapse (unless clicking a button/input)
        else if (target.closest('.group-header') && !target.closest('.sp-caret, .sp-toggle-switch, .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button, input')) {
            const g = groupsById.get(groupId);
            if (g) {
                g.collapsed = !g.collapsed;

                // Animation Logic
                const caret = groupContainer.querySelector('.sp-caret');
                const childrenContainer = groupContainer.querySelector('.group-children');

                if (g.collapsed) {
                    caret.classList.add('collapsed');
                    childrenContainer.style.height = childrenContainer.scrollHeight + 'px';
                    childrenContainer.offsetHeight; // Force reflow
                    childrenContainer.style.height = '0px';
                    childrenContainer.classList.add('collapsed');
                } else {
                    caret.classList.remove('collapsed');
                    childrenContainer.classList.remove('collapsed');
                    childrenContainer.style.height = childrenContainer.scrollHeight + 'px';

                    childrenContainer.addEventListener('transitionend', function handler() {
                        childrenContainer.style.height = 'auto';
                        childrenContainer.removeEventListener('transitionend', handler);
                    });
                }
                saveState();
            }
        }
        // Handle clicking on the source item row to toggle checkbox (unless clicking button/checkbox)
        else if (target.closest('.source-item') && !target.closest('.sp-more-button, .sp-move-to-folder-button, input, .sp-batch-checkbox')) {
            const sourceRow = target.closest('.source-item');
            const sourceKey = sourceRow.dataset.sourceKey;
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
                    if (areAllAncestorsEnabled(sourceKey)) {
                        syncSourceToPage(source, source.enabled);
                    }
                    saveState();

                    // Localized Badge Update
                    const groupObj = findParentGroupOfSource(sourceKey);
                    if (groupObj) {
                        const { on, total } = getGroupEffectiveState(groupObj);
                        const badgeEl = shadowRoot.querySelector(`[data-group-id="${groupObj.id}"] .badge`);
                        if (badgeEl) badgeEl.textContent = ` ${on} / ${total} `;
                    }
                }
            }
        }

        // Handle Batch Checkbox explicit click directly
        const batchCheckbox = target.closest('.sp-batch-checkbox');
        if (batchCheckbox) {
            const sourceKey = batchCheckbox.dataset.sourceKey;
            if (pendingBatchKeys.has(sourceKey)) {
                pendingBatchKeys.delete(sourceKey);
            } else {
                pendingBatchKeys.add(sourceKey);
            }
            render();
            return;
        }

        // Handle Batch Action Bar Buttons
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

        const moreButton = target.closest('.sp-more-button');
        if (moreButton) {
            const key = moreButton.dataset.sourceKey;
            const source = sourcesByKey.get(key);
            if (source?.element) {
                const nativeBtn = findElement(DEPS.moreBtn, source.element);
                if (nativeBtn) {
                    // With styles.css now using `position: absolute`/`opacity: 0` instead of `display: none`,
                    // the native elements maintain their bounding rectangles in the DOM.
                    // This means Angular CDK can measure them directly without hacks.
                    nativeBtn.click();
                }
            }
        }
        const editButton = target.closest('.sp-edit-button');
        if (editButton) {
            triggerRename(groupContainer);
        }

        // --- Added: Delete Group ---
        const deleteButton = target.closest('.sp-delete-button');
        if (deleteButton) {
            const group = groupsById.get(groupId);
            if (!group) return;

            // Optional custom confirm dialog style can be added. Using browser confirm for simplicity.
            if (group.children.length === 0) {
                // Empty folder, just delete
                removeGroupFromTree(groupId);
                groupsById.delete(groupId);
            } else {
                // Folder has contents
                const deleteContents = window.confirm(
                    `The folder "${group.title}" is not empty.\n\n` +
                    `[OK] Delete folder AND move its contents to "Ungrouped"\n` +
                    `[Cancel] Keep group`
                );

                if (deleteContents) {
                    // Extract children back to ungrouped / groups level
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
                    return; // Cancelled
                }
            }
            buildParentMap();
            saveState();
            render();
        }

        // --- Move To Folder Modal Trigger ---
        const moveButton = target.closest('.sp-move-to-folder-button');
        if (moveButton) {
            const key = moveButton.dataset.sourceKey;
            renderMoveToFolderModal(key);
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

                // Localized View Sync
                const virtualCheckbox = shadowRoot.querySelector(`.sp-checkbox[data-source-key="${key}"]`);
                if (virtualCheckbox) {
                    virtualCheckbox.checked = checkbox.checked;
                }

                // Localized Badge Update
                const groupObj = findParentGroupOfSource(key);
                if (groupObj) {
                    const { on, total } = getGroupEffectiveState(groupObj);
                    const badgeEl = shadowRoot.querySelector(`[data-group-id="${groupObj.id}"] .badge`);
                    if (badgeEl) badgeEl.textContent = ` ${on} / ${total} `;
                }
                saveState();
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
        titleSpan.textContent = '📁 ';
        titleSpan.appendChild(input);
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
            saveState();
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
        saveState();
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
        if (!isFirstLoad) {
            sourcesByKey.forEach((source, key) => {
                oldSourcesMap.set(key, { enabled: source.enabled });
            });
        }

        sourcesByKey.clear();
        keyByElement = new WeakMap();

        const sourceElements = Array.from(queryAllElements(DEPS.row));
        if (sourceElements.length === 0 && Array.from(document.body.children).length > 2) {
            // The native panel can be empty while NotebookLM is still loading initial results.
        }

        const seenSourceIds = new Map();
        const seenLegacyKeys = new Map();
        const currentSources = sourceElements.map((sourceElement) => (
            createSourceDescriptor(sourceElement, seenSourceIds, seenLegacyKeys)
        ));
        const sourceLookup = buildSourceLookup(currentSources);
        const resolvedSourceStateById = isFirstLoad
            ? buildResolvedSourceStateById(sourceLookup, loadedState)
            : new Map();

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
            groupsById.forEach((group) => {
                group.children.forEach((child) => {
                    if (child.type === 'source') knownSourceRefs.add(child.key);
                });
            });
            state.ungrouped.forEach((key) => knownSourceRefs.add(key));
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

            if (!knownSourceRefs.has(source.key)) {
                state.ungrouped.push(source.key);
                knownSourceRefs.add(source.key);
            }
        });

        buildParentMap();
        sourcesByKey.forEach((source) => {
            syncSourceToPage(source, isSourceEffectivelyEnabled(source));
        });

        return isFirstLoad && pendingStorageUpgrade;
    }

    const debouncedScanAndSync = debounce(() => {
        try {
            // Pass false for isFirstLoad because this is triggered by DOM mutations
            scanAndSyncSources({}, false);
            render();
            saveState();
        } catch (e) {
            console.error("NotebookLM Source Management: Error syncing state during DOM change.", e);
        }
    }, 500);

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

    function teardown() {
        if (scrollObserver) {
            scrollObserver.disconnect();
            scrollObserver = null;
        }
        if (healthCheckInterval) {
            clearTimeout(healthCheckInterval); // Now using setTimeout for adaptive backoff
            healthCheckInterval = null;
        }
        document.removeEventListener('change', handleOriginalCheckboxChange, true);
        if (shadowRoot && shadowRoot.host) {
            shadowRoot.host.remove();
            shadowRoot = null;
        }
        extensionHost = null;
        if (focusHighlightTimeout) {
            clearTimeout(focusHighlightTimeout);
            focusHighlightTimeout = null;
        }
        if (routeRecoveryTimeout) {
            clearTimeout(routeRecoveryTimeout);
            routeRecoveryTimeout = null;
        }
        removeGlobalOverlayStyle();
        groupsById.clear();
        sourcesByKey.clear();
        parentMap.clear();
        keyByElement = new WeakMap();
        state.groups = [];
        state.ungrouped = [];
        state.filterQuery = '';
        state.isBatchMode = false;
        isSyncingState = false;
        clickQueue = [];
        isProcessingQueue = false;
        freshRowCache = null;
        pendingStorageUpgrade = false;
        managerStatusReason = 'manager_not_ready';
    }

    function recoverManagerForRoute(targetProjectId, attempt = 0, recoveryToken = activeRouteRecoveryToken) {
        waitForElement(DEPS.panel, {
            observerRoot: document.body,
            timeoutMs: ROUTE_REINIT_RETRY_DELAY_MS
        }).then((panel) => {
            if (recoveryToken !== activeRouteRecoveryToken) return;

            if (panel && getProjectId() === targetProjectId) {
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
                activeRouteRecoveryToken += 1;
                projectId = null;
                teardown();
                managerStatusReason = 'not_on_notebook_page';
            }
            return;
        }

        if (newProjectId !== projectId) {
            console.log(`NotebookLM Source Management: Route changed from ${projectId} to ${newProjectId}. Reinitializing manager.`);
            activeRouteRecoveryToken += 1;
            projectId = newProjectId;
            managerStatusReason = 'manager_not_ready';
            teardown();
            recoverManagerForRoute(newProjectId, 0, activeRouteRecoveryToken);
        }
    }

    function init(sourcePanel) {
        const extensionRoot = document.createElement('div');
        extensionRoot.id = 'sources-plus-root';
        extensionHost = extensionRoot;
        shadowRoot = extensionRoot.attachShadow({ mode: 'open' });
        managerStatusReason = 'manager_not_ready';
        const style = document.createElement('style');
        style.textContent = contentStyleText;
        shadowRoot.appendChild(style);

        const containerHtml = createManagerShell(el, chrome);
        shadowRoot.appendChild(containerHtml);

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
            const newHeight = startHeight + (e.clientY - startY);
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

        shadowRoot.getElementById('sp-batch-action-btn').addEventListener('click', () => {
            if (isDeletingSources) return;
            state.isBatchMode = !state.isBatchMode;
            pendingBatchKeys.clear();
            render();
        });

        const searchInput = shadowRoot.getElementById('sp-search');
        const handleSearchInput = debounce((e) => { state.filterQuery = e.target.value; render(); }, 300);

        // Immediate search trigger
        const triggerImmediateSearch = () => {
            state.filterQuery = searchInput.value;
            render();
        };

        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerImmediateSearch();
            }
        });
        shadowRoot.getElementById('sp-search-btn').addEventListener('click', triggerImmediateSearch);

        const listContainer = shadowRoot.querySelector('#sources-list');
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

            loadState((loadedState) => {
                const shouldUpgradeStorage = scanAndSyncSources(loadedState, true);
                render();
                if (shouldUpgradeStorage) {
                    pendingStorageUpgrade = false;
                    saveState();
                }
            });
        } else {
            managerStatusReason = 'panel_header_missing';
            showCrashBanner("NotebookLM Source Management: Initialization failed. Could not locate panel header.");
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
                showCrashBanner("NotebookLM Source Management: Could not find NotebookLM panel. Google may have updated the page structure.");
                return;
            }
            init(panel);
        }).catch(err => {
            console.error("NotebookLM Source Management init error:", err);
            managerStatusReason = 'manager_not_ready';
            showCrashBanner("NotebookLM Source Management: Initialization error. Check console for details.");
        });
    }

    // Monitor for SPA route changes
    let currentUrl = location.href;
    const routeObserver = new MutationObserver(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            handleRouteChanged();
        }
    });
    routeObserver.observe(document.body, { subtree: true, childList: true });

    // Expose internals for testing
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            areAllAncestorsEnabled,
            buildPersistableState,
            createSourceDescriptor,
            findFreshCheckbox,
            normalizeLoadedState,
            processClickQueue,
            removeGroupFromTree,
            scanAndSyncSources,
            syncSourceToPage,
            parentMap,
            groupsById,
            executeBatchDelete,
            loadState,
            pendingBatchKeys,
            sourcesByKey,
            state,
            DEPS,
            saveState,
            getManagerStatus,
            focusManagerPanel,
            handleManagerMessage,
            handleRouteChanged,
            recoverManagerForRoute,
            _getClickQueueLength: () => clickQueue.length,
            _getIsDeletingSources: () => isDeletingSources,
            _getIsSyncingState: () => isSyncingState,
            _setIsDeletingSources: (val) => { isDeletingSources = val; },
            _getFreshRowCache: () => freshRowCache,
            _getPendingStorageUpgrade: () => pendingStorageUpgrade,
            _setCustomHeight: (val) => { customHeight = val; },
            _setManagerStatusReason: (val) => { managerStatusReason = val; },
            _setProjectId: (val) => { projectId = val; },
            _setShadowRootForTest: (val) => { shadowRoot = val; extensionHost = val && val.host ? val.host : null; },
            _resetState: () => {
                state.groups = [];
                state.ungrouped = [];
                state.filterQuery = '';
                state.isBatchMode = false;
                pendingBatchKeys.clear();
                isDeletingSources = false;
                groupsById.clear();
                sourcesByKey.clear();
                parentMap.clear();
                customHeight = null;
                projectId = null;
                shadowRoot = document.createElement('div').attachShadow({ mode: 'open' }); // Mock shadowRoot for testing showToast
                extensionHost = shadowRoot.host;
                freshRowCache = null;
                clickQueue = [];
                isProcessingQueue = false;
                isSyncingState = false;
                pendingStorageUpgrade = false;
                activeRouteRecoveryToken = 0;
                routeRecoveryTimeout = null;
                managerStatusReason = 'manager_not_ready';
                if (focusHighlightTimeout) {
                    clearTimeout(focusHighlightTimeout);
                    focusHighlightTimeout = null;
                }
            }
        };
    }

})();
