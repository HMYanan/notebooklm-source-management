(function () {
    'use strict';

    const NOTEBOOKLM_HOME_URL = 'https://notebooklm.google.com/';
    const NOTEBOOKLM_NOTEBOOK_PREFIX = 'https://notebooklm.google.com/notebook/';
    const ERROR_MESSAGE_KEYS = {
        invalid_storage_key: 'popup_error_invalid_storage_key',
        runtime_failure: 'popup_reason_generic',
        tabs_query_failed: 'popup_reason_tabs_query_failed'
    };

    function getUiLanguage() {
        if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
            return chrome.i18n.getUILanguage() || 'en';
        }
        return 'en';
    }

    function applyDocumentLocalization(doc = document) {
        if (!doc) return;

        if (typeof doc.title === 'string') {
            doc.title = getMessage('extName');
        }

        const root = doc.documentElement || null;
        if (root) {
            root.lang = getUiLanguage();
        }
    }

    function getPageContext(url) {
        if (typeof url !== 'string' || !url) return 'external';
        if (url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX)) return 'notebook';
        if (url.startsWith(NOTEBOOKLM_HOME_URL)) return 'notebook-home';
        return 'external';
    }

    function isNotebookTab(tab) {
        return Boolean(tab && typeof tab.url === 'string' && tab.url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX));
    }

    function deriveLaunchContext(activeTab, notebookLmTabs) {
        const pageContext = getPageContext(activeTab && activeTab.url);
        const hasOpenNotebook = notebookLmTabs.some(tab => isNotebookTab(tab) && tab.id !== (activeTab && activeTab.id));

        if (pageContext === 'notebook-home' && !hasOpenNotebook) {
            return 'current-home-only';
        }

        if (hasOpenNotebook) {
            return 'has-open-notebook';
        }

        return 'no-open-notebook';
    }

    function getReasonMessageKey(reason) {
        const reasonMap = {
            source_panel_missing: 'popup_reason_source_panel_missing',
            panel_header_missing: 'popup_reason_panel_header_missing',
            manager_not_ready: 'popup_reason_manager_not_ready',
            manager_unreachable: 'popup_reason_manager_unreachable',
            tab_message_failed: 'popup_reason_tab_message_failed',
            tabs_query_failed: 'popup_reason_tabs_query_failed',
            notebook_missing: 'popup_reason_notebook_missing',
            not_on_notebook_page: 'popup_reason_notebook_missing'
        };

        return reasonMap[reason] || 'popup_reason_generic';
    }

    function buildPopupState({ context, managerStatus, launchContext }) {
        if (context === 'notebook') {
            if (managerStatus && managerStatus.ready) {
                return {
                    badgeKey: 'popup_badge_ready',
                    titleKey: 'popup_title_ready',
                    bodyKey: 'popup_body_ready',
                    buttonKey: 'popup_cta_open_manager',
                    detailKey: null,
                    action: 'focus-manager'
                };
            }

            return {
                badgeKey: 'popup_badge_attention',
                titleKey: 'popup_title_refresh_needed',
                bodyKey: 'popup_body_refresh_needed',
                buttonKey: 'popup_cta_refresh_notebook',
                detailKey: getReasonMessageKey(managerStatus && managerStatus.reason),
                action: 'refresh-tab'
            };
        }

        if (context === 'notebook-home') {
            if (launchContext === 'has-open-notebook') {
                return {
                    badgeKey: 'popup_badge_launcher',
                    titleKey: 'popup_title_switch_notebook',
                    bodyKey: 'popup_body_switch_notebook',
                    buttonKey: 'popup_cta_go_to_open_notebook',
                    detailKey: null,
                    action: 'open-notebooklm'
                };
            }

            return {
                badgeKey: 'popup_badge_launcher',
                titleKey: 'popup_title_notebook_home_new_tab',
                bodyKey: 'popup_body_notebook_home_new_tab',
                buttonKey: 'popup_cta_open_notebooklm_new_tab',
                detailKey: null,
                action: 'open-notebooklm'
            };
        }

        if (launchContext === 'has-open-notebook') {
            return {
                badgeKey: 'popup_badge_launcher',
                titleKey: 'popup_title_switch_notebook',
                bodyKey: 'popup_body_switch_notebook',
                buttonKey: 'popup_cta_go_to_open_notebook',
                detailKey: null,
                action: 'open-notebooklm'
            };
        }

        return {
            badgeKey: 'popup_badge_launcher',
            titleKey: 'popup_title_external_page',
            bodyKey: 'popup_body_external_page',
            buttonKey: 'popup_cta_go_to_notebooklm',
            detailKey: null,
            action: 'open-notebooklm'
        };
    }

    function queryNotebookLmTabs() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ url: `${NOTEBOOKLM_HOME_URL}*` }, (tabs) => {
                if (chrome.runtime.lastError) {
                    const error = new Error(chrome.runtime.lastError.message || 'NotebookLM tabs query failed');
                    error.errorCode = 'tabs_query_failed';
                    reject(error);
                    return;
                }

                resolve(Array.isArray(tabs) ? tabs : []);
            });
        });
    }

    function queryActiveTab() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    const error = new Error(chrome.runtime.lastError.message || 'Active tab query failed');
                    error.errorCode = 'tabs_query_failed';
                    reject(error);
                    return;
                }

                resolve((tabs && tabs[0]) || null);
            });
        });
    }

    function sendMessageToTab(tabId, message) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                resolve(response || null);
            });
        });
    }

    function isReceivingEndError(error) {
        const message = String(error && error.message ? error.message : '');
        return /Receiving end does not exist|Could not establish connection|message port closed before a response was received/i.test(message);
    }

    function classifyTabMessageError(error) {
        return isReceivingEndError(error) ? 'manager_unreachable' : 'tab_message_failed';
    }

    function sendRuntimeMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                resolve(response || null);
            });
        });
    }

    function reloadTab(tabId) {
        return new Promise((resolve, reject) => {
            chrome.tabs.reload(tabId, {}, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                resolve({ success: true });
            });
        });
    }

    async function inspectManagerStatus(tab) {
        if (!tab || typeof tab.id !== 'number') {
            return { ready: false, reason: 'notebook_missing' };
        }

        try {
            const response = await sendMessageToTab(tab.id, { type: 'GET_MANAGER_STATUS' });
            return response || { ready: false, reason: 'manager_not_ready' };
        } catch (error) {
            return { ready: false, reason: classifyTabMessageError(error) };
        }
    }

    function getElements(doc) {
        return {
            badge: doc.getElementById('popup-badge'),
            title: doc.getElementById('popup-title'),
            body: doc.getElementById('popup-body'),
            note: doc.getElementById('popup-note'),
            detail: doc.getElementById('popup-detail'),
            primaryButton: doc.getElementById('popup-primary-btn')
        };
    }

    function renderPopup(doc, state) {
        const elements = getElements(doc);
        elements.badge.textContent = getMessage(state.badgeKey);
        elements.title.textContent = getMessage(state.titleKey);
        elements.body.textContent = getMessage(state.bodyKey);
        elements.note.textContent = getMessage('popup_launcher_note');
        elements.primaryButton.textContent = getMessage(state.buttonKey);
        elements.primaryButton.disabled = false;

        if (state.detailKey) {
            elements.detail.hidden = false;
            elements.detail.textContent = getMessage(state.detailKey);
        } else {
            elements.detail.hidden = true;
            elements.detail.textContent = '';
        }

        return elements;
    }

    function resolveErrorMessage(result) {
        if (result && typeof result.errorMessageKey === 'string') {
            return getMessage(result.errorMessageKey);
        }

        if (result && typeof result.errorCode === 'string') {
            return getMessage(ERROR_MESSAGE_KEYS[result.errorCode] || 'popup_reason_generic');
        }

        return getMessage('popup_reason_generic');
    }

    function buildTabsQueryFailureState() {
        return {
            badgeKey: 'popup_badge_attention',
            titleKey: 'popup_title_external_page',
            bodyKey: 'popup_body_external_page',
            buttonKey: 'popup_cta_go_to_notebooklm',
            detailKey: 'popup_reason_tabs_query_failed',
            action: 'open-notebooklm'
        };
    }

    async function performPrimaryAction(state, tab, launchContext) {
        if (state.action === 'focus-manager') {
            return sendMessageToTab(tab.id, { type: 'FOCUS_MANAGER' });
        }

        if (state.action === 'refresh-tab') {
            return reloadTab(tab.id);
        }

        return sendRuntimeMessage({
            type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
            currentTabId: tab && typeof tab.id === 'number' ? tab.id : null,
            currentContext: getPageContext(tab && tab.url),
            launchContext
        });
    }

    async function initializePopup(doc = document) {
        applyDocumentLocalization(doc);
        const elements = getElements(doc);
        let activeTab = null;
        let activeTabQueryFailed = false;
        let notebookTabsQueryFailed = false;

        try {
            activeTab = await queryActiveTab();
        } catch (error) {
            activeTabQueryFailed = true;
        }

        const context = getPageContext(activeTab && activeTab.url);
        let notebookLmTabs = [];

        if (context !== 'notebook') {
            try {
                notebookLmTabs = await queryNotebookLmTabs();
            } catch (error) {
                notebookTabsQueryFailed = true;
            }
        }

        const launchContext = context === 'notebook' ? null : deriveLaunchContext(activeTab, notebookLmTabs);
        const managerStatus = context === 'notebook' ? await inspectManagerStatus(activeTab) : null;
        const state = (activeTabQueryFailed || notebookTabsQueryFailed)
            ? buildTabsQueryFailureState()
            : buildPopupState({ context, managerStatus, launchContext });

        renderPopup(doc, state);

        elements.primaryButton.onclick = async () => {
            elements.primaryButton.disabled = true;

            try {
                const result = await performPrimaryAction(state, activeTab, launchContext);
                if (result && result.success === false) {
                    elements.detail.hidden = false;
                    elements.detail.textContent = resolveErrorMessage(result);
                    elements.primaryButton.disabled = false;
                    return;
                }

                if (typeof window !== 'undefined' && window && typeof window.close === 'function') {
                    window.close();
                }
            } catch (error) {
                elements.detail.hidden = false;
                elements.detail.textContent = resolveErrorMessage({
                    errorCode: error && error.errorCode ? error.errorCode : 'runtime_failure'
                });
                elements.primaryButton.disabled = false;
            }
        };

        return { context, launchContext, managerStatus, state };
    }

    if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', () => {
            initializePopup().catch((error) => {
                const detail = document.getElementById('popup-detail');
                if (detail) {
                    detail.hidden = false;
                    detail.textContent = getMessage('popup_reason_generic');
                }
            });
        });
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildPopupState,
            buildTabsQueryFailureState,
            deriveLaunchContext,
            getPageContext,
            getReasonMessageKey,
            getUiLanguage,
            initializePopup,
            isNotebookTab,
            inspectManagerStatus,
            performPrimaryAction,
            queryNotebookLmTabs,
            renderPopup,
            applyDocumentLocalization,
            resolveErrorMessage,
            isReceivingEndError,
            classifyTabMessageError
        };
    }
})();
