import {
    RESORT_MS, ROW_LIMIT, THREAD_FILTERS, THREAD_SORTS, hatShort, stableOrder, suggestMessages,
    threadFacts, threadMatches, threadMs, threadName, threadStateText, threadSummary, withLingering,
} from './panel-model.js';
import { keepScroll, reconcile, setAttribute, setText } from './panel-rows.js';

const COST_SLICES = 10;
const HOT_MS = 3;
const SEGMENT_COLOURS = ['--sky', '--aqua', '--periwinkle', '--coral', '--sunny', '--ok', '--pill-shitpost'];
const stateOf = row => row.long ? 'long' : row.state;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function frameView(h, frames) {
    return h('div', { class: 'trace' }, frames.map(frame => h('div', { class: `frame${frame.procedure ? ' call' : ''}` },
        h('div', { class: 'frame-title' },
            frame.procedure && frame.args
                ? `${frame.title}(${Object.entries(frame.args).map(([name, value]) => `${name}=${value}`).join(', ')})`
                : frame.title,
            frame.warp ? h('span', { class: 'badge warp' }, 'warp') : null),
        frame.blocks.map((block, depth) => h('div', { class: `fb${block.current ? ' cur' : ''}`, style: `--indent:${depth * 10}px` },
            h('span', { class: 'fb-mark', 'aria-hidden': 'true' }, block.current ? '▸' : ''), block.label)))));
}

function threadRow({ h, ctx, state }) {
    let row = null;
    const dot = h('span', { class: 'sdot' });
    const name = h('span', { class: 'name' });
    const tag = h('span', { class: 'tag' });
    const meta = h('span', { class: 'meta' });
    const cost = h('span', { class: 'cost' });
    const chev = h('button', { class: 'chev', 'aria-label': 'Show stack', 'aria-expanded': 'false', tabindex: '-1' }, ctx.icon('caret'));
    const label = () => `thread #${row.id} (${threadName(row)}: ${row.script})`;
    const kill = h('button', { class: 'icon kill', 'aria-label': 'Kill thread', title: 'Kill thread', onClick: event => {
        event.stopPropagation();
        ctx.run(() => ctx.api.threads.kill(row.id), () => `killed ${label()}`);
    } }, ctx.icon('cross'));
    const toggle = () => {
        if (state.open.has(row.id)) state.open.delete(row.id);
        else state.open.add(row.id);
        ctx.refresh();
    };
    const head = h('div', { class: 'trow', role: 'button', tabindex: '0', onClick: toggle }, chev,
        h('span', { class: 'who' }, h('span', { class: 'name-line' }, dot, name, tag), meta), cost, kill);
    head.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
    });

    const pause = h('button', { class: 'btn with-icon', onClick: () => ctx.run(
        () => (row.state === 'paused' ? ctx.api.threads.resume(row.id) : ctx.api.threads.pause(row.id)),
        () => (row.state === 'paused' ? `resumed ${label()}` : `paused ${label()}`)) });
    const step = h('button', { class: 'btn with-icon', title: 'Run this script for one frame while it is paused', onClick: () => ctx.run(
        () => ctx.api.threads.step(row.id), 'stepped one frame') }, ctx.icon('step', 12), 'Step');
    const restart = h('button', { class: 'btn with-icon', title: 'Start it again from its hat', onClick: () => ctx.run(
        () => ctx.api.threads.restart(row.id), fresh => `restarted as thread #${fresh.id}`) }, ctx.icon('restart', 12), 'Restart');
    const stop = h('button', { class: 'btn danger with-icon', onClick: () => ctx.run(() => ctx.api.threads.kill(row.id), () => `killed ${label()}`) }, ctx.icon('cross', 12), 'Kill');
    const traceHolder = h('div');
    const facts = h('div', { class: 'facts' });
    const drawer = h('div', { class: 'drawer tdrawer' }, traceHolder, facts, h('div', { class: 'btn-row actions' }, pause, step, restart, stop));
    const el = h('div', { class: 'item thread', role: 'listitem' }, head);
    let traceKey = '';

    return {
        el,
        update(item) {
            row = item;
            const ended = row.state === 'ended';
            setAttribute(el, 'data-state', stateOf(row));
            setText(name, threadName(row));
            setText(tag, hatShort(row.script));
            setAttribute(tag, 'title', row.script);
            setText(meta, row.block ? `${threadStateText(row)} · ${row.block}` : threadStateText(row));
            setText(cost, threadMs(row.ms));
            cost.toggleAttribute('data-hot', row.ms >= HOT_MS);
            kill.disabled = ended;
            const open = state.open.has(row.id);
            setAttribute(chev, 'aria-expanded', String(open));
            el.toggleAttribute('data-open', open);
            if (!open) return drawer.isConnected ? drawer.remove() : undefined;
            if (!drawer.isConnected) el.append(drawer);
            const key = `${row.block}|${row.state}`;
            if (key !== traceKey) {
                traceKey = key;
                let frames = [];
                try {
                    frames = ended ? [] : ctx.api.threads.frames(row.id);
                } catch {
                    frames = [];
                }
                traceHolder.replaceChildren(frameView(h, frames));
            }
            facts.replaceChildren(...threadFacts(row).map(text => h('span', {}, text)));
            pause.replaceChildren(ctx.icon(row.state === 'paused' ? 'play' : 'pause', 12), row.state === 'paused' ? 'Resume' : 'Pause');
            pause.disabled = ended;
            step.disabled = row.state !== 'paused';
            stop.disabled = ended;
        },
    };
}

