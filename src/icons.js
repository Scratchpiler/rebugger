const PATHS = {
    caret: 'M9.5 6.5 15 12l-5.5 5.5',
    cross: 'M7 7l10 10M17 7 7 17',
    minus: 'M6.5 12h11',
    plus: 'M12 6.5v11M6.5 12h11',
    lock: 'M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11M6.5 11h11v8.5h-11z',
};

const LINE = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

export const createIcons = s => (name, size = 14) =>
    s('svg', { class: 'glyph', viewBox: '0 0 24 24', width: String(size), height: String(size), 'aria-hidden': 'true', ...LINE }, s('path', { d: PATHS[name] }));
