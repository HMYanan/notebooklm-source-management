/**
 * Minimal DOM Mock for testing utility functions in Node.js environment
 * without jsdom.
 */
class Node {
    constructor() {
        this.childNodes = [];
        this.parentNode = null;
    }
    appendChild(child) {
        if (child instanceof Node) {
            child.parentNode = this;
            this.childNodes.push(child);
        }
        return child;
    }
    get textContent() {
        if (this instanceof TextNode) return this.text;
        return this.childNodes.map(c => c.textContent || '').join('');
    }
}

class TextNode extends Node {
    constructor(text) {
        super();
        this.text = text;
    }
}

class HTMLElement extends Node {
    constructor(tagName) {
        super();
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.attributes = new Map();
        this.dataset = {};
    }
    setAttribute(key, value) {
        this.attributes.set(key, String(value));
    }
    getAttribute(key) {
        const val = this.attributes.get(key);
        return val === undefined ? null : val;
    }
    hasAttribute(key) {
        return this.attributes.has(key);
    }
    get innerHTML() {
        return this.childNodes.map(c => {
            if (c instanceof HTMLElement) {
                const attrs = Array.from(c.attributes.entries())
                    .map(([k, v]) => ` ${k}="${v}"`)
                    .join('');
                return `<${c.tagName.toLowerCase()}${attrs}>${c.innerHTML}</${c.tagName.toLowerCase()}>`;
            }
            return c.textContent;
        }).join('');
    }
    get firstChild() {
        return this.childNodes[0] || null;
    }
}

global.Node = Node;
global.document = {
    createElement: (tag) => new HTMLElement(tag),
    createTextNode: (text) => new TextNode(text)
};

const { el } = require('./src/utils');

describe('el function', () => {
    test('creates an element with tag name', () => {
        const element = el('div');
        expect(element.tagName).toBe('DIV');
    });

    test('sets className correctly', () => {
        const element = el('div', { className: 'test-class' });
        expect(element.className).toBe('test-class');
    });

    test('sets dataset correctly', () => {
        const element = el('div', { dataset: { id: '123', type: 'user' } });
        expect(element.dataset.id).toBe('123');
        expect(element.dataset.type).toBe('user');
    });

    test('sets attributes correctly', () => {
        const element = el('input', { type: 'text', placeholder: 'enter name' });
        expect(element.getAttribute('type')).toBe('text');
        expect(element.getAttribute('placeholder')).toBe('enter name');
    });

    test('sets boolean attributes correctly', () => {
        const element = el('input', { disabled: true, required: false });
        expect(element.hasAttribute('disabled')).toBe(true);
        expect(element.getAttribute('disabled')).toBe('');
        expect(element.hasAttribute('required')).toBe(false);
    });

    test('ignores null or false attributes', () => {
        const element = el('div', { 'data-test': null, 'aria-hidden': false });
        expect(element.hasAttribute('data-test')).toBe(false);
        expect(element.hasAttribute('aria-hidden')).toBe(false);
    });

    test('appends string children as text nodes', () => {
        const element = el('div', {}, ['Hello ', 'World']);
        expect(element.childNodes.length).toBe(2);
        expect(element.textContent).toBe('Hello World');
    });

    test('appends Node children correctly', () => {
        const span = document.createElement('span');
        // Manually mock textContent for the span
        span.childNodes.push(new TextNode('Child'));
        const element = el('div', {}, [span]);
        expect(element.childNodes.length).toBe(1);
        expect(element.firstChild).toBe(span);
        // Minimal innerHTML check
        expect(element.innerHTML).toContain('span');
    });

    test('handles mixed children', () => {
        const span = document.createElement('span');
        const element = el('div', {}, ['Text before ', span, ' text after']);
        expect(element.childNodes.length).toBe(3);
        expect(element.childNodes[0] instanceof TextNode).toBe(true);
        expect(element.childNodes[1]).toBe(span);
        expect(element.childNodes[2] instanceof TextNode).toBe(true);
    });

    test('blocks insecure event handler attributes', () => {
        const element = el('div', { onclick: 'alert(1)', onMouseOver: 'console.log("hover")' });
        expect(element.hasAttribute('onclick')).toBe(false);
        expect(element.hasAttribute('onMouseOver')).toBe(false);
        // It shouldn't block attributes containing 'on' but not starting with it
        const element2 = el('div', { 'data-icon': 'icon' });
        expect(element2.getAttribute('data-icon')).toBe('icon');
    });

    test('blocks javascript URIs in sensitive attributes', () => {
        const element = el('a', { href: 'javascript:alert(1)', src: ' javascript: void(0);', action: 'JAVAScript:something()', formaction: 'javasc\tript:alert(1)', srcdoc: 'java\nscript:alert(1)' });
        expect(element.hasAttribute('href')).toBe(false);
        expect(element.hasAttribute('src')).toBe(false);
        expect(element.hasAttribute('action')).toBe(false);
        expect(element.hasAttribute('formaction')).toBe(false);
        expect(element.hasAttribute('srcdoc')).toBe(false);

        // It should allow normal URLs
        const safeElement = el('a', { href: 'https://example.com' });
        expect(safeElement.getAttribute('href')).toBe('https://example.com');
    });
});
