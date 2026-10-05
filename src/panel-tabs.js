import {
    ROW_LIMIT, ageLabel, parseFilter, parseValue, scanRows, spriteNames, variableRows,
} from './panel-model.js';
import { createDeck } from './panel-deck.js';
import { createRow, reconcile } from './panel-rows.js';

const checkbox = (h, label, checked, onChange) => {
    const input = h('input', { type: 'checkbox', checked, onChange: () => onChange(input.checked) });
    input.checked = checked;
    return { input, el: h('label', {}, input, label) };
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const KEEP = {
    frames: { value: 3600, min: 1, step: '1', option: 'maxFrames' },
    seconds: { value: 120, min: 0.1, step: 'any', option: 'maxSeconds' },
};
const hitsMessage = hits => `${plural(hits.length, 'hit')} left`;

function rowsView(h, ctx, emptyText, { showCount = false } = {}) {
    const list = h('div', { class: 'list', role: 'list' });
    const empty = h('div', { class: 'empty' }, emptyText);
    const summary = h('div', { class: 'summary', 'aria-live': 'off' });
    const entries = new Map();
    return {
        els: [summary, list, empty],
        show({ rows, total }, emptyMessage) {
            reconcile(list, rows, entries, item => createRow({ h, ctx }, item));
            summary.textContent = total > rows.length ? `${total} found, showing the first ${ROW_LIMIT}: narrow the filter` : plural(total, 'row');
            if (emptyMessage) empty.textContent = emptyMessage;
            empty.hidden = total > 0;
            list.hidden = total === 0;
            summary.hidden = total === 0 || (!showCount && total <= rows.length);
        },
    };
}

export function variablesTab({ h, ctx }) {
    const state = { filter: '', sprite: '', frozenOnly: false, clones: false };
    const filter = h('input', { class: 'grow', type: 'search', placeholder: 'Filter', title: 'Filter by name, or /regex/', 'aria-label': 'Filter variables by name' });
    filter.addEventListener('input', () => { state.filter = filter.value; ctx.refresh(); });
    const sprite = h('select', { 'aria-label': 'Sprite' });
    sprite.addEventListener('change', () => { state.sprite = sprite.value; ctx.refresh(); });
    const frozen = checkbox(h, 'Frozen', false, on => { state.frozenOnly = on; ctx.refresh(); });
    const clones = checkbox(h, 'Clones', false, on => { state.clones = on; ctx.refresh(); });
    const view = rowsView(h, ctx, 'No variables match.');
    frozen.el.title = 'Show only what is frozen, blanked or shitposted';
    let knownSprites = '';

    function syncSprites() {
        const names = spriteNames(ctx.api);
        const signature = names.join('\u0000');
        if (signature === knownSprites) return;
        knownSprites = signature;
        sprite.replaceChildren(h('option', { value: '' }, 'All sprites'), ...names.map(name => h('option', { value: name }, name)));
        if (!names.includes(state.sprite)) state.sprite = '';
        sprite.value = state.sprite;
    }

    return {
        id: 'vars',
        hue: 'var',
        label: 'Variables',
        el: h('div', { class: 'page' },
            h('div', { class: 'toolbar' }, filter, sprite, h('span', { class: 'checks' }, frozen.el, clones.el)), ...view.els),
        refresh() {
            syncSprites();
            const found = variableRows(ctx.api, state);
            const placeholder = `Filter ${found.total} rows`;
            if (filter.placeholder !== placeholder) filter.placeholder = placeholder;
            view.show(found, state.filter ? 'No variables match that filter.' : 'This project has no variables.');
        },
    };
}

export function scanTab({ h, ctx }) {
    const value = h('input', { class: 'grow', placeholder: 'value to look for', 'aria-label': 'Value to scan for' });
    const within = h('input', { type: 'number', min: '0', step: 'any', placeholder: '± tol', title: 'match numbers within this distance', 'aria-label': 'Tolerance', style: 'width:72px' });
    const scanButton = h('button', { class: 'btn primary' }, 'Scan');
    const narrowers = ['changed', 'unchanged', 'increased', 'decreased'].map(name =>
        h('button', { title: `Keep what has ${name === 'unchanged' ? 'not changed' : name} since the last scan`, onClick: () => ctx.run(() => ctx.api.scan[name](), hitsMessage) }, name[0].toUpperCase() + name.slice(1)));
    const snapshot = h('button', { class: 'btn', title: 'Start from every variable, for when you cannot read the number', onClick: () => ctx.run(() => ctx.api.scan.snapshot(), count => `scan started from ${plural(count, 'variable')}`) }, 'Snapshot');
    const reset = h('button', { class: 'btn danger', onClick: () => ctx.run(() => ctx.api.scan.reset(), 'scan cleared') }, 'Reset');
    const view = rowsView(h, ctx, '', { showCount: true });
    const submit = () => {
        if (value.value.trim() === '') return ctx.fail(new Error('type a value to scan for, or press Snapshot'));
        ctx.run(() => ctx.api.scan(parseValue(value.value), { within: Number(within.value) || 0 }), hitsMessage);
    };
    scanButton.addEventListener('click', submit);
    value.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });

    return {
        id: 'scan',
        hue: 'sense',
        label: 'Scan',
        el: h('div', { class: 'page' },
            h('div', { class: 'toolbar' }, value, within, scanButton, snapshot, reset),
            h('div', { class: 'btn-row' }, h('span', { class: 'segments', role: 'group', 'aria-label': 'Narrow the scan' }, ...narrowers)),
            ...view.els),
        refresh() {
            const scanning = ctx.api.info().scanning !== null;
            scanButton.textContent = scanning ? 'Narrow' : 'Scan';
            for (const button of narrowers) button.disabled = !scanning;
            snapshot.hidden = scanning;
            reset.hidden = !scanning;
            const rows = scanning ? scanRows(ctx.api) : [];
            view.show({ rows: rows.slice(0, ROW_LIMIT), total: rows.length },
                scanning ? 'Nothing left: Reset and scan again.' : 'Scan for a value the game shows, change it in the game, then narrow: Changed, Increased, or scan the new value.');
        },
    };
}

