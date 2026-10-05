const applyProp = (el, key, value) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
};

const append = (el, child) => {
    if (Array.isArray(child)) child.forEach(c => append(el, c));
    else if (child !== null && child !== undefined && child !== false) {
        el.append(typeof child === 'object' ? child : String(child));
    }
};

export const createH = doc => (tag, props = {}, ...children) => {
    const el = doc.createElement(tag);
    for (const [key, value] of Object.entries(props)) applyProp(el, key, value);
    append(el, children);
    return el;
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const createSvg = doc => (tag, attributes = {}, ...children) => {
    const el = doc.createElementNS(SVG_NAMESPACE, tag);
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    el.append(...children);
    return el;
};