function broadcastBox({ h, ctx }) {
    const listId = `rb-messages-${Math.random().toString(36).slice(2, 8)}`;
    const input = h('input', { class: 'grow', placeholder: 'broadcast message…', 'aria-label': 'Broadcast message', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false' });
    const popup = h('div', { class: 'suggest', role: 'listbox', id: listId, hidden: true });
    let shown = [];
    let active = -1;

    const close = () => {
        popup.hidden = true;
        active = -1;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
    };
    const paint = () => {
        popup.replaceChildren(...(shown.length
            ? shown.map((message, index) => h('div', { class: 'option', role: 'option', id: `${listId}-${index}`, 'aria-selected': String(index === active), 'data-index': index },
                h('span', { class: 'option-name' }, message.name),
                h('span', { class: `option-note${message.listeners ? '' : ' none'}` }, message.listeners ? `${message.listeners} listening` : 'no listeners')))
            : [h('div', { class: 'option empty' }, 'No broadcast by that name')]));
        if (active >= 0) input.setAttribute('aria-activedescendant', `${listId}-${active}`);
        else input.removeAttribute('aria-activedescendant');
    };
    const open = () => {
        let messages = [];
        try {
            messages = ctx.api.messages();
        } catch {
            messages = [];
        }
        shown = suggestMessages(messages, input.value);
        active = input.value.trim() && shown.length ? 0 : -1;
        popup.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        paint();
    };
    const move = step => {
        if (popup.hidden) return open();
        if (!shown.length) return;
        active = (active + step + shown.length) % shown.length;
        paint();
        popup.children[active]?.scrollIntoView?.({ block: 'nearest' });
    };
    const send = () => {
        const value = input.value.trim();
        if (!value) return ctx.fail(new Error('type a broadcast message first'));
        close();
        ctx.run(() => ctx.api.broadcast(value), started => (started.length
            ? `${value}: started ${plural(started.length, 'script')} on ${[...new Set(started.map(row => row.sprite))].join(', ')}`
            : `${value}: nobody is listening`));
    };

    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', close);
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
        else if (event.key === 'Tab' && !popup.hidden && shown.length) {
            event.preventDefault();
            input.value = shown[Math.max(active, 0)].name;
            open();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (!popup.hidden && active >= 0) input.value = shown[active].name;
            send();
        } else if (event.key === 'Escape' && !popup.hidden) {
            event.stopPropagation();
            close();
        }
    });
    popup.addEventListener('pointerdown', event => {
        event.preventDefault();
        const option = event.target.closest('[data-index]');
        if (!option) return;
        input.value = shown[Number(option.dataset.index)].name;
        send();
    });

    const button = h('button', { class: 'btn primary with-icon', onClick: send }, 'Send', ctx.icon('send', 12));
    return { input, popup, button };
}

