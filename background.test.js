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
            require('./background.js');
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
            'Sources+: Received message from unauthorized sender:',
            invalidSender
        );
        expect(global.chrome.storage.local.set).not.toHaveBeenCalled();
        expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should handle SAVE_STATE message successfully', () => {
        const request = {
            type: 'SAVE_STATE',
            key: 'myKey',
            data: { test: 123 }
        };

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
            { 'myKey': { test: 123 } },
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
        expect(result).toBe(true); // Should return true to keep channel open
    });

    it('should handle SAVE_STATE error case', () => {
        const request = {
            type: 'SAVE_STATE',
            key: 'myKey',
            data: { test: 123 }
        };

        // Set lastError before calling listener
        global.chrome.runtime.lastError = { message: 'Storage quota exceeded' };

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.set).toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
            'Sources+ background save error:',
            global.chrome.runtime.lastError
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: false,
            error: 'Storage quota exceeded'
        });
        expect(result).toBe(true);
    });

    it('should handle LOAD_STATE message successfully', () => {
        const request = {
            type: 'LOAD_STATE',
            key: 'myKey'
        };

        // Mock get to return some data
        global.chrome.storage.local.get.mockImplementationOnce((key, cb) => {
            cb({ 'myKey': { loadedData: true } });
        });

        const result = listener(request, validSender, mockSendResponse);

        expect(global.chrome.storage.local.get).toHaveBeenCalledWith(
            'myKey',
            expect.any(Function)
        );
        expect(mockSendResponse).toHaveBeenCalledWith({
            success: true,
            data: { loadedData: true }
        });
        expect(result).toBe(true); // Should return true to keep channel open
    });

    it('should handle LOAD_STATE message returning null when data not found', () => {
        const request = {
            type: 'LOAD_STATE',
            key: 'myKey'
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
});
