import { createRequire } from 'node:module';
import { test, assert } from './helpers.js';
import { createIcons } from '../src/icons.js';
import { createSvg } from '../src/dom.js';

const { JSDOM } = createRequire(new URL('../../scratchpiler/package.json', import.meta.url))('jsdom');

const icons = () => {
    const { document } = new JSDOM('').window;
    return createIcons(createSvg(document));
};

test('icons are thin-line SVGs that take their colour from the text and are hidden from screen readers', () => {
    const svg = icons()('caret');
    assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
    assert.equal(svg.getAttribute('stroke'), 'currentColor');
    assert.equal(svg.getAttribute('fill'), 'none');
    assert.equal(svg.getAttribute('stroke-width'), '1.5');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.querySelector('path').getAttribute('d').length > 0, true);
});

test('every icon has its own path and a size that can be chosen', () => {
    const icon = icons();
    const paths = ['caret', 'cross', 'minus', 'plus'].map(name => icon(name).querySelector('path').getAttribute('d'));
    assert.equal(new Set(paths).size, 4);
    const small = icon('cross', 12);
    assert.deepEqual([small.getAttribute('width'), small.getAttribute('height')], ['12', '12']);
    assert.equal(icon('cross').getAttribute('width'), '14');
});
