import {
    LIST_ITEM_LIMIT, displayValue, editableText, parseValue, pinLabel, scopeOf,
} from './panel-model.js';
import { DURATION, MOTION } from './animate.js';

const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
};

const setAttribute = (element, name, value) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

export function reconcile(container, items, entries, make, extra) {
    const seen = new Set();
    let cursor = container.firstChild;
    for (const item of items) {
        let entry = entries.get(item.key);
        if (!entry) {
            entry = make(item);
            entries.set(item.key, entry);
        }
        entry.update(item, extra);
        if (entry.el === cursor) cursor = cursor.nextSibling;
        else container.insertBefore(entry.el, cursor);
        seen.add(item.key);
    }
    for (const [key, entry] of entries) {
        if (seen.has(key)) continue;
        entry.el.remove();
        entries.delete(key);
    }
}

const isEditing = (input, root) => root.activeElement === input;

function numberInput(h, label, placeholder) {
    return h('input', { type: 'number', step: 'any', 'aria-label': label, placeholder });
}

function variableDrawer({ h, ctx, row }) {
    const holdAt = h('input', { class: 'wide', 'aria-label': `Value to hold ${row().name} at`, placeholder: 'value' });
    const low = numberInput(h, 'Shitpost low', 'low');
    const high = numberInput(h, 'Shitpost high', 'high');
    const release = h('button', { class: 'btn', onClick: () => ctx.run(() => ctx.api.unfreeze(row().name, scopeOf(row())), 'released') }, 'Release');
    const act = (action, message) => () => ctx.run(action, message);

    const el = h('div', { class: 'drawer' },
        h('div', { class: 'line' }, h('span', { class: 'label' }, 'Hold at'), holdAt,
            h('button', { class: 'btn primary', onClick: () => {
                const value = holdAt.value === '' ? undefined : parseValue(holdAt.value);
                ctx.run(() => ctx.api.freeze(row().name, value, scopeOf(row())), `froze ${row().name}`);
            } }, 'Freeze')),
        h('div', { class: 'line' }, h('span', { class: 'label' }, 'Shitpost'), low, 'to', high,
            h('button', { class: 'btn', onClick: () => ctx.run(
                () => ctx.api.shitpost(row().name, Number(low.value), Number(high.value), scopeOf(row())),
                `shitposting ${row().name}`) }, 'Go')),
        h('div', { class: 'line' },
            h('button', { class: 'btn', onClick: act(() => ctx.api.blank(row().name, scopeOf(row())), `blanking ${row().name}`) }, 'Blank'),
            release));

    return {
        el,
        update(data) {
            release.disabled = !data.pin;
            if (!isEditing(holdAt, ctx.root) && holdAt.value === '') holdAt.placeholder = editableText(data.value);
        },
    };
}

