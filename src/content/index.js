(function () {
    'use strict';

    // --- Selectors & Dependencies ---
    const DEPS = {
        panel: ['[data-testid="source-panel"]', '.source-panel'], // Fallbacks inside arrays
        scroll: ['.scroll-area'],
        row: ['[data-testid="source-item"]', '.single-source-container'],
        title: ['[data-testid="source-title"]', '.source-title'],
        checkbox: ['input[type="checkbox"]', '.select-checkbox input[type="checkbox"]'],
        moreBtn: ['[aria-label="More options"]', '.source-item-more-button'],
        icon: ['mat-icon[class*="-icon-color"]', 'mat-icon:not([aria-label="More options"] mat-icon):not(button mat-icon)']
    };
    // Kept for legacy compatibility in other parts of the script where DEPS.x[0] is sufficient
    const SCROLL_AREA_SELECTOR = DEPS.scroll[0];
    const SOURCE_TITLE_SELECTOR = DEPS.title[0];
    const SOURCE_CHECKBOX_SELECTOR = DEPS.checkbox[0];
    const SOURCE_ICON_SELECTOR = DEPS.icon[0];

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

    function waitForElement(selectors) {
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
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
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
                        console.warn(`Sources+: Could not find confirmation button in dialog for source key: ${key}`);
                        // Try to close dialog by clicking escape or backdrop if possible, fallback to body click
                        document.body.click();
                    }

                } else {
                    // Close menu if delete button wasn't found (safety)
                    document.body.click();
                    console.warn(`Sources+: Could not find delete menu item for source key: ${key}`);
                }
            } catch (err) {
                console.error("Sources+: Error during automated deletion step", err);
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
                    console.error("Sources+ 通信失败:", chrome.runtime.lastError);
                }
            });
        } catch (e) {
            console.warn("Sources+: Context invalidated. Please refresh the page.", e);
        }
    }, 1500);

    function saveState() {
        if (!projectId) return;
        const key = `sourcesPlusState_${projectId}`;
        const enabledMap = {};
        sourcesByKey.forEach((source, sourceKey) => { enabledMap[sourceKey] = source.enabled; });
        const persistableState = {
            groups: state.groups,
            groupsById: Object.fromEntries(groupsById),
            ungrouped: state.ungrouped,
            enabledMap: enabledMap,
            customHeight: customHeight
        };
        debouncedStorageSet(key, persistableState);
    }

    function loadState(callback) {
        if (!projectId) return callback();
        const key = `sourcesPlusState_${projectId}`;
        try {
            chrome.runtime.sendMessage({ type: 'LOAD_STATE', key }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("Sources+ 未能连接后台:", chrome.runtime.lastError);
                    buildParentMap();
                    return callback({});
                }
                const stateData = response && response.data;
                if (stateData) {
                    if (stateData.groupsById) {
                        state.groups = stateData.groups || [];
                        state.ungrouped = stateData.ungrouped || [];
                        groupsById = new Map(Object.entries(stateData.groupsById));
                        groupsById.forEach(g => {
                            if (g.enabled === undefined) g.enabled = true;
                            if (g.collapsed === undefined) g.collapsed = false;
                        });
                    }
                    if (stateData.customHeight) {
                        customHeight = stateData.customHeight;
                        const container = shadowRoot.querySelector('.sp-container');
                        if (container) container.style.height = `${customHeight}px`;
                    }
                }
                buildParentMap();
                callback((stateData && stateData.enabledMap) || {});
            });
        } catch (e) {
            console.warn("Sources+: Context invalidated during load. Please refresh the page.", e);
            buildParentMap();
            callback({});
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
    function scanAndSyncSources(loadedEnabledMap, isFirstLoad = false) {
        const allKnownKeys = new Set();
        groupsById.forEach(g => g.children.forEach(c => { if (c.type === 'source') allKnownKeys.add(c.key); }));
        state.ungrouped.forEach(key => allKnownKeys.add(key));

        // Don't clear sourcesByKey completely on re-renders, otherwise we lose extension state
        const oldSourcesMap = new Map();
        if (!isFirstLoad) {
            sourcesByKey.forEach((val, key) => oldSourcesMap.set(key, val.enabled));
        }

        sourcesByKey.clear();
        keyByElement = new WeakMap();
        const sourceElements = queryAllElements(DEPS.row);
        if (sourceElements.length === 0 && Array.from(document.body.children).length > 2) {
            // Document might be still loading the initial sources over network or panel is empty.
            // Suppressed console.warn to keep extension log clean.
        }

        const seenTitlesCount = new Map();

        Array.from(sourceElements).forEach((el) => {
            const titleEl = findElement(DEPS.title, el);
            const checkbox = findElement(DEPS.checkbox, el);
            const label = checkbox ? checkbox.getAttribute('aria-label') : '';
            const keyTitle = label || titleEl?.textContent || '';
            const title = titleEl?.textContent.trim() || 'Untitled Source';
            
            let iconEl = findElement(DEPS.icon, el);
            let iconName = iconEl?.textContent.trim() || 'article';
            
            // Map unsupported or missing icons to valid Google Symbols
            const iconMap = {
                'video_youtube': 'smart_display',
                'more_vert': 'article', // Prevent grabbing the wrong icon
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
            
            const baseKey = generateSourceKey(keyTitle);
            const count = seenTitlesCount.get(baseKey) || 0;
            seenTitlesCount.set(baseKey, count + 1);
            const key = count === 0 ? baseKey : `${baseKey}_${count}`;

            // Heuristic to detect if a source is currently loading
            // NotebookLM uses role="progressbar" or mat-spinner when loading a document
            const isLoadingDom = el.querySelector('[role="progressbar"], mat-spinner, svg animateTransform');
            const isLoading = !!isLoadingDom;

            const isDisabled = !checkbox || checkbox.disabled || isLoading;
            let enabled;
            if (isFirstLoad) {
                enabled = (key in loadedEnabledMap) ? loadedEnabledMap[key] : (checkbox?.checked || false);
            } else {
                // On DOM re-render, prefer our local extension state over the potentially stale native state
                enabled = oldSourcesMap.has(key) ? oldSourcesMap.get(key) : (checkbox?.checked || false);
            }

            const lowercaseTitle = title ? title.toLowerCase() : '';
            sourcesByKey.set(key, { key, title, lowercaseTitle, element: el, enabled, iconName, iconColorClass, isDisabled, isLoading });
            keyByElement.set(el, key);
            if (!allKnownKeys.has(key)) {
                state.ungrouped.push(key);
            }
        });

        buildParentMap();
        sourcesByKey.forEach(source => {
            syncSourceToPage(source, isSourceEffectivelyEnabled(source));
        });
    }

    const debouncedScanAndSync = debounce(() => {
        try {
            // Pass false for isFirstLoad because this is triggered by DOM mutations
            scanAndSyncSources({}, false);
            render();
            saveState();
        } catch (e) {
            console.error("Sources+: Error syncing state during DOM change.", e);
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
            console.error("Sources+: Failed handling mutations.", e);
        }
    }

    // --- Lifecycle Management ---
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
        groupsById.clear();
        sourcesByKey.clear();
        parentMap.clear();
        keyByElement = new WeakMap();
        state = { groups: [], ungrouped: [], filterQuery: '' };
        isSyncingState = false;
        clickQueue = [];
        isProcessingQueue = false;
        freshRowCache = null;
    }

    function handleRouteChanged() {
        const newProjectId = getProjectId();
        if (newProjectId && newProjectId !== projectId) {
            console.log(`Sources+: Route changed from ${projectId} to ${newProjectId}. Re-initializing.`);
            projectId = newProjectId;
            teardown();

            waitForElement(DEPS.panel).then(panel => {
                if (panel) init(panel);
            });
        }
    }

    function init(sourcePanel) {
        const extensionRoot = document.createElement('div');
        shadowRoot = extensionRoot.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        // MODIFIED: Added styles for the new toggle switch and removed tri-state checkbox styles.
        style.textContent = `
            @font-face {
                font-family: 'Google Symbols';
                font-style: normal;
                font-weight: 400;
                src: url(
                    https://fonts.gstatic.com/s/googlesymbols/v342/HhzMU5Ak9u-oMExPeInvcuEmPosC9zyteYEFU68cPrjdKM1XLPTxlGmzczpgWvF1d8Yp7AudBnt3CPar1JFWjoLAUv3G-tSNljixIIGUsC62cYrKiAw.woff2
                ) format('woff2');
            }
            .google-symbols {
                font-family: 'Google Symbols';
                font-weight: normal;
                font-style: normal;
                font-size: 18px;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                display: inline-block;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr;
                -webkit-font-feature-settings: 'liga';
                -webkit-font-smoothing: antialiased;
            }
            
            /* -------- Light Mode (Default) -------- */
            :host {
                --sp-bg-primary: transparent;
                --sp-bg-secondary: rgba(0,0,0,0.03);
                --sp-bg-hover: rgba(0,0,0,0.04);
                --sp-bg-button: #fff;
                --sp-bg-button-hover: #f5f5f7;
                --sp-bg-button-active: #ebebeb;
                --sp-bg-toast: rgba(0,0,0,0.8);
                --sp-bg-badge: rgba(0,0,0,0.05);
                --sp-bg-switch: #e9e9ea;
                --sp-bg-switch-thumb: white;
                --sp-bg-checkbox: #fff;
                --sp-border-light: rgba(0,0,0,0.1);
                --sp-border-medium: rgba(0,0,0,0.15);
                --sp-border-checkbox: rgba(0,0,0,0.25);
                --sp-text-primary: #1A1A1C;
                --sp-text-secondary: #6E6E73;
                --sp-text-toast: #fff;
                --sp-text-badge: #6E6E73;
                --sp-accent: #007aff;
                --sp-accent-danger: #ff3b30;
                --sp-accent-success: #34c759;
                --sp-drag-bg: rgba(0, 122, 255, 0.05);
                --sp-drag-into-bg: rgba(0, 122, 255, 0.1);
                --sp-shadow-toast: 0 8px 32px rgba(0,0,0,0.08);
                --sp-shadow-button: 0 8px 32px rgba(0,0,0,0.08);
                --sp-shadow-switch-thumb: 0 1px 2px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.1);
                --sp-icon-button-hover: rgba(0,0,0,0.08);
                
                /* Global Glassmorphism Variables */
                --sp-glass-bg-body: rgba(255, 255, 255, 0.85);
                --sp-glass-bg-menu: rgba(255, 255, 255, 0.85);
                --sp-glass-border: rgba(0, 0, 0, 0.05);
                --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
            }

            /* -------- Dark Mode Override -------- */
            @media (prefers-color-scheme: dark) {
                :host {
                    --sp-bg-secondary: rgba(255,255,255,0.05);
                    --sp-bg-hover: rgba(255,255,255,0.08);
                    --sp-bg-button: #1c1c1e;
                    --sp-bg-button-hover: #2c2c2e;
                    --sp-bg-button-active: #3a3a3c;
                    --sp-bg-toast: rgba(255,255,255,0.9);
                    --sp-bg-badge: rgba(255,255,255,0.1);
                    --sp-bg-switch: #39393d;
                    --sp-bg-switch-thumb: white;
                    --sp-bg-checkbox: rgba(255,255,255,0.1);
                    --sp-border-light: rgba(255,255,255,0.1);
                    --sp-border-medium: rgba(255,255,255,0.2);
                    --sp-border-checkbox: rgba(255,255,255,0.6);
                    --sp-text-primary: #f5f5f7;
                    --sp-text-secondary: #98989d;
                    --sp-text-toast: #000;
                    --sp-text-badge: #98989d;
                    --sp-accent: #0a84ff;
                    --sp-accent-danger: #ff453a;
                    --sp-accent-success: #30d158;
                    --sp-drag-bg: rgba(10, 132, 255, 0.1);
                    --sp-drag-into-bg: rgba(10, 132, 255, 0.15);
                    --sp-shadow-toast: 0 8px 32px rgba(0,0,0,0.4);
                    --sp-shadow-button: 0 8px 32px rgba(0,0,0,0.2);
                    --sp-shadow-switch-thumb: 0 1px 2px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2);
                    --sp-icon-button-hover: rgba(255,255,255,0.15);
                    
                    /* Global Glassmorphism Variables */
                    --sp-glass-bg-body: rgba(28, 28, 30, 0.85);
                    --sp-glass-bg-menu: rgba(44, 44, 46, 0.85);
                    --sp-glass-border: rgba(255, 255, 255, 0.15);
                    --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }
            }

            .sp-container {
                display: flex;
                flex-direction: column;
                max-height: calc(100vh - 220px);
                min-height: 150px;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: var(--sp-text-primary);
                position: relative;
            }
            .sp-resizer {
                height: 8px;
                width: 100%;
                cursor: ns-resize;
                position: absolute;
                bottom: -4px;
                left: 0;
                z-index: 10;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .sp-resizer::after {
                content: '';
                width: 30px;
                height: 3px;
                background-color: var(--sp-border-medium);
                border-radius: 3px;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-resizer:hover::after {
                background-color: var(--sp-accent);
            }
            
            /* Sticky Header with Glassmorphism */
            .sp-controls { 
                display: flex; gap: 8px; flex-shrink: 0; align-items: center; 
                position: sticky; top: 0; z-index: 5;
                padding: 12px 8px 12px 0;
                margin-bottom: 0; /* Handled by padding now */
                background: var(--sp-glass-bg-body);
                backdrop-filter: blur(12px) saturate(180%);
                -webkit-backdrop-filter: blur(12px) saturate(180%);
                border-bottom: 1px solid var(--sp-border-light);
                /* Fade mask for scrolling sources underneath */
                mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
                -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
            }
            .sp-controls::after {
                /* Extra subtle shadow under the sticky header */
                content: ''; position: absolute; bottom: -4px; left: 0; right: 0; height: 4px;
                background: linear-gradient(to bottom, rgba(0,0,0,0.03), transparent);
                pointer-events: none;
            }
            
            #sources-list {
                overflow-y: auto;
                overflow-x: hidden;
                flex-grow: 1;
                min-height: 0;
                padding-right: 4px;
                padding-top: 4px;
            }
            #sources-list::-webkit-scrollbar {
                width: 6px;
            }
            #sources-list::-webkit-scrollbar-track {
                background: transparent;
            }
            #sources-list::-webkit-scrollbar-thumb {
                background-color: var(--sp-border-medium);
                border-radius: 12px;
            }
            .sp-search-container {
                display: flex;
                align-items: center;
                flex-grow: 1;
                position: relative;
            }
            #sp-search {
                width: 100%;
                box-sizing: border-box;
                padding: 6px 32px 6px 12px;
                border: 1px solid var(--sp-border-light);
                border-radius: 12px;
                font-size: 13px;
                background-color: var(--sp-bg-secondary);
                color: var(--sp-text-primary);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                outline: none;
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
                transform-origin: center;
            }
            #sp-search:focus {
                background-color: var(--sp-bg-button);
                border-color: var(--sp-accent);
                box-shadow: 0 0 0 3px rgba(0,122,255,0.15);
                transform: scale(1.01);
            }
            #sp-search::placeholder {
                color: var(--sp-text-secondary);
            }
            
            .sp-icon-button {
                position: absolute;
                right: 4px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--sp-text-secondary);
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-icon-button:hover {
                background-color: var(--sp-icon-button-hover);
                color: var(--sp-text-primary);
                transform: translateY(-50%) scale(1.08);
            }
            .sp-icon-button:active {
                transform: translateY(-50%) scale(0.85);
            }
            .sp-icon-button .google-symbols {
                font-size: 18px;
            }
            
            .sp-button {
                position: relative;
                overflow: hidden;
                border: 1px solid var(--sp-border-light);
                color: var(--sp-text-primary);
                background-color: var(--sp-bg-button);
                font-size: 13px;
                font-weight: 500;
                border-radius: 12px;
                padding: 6px 12px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                white-space: nowrap;
                box-shadow: var(--sp-shadow-button);
            }
            .sp-button:hover {
                background-color: var(--sp-bg-button-hover);
                border-color: var(--sp-border-medium);
            }
            .sp-button:active {
                background-color: var(--sp-bg-button-active);
                transform: scale(0.95);
            }
            .sp-button::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 50%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(128,128,128,0.15), transparent);
                transform: skewX(-20deg);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-button:hover::after {
                left: 150%;
            }
            
            /* --- Ultra Premium Custom Animated Checkboxes --- */
            .sp-checkbox { 
                box-sizing: border-box;
                appearance: none; -webkit-appearance: none; 
                width: 18px; height: 18px; 
                margin: 0; padding: 0;
                border: 2px solid var(--sp-text-secondary); /* High contrast border so it's clearly visible in both modes */
                border-radius: 6px; 
                cursor: pointer; 
                position: relative; 
                flex-shrink: 0; 
                background-color: var(--sp-bg-primary); 
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-checkbox:hover {
                border-color: var(--sp-accent);
                transform: scale(1.05);
            }
            .sp-checkbox:checked { 
                background-color: var(--sp-accent); 
                border-color: var(--sp-accent); 
                /* Removed implicit animation */
            }
            /* Explicit user-interaction animation */
            .sp-checkbox.is-animating:checked {
                animation: checkbox-spring 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            
            /* The hidden checkmark shape inside the box */
            .sp-checkbox::before { 
                content: ''; 
                display: block; 
                position: absolute; 
                left: 0.5px; 
                bottom: 6px; 
                border: solid white; 
                border-width: 0 2.5px 2.5px 0; /* Thicker checkmark */
                border-radius: 1px;
                transform: rotate(45deg); 
                transform-origin: left bottom; /* Critical for growing outward correctly */
                
                /* Static base state for unselected */
                width: 0; 
                height: 0; 
                opacity: 0;
            }
            
            /* Static base state for successfully selected elements (avoiding re-render flickers) */
            /* MUST BE LOWER SPECIFICITY OR DECLARED BEFORE THE ANIMATION CLASS */
            .sp-checkbox:checked::before {
                width: 4.5px; 
                height: 10px; 
                opacity: 1;
            }

            /* Animate the checkmark drawing in using an organic, non-linear sequence ONLY on user interaction */
            .sp-checkbox.is-animating:checked::before { 
                /* ease-out decelerates at the very end of the stroke */
                animation: check-draw-organic 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards !important;
                animation-delay: 0.1s !important; /* Let the checkbox pop start and settle a bit first */
            }

            @keyframes check-draw-organic {
                0% {
                    width: 0;
                    height: 0;
                    opacity: 0;
                }
                10% {
                    width: 0;
                    height: 0;
                    opacity: 1;
                }
                40%  { width: 4.5px; height: 0;    opacity: 1; } /* Stroke 1: Draw short stem left-to-right */
                100% { width: 4.5px; height: 10px; opacity: 1; } /* Stroke 2: Whip up the long stem bottom-to-top */
            }

            @keyframes checkbox-spring {
                0% {
                    transform: scale(1);
                }
                30% {
                    transform: scale(0.7);
                }
                60% { transform: scale(1.15); } /* Overshoot */
                100% {
                    transform: scale(1);
                }
            }
            .source-item, .group-header {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                border-radius: 12px;
                margin: 2px 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                color: var(--sp-text-primary);
                position: relative;
                z-index: 1;
                transform-origin: left center;
                cursor: pointer;
            }
            .source-item {
                padding-left: 12px;
                border: 1px solid transparent;
            }
            .group-header {
                font-weight: 600;
                background-color: var(--sp-bg-primary);
            }
            .source-item:hover, .group-header:hover {
                background-color: var(--sp-bg-hover);
                z-index: 2;
                transform: translateX(3px);
            }
            .source-item:active, .group-header:active {
                transform: translateX(3px) scale(0.98);
            }
            .sp-caret {
                background: none;
                border: none;
                cursor: pointer;
                padding: 0 2px;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                transform: rotate(0deg);
                color: var(--sp-text-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .sp-caret .google-symbols {
                font-size: 20px;
            }
            .sp-caret.collapsed {
                transform: rotate(-90deg);
            }
            .icon-container {
                flex-shrink: 0;
                margin-right: 12px;
                display: flex;
                align-items: center;
                color: var(--sp-text-secondary);
                transition: all 0.15s cubic-bezier(0.25, 1, 0.5, 1);
                cursor: pointer;
            }
            .icon-container:hover {
                transform: scale(0.95);
                opacity: 0.8;
            }
            .icon-container .google-symbols {
                font-size: 16px;
            }
            .menu-container {
                flex-shrink: 0;
                margin-right: 8px;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                display: flex;
                align-items: center;
            }
            .source-item:hover .menu-container {
                opacity: 1;
            }
            .title-container, .group-title {
                flex-grow: 1;
                min-width: 0;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                font-size: 13px;
                color: var(--sp-text-primary);
                letter-spacing: -0.01em;
            }
            .checkbox-container {
                flex-shrink: 0;
                margin-left: auto;
                padding-left: 8px;
                display: flex;
                align-items: center;
            }
            .sp-more-button, .sp-move-to-folder-button, .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button {
                background: none;
                border: none;
                cursor: pointer;
                border-radius: 12px;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                color: var(--sp-text-secondary);
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-more-button .google-symbols,
            .sp-move-to-folder-button .google-symbols,
            .sp-add-subgroup-button .google-symbols,
            .sp-isolate-button .google-symbols,
            .sp-edit-button .google-symbols,
            .sp-delete-button .google-symbols {
                font-size: 16px;
            }
            .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button {
                display: flex;
                opacity: 0;
                transform: translateX(10px) scale(0.9);
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
                margin-left: 2px;
            }
            .sp-more-button, .sp-move-to-folder-button {
                margin-left: 2px;
            }
            .group-header:hover .sp-add-subgroup-button, .group-header:hover .sp-isolate-button, .group-header:hover .sp-edit-button, .group-header:hover .sp-delete-button {
                opacity: 1;
                transform: translateX(0) scale(1);
                pointer-events: auto;
            }
            .group-title + .badge {
                margin-left: auto;
            }
            .sp-more-button:hover, .sp-move-to-folder-button:hover, .sp-add-subgroup-button:hover, .sp-isolate-button:hover, .sp-edit-button:hover {
                background-color: var(--sp-icon-button-hover);
                color: var(--sp-text-primary);
                transform: scale(1.1);
            }
            .sp-delete-button:hover {
                background-color: rgba(255, 59, 48, 0.1);
                color: var(--sp-accent-danger);
                transform: scale(1.1);
            }
            .sp-more-button:active, .sp-move-to-folder-button:active, .sp-add-subgroup-button:active, .sp-isolate-button:active, .sp-edit-button:active, .sp-delete-button:active {
                transform: scale(0.85);
            }
            .icon-color {
                color: var(--sp-accent);
                } .youtube-icon-color { color: var(--sp-accent-danger);
                } .pdf-icon-color { color: var(--sp-accent-danger);
            }
            .group-container {
                display: flex;
                flex-direction: column;
                overflow: hidden;
                margin-bottom: 2px;
            }
            .source-item.gated, .group-container.gated > .group-children {
                opacity: 0.5;
                filter: grayscale(50%);
            }
            .failed-source {
                cursor: not-allowed;
            }
            .failed-source .title-container, .failed-source .icon-container {
                color: var(--sp-accent-danger) !important;
            }
            .failed-source .sp-checkbox {
                opacity: 0.5;
                cursor: not-allowed;
                border-color: var(--sp-accent-danger);
            }
            
            /* Loading State Visuals */
            .loading-source {
                cursor: wait;
            }
            .loading-source .title-container { 
                opacity: 0.6; 
                animation: pulse-text 2s cubic-bezier(0.25, 1, 0.5, 1) infinite; 
            }
            .loading-source .sp-checkbox {
                opacity: 0;
                pointer-events: none;
            }
            .sp-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid var(--sp-border-medium);
                border-top-color: var(--sp-accent);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                100% { transform: rotate(360deg);
                };
            }
            @keyframes pulse-text {
                0%, 100% {
                    opacity: 0.8;
                }
                50% {
                    opacity: 0.4;
                }
            }
            .group-children { 
                padding-left: 8px; 
                border-left: 1px solid var(--sp-border-light); 
                margin-left: 18px; 
                margin-top: 2px; 
                overflow: hidden; 
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                opacity: 1;
                /* By default, let height be auto. JS will set explicit heights during animation. */
            }
            .group-children.collapsed {
                height: 0;
                opacity: 0;
                margin-top: 0;
                border: none;
            }
            
            /* Folder Entry Animation */
            .sp-folder-enter {
                animation: sp-folder-pop 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                transform-origin: top center;
            }
            @keyframes sp-folder-pop {
                0% {
                    opacity: 0;
                    transform: translateY(-10px) translateX(-5px) scale(0.95);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0) translateX(0) scale(1);
                }
            }
            
            /* --- Move to Folder Modal & Overlay --- */
            @keyframes sp-modal-enter {
                0% {
                    opacity: 0;
                    transform: translate(-50%, -46%) scale(0.95);
                }
                100% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }
            @keyframes sp-modal-leave {
                0% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translate(-50%, -54%) scale(0.95);
                }
            }
            .sp-overlay-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.2);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
            }
            .sp-overlay-backdrop.visible {
                opacity: 1;
                pointer-events: auto;
            }
            .sp-folder-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                width: 320px;
                max-height: 80vh;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                border: 1px solid rgba(0, 0, 0, 0.05);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                z-index: 10001;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                pointer-events: none;
            }
            .sp-overlay-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.2);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
            }
            .sp-overlay-backdrop.visible {
                opacity: 1;
                pointer-events: auto;
            }
            .sp-folder-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                width: 320px;
                max-height: 80vh;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                border: 1px solid rgba(0, 0, 0, 0.05);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                z-index: 10001;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                pointer-events: none;
            }
            
            /* Adjust for dark mode specifically */
            @media (prefers-color-scheme: dark) {
                .sp-folder-modal {
                    background: rgba(30, 30, 32, 0.85);
                    border-color: rgba(255,255,255,0.1);
                    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
                }
                .sp-overlay-backdrop {
                    background: rgba(0, 0, 0, 0.6);
                }
                .sp-folder-modal-header,
                .sp-folder-modal-footer {
                    border-color: rgba(255,255,255,0.05);
                }
            }
            
            .sp-folder-modal.visible {
                opacity: 1;
                pointer-events: auto;
                animation: sp-modal-enter 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            .sp-folder-modal.closing {
                animation: sp-modal-leave 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            .sp-folder-modal-header {
                padding: 16px 20px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }
            .sp-folder-modal-title {
                font-size: 16px;
                font-weight: 500;
                color: var(--sp-text-primary);
                margin: 0;
            }
            .sp-folder-modal-content {
                padding: 8px;
                overflow-y: auto;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            /* Vertical option list style */
            .sp-folder-option {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
                background: transparent;
                border: none;
                width: 100%;
                text-align: left;
            }
            .sp-folder-option:hover {
                background: var(--sp-bg-hover);
                transform: scale(0.98);
            }
            .sp-folder-option .google-symbols {
                font-size: 20px;
                color: var(--sp-accent);
                margin-right: 12px;
                opacity: 0.8;
            }
            .sp-folder-option-title {
                font-size: 14px;
                color: var(--sp-text-primary);
                flex-grow: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-weight: normal;
            }
            
            .sp-folder-empty {
                padding: 24px 16px;
                text-align: center;
                color: var(--sp-text-tertiary);
                font-size: 14px;
            }
            .sp-folder-modal-footer {
                padding: 12px 16px;
                display: flex;
                justify-content: flex-end;
                border-top: 1px solid rgba(0, 0, 0, 0.05);
                gap: 8px;
            }
            .sp-modal-cancel {
                background: var(--sp-bg-secondary);
                color: var(--sp-text-primary);
                border: 1px solid var(--sp-border-light);
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-modal-cancel:hover {
                background: var(--sp-bg-hover);
                transform: scale(0.98);
            }

            .ungrouped-header {
                margin: 16px 0 6px 8px;
                color: var(--sp-text-secondary);
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .source-item.dragging,
            .group-header.dragging {
                opacity: 0.95;
                background-color: var(--sp-bg-button);
                transform: scale(1.03) translateY(-2px);
                box-shadow: var(--sp-shadow-toast);
                border: 1px solid var(--sp-accent);
                z-index: 10;
                cursor: grabbing;
                transition: none;
            }

            .group-container.drag-into > .group-header {
                background-color: var(--sp-drag-into-bg);
                border-radius: 12px;
            }

            .drag-over-top {
                border-top: 2px solid var(--sp-accent);
                border-top-left-radius: 0;
                border-top-right-radius: 0;
            }

            .drag-over-bottom {
                border-bottom: 2px solid var(--sp-accent);
                border-bottom-left-radius: 0;
                border-bottom-right-radius: 0;
            }

            .sp-toast {
                visibility: hidden;
                min-width: 200px;
                background-color: var(--sp-bg-toast);
                color: var(--sp-text-toast);
                text-align: center;
                border-radius: 12px;
                padding: 12px 16px;
                position: fixed;
                z-index: 9999;
                left: 50%;
                bottom: 30px;
                transform: translateX(-50%) translateY(20px) scale(0.9);
                font-size: 14px;
                font-weight: 500;
                opacity: 0;
                filter: blur(4px);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                backdrop-filter: blur(10px);
                box-shadow: var(--sp-shadow-toast);
            }

            .sp-toast.show {
                visibility: visible;
                opacity: 1;
                transform: translateX(-50%) translateY(0) scale(1);
                filter: blur(0);
            }

            .badge {
                font-size: 11px;
                color: var(--sp-text-badge);
                margin-left: 6px;
                font-weight: 500;
                font-variant-numeric: tabular-nums;
                flex-shrink: 0;
                background: var(--sp-bg-badge);
                padding: 2px 6px;
                border-radius: 12px;
            }

            .sp-toggle-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
                margin: 0 8px 0 2px;
                flex-shrink: 0;
                transform: scale(0.9);
            }
            .sp-toggle-switch:hover .sp-toggle-slider {
                box-shadow: inset 0 0 0 1px var(--sp-border-medium);
            }

            .sp-toggle-switch .sp-group-toggle-checkbox {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .sp-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--sp-bg-switch);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                border-radius: 18px;
                box-shadow: inset 0 0 0 1px var(--sp-border-light);
            }

            .sp-toggle-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 2px;
                bottom: 2px;
                background-color: var(--sp-bg-switch-thumb);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                border-radius: 50%;
                box-shadow: var(--sp-shadow-switch-thumb);
            }

            .sp-group-toggle-checkbox:checked + .sp-toggle-slider {
                background-color: var(--sp-accent-success);
                box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
            }

            .sp-group-toggle-checkbox:checked + .sp-toggle-slider:before {
                transform: translateX(16px);
            }
            
            /* --- Batch Mode Additions --- */
            .source-item.selected-for-batch {
                background-color: rgba(0, 122, 255, 0.05);
                border: 1px dashed var(--sp-accent);
            }
            .sp-batch-checkbox {
                border-color: var(--sp-accent);
                background-color: rgba(0, 122, 255, 0.1);
            }
            .sp-batch-checkbox:checked {
                background-color: var(--sp-accent);
                border-color: var(--sp-accent);
            }
            .sp-batch-action-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                margin-top: 8px;
                position: sticky;
                bottom: 8px;
                background: var(--sp-glass-bg-body, rgba(255, 255, 255, 0.85));
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.05));
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
                z-index: 5;
            }
            .sp-batch-actions {
                display: flex;
                gap: 8px;
            }
            .sp-batch-add-folder-btn {
                background-color: var(--sp-accent);
                color: white;
                border-color: transparent;
            }
            .sp-batch-add-folder-btn:hover {
                background-color: #0066cc;
            }
            .sp-batch-add-folder-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .sp-confirm-delete-btn {
                background-color: var(--sp-accent-danger);
                color: white;
                border-color: transparent;
            }
            .sp-confirm-delete-btn:hover {
                background-color: #ff2d20;
            }
            .sp-confirm-delete-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            /* =========================================
               UI Polish Part 2
               ========================================= */

            /* 1. Empty Drop Zone Styling */
            .sp-empty-state {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                margin: 4px 8px 8px 18px;
                border: 2px dashed var(--sp-border-medium);
                border-radius: 12px;
                color: var(--sp-text-secondary);
                font-size: 13px;
                font-weight: 500;
                background-color: rgba(0, 0, 0, 0.01);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            @media (prefers-color-scheme: dark) {
                .sp-empty-state {
                    background-color: rgba(255, 255, 255, 0.01);
                }
            }
            .group-container.drag-into > .group-children > .sp-empty-state {
                background-color: var(--sp-drag-into-bg);
                border-color: var(--sp-accent);
                color: var(--sp-accent);
                transform: scale(1.02);
            }
            
            /* 2. Global Icon Button Click Feedback */
            .sp-icon-button {
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-icon-button:active {
                transform: scale(0.85);
            }


            /* =========================================
               UI Polish Part 3: Typography & Layout
               ========================================= */

            /* 1. Sticky Controls with Glassmorphism */
            .sp-controls {
                position: sticky;
                top: 0;
                z-index: 20;
                background: var(--sp-glass-bg-body, rgba(255, 255, 255, 0.85));
                backdrop-filter: blur(24px) saturate(180%);
                -webkit-backdrop-filter: blur(24px) saturate(180%);
                padding-bottom: 8px;
                margin-bottom: 4px;
                border-bottom: 1px solid transparent;
                transition: border-color 0.3s ease;
            }
            /* Add a subtle border when scrolling */
            #sources-list:not(:empty) {
                padding-top: 4px;
            }

            /* 2. Advanced Typography & Line Clamp */
            .title-container, .group-title {
                /* Replace single line ellipsis with up to 2 lines */
                white-space: normal;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                line-height: 1.4;
                margin-right: 4px;
            }
            .group-name {
                font-weight: 500;
                letter-spacing: 0.1px;
            }
            
            /* 3. Enhanced Modal Depth (Material 3) */
            .sp-folder-modal {
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0,0,0,0.1);
                transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease;
            }
            @media (prefers-color-scheme: dark) {
                .sp-folder-modal {
                    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255,255,255,0.1);
                }
            }

            .sp-cancel-batch-btn {
                background: transparent;
                border: 1px solid var(--sp-border-light);
            }

            /* =========================================
               UI Polish & Enhancements
               ========================================= */

            /* 1. Custom Webkit Scrollbar */
            #sources-list::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            #sources-list::-webkit-scrollbar-track {
                background: transparent;
            }
            #sources-list::-webkit-scrollbar-thumb {
                background: rgba(150, 150, 150, 0.3);
                border-radius: 10px;
            }
            #sources-list::-webkit-scrollbar-thumb:hover {
                background: rgba(150, 150, 150, 0.6);
            }

            /* 2. Tree-view Hierarchy Lines & Item Styling */
            .source-item {
                border-radius: 8px;
                margin-bottom: 2px;
                transition: background-color 0.2s ease, transform 0.2s ease;
            }
            .source-item:hover {
                background-color: var(--sp-bg-hover);
            }
            .group-children {
                border-left: 2px solid var(--sp-border-light) !important;
                border-radius: 0 0 0 6px;
                transition: border-color 0.3s ease, height 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease;
            }
            .group-container:hover > .group-children {
                border-left-color: var(--sp-accent) !important;
            }

            /* 3. Micro-interactions & Focus Rings */
            #sp-search {
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            #sp-search:focus {
                outline: none;
                border-color: var(--sp-accent);
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15); /* Apple style focus ring */
            }
            #sp-search:focus + #sp-search-btn .google-symbols {
                color: var(--sp-accent);
            }
            
            /* Enhanced Drag Feedback */
            .drag-over-top {
                border-top: 2px solid var(--sp-accent) !important;
                position: relative;
            }
            .drag-over-top::before {
                content: '';
                position: absolute;
                top: -5px;
                left: -5px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--sp-accent);
                border: 2px solid var(--sp-bg-primary, white);
                z-index: 10;
            }
            
            .drag-over-bottom {
                border-bottom: 2px solid var(--sp-accent) !important;
                position: relative;
            }
            .drag-over-bottom::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: -5px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--sp-accent);
                border: 2px solid var(--sp-bg-primary, white);
                z-index: 10;
            }
        `;
        shadowRoot.appendChild(style);

        const containerHtml = el('div', { className: 'sp-container' }, [
            el('div', { className: 'sp-controls' }, [
                el('button', { id: 'sp-new-group-btn', className: 'sp-button' }, [chrome.i18n.getMessage("ui_new_group")]),
                el('button', { id: 'sp-batch-action-btn', className: 'sp-button' }, [chrome.i18n.getMessage("ui_batch_action")]),
                el('div', { className: 'sp-search-container' }, [
                    el('input', { id: 'sp-search', placeholder: chrome.i18n.getMessage("ui_filter_sources") }),
                    el('button', { id: 'sp-search-btn', className: 'sp-icon-button', title: 'Search' }, [
                        el('span', { className: 'google-symbols' }, ['search'])
                    ])
                ])
            ]),
            el('div', { id: 'sources-list' }),
            el('div', { className: 'sp-resizer' })
        ]);
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
            document.addEventListener('change', handleOriginalCheckboxChange, true);

            // --- Global Native Glassmorphism Injection ---
            if (!document.getElementById('sp-global-glassmorphism')) {
                const globalStyle = document.createElement('style');
                globalStyle.id = 'sp-global-glassmorphism';
                globalStyle.textContent = `
                    /* --------- Global Apple HIG Glassmorphism Overrides --------- */
                    /* Note: Modifying Angular Material generic overlay/dialog structures */
                    
                    /* 1. Popover Menus (More button floating menus) */
                    body .cdk-overlay-container .mat-mdc-menu-panel,
                    body .cdk-overlay-container .mat-menu-panel {
                        background-color: var(--sp-glass-bg-menu, rgba(255, 255, 255, 0.85)) !important;
                        backdrop-filter: blur(20px) saturate(150%) !important;
                        -webkit-backdrop-filter: blur(20px) saturate(150%) !important;
                        border-radius: 12px !important;
                        border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.1)) !important;
                        box-shadow: var(--sp-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12)) !important;
                        overflow: hidden !important;
                    }
                    
                    /* Menu item hover effects inside the glass panel */
                    body .cdk-overlay-container .mat-mdc-menu-item:hover,
                    body .cdk-overlay-container .mat-menu-item:hover {
                        background-color: rgba(128, 128, 128, 0.1) !important;
                    }

                    /* 2. Dialogs / Modals (New Note, Rename, Delete Confirmation) */
                    body .cdk-overlay-container .mat-mdc-dialog-surface,
                    body .cdk-overlay-container .mat-dialog-container {
                        background-color: var(--sp-glass-bg-body, rgba(255, 255, 255, 0.75)) !important;
                        backdrop-filter: blur(24px) saturate(180%) !important;
                        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                        border-radius: 16px !important;
                        border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.1)) !important;
                        box-shadow: var(--sp-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12)) !important;
                    }

                    /* Respect system dark mode for global variables if not defined in shadow root */
                    @media (prefers-color-scheme: dark) {
                        body .cdk-overlay-container {
                            --sp-glass-bg-body: rgba(28, 28, 30, 0.85);
                            --sp-glass-bg-menu: rgba(44, 44, 46, 0.85);
                            --sp-glass-border: rgba(255, 255, 255, 0.15);
                            --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                        }
                    }
                `;
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
                console.error("Sources+: Failed to observe source panel", e);
            }

            // 2. Removed CPU-intensive Heartbeat Polling
            // Relying purely on MutationObserver is much more efficient.

            loadState((loadedEnabledMap) => { scanAndSyncSources(loadedEnabledMap, true); render(); });
        } else {
            showCrashBanner("NotebookLM Sources+: Initialization failed. Could not locate panel header.");
        }
    }

    // --- Main execution ---
    if (projectId) {
        waitForElement(DEPS.panel).then(panel => {
            if (!panel) {
                showCrashBanner("NotebookLM Sources+: Could not find NotebookLM panel. Google may have updated the page structure.");
                return;
            }
            init(panel);
        }).catch(err => {
            console.error("Sources+ Init Error:", err);
            showCrashBanner("NotebookLM Sources+: Initialization error. Check console for details.");
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
            findFreshCheckbox,
            removeGroupFromTree,
            parentMap,
            groupsById,
            executeBatchDelete,
            loadState,
            pendingBatchKeys,
            sourcesByKey,
            state,
            DEPS,
            saveState,
            _getIsDeletingSources: () => isDeletingSources,
            _setIsDeletingSources: (val) => { isDeletingSources = val; },
            _getFreshRowCache: () => freshRowCache,
            _setCustomHeight: (val) => { customHeight = val; },
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
                freshRowCache = null;
                clickQueue = [];
                isProcessingQueue = false;
                isSyncingState = false;
            }
        };
    }

})();