function savedItem({ h, ctx, options }) {
    let name = '';
    const title = h('strong', {});
    const detail = h('span', { class: 'detail' });
    const el = h('div', { class: 'saved' }, title, h('span', { class: 'actions' },
        h('button', { class: 'btn primary', onClick: () => ctx.run(() => ctx.api.load(name, options()), report => `loaded ${name}: ${report.variables} variables and lists${report.frozen.length ? `; frozen ones snap back: ${report.frozen.join(', ')}` : ''}`) }, 'Load'),
        h('button', { class: 'btn', onClick: () => ctx.run(() => ctx.download(`${name}.rebugger-state.json`, JSON.stringify(ctx.api.export(name))), `exported ${name}`) }, 'Export'),
        h('button', { class: 'btn danger', onClick: () => ctx.run(() => ctx.api.drop(name), `dropped ${name}`) }, 'Drop')), detail);
    return {
        el,
        update(summary) {
            name = summary.name;
            title.textContent = name;
            detail.textContent = `${plural(summary.variables, 'variable')}, ${plural(summary.lists, 'list')}, ${plural(summary.targets, 'sprite')}, saved ${ageLabel(summary.takenAt)}`;
        },
    };
}

export function statesTab({ h, ctx }) {
    const name = h('input', { class: 'grow', placeholder: 'name (optional)', 'aria-label': 'Savestate name' });
    const motion = checkbox(h, 'Restore sprite positions', true, () => {});
    const recreate = checkbox(h, 'Recreate deleted', false, () => {});
    const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const entries = new Map();
    const list = h('div', { class: 'list' });
    const empty = h('div', { class: 'empty' }, 'No savestates yet. Save one before trying something risky.');
    const save = () => {
        if (ctx.run(() => ctx.api.save(name.value.trim() || undefined), saved => `saved ${saved.name}`)) name.value = '';
    };
    name.addEventListener('keydown', event => { if (event.key === 'Enter') save(); });
    picker.addEventListener('change', async () => {
        const [file] = picker.files;
        if (!file) return;
        try {
            const text = await file.text();
            ctx.run(() => ctx.api.import(text), `imported ${file.name}`);
        } catch (error) {
            ctx.fail(error);
        }
        picker.value = '';
    });
    const options = () => ({ motion: motion.input.checked, recreate: recreate.input.checked });

    return {
        id: 'states',
        hue: 'events',
        label: 'Savestates',
        el: h('div', { class: 'page' },
            h('div', { class: 'toolbar' }, name, h('button', { class: 'btn primary', onClick: save }, 'Save'),
                h('button', { class: 'btn', onClick: () => picker.click() }, 'Import…'), picker),
            h('div', { class: 'toolbar' }, motion.el, recreate.el),
            list, empty),
        refresh() {
            const states = ctx.api.states().map(summary => ({ ...summary, key: summary.name })).reverse();
            reconcile(list, states, entries, () => savedItem({ h, ctx, options }));
            empty.hidden = states.length > 0;
            list.hidden = states.length === 0;
        },
    };
}

