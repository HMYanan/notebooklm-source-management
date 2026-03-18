(function () {
    'use strict';

    function createManagerShell(el, chrome) {
        return el('div', { className: 'sp-container' }, [
            el('div', { className: 'sp-controls' }, [
                el('div', { className: 'sp-toolbar-actions' }, [
                    el('button', { id: 'sp-new-group-btn', className: 'sp-button sp-toolbar-action' }, [chrome.i18n.getMessage("ui_new_group")]),
                    el('button', { id: 'sp-manage-tags-btn', className: 'sp-button sp-toolbar-action' }, [chrome.i18n.getMessage("ui_manage_tags")]),
                    el('button', { id: 'sp-batch-action-btn', className: 'sp-button sp-toolbar-action' }, [chrome.i18n.getMessage("ui_batch_action")])
                ]),
                el('div', { className: 'sp-search-container' }, [
                    el('input', {
                        id: 'sp-search',
                        type: 'search',
                        placeholder: chrome.i18n.getMessage("ui_filter_sources"),
                        'aria-label': chrome.i18n.getMessage("ui_filter_sources"),
                        autocomplete: 'off'
                    }),
                    el('button', {
                        id: 'sp-search-btn',
                        className: 'sp-icon-button',
                        title: chrome.i18n.getMessage("ui_filter_sources"),
                        'aria-label': chrome.i18n.getMessage("ui_filter_sources")
                    }, [
                        el('span', { className: 'google-symbols' }, ['search'])
                    ])
                ])
            ]),
            el('div', { id: 'sp-view-state', className: 'sp-view-state', hidden: true }),
            el('div', { id: 'sources-list' }),
            el('div', { className: 'sp-resizer' })
        ]);
    }

    globalThis.NSM_CREATE_MANAGER_SHELL = createManagerShell;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = createManagerShell;
    }
})();
