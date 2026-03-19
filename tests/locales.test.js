const enMessages = require('../_locales/en/messages.json');
const zhCnMessages = require('../_locales/zh_CN/messages.json');

describe('locale message catalogs', () => {
    it('keeps English and Simplified Chinese keys in sync', () => {
        expect(Object.keys(zhCnMessages).sort()).toEqual(Object.keys(enMessages).sort());
    });
});
