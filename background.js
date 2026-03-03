// background.js
// Service Worker handling background tasks and local storage
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SAVE_STATE') {
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
        chrome.storage.local.get(request.key, (data) => {
            sendResponse({ success: true, data: data[request.key] || null });
        });
        return true;
    }
});
