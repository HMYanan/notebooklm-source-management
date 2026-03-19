const createPopupDocument = () => {
    const elements = {
        'popup-badge': { textContent: '', hidden: false },
        'popup-title': { textContent: '', hidden: false },
        'popup-body': { textContent: '', hidden: false },
        'popup-note': { textContent: '', hidden: false },
        'popup-detail': { textContent: '', hidden: true },
        'popup-primary-btn': { textContent: '', disabled: false, onclick: null }
    };

    return {
        elements,
        title: '',
        documentElement: { lang: '' },
        getElementById: jest.fn((id) => elements[id]),
        addEventListener: jest.fn()
    };
};

describe('popup launcher', () => {
    let popup;
    let popupDocument;
    let activeTab;
    let notebookLmTabs;

    beforeEach(() => {
        jest.resetModules();
        popupDocument = createPopupDocument();
        activeTab = { id: 7, url: 'https://notebooklm.google.com/notebook/abc' };
        notebookLmTabs = [activeTab];

        global.document = popupDocument;
        global.window = { close: jest.fn() };
        global.getMessage = (key) => key;
        global.chrome = {
            i18n: {
                getMessage: (key) => key,
                getUILanguage: () => 'zh-CN'
            },
            runtime: {
                lastError: null,
                sendMessage: jest.fn((message, cb) => cb({ success: true, action: 'focused-existing-notebook' }))
            },
            tabs: {
                query: jest.fn((queryInfo, cb) => {
                    if (queryInfo.active) {
                        cb([activeTab]);
                        return;
                    }

                    cb(notebookLmTabs);
                }),
                sendMessage: jest.fn((tabId, message, cb) => cb({ ready: true })),
                reload: jest.fn((tabId, options, cb) => cb())
            }
        };

        popup = require('../src/popup/index.js');
    });

    afterEach(() => {
        delete global.document;
        delete global.window;
        delete global.chrome;
        delete global.getMessage;
    });

    it('detects page context correctly', () => {
        expect(popup.getPageContext('https://notebooklm.google.com/notebook/123')).toBe('notebook');
        expect(popup.getPageContext('https://notebooklm.google.com/')).toBe('notebook-home');
        expect(popup.getPageContext('https://example.com')).toBe('external');
    });

    it('builds launcher states for notebook, notebook-home, and external pages', () => {
        expect(popup.buildPopupState({
            context: 'notebook',
            managerStatus: { ready: true },
            launchContext: null
        })).toMatchObject({
            buttonKey: 'popup_cta_open_manager',
            action: 'focus-manager'
        });

        expect(popup.buildPopupState({
            context: 'notebook-home',
            managerStatus: null,
            launchContext: 'current-home-only'
        })).toMatchObject({
            buttonKey: 'popup_cta_open_notebooklm_new_tab',
            action: 'open-notebooklm'
        });

        expect(popup.buildPopupState({
            context: 'external',
            managerStatus: null,
            launchContext: 'has-open-notebook'
        })).toMatchObject({
            buttonKey: 'popup_cta_go_to_open_notebook',
            action: 'open-notebooklm'
        });
    });

    it('derives launcher contexts for open notebook, current home, and no open notebook', () => {
        expect(popup.deriveLaunchContext(
            { id: 1, url: 'https://example.com' },
            [{ id: 9, url: 'https://notebooklm.google.com/notebook/xyz' }]
        )).toBe('has-open-notebook');

        expect(popup.deriveLaunchContext(
            { id: 2, url: 'https://notebooklm.google.com/' },
            [{ id: 2, url: 'https://notebooklm.google.com/' }]
        )).toBe('current-home-only');

        expect(popup.deriveLaunchContext(
            { id: 3, url: 'https://example.com' },
            []
        )).toBe('no-open-notebook');
    });

    it('renders a ready notebook state and focuses the in-page manager', async () => {
        const result = await popup.initializePopup(popupDocument);

        expect(result.context).toBe('notebook');
        expect(popupDocument.title).toBe('extName');
        expect(popupDocument.documentElement.lang).toBe('zh-CN');
        expect(popupDocument.elements['popup-title'].textContent).toBe('popup_title_ready');
        expect(popupDocument.elements['popup-primary-btn'].textContent).toBe('popup_cta_open_manager');

        await popupDocument.elements['popup-primary-btn'].onclick();

        expect(global.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(
            1,
            7,
            { type: 'GET_MANAGER_STATUS' },
            expect.any(Function)
        );
        expect(global.chrome.tabs.sendMessage).toHaveBeenNthCalledWith(
            2,
            7,
            { type: 'FOCUS_MANAGER' },
            expect.any(Function)
        );
        expect(global.window.close).toHaveBeenCalled();
    });

    it('renders a refresh action when the manager is unavailable in a notebook', async () => {
        global.chrome.tabs.sendMessage.mockImplementationOnce((tabId, message, cb) => cb({ ready: false, reason: 'source_panel_missing' }));

        const result = await popup.initializePopup(popupDocument);

        expect(result.state.action).toBe('refresh-tab');
        expect(popupDocument.elements['popup-detail'].hidden).toBe(false);
        expect(popupDocument.elements['popup-detail'].textContent).toBe('popup_reason_source_panel_missing');

        await popupDocument.elements['popup-primary-btn'].onclick();
        expect(global.chrome.tabs.reload).toHaveBeenCalledWith(7, {}, expect.any(Function));
    });

    it('opens NotebookLM from non-notebook pages', async () => {
        activeTab = { id: 4, url: 'https://example.com' };
        notebookLmTabs = [{ id: 11, url: 'https://notebooklm.google.com/notebook/xyz' }];

        const result = await popup.initializePopup(popupDocument);

        expect(result.context).toBe('external');
        expect(result.launchContext).toBe('has-open-notebook');
        expect(popupDocument.elements['popup-primary-btn'].textContent).toBe('popup_cta_go_to_open_notebook');

        await popupDocument.elements['popup-primary-btn'].onclick();
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            {
                type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
                currentTabId: 4,
                currentContext: 'external',
                launchContext: 'has-open-notebook'
            },
            expect.any(Function)
        );
    });

    it('opens NotebookLM in a new tab when the current tab is the only home tab', async () => {
        activeTab = { id: 14, url: 'https://notebooklm.google.com/' };
        notebookLmTabs = [{ id: 14, url: 'https://notebooklm.google.com/' }];

        const result = await popup.initializePopup(popupDocument);

        expect(result.context).toBe('notebook-home');
        expect(result.launchContext).toBe('current-home-only');
        expect(popupDocument.elements['popup-primary-btn'].textContent).toBe('popup_cta_open_notebooklm_new_tab');

        await popupDocument.elements['popup-primary-btn'].onclick();
        expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
            {
                type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
                currentTabId: 14,
                currentContext: 'notebook-home',
                launchContext: 'current-home-only'
            },
            expect.any(Function)
        );
    });

    it('maps background error codes to localized popup messages', async () => {
        activeTab = { id: 4, url: 'https://example.com' };
        notebookLmTabs = [];
        global.chrome.runtime.sendMessage.mockImplementationOnce((message, cb) => cb({
            success: false,
            errorCode: 'invalid_storage_key'
        }));

        await popup.initializePopup(popupDocument);
        await popupDocument.elements['popup-primary-btn'].onclick();

        expect(popupDocument.elements['popup-detail'].hidden).toBe(false);
        expect(popupDocument.elements['popup-detail'].textContent).toBe('popup_error_invalid_storage_key');
    });

    it('falls back to a localized generic message for thrown runtime errors', async () => {
        activeTab = { id: 4, url: 'https://example.com' };
        notebookLmTabs = [];
        global.chrome.runtime.sendMessage.mockImplementationOnce((message, cb) => {
            global.chrome.runtime.lastError = { message: 'English runtime failure' };
            cb();
            global.chrome.runtime.lastError = null;
        });

        await popup.initializePopup(popupDocument);
        await popupDocument.elements['popup-primary-btn'].onclick();

        expect(popupDocument.elements['popup-detail'].hidden).toBe(false);
        expect(popupDocument.elements['popup-detail'].textContent).toBe('popup_reason_generic');
    });
});
