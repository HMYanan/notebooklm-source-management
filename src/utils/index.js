/**
 * Helper function to create DOM elements with attributes and children.
 * @param {string} tag - The HTML tag name.
 * @param {Object} attributes - Object containing attributes to set on the element.
 * @param {Array} children - Array of children (strings or Nodes) to append to the element.
 * @returns {HTMLElement} The created element.
 */
function el(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className' && value) {
            element.className = value;
        } else if (key === 'dataset' && value) {
            for (const [dKey, dVal] of Object.entries(value)) {
                element.dataset[dKey] = dVal;
            }
        } else if (value !== false && value != null) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.startsWith('on')) {
                console.warn(`Sources+: Blocked insecure attribute key: ${key}`);
                continue;
            }
            if (['href', 'src', 'action', 'formaction', 'srcdoc'].includes(lowerKey) && String(value).toLowerCase().replace(/[\s\x00-\x1F]/g, '').startsWith('javascript:')) {
                console.warn(`Sources+: Blocked insecure attribute value for ${key}`);
                continue;
            }
            element.setAttribute(key, value === true ? '' : value);
        }
    }
    for (const child of children) {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    }
    return element;
}

/**
 * Debounce a function.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The wait time in milliseconds.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Checks if a group is a descendant of another group.
 * @param {Object} possibleChild - The potential child group object.
 * @param {Object} possibleParent - The potential parent group object.
 * @param {Map} groupsById - A Map containing all groups keyed by their IDs.
 * @returns {boolean} True if possibleChild is a descendant of possibleParent, false otherwise.
 */
function isDescendant(possibleChild, possibleParent, groupsById) {
    if (!possibleChild || !possibleParent || possibleChild.id === possibleParent.id) return true;
    const visit = (g) => {
        if (!g) return false;
        return g.children.some(c => {
            if (c.type === 'group') {
                if (c.id === possibleChild.id) return true;
                return visit(groupsById.get(c.id));
            }
            return false;
        });
    };
    return visit(possibleParent);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { el, debounce, isDescendant };
}
