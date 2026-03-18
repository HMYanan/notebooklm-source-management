(function () {
    'use strict';

    const DEPS = {
        panel: ['[data-testid="source-panel"]', '.source-panel'],
        scroll: ['.scroll-area'],
        row: ['[data-testid="source-item"]', '.single-source-container'],
        title: ['[data-testid="source-title"]', '.source-title'],
        checkbox: ['input[type="checkbox"]', '.select-checkbox input[type="checkbox"]'],
        moreBtn: ['[aria-label="More options"]', '.source-item-more-button'],
        icon: ['mat-icon[class*="-icon-color"]', 'mat-icon:not([aria-label="More options"] mat-icon):not(button mat-icon)']
    };

    const contentConfig = {
        DEPS,
        SCROLL_AREA_SELECTOR: DEPS.scroll[0],
        SOURCE_TITLE_SELECTOR: DEPS.title[0],
        SOURCE_CHECKBOX_SELECTOR: DEPS.checkbox[0],
        SOURCE_ICON_SELECTOR: DEPS.icon[0],
        STORAGE_SCHEMA_VERSION: 3,
        GLOBAL_OVERLAY_STYLE_ID: 'sp-global-glassmorphism',
        ROUTE_REINIT_MAX_ATTEMPTS: 2,
        ROUTE_REINIT_RETRY_DELAY_MS: 250
    };

    globalThis.NSM_CONTENT_CONFIG = contentConfig;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = contentConfig;
    }
})();
