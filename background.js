// background.js
// Service Worker handling background tasks and local storage
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Security: Validate sender origin to prevent unauthorized access
    if (!sender.tab || !sender.tab.url || !sender.tab.url.startsWith('https://notebooklm.google.com/notebook/')) {
        console.warn('Sources+: Received message from unauthorized sender:', sender);
        return;
    }

    if (request.type === 'SAVE_STATE') {
        // Security: Validate storage key to prevent arbitrary storage manipulation
        if (typeof request.key !== 'string' || !request.key.startsWith('sourcesPlusState_')) {
            console.warn('Sources+: Received SAVE_STATE with invalid key:', request.key);
            sendResponse({ success: false, error: 'Invalid storage key' });
            return;
        }

        chrome.storage.local.set({ [request.key]: request.data }, () => {
            if (chrome.runtime.lastError) {
                console.error("Sources+ background save error:", chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true });
            }
        });
        return true; // Keep the message channel open for async response
    }

    if (request.type === 'LOAD_STATE') {
        // Security: Validate storage key
        if (typeof request.key !== 'string' || !request.key.startsWith('sourcesPlusState_')) {
            console.warn('Sources+: Received LOAD_STATE with invalid key:', request.key);
            sendResponse({ success: false, error: 'Invalid storage key' });
            return;
        }

        chrome.storage.local.get(request.key, (data) => {
            sendResponse({ success: true, data: data[request.key] || null });
        });
        return true;
    }
});