function listDrawer({ h, ctx, row }) {
    const items = h('div', { class: 'items' });
    const note = h('div', { class: 'note' });
    const addInput = h('input', { class: 'wide', 'aria-label': `New item for ${row().name}`, placeholder: 'new item' });
    const lines = [];
    const scope = () => scopeOf(row());
    const isHeld = position => row().held.includes(position);

    const addItem = () => {
        const value = parseValue(addInput.value);
        if (ctx.run(() => ctx.api.push(row().name, value, scope()), 'added')) addInput.value = '';
    };
    addInput.addEventListener('keydown', event => { if (event.key === 'Enter') addItem(); });

    const makeLine = index => {
        const position = index + 1;
        const input = h('input', { class: 'wide', 'aria-label': `${row().name} item ${position}` });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                const value = parseValue(input.value);
                ctx.run(() => (isHeld(position)
                    ? ctx.api.freezeAt(row().name, position, value, scope())
                    : ctx.api.setAt(row().name, position, value, scope())), `set item ${position}`);
            }
            if (event.key === 'Escape') { event.stopPropagation(); input.blur(); }
        });
        const hold = h('button', { class: 'icon hold', 'aria-pressed': 'false', onClick: () => {
            const held = isHeld(position);
            ctx.run(() => (held
                ? ctx.api.unfreezeAt(row().name, position, scope())
                : ctx.api.freezeAt(row().name, position, undefined, scope())), held ? `released item ${position}` : `holding item ${position}`);
        } }, ctx.icon('lock', 12));
        const remove = h('button', { class: 'icon', 'aria-label': `Remove item ${position}`, onClick: () => ctx.run(() => ctx.api.removeAt(row().name, position, scope()), 'removed') }, ctx.icon('cross', 12));
        const el = h('div', { class: 'line' }, h('span', { class: 'idx' }, String(position)), input, hold, remove);
        return { el, input, hold, remove };
    };

    const holdAll = h('button', { class: 'btn', onClick: () => ctx.run(() => {
        for (let position = 1; position <= row().value.length; position++) {
            if (!isHeld(position)) ctx.api.freezeAt(row().name, position, undefined, scope());
        }
    }, 'holding every item') }, 'Hold all');
    const releaseHeld = h('button', { class: 'btn', onClick: () => ctx.run(() => {
        for (const position of [...row().held]) ctx.api.unfreezeAt(row().name, position, scope());
    }, 'released every held item') }, 'Release held');
    const wipe = h('button', { class: 'btn', title: 'Set every row to empty text and keep the rows', onClick: () => ctx.run(() => ctx.api.wipe(row().name, scope()), rows => `wiped ${rows} row${rows === 1 ? '' : 's'}`) }, 'Wipe rows');

    const el = h('div', { class: 'drawer' }, items,
        note,
        h('div', { class: 'line' }, addInput, h('button', { class: 'btn primary', onClick: addItem }, 'Add')),
        h('div', { class: 'line' }, holdAll, releaseHeld),
        h('div', { class: 'line' }, wipe,
            h('button', { class: 'btn danger', title: 'Remove every row', onClick: () => ctx.run(() => ctx.api.clear(row().name, scope()), 'emptied') }, 'Clear'),
            h('button', { class: 'btn', title: 'Keep this list empty every frame', onClick: () => ctx.run(() => ctx.api.blank(row().name, scope()), `blanking ${row().name}`) }, 'Blank')));

    return {
        el,
        update(data) {
            const shown = Math.min(data.value.length, LIST_ITEM_LIMIT);
            while (lines.length < shown) {
                const line = makeLine(lines.length);
                lines.push(line);
                items.append(line.el);
            }
            while (lines.length > shown) lines.pop().el.remove();
            lines.forEach(({ el: lineEl, input, hold, remove }, i) => {
                const held = data.held.includes(i + 1);
                const text = editableText(data.value[i]);
                if (!isEditing(input, ctx.root) && input.value !== text) input.value = text;
                lineEl.classList.toggle('held', held);
                setAttribute(hold, 'aria-pressed', String(held));
                setAttribute(hold, 'aria-label', `${held ? 'Release' : 'Hold'} item ${i + 1}`);
                setAttribute(hold, 'title', held ? 'Release this item' : 'Hold this item at its current value');
                remove.disabled = held;
                setAttribute(remove, 'title', held ? 'Release the hold before removing it' : 'Remove this item');
            });
            holdAll.disabled = !data.value.length || data.value.length > LIST_ITEM_LIMIT || data.held.length >= data.value.length;
            wipe.disabled = !data.value.length;
            holdAll.title = data.value.length > LIST_ITEM_LIMIT ? `Hold individual items; lists over ${LIST_ITEM_LIMIT} items can't be held in one go` : 'Hold every item at its current value';
            releaseHeld.disabled = !data.held.length;
            note.textContent = data.value.length > shown
                ? `showing the first ${shown} of ${data.value.length} items`
                : data.value.length ? '' : 'empty list';
        },
    };
}

