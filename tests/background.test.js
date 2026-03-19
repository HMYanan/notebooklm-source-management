describe('background.js message listener', () => {
    let listener;
    let mockSendResponse;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Mock global console.warn and console.error to keep test output clean
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Mock sendResponse
        mockSendResponse = jest.fn();

        // Mock chrome API
        global.chrome = {
            runtime: {
                onMessage: {
                    addListener: jest.fn((cb) => {
                        listener = cb;
                    })
                },
                lastError: undefined
            },
            tabs: {
                query: jest.fn((queryInfo, cb) => {
                    if (cb) cb([]);
                }),
                update: jest.fn((tabId, updateInfo, cb) => {
                    if (cb) cb({ id: tabId, url: 'https://notebooklm.google.com/notebook/123' });
                }),
                create: jest.fn((createProperties, cb) => {
                    if (cb) cb({ id: 99, url: createProperties.url });
                })
            },
            windows: {
                update: jest.fn((windowId, updateInfo, cb) => {
                    if (cb) cb();
                })
            },
            storage: {
                local: {
                    set: jest.fn((data, cb) => {
                        if (cb) cb();
                    }),
                    get: jest.fn((key, cb) => {
                        if (cb) cb({});
                    })
                }
            }
        };

        // Load the background script. This should trigger addListener.
        // We isolate the module so it evaluates the addListener each time.
        jest.isolateModules(() => {
            require('../src/background/index.js');
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete global.chrome;
    });

    const validSender = {
        tab: {
            url: 'https://notebooklm.google.com/notebook/123'
        }
    };

    it('should log a warning and return early for an unauthorized sender', () => {
        const invalidSender = {
            tab: {
                url: 'https://example.com'
            }
        };

        listener({ type: 'SAVE_STATE' }, invalidSender, mockSendResponse);

        expect(console.warn).toHaveBeenCalledWith(
            'NotebookLM Source Management: Received message from unauthorized sender:',
            invalidSender
        );
        expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should handle SAVE_STATE message successfully', () => {
        const request = {
            type: 'SAVE_STATE',
            key: 'sourcesPlusState_123',
            data: { test: 123 }
        };

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
            { 'sourcesPlusState_123': { test: 123 } },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
        expect(result).toBe(true); // Should return true to keep channel open
    });

    it('should reject SAVE_STATE with invalid key', () => {
        const request = {
            type: 'SAVE_STATE',
            key: 'invalidKey',
            data: { test: 123 }
        };

        listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            'NotebookLM Source Management: Received SAVE_STATE with invalid key:',
            'invalidKey'
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: false,
            errorCode: 'invalid_storage_key'
        });
    });

    it('should handle SAVE_STATE error case', () => {
        const request = {
            type: 'SAVE_STATE',
            key: 'sourcesPlusState_123',
            data: { test: 123 }
        };

        // Set lastError before calling listener
        global.chrome.runtime.lastError = { message: 'Storage quota exceeded' };

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.set).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
            'NotebookLM Source Management background save error:',
            global.chrome.runtime.lastError
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: false,
            errorCode: 'runtime_failure'
        });
        expect(result).toBe(true);
    });

    it('should handle LOAD_STATE message successfully', () => {
        const request = {
            type: 'LOAD_STATE',
            key: 'sourcesPlusState_123'
        };

        // Mock get to return some data
        global.chrome.storage.local.get.mockImplementationOnce((key, cb) => {
            cb({ 'sourcesPlusState_123': { loadedData: true } });
        });

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.get).toHaveBeenCalledWith(
            'sourcesPlusState_123',
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            data: { loadedData: true }
        });
        expect(result).toBe(true); // Should return true to keep channel open
    });

    it('should reject LOAD_STATE with invalid key', () => {
        const request = {
            type: 'LOAD_STATE',
            key: 'invalidKey'
        };

        listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.get).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            'NotebookLM Source Management: Received LOAD_STATE with invalid key:',
            'invalidKey'
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: false,
            errorCode: 'invalid_storage_key'
        });
    });

    it('should handle LOAD_STATE message returning null when data not found', () => {
        const request = {
            type: 'LOAD_STATE',
            key: 'sourcesPlusState_123'
        };

        // Mock get to return empty object
        global.chrome.storage.local.get.mockImplementationOnce((key, cb) => {
            cb({});
        });

        listener(request, validSender, mockSendResponse);

        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            data: null
        });
    });

    it('should focus an existing NotebookLM notebook tab for launcher requests', () => {
        global.chrome.tabs.query.mockImplementationOnce((queryInfo, cb) => {
            cb([
                { id: 12, url: 'https://notebooklm.google.com/', windowId: 3 },
                { id: 44, url: 'https://notebooklm.google.com/notebook/abc', windowId: 5 }
            ]);
        });

        const result = listener({
            type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
            currentTabId: 12,
            currentContext: 'external'
        }, {}, mockSendResponse);

        expect(global.chrome.tabs.query).toHaveBeenCalledWith(
            { url: 'https://notebooklm.google.com/*' },
            expect.any(Function)
        );
        expect(global.chrome.tabs.update).toHaveBeenCalledWith(
            44,
            { active: true },
            expect.any(Function)
        );
        expect(global.chrome.windows.update).toHaveBeenCalledWith(
            5,
            { focused: true },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            action: 'focused-existing-notebook',
            tabId: 44,
            url: 'https://notebooklm.google.com/notebook/123'
        });
        expect(result).toBe(true);
    });

    it('should open a new NotebookLM home tab when the current tab is the only home tab', () => {
        global.chrome.tabs.query.mockImplementationOnce((queryInfo, cb) => {
            cb([
                { id: 12, url: 'https://notebooklm.google.com/', windowId: 3 }
            ]);
        });

        const result = listener({
            type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
            currentTabId: 12,
            currentContext: 'notebook-home'
        }, {}, mockSendResponse);

        expect(global.chrome.tabs.update).not.toHaveBeenCalled();
        expect(global.chrome.tabs.create).toHaveBeenCalledWith(
            { url: 'https://notebooklm.google.com/' },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            action: 'opened-new-home',
            tabId: 99,
            url: 'https://notebooklm.google.com/'
        });
        expect(result).toBe(true);
    });

    it('should focus an existing NotebookLM home tab from an external page when no notebook tab exists', () => {
        global.chrome.tabs.query.mockImplementationOnce((queryInfo, cb) => {
            cb([
                { id: 21, url: 'https://notebooklm.google.com/', windowId: 8 }
            ]);
        });
        global.chrome.tabs.update.mockImplementationOnce((tabId, updateInfo, cb) => {
            if (cb) cb({ id: tabId, url: 'https://notebooklm.google.com/' });
        });

        const result = listener({
            type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
            currentTabId: 5,
            currentContext: 'external'
        }, {}, mockSendResponse);

        expect(global.chrome.tabs.update).toHaveBeenCalledWith(
            21,
            { active: true },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            action: 'focused-existing-home',
            tabId: 21,
            url: 'https://notebooklm.google.com/'
        });
        expect(result).toBe(true);
    });

    it('should open NotebookLM when no matching tab exists', () => {
        global.chrome.tabs.query.mockImplementationOnce((queryInfo, cb) => {
            cb([]);
        });

        const result = listener({
            type: 'OPEN_OR_FOCUS_NOTEBOOKLM',
            currentTabId: 5,
            currentContext: 'external'
        }, {}, mockSendResponse);

        expect(global.chrome.tabs.create).toHaveBeenCalledWith(
            { url: 'https://notebooklm.google.com/' },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            action: 'opened-new-home',
            tabId: 99,
            url: 'https://notebooklm.google.com/'
        });
        expect(result).toBe(true);
    });
});
