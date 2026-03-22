function clearContentGlobals() {
    delete globalThis.NSM_CONTENT_CONFIG;
    delete globalThis.NSM_SOURCE_DESCRIPTOR_HELPERS;
    delete globalThis.NSM_CONTENT_STYLE_TEXT;
    delete globalThis.NSM_GLOBAL_OVERLAY_STYLE_TEXT;
    delete globalThis.NSM_CREATE_MANAGER_SHELL;
}

function loadContentModule() {
    clearContentGlobals();
    require('../../src/content/content-config.js');
    require('../../src/content/source-descriptor-helpers.js');
    require('../../src/content/content-style-text.js');
    require('../../src/content/content-template.js');
    return require('../../src/content/index.js');
}

module.exports = loadContentModule;