function recordingItem({ h, ctx }) {
    let name = '';
    const replay = h('button', { class: 'btn primary' });
    const drop = h('button', { class: 'btn danger', onClick: () => ctx.run(() => ctx.api.droprec(name), `dropped ${name}`) }, 'Drop');
    const title = h('strong', {});
    const detail = h('span', { class: 'detail' });
    replay.addEventListener('click', () => {
        if (ctx.api.info().playing === name) return ctx.run(() => ctx.api.stopplay(), 'replay closed');
        ctx.run(() => ctx.api.playrec(name, 1, { park: true }), `replaying ${name}`);
    });
    const el = h('div', { class: 'saved' }, title, h('span', { class: 'actions' }, replay, drop), detail);

    return {
        el,
        update(summary, { playing, recording }) {
            name = summary.name;
            const active = playing === name;
            title.textContent = name;
            detail.textContent = summary.recording
                ? 'recording...'
                : `${plural(summary.frames, 'frame')}, ${summary.seconds}s, ${plural(summary.variables, 'variable')}${summary.dropped ? `, ${summary.dropped} oldest dropped` : ''}`;
            replay.textContent = active ? 'Stop' : 'Replay';
            replay.disabled = summary.recording || (recording !== null && !active);
            drop.disabled = summary.recording || active;
        },
    };
}

export function recordingsTab({ h, ctx }) {
    const deck = createDeck({ h, ctx });
    const only = h('input', { class: 'grow', placeholder: 'only names containing… (blank: all)', 'aria-label': 'Record only variables whose name matches' });
    const lists = checkbox(h, 'Lists', false, () => {});
    const motion = checkbox(h, 'Sprite motion', true, () => {});
    const keep = h('span', { class: 'keep', title: 'Only the most recent part is kept; older frames are dropped' });
    const amount = h('input', { type: 'number', min: '1', step: '1', value: String(KEEP.frames.value), 'aria-label': 'How much to keep' });
    const unit = h('select', { 'aria-label': 'Unit for how much to keep' },
        h('option', { value: 'frames' }, 'Frames'), h('option', { value: 'seconds' }, 'Seconds'));
    const kept = { unit: 'frames', frames: KEEP.frames.value, seconds: KEEP.seconds.value };
    unit.addEventListener('change', () => {
        kept[kept.unit] = Number(amount.value) || kept[kept.unit];
        kept.unit = unit.value;
        amount.min = String(KEEP[kept.unit].min);
        amount.step = KEEP[kept.unit].step;
        amount.value = String(kept[kept.unit]);
    });
    keep.append(amount, unit);
    const record = h('button', { class: 'btn primary' });
    record.addEventListener('click', () => {
        if (ctx.api.info().recording) return ctx.run(() => ctx.api.stoprec(), rec => `stopped ${rec.name}: ${plural(rec.frames, 'frame')}`);
        const filter = only.value.trim();
        ctx.run(() => ctx.api.startrec({
            ...(filter ? { only: parseFilter(filter) } : {}),
            lists: lists.input.checked,
            motion: motion.input.checked,
            [KEEP[kept.unit].option]: Number(amount.value) || KEEP[kept.unit].value,
        }), rec => `recording ${rec.name}`);
    });
    const entries = new Map();
    const list = h('div', { class: 'list' });
    const empty = h('div', { class: 'empty' }, 'No recordings yet. Press Record, play the project, then Stop.');

    return {
        id: 'rec',
        hue: 'rec',
        label: 'Record',
        el: h('div', { class: 'page' },
            h('div', { class: 'toolbar' }, only, record),
            h('div', { class: 'toolbar' }, lists.el, motion.el, keep),
            deck.el, list, empty),
        refresh() {
            const info = ctx.api.info();
            record.textContent = info.recording ? 'Stop' : 'Record';
            record.classList.toggle('danger', !!info.recording);
            record.classList.toggle('primary', !info.recording);
            const recordings = ctx.api.recs().map(summary => ({ ...summary, key: summary.name })).reverse();
            reconcile(list, recordings, entries, () => recordingItem({ h, ctx }), info);
            empty.hidden = recordings.length > 0;
            list.hidden = recordings.length === 0;
            deck.sync();
        },
    };
}
