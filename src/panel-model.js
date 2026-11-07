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

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function durationLabel(milliseconds) {
    const seconds = Math.max(0, milliseconds) / 1000;
    if (seconds < 10) return `${seconds.toFixed(1)}s`;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.floor(seconds / 60)}m ${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

export const THREAD_FILTERS = ['All', 'Running', 'Waiting'];
export const THREAD_SORTS = ['Oldest', 'Cost', 'Sprite', 'State'];
export const THREAD_LINGER_MS = 1500;
export const RESORT_MS = 2000;
export const SUGGESTION_LIMIT = 8;
export const FRAME_BUDGET_MS = 1000 / 30;

const THREAD_COMPARE = {
    Oldest: (a, b) => a.id - b.id,
    Cost: (a, b) => b.ms - a.ms || a.id - b.id,
    Sprite: (a, b) => a.sprite.localeCompare(b.sprite, undefined, { sensitivity: 'base' }) || a.clone - b.clone || a.id - b.id,
    State: (a, b) => THREAD_STATES.indexOf(a.state) - THREAD_STATES.indexOf(b.state) || b.ms - a.ms || a.id - b.id,
};
const THREAD_STATES = ['running', 'waiting', 'paused', 'ended'];

export const threadName = row => row.clone ? `${row.sprite} #${row.clone}` : row.sprite;

export function hatShort(script) {
    if (/^when flag clicked/.test(script)) return 'flag';
    const receive = script.match(/^when I receive (.+)$/);
    if (receive) return receive[1];
    if (/^when I start as a clone/.test(script)) return 'clone';
    const key = script.match(/^when (.+) key pressed$/);
    if (key) return `key ${key[1]}`;
    return script.replace(/^when /, '');
}

export function threadStateText(row) {
    if (row.state !== 'waiting' || row.waitedMs < 1000) return row.state;
    return `waiting ${durationLabel(row.waitedMs)}`;
}

export const threadFacts = row => [
    `${durationLabel(row.ageMs)} old`,
    row.state === 'waiting' || row.state === 'paused' ? `${durationLabel(row.waitedMs)} at this block` : null,
    row.warp ? 'warp: runs without yielding' : null,
].filter(Boolean);

export function threadMs(ms) {
    if (ms < 0.005) return '–';
    return ms < 1 ? `${ms.toFixed(2)}ms` : `${ms.toFixed(1)}ms`;
}

export function threadSummary(rows) {
    const count = state => rows.filter(row => row.state === state).length;
    const live = rows.length - count('ended');
    const parts = [plural(live, 'script'), `${count('running')} running`, `${count('waiting')} waiting`];
    if (count('paused')) parts.push(`${count('paused')} paused`);
    return parts.join(' · ');
}

const FILTER_TEST = {
    All: () => true,
    Running: row => row.state === 'running',
    Waiting: row => row.state === 'waiting',
};

export function threadMatches(row, { text, filter }) {
    if (!FILTER_TEST[filter](row)) return false;
    if (!text) return true;
    const wanted = parseFilter(text);
    const haystack = `${row.sprite} ${row.clone ? `#${row.clone}` : ''} ${row.script} ${row.block}`;
    return wanted instanceof RegExp ? wanted.test(haystack) : haystack.toLowerCase().includes(String(wanted).toLowerCase());
}

export function withLingering(memory, rows, now, { ttl = THREAD_LINGER_MS, hold = false } = {}) {
    const present = new Set();
    for (const row of rows) {
        present.add(row.id);
        memory.set(row.id, { row, goneAt: row.state === 'ended' ? (memory.get(row.id)?.goneAt ?? now) : null });
    }
    const out = [];
    for (const [id, remembered] of memory) {
        let entry = remembered;
        if (!present.has(id) && entry.goneAt === null) {
            entry = { row: { ...entry.row, state: 'ended', ms: 0, long: false }, goneAt: now };
            memory.set(id, entry);
        }
        const expired = entry.goneAt !== null && !hold && now - entry.goneAt > ttl;
        if (expired && !present.has(id)) memory.delete(id);
        else if (!expired) out.push(entry.row);
    }
    return out;
}

export function stableOrder(previous, rows, sort, resort) {
    const compare = THREAD_COMPARE[sort];
    const byId = new Map(rows.map(row => [row.id, row]));
    if (resort) return rows.slice().sort(compare).map(row => row.id);
    const kept = previous.filter(id => byId.has(id));
    const known = new Set(kept);
    const fresh = rows.filter(row => !known.has(row.id)).sort(compare).map(row => row.id);
    return [...kept, ...fresh];
}

export function suggestMessages(messages, text) {
    const needle = text.trim().toLowerCase();
    const rank = name => {
        const lower = name.toLowerCase();
        if (!needle) return 3;
        if (lower === needle) return -1;
        if (lower.startsWith(needle)) return 0;
        if (lower.split(/[\s_-]+/).some(word => word.startsWith(needle))) return 1;
        return lower.includes(needle) ? 2 : null;
    };
    return messages
        .map(message => ({ message, rank: rank(message.name) }))
        .filter(entry => entry.rank !== null)
        .sort((a, b) => a.rank - b.rank || b.message.listeners - a.message.listeners || a.message.name.localeCompare(b.message.name))
        .slice(0, SUGGESTION_LIMIT)
        .map(entry => entry.message);
}
