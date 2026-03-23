const enMessages = require('../_locales/en/messages.json');
const zhCnMessages = require('../_locales/zh_CN/messages.json');

function getMessageKeys(messages) {
    return Object.keys(messages).sort();
}

function getPlaceholderSignature(messageEntry) {
    const placeholders = messageEntry && messageEntry.placeholders ? messageEntry.placeholders : {};
    return Object.keys(placeholders)
        .sort()
        .map((key) => ({
            key,
            content: placeholders[key] && placeholders[key].content ? placeholders[key].content : ''
        }));
}

function getRequiredMessageKeys() {
    return [
        'popup_badge_ready',
        'popup_badge_launcher',
        'popup_badge_attention',
        'popup_title_ready',
        'popup_body_ready',
        'popup_title_notebook_home',
        'popup_body_notebook_home',
        'popup_title_refresh_needed',
        'popup_body_refresh_needed',
        'popup_cta_open_manager',
        'popup_cta_refresh_notebook',
        'popup_reason_source_panel_missing',
        'popup_reason_panel_header_missing',
        'popup_reason_manager_not_ready',
        'popup_reason_notebook_missing',
        'popup_reason_generic',
        'popup_error_invalid_storage_key',
        'ui_source_untitled',
        'ui_group_untitled',
        'ui_no_matching_sources',
        'ui_no_tags',
        'ui_tag_delete_confirm',
        'ui_tag_filter_active',
        'ui_isolation_active'
    ].sort();
}

describe('locale message catalogs', () => {
    it('keeps English and Simplified Chinese keys in sync', () => {
        expect(getMessageKeys(zhCnMessages)).toEqual(getMessageKeys(enMessages));
    });

    it('keeps placeholder structure aligned between locales', () => {
        for (const key of getMessageKeys(enMessages)) {
            expect(getPlaceholderSignature(enMessages[key])).toEqual(getPlaceholderSignature(zhCnMessages[key]));
        }
    });

    it('retains critical fallback and popup copy keys', () => {
        for (const key of getRequiredMessageKeys()) {
            expect(enMessages[key]).toBeDefined();
            expect(zhCnMessages[key]).toBeDefined();
            expect(enMessages[key].message).not.toBe('');
            expect(zhCnMessages[key].message).not.toBe('');
        }
    });
});
