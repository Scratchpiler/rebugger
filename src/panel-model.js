import { toNumber } from './util.js';

export const ROW_LIMIT = 200;
export const LIST_ITEM_LIMIT = 100;
export const SPEEDS = [0.25, 0.5, 1, 2, 5, Infinity];
export const DECK_SPEEDS = [0.25, 0.5, 1, 2, 4];

export const speedLabel = speed => speed === Infinity ? '∞' : `${speed}×`;
export const speedDigits = speed => speed === Infinity ? '∞' : String(speed);

export function parseValue(text) {
    const trimmed = text.trim();
    const number = Number(trimmed);
    return trimmed !== '' && Number.isFinite(number) && String(number) === trimmed ? number : text;
}

export const editableText = value => Array.isArray(value) ? JSON.stringify(value) : String(value);

const SIGNIFICANT_DIGITS = 10;

export const displayValue = value => {
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    if (value === '') return '""';
    if (typeof value === 'number' && !Number.isInteger(value) && Number.isFinite(value)) {
        return String(Number(value.toPrecision(SIGNIFICANT_DIGITS)));
    }
    return String(value);
};

export function parseFilter(text) {
    const wrapped = text.match(/^\/(.+)\/([a-z]*)$/);
    if (!wrapped) return text.trim();
    try {
        return new RegExp(wrapped[1], wrapped[2]);
    } catch {
        return text.trim();
    }
}

export const rowKey = ({ sprite, clone, name, kind }) => `${kind}\u0000${sprite}\u0000${clone}\u0000${name}`;

export const scopeOf = ({ sprite, clone, kind }) => ({ sprite, clone, kind });

const collator = new Intl.Collator(undefined, { numeric: true });
const byName = (a, b) => (a.sprite === b.sprite ? 0 : collator.compare(a.sprite, b.sprite)) || collator.compare(a.name, b.name);

export function withPins(rows, frozenRows) {
    const modes = new Map();
    const heldItems = new Map();
    for (const row of frozenRows) {
        const key = rowKey(row);
        if (row.index === undefined) modes.set(key, row.mode);
        else heldItems.set(key, [...(heldItems.get(key) ?? []), row.index]);
    }
    return rows.map(row => {
        const key = rowKey(row);
        return { ...row, key, pin: modes.get(key) ?? null, held: heldItems.get(key) ?? [] };
    });
}

export function variableRows(api, { filter, sprite, frozenOnly, clones }) {
    const found = api.find(parseFilter(filter), { kind: 'any', clones, live: true, ...(sprite ? { sprite } : {}) });
    const frozenRows = api.frozen();
    const candidates = frozenOnly
        ? found.filter(row => frozenRows.some(held => rowKey(held) === rowKey(row)))
        : found;
    candidates.sort(byName);
    return { rows: withPins(candidates.slice(0, ROW_LIMIT), frozenRows), total: candidates.length };
}

export const scanRows = api => withPins(api.scan.results().map(row => ({ ...row, kind: 'var' })), api.frozen());

export const spriteNames = api => [...new Set(api.sprites())].sort((a, b) =>
    (a === 'Stage' ? -1 : b === 'Stage' ? 1 : collator.compare(a, b)));

export const pinLabel = pin => ({ freeze: 'Frozen', blank: 'Blanked', shitpost: 'Shitposting' })[pin] ?? 'Freeze';

export function timeSummary(info) {
    if (info.playing) return { tone: 'play', text: `playing ${info.playing}` };
    if (info.recording) return { tone: 'record', text: `recording ${info.recording}` };
    if (info.paused) return { tone: 'paused', text: 'paused' };
    return { tone: 'run', text: `running ${speedLabel(info.speed)}` };
}

export const ageLabel = (iso, now = Date.now()) => {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
};

export const errorText = error => error instanceof Error ? error.message : String(error);

export function formatClock(milliseconds) {
    const centiseconds = Math.floor(Math.max(0, milliseconds) / 10);
    const minutes = Math.floor(centiseconds / 6000);
    const seconds = Math.floor((centiseconds % 6000) / 100);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

const numericPoints = series => series
    .map(({ t, value }) => ({ t, value: toNumber(value) }))
    .filter(point => Number.isFinite(point.value))
    .map((point, index) => ({ ...point, index }));

export const varies = series => {
    const numbers = numericPoints(series).map(point => point.value);
    return numbers.length > 1 && Math.min(...numbers) !== Math.max(...numbers);
};

export const pickMoving = seriesList => {
    const index = seriesList.findIndex(varies);
    return index === -1 ? 0 : index;
};

const MAX_PLOT_POINTS = 240;
const PLOT_MARGIN = 8;

function downsample(points, limit) {
    if (points.length <= limit) return points;
    const bucket = Math.ceil(points.length / (limit / 2));
    const kept = [];
    for (let start = 0; start < points.length; start += bucket) {
        const slice = points.slice(start, start + bucket);
        const low = slice.reduce((a, b) => (b.value < a.value ? b : a));
        const high = slice.reduce((a, b) => (b.value > a.value ? b : a));
        kept.push(...(low.t <= high.t ? [low, high] : [high, low]));
    }
    return kept;
}

export function sparkline(series, duration) {
    const points = numericPoints(series);
    if (points.length < 2) return null;
    const values = points.map(point => point.value);
    const low = Math.min(...values);
    const span = Math.max(...values) - low;
    const x = point => (duration > 0 ? point.t / duration : point.index / (points.length - 1)) * 100;
    const y = point => (span === 0 ? 50 : 100 - PLOT_MARGIN - ((point.value - low) / span) * (100 - 2 * PLOT_MARGIN));
    const plotted = downsample(points, MAX_PLOT_POINTS).map(point => [x(point), y(point)]);
    const line = plotted.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
    return { line, area: `0,100 ${line} 100,100`, low, high: low + span };
}
