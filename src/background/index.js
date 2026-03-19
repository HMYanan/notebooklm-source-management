const NOTEBOOKLM_HOME_URL = 'https://notebooklm.google.com/';
const NOTEBOOKLM_URL_PATTERN = 'https://notebooklm.google.com/*';
const NOTEBOOKLM_NOTEBOOK_PREFIX = 'https://notebooklm.google.com/notebook/';
const ERROR_CODES = {
    INVALID_STORAGE_KEY: 'invalid_storage_key',
    RUNTIME_FAILURE: 'runtime_failure'
};

function isAuthorizedNotebookSender(sender) {
    return Boolean(
        sender &&
        sender.tab &&
        typeof sender.tab.url === 'string' &&
        sender.tab.url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX)
    );
}

function pickPreferredNotebookTab(tabs) {
    if (!Array.isArray(tabs) || tabs.length === 0) return null;
    return tabs.find(tab => typeof tab.url === 'string' && tab.url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX)) || tabs[0];
}

function isNotebookHomeTab(tab) {
    return Boolean(tab && typeof tab.url === 'string' && tab.url.startsWith(NOTEBOOKLM_HOME_URL) && !tab.url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX));
}

function focusTab(tab, action, sendResponse) {
    chrome.tabs.update(tab.id, { active: true }, (updatedTab) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, errorCode: ERROR_CODES.RUNTIME_FAILURE });
            return;
        }

        if (chrome.windows && typeof chrome.windows.update === 'function') {
            chrome.windows.update(tab.windowId, { focused: true }, () => {
                sendResponse({
                    success: true,
                    action,
                    tabId: (updatedTab && updatedTab.id) || tab.id,
                    url: (updatedTab && updatedTab.url) || tab.url
                });
            });
            return;
        }

        sendResponse({
            success: true,
            action,
            tabId: (updatedTab && updatedTab.id) || tab.id,
            url: (updatedTab && updatedTab.url) || tab.url
        });
    });
}

function openNewNotebookLmHome(sendResponse) {
    chrome.tabs.create({ url: NOTEBOOKLM_HOME_URL }, (tab) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, errorCode: ERROR_CODES.RUNTIME_FAILURE });
            return;
        }

        sendResponse({
            success: true,
            action: 'opened-new-home',
            tabId: tab && tab.id,
            url: (tab && tab.url) || NOTEBOOKLM_HOME_URL
        });
    });
}

function openOrFocusNotebookLm(request, sendResponse) {
    const currentTabId = typeof request.currentTabId === 'number' ? request.currentTabId : null;
    const currentContext = typeof request.currentContext === 'string' ? request.currentContext : 'external';

    chrome.tabs.query({ url: NOTEBOOKLM_URL_PATTERN }, (tabs) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, errorCode: ERROR_CODES.RUNTIME_FAILURE });
            return;
        }

        const notebookTabs = tabs.filter(tab => typeof tab.url === 'string' && tab.url.startsWith(NOTEBOOKLM_NOTEBOOK_PREFIX));
        const preferredNotebookTab = pickPreferredNotebookTab(notebookTabs);
        if (preferredNotebookTab) {
            focusTab(preferredNotebookTab, 'focused-existing-notebook', sendResponse);
            return;
        }

        if (currentContext === 'notebook-home') {
            openNewNotebookLmHome(sendResponse);
            return;
        }

        const reusableHomeTab = tabs.find(tab => isNotebookHomeTab(tab) && tab.id !== currentTabId);
        if (reusableHomeTab) {
            focusTab(reusableHomeTab, 'focused-existing-home', sendResponse);
            return;
        }

        openNewNotebookLmHome(sendResponse);
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || typeof request.type !== 'string') {
        return;
    }

    if (request.type === 'OPEN_OR_FOCUS_NOTEBOOKLM') {
        openOrFocusNotebookLm(request, sendResponse);
        return true;
    }

    if (request.type !== 'SAVE_STATE' && request.type !== 'LOAD_STATE') {
        return;
    }

    if (!isAuthorizedNotebookSender(sender)) {
        console.warn('NotebookLM Source Management: Received message from unauthorized sender:', sender);
        return;
    }

    if (request.type === 'SAVE_STATE') {
        if (typeof request.key !== 'string' || !request.key.startsWith('sourcesPlusState_')) {
            console.warn('NotebookLM Source Management: Received SAVE_STATE with invalid key:', request.key);
            sendResponse({ success: false, errorCode: ERROR_CODES.INVALID_STORAGE_KEY });
            return;
        }

        chrome.storage.local.set({ [request.key]: request.data }, () => {
            if (chrome.runtime.lastError) {
                console.error('NotebookLM Source Management background save error:', chrome.runtime.lastError);
                sendResponse({ success: false, errorCode: ERROR_CODES.RUNTIME_FAILURE });
            } else {
                sendResponse({ success: true });
            }
        });
        return true;
    }

    if (typeof request.key !== 'string' || !request.key.startsWith('sourcesPlusState_')) {
        console.warn('NotebookLM Source Management: Received LOAD_STATE with invalid key:', request.key);
        sendResponse({ success: false, errorCode: ERROR_CODES.INVALID_STORAGE_KEY });
        return;
    }

    chrome.storage.local.get(request.key, (data) => {
        sendResponse({ success: true, data: data[request.key] || null });
    });
    return true;
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        NOTEBOOKLM_HOME_URL,
        NOTEBOOKLM_NOTEBOOK_PREFIX,
        ERROR_CODES,
        isNotebookHomeTab,
        pickPreferredNotebookTab,
        isAuthorizedNotebookSender
    };
}