function scriptPicker({ h, ctx }) {
    let rows = [];
    let signature = '';
    const pick = h('select', { class: 'grow', 'aria-label': 'Script to start' });
    const start = h('button', { class: 'btn with-icon', onClick: () => {
        const row = rows[Number(pick.value)];
        if (!row) return ctx.fail(new Error('pick a script first'));
        ctx.run(() => ctx.api.startScript(row), started => `started ${row.sprite}: ${row.script} as thread #${started.id}`);
    } }, 'Start', ctx.icon('play', 12));
    const sync = () => {
        let found = [];
        try {
            found = ctx.api.scripts();
        } catch {
            found = [];
        }
        const next = found.map(row => row.key).join('|');
        if (next === signature) return;
        signature = next;
        rows = found;
        const groups = new Map();
        found.forEach((row, index) => {
            if (!groups.has(row.sprite)) groups.set(row.sprite, []);
            groups.get(row.sprite).push(h('option', { value: String(index) }, row.script));
        });
        pick.replaceChildren(h('option', { value: '' }, 'start a script…'), ...[...groups].map(([sprite, options]) => h('optgroup', { label: sprite }, ...options)));
    };
    pick.addEventListener('focus', sync);
    pick.addEventListener('pointerdown', sync);
    return { pick, start, sync };
}

