(function () {
    'use strict';

    function createManagerShell(el, chrome) {
        return el('div', { className: 'sp-container' }, [
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
    }

    globalThis.NSM_CREATE_MANAGER_SHELL = createManagerShell;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = createManagerShell;
    }
})();