export function createRow({ h, ctx }, first) {
    let current = first;
    let expanded = false;
    let editing = false;
    let drawer = null;
    const row = () => current;

    const chevron = h('button', { class: 'chev', 'aria-expanded': 'false', 'aria-label': `Details for ${first.name}`, onClick: () => toggle() }, ctx.icon('caret', 13));
    const valueButton = h('button', { class: 'value' });
    const slot = h('div', { class: 'slot' }, valueButton);
    const cell = h('div', { class: 'cell' }, slot);
    const pin = h('button', { class: 'pin', onClick: () => togglePin() });
    const cloud = first.cloud ? h('span', { title: 'cloud variable: changes stay local' }, ' ☁') : null;
    const heldCount = h('span', {});
    const heldBadge = h('span', { class: 'held-badge', hidden: true }, ctx.icon('lock', 10), heldCount);
    const who = h('div', { class: 'who' },
        h('span', { class: 'name', title: first.name }, first.name),
        h('span', { class: 'meta' }, first.sprite, first.clone ? ` clone ${first.clone}` : '', cloud, heldBadge));
    const line = h('div', { class: 'row' }, chevron, who, cell, pin);
    const el = h('div', { class: 'item' }, line);

    function toggle() {
        expanded = !expanded;
        chevron.setAttribute('aria-expanded', String(expanded));
        el.toggleAttribute('data-open', expanded);
        if (expanded && !drawer) {
            drawer = (current.kind === 'list' ? listDrawer : variableDrawer)({ h, ctx, row });
            el.append(drawer.el);
        }
        if (drawer) drawer.el.hidden = !expanded;
        if (expanded) drawer.update(current);
    }

    function togglePin() {
        const { name, kind } = current;
        const scope = scopeOf(current);
        if (current.pin) ctx.run(() => ctx.api.unfreeze(name, scope), `released ${name}`);
        else if (kind === 'list') ctx.run(() => ctx.api.blank(name, scope), `blanking ${name}`);
        else ctx.run(() => ctx.api.freeze(name, undefined, scope), `froze ${name}`);
    }

    function beginEdit() {
        if (editing) return;
        editing = true;
        const input = h('input', { 'aria-label': `Value of ${current.name}`, value: editableText(current.value) });
        const finish = () => {
            if (!editing) return;
            editing = false;
            slot.replaceChildren(valueButton);
            paintValue();
        };
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                const { name } = current;
                ctx.run(() => ctx.api.set(name, parseValue(input.value), scopeOf(current)), `set ${name}`);
                finish();
            } else if (event.key === 'Escape') {
                event.stopPropagation();
                finish();
            }
        });
        input.addEventListener('blur', finish);
        slot.replaceChildren(input);
        input.focus();
        input.select();
    }

    function paintValue() {
        setText(valueButton, displayValue(current.value));
        setAttribute(valueButton, 'title', Array.isArray(current.value) ? 'click to open the items' : `${editableText(current.value)} (click to edit)`);
    }

    valueButton.addEventListener('click', () => (current.kind === 'list' ? toggle() : beginEdit()));

    return {
        el,
        update(next) {
            current = next;
            if (!editing) paintValue();
            const mode = next.pin ?? (next.kind === 'list' ? 'list' : 'var');
            if (el.dataset.mode !== mode) {
                if (el.dataset.mode) ctx.play(valueButton, MOTION.settle, { duration: DURATION.settle });
                el.dataset.mode = mode;
            }
            const heldNow = next.held.length;
            heldBadge.hidden = !heldNow;
            setText(heldCount, heldNow ? String(heldNow) : '');
            setAttribute(heldBadge, 'title', `${heldNow} held item${heldNow === 1 ? '' : 's'}`);
            const action = next.pin ? 'Release' : next.kind === 'list' ? 'Blank' : 'Freeze';
            setText(pin, next.pin ? pinLabel(next.pin) : action);
            setAttribute(pin, 'aria-pressed', String(!!next.pin));
            setAttribute(pin, 'aria-label', `${action} ${next.name}`);
            if (expanded) drawer.update(next);
        },
    };
}