export function threadsTab({ h, ctx }) {
    const state = { text: '', filter: 'All', sort: 'Oldest', cost: true, open: new Set(), order: [], memory: new Map(), resortAt: 0, resort: true, hover: false, focus: false };
    const entries = new Map();
    const list = h('div', { class: 'list threads', role: 'list' });
    const empty = h('div', { class: 'empty' }, 'No scripts are running.');
    const summary = h('div', { class: 'summary', 'aria-live': 'off' });
    const costbar = h('div', { class: 'costbar', role: 'img', 'aria-label': 'Frame time per script' });

    const filter = h('input', { class: 'grow', type: 'search', placeholder: 'Filter by sprite, script or block', title: 'Plain text, or /regex/', 'aria-label': 'Filter scripts' });
    filter.addEventListener('input', () => {
        state.text = filter.value;
        state.resort = true;
        ctx.refresh();
    });
    const sort = h('select', { class: 'sort-select', 'aria-label': 'Order scripts', title: 'Oldest keeps new scripts at the bottom so the list holds still; the other orders re-sort only when you are not pointing at the list' },
        THREAD_SORTS.map(name => h('option', { value: name }, name)));
    sort.addEventListener('change', () => {
        state.sort = sort.value;
        state.resort = true;
        ctx.refresh();
    });
    const costInput = h('input', { type: 'checkbox', onChange: () => {
        state.cost = costInput.checked;
        ctx.refresh();
    } });
    costInput.checked = true;
    const costLabel = h('label', { title: 'Measure milliseconds per frame for each script while this tab is open' }, costInput, 'Cost');
    const segmented = h('span', { class: 'segments sky', role: 'group', 'aria-label': 'Show scripts' });
    const filterButtons = THREAD_FILTERS.map(name => h('button', { type: 'button', 'aria-pressed': String(name === state.filter), onClick: () => {
        state.filter = name;
        state.resort = true;
        filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.textContent === name)));
        ctx.refresh();
    } }, name));
    segmented.append(...filterButtons);
    const killAll = h('button', { class: 'btn danger with-icon', onClick: () => {
        const ids = state.visible.filter(row => row.state !== 'ended').map(row => row.id);
        ctx.run(() => {
            let killed = 0;
            for (const id of ids) {
                try {
                    ctx.api.threads.kill(id);
                    killed++;
                } catch {
                    continue;
                }
            }
            return killed;
        }, killed => `killed ${plural(killed, 'script')}`);
    } }, ctx.icon('cross', 12), 'Kill 0');
    state.visible = [];

    list.addEventListener('pointerenter', () => { state.hover = true; });
    list.addEventListener('pointerleave', () => { state.hover = false; });
    list.addEventListener('focusin', () => { state.focus = true; });
    list.addEventListener('focusout', () => { state.focus = false; });

    const broadcast = broadcastBox({ h, ctx });
    const scripts = scriptPicker({ h, ctx });
    const dock = h('div', { class: 'launch' },
        h('div', { class: 'toolbar launch-row' }, h('span', { class: 'launch-label' }, ctx.icon('bolt', 12), 'Launch'), broadcast.input, broadcast.button, broadcast.popup),
        h('div', { class: 'toolbar' }, scripts.pick, scripts.start));

    function paintCost(rows, budget) {
        const live = rows.filter(row => row.state !== 'ended');
        const total = live.reduce((sum, row) => sum + row.ms, 0);
        costbar.hidden = !state.cost;
        if (!state.cost) return total;
        const slices = live.filter(row => row.ms >= 0.005).sort((a, b) => b.ms - a.ms).slice(0, COST_SLICES);
        costbar.replaceChildren(...slices.map(row => h('i', {
            title: `${threadName(row)}: ${threadMs(row.ms)}`,
            style: `width:${Math.min(row.ms / budget, 1) * 100}%;--seg:var(${SEGMENT_COLOURS[row.id % SEGMENT_COLOURS.length]})`,
        })));
        return total;
    }

    return {
        id: 'threads',
        hue: 'thread',
        label: 'Threads',
        el: h('div', { class: 'page' },
            h('div', { class: 'toolbar' }, filter, sort),
            h('div', { class: 'toolbar' }, segmented, costLabel, h('span', { class: 'spacer' }), killAll),
            costbar, summary, list, empty, dock),
        refresh() {
            const now = ctx.clock();
            if (ctx.api.threads.profiling() !== state.cost) ctx.api.threads.profile(state.cost);
            scripts.sync();
            const held = state.hover || state.focus;
            const rows = withLingering(state.memory, ctx.api.threads(), now, { hold: held });
            const matched = rows.filter(row => threadMatches(row, state));
            const due = state.sort !== 'Oldest' && now - state.resortAt >= RESORT_MS && !held && list.scrollTop < 4;
            const resort = state.resort || due;
            if (resort) {
                state.resortAt = now;
                state.resort = false;
            }
            state.order = stableOrder(state.order, matched, state.sort, resort);
            const byId = new Map(matched.map(row => [row.id, row]));
            const ordered = state.order.map(id => byId.get(id));
            state.visible = ordered;
            const shown = ordered.slice(0, ROW_LIMIT).map(row => ({ ...row, key: row.id }));
            keepScroll(list, () => reconcile(list, shown, entries, () => threadRow({ h, ctx, state })));

            const budget = ctx.api.info().frameMs;
            list.dataset.cost = state.cost ? 'on' : 'off';
            const total = paintCost(rows, budget);
            const base = threadSummary(rows);
            const limited = ordered.length > shown.length ? ` · showing the first ${ROW_LIMIT}: narrow the filter` : '';
            summary.textContent = `${base}${state.cost ? ` · ${total.toFixed(1)} / ${budget.toFixed(1)} ms` : ''}${limited}`;
            const live = ordered.filter(row => row.state !== 'ended').length;
            killAll.lastChild.textContent = `Kill ${live}`;
            killAll.disabled = live === 0;
            empty.hidden = ordered.length > 0;
            list.hidden = ordered.length === 0;
            empty.textContent = rows.length ? 'No scripts match.' : 'No scripts are running.';
            for (const id of [...state.open]) if (!state.memory.has(id)) state.open.delete(id);
        },
        leave() {
            ctx.api.threads.profile(false);
            state.hover = false;
            state.focus = false;
        },
    };
}
