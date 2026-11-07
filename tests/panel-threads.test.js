import { JSDOM } from 'jsdom';
import { test, assert, VirtualMachine, addTarget, runFrame, catBlocks, dogBlocks } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';
import { keepScroll } from '../src/panel-rows.js';
import { hatShort, stableOrder, suggestMessages, threadMatches, threadStateText, threadSummary, withLingering } from '../src/panel-model.js';

const setup = () => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    const { document, Event, KeyboardEvent } = dom.window;
    const vm = new VirtualMachine();
    const stage = addTarget(vm, { name: 'Stage', stage: true });
    stage.createVariable('msg', 'jump', 'broadcast_msg');
    stage.createVariable('msg2', 'game over', 'broadcast_msg');
    stage.createVariable('msg3', 'jumper', 'broadcast_msg');
    addTarget(vm, { name: 'Cat', blocks: catBlocks() });
    addTarget(vm, { name: 'Dog', blocks: dogBlocks() });
    const move = vm.runtime._primitives.motion_changexby;
    vm.runtime._primitives.motion_changexby = (args, util) => {
        move(args, util);
        vm.runtime.requestRedraw();
    };
    const clock = { t: 0 };
    const probe = makeRebugger(vm, { document, storage: null, clock: () => clock.t });
    vm.runtime.startHats('event_whenflagclicked');
    runFrame(vm);
    probe.ui(true);
    const shadow = () => document.querySelector('#rebugger-panel').shadowRoot;
    const $ = selector => shadow().querySelector(selector);
    const $$ = selector => [...shadow().querySelectorAll(selector)];
    const tab = label => $$('[role=tab]').find(button => button.textContent === label);
    const open = () => {
        tab('Threads').click();
        return $('#page-threads');
    };
    const rows = () => $$('#page-threads .item.thread');
    const names = () => rows().map(row => row.querySelector('.name').textContent);
    const type = (input, text) => {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const press = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));
    const refresh = () => probe.ui(true) && $('#page-threads') && tab('Threads').click();
    return { dom, vm, probe, clock, $, $$, tab, open, rows, names, type, press, refresh, document };
};

const withPage = run => {
    const page = setup();
    try {
        run(page);
    } finally {
        page.probe.dispose();
        page.dom.window.close();
    }
};

test('the Threads tab lists every running script with its state and block', () => {
    withPage(({ open, rows, $ }) => {
        open();
        assert.equal(rows().length, 2);
        const cat = rows().find(row => row.querySelector('.name').textContent === 'Cat');
        assert.equal(cat.dataset.state, 'waiting');
        assert.match(cat.querySelector('.meta').textContent, /waiting · wait/);
        assert.equal(cat.querySelector('.tag').textContent, 'flag');
        assert.match($('#page-threads .summary').textContent, /2 scripts · 0 running · 2 waiting/);
    });
});

test('opening the Threads tab starts profiling and leaving it stops', () => {
    withPage(({ probe, open, tab }) => {
        assert.equal(probe.threads.profiling(), false);
        open();
        assert.equal(probe.threads.profiling(), true);
        tab('Variables').click();
        assert.equal(probe.threads.profiling(), false);
    });
});

test('killing from a row stops the script, says so, and the row fades out after a moment', () => {
    withPage(({ vm, clock, probe, open, rows, $ }) => {
        open();
        const dog = rows().find(row => row.querySelector('.name').textContent === 'Dog');
        dog.querySelector('.kill').click();
        assert.match($('.status').textContent, /killed thread #\d+ \(Dog: when flag clicked\)/);
        assert.equal(rows().find(row => row.querySelector('.name').textContent === 'Dog').dataset.state, 'ended');
        runFrame(vm);
        clock.t += 1000;
        probe.ui(true);
        open();
        assert.equal(rows().length, 2);
        clock.t += 1000;
        open();
        assert.deepEqual(rows().map(row => row.querySelector('.name').textContent), ['Cat']);
    });
});

test('rows hold still while the pointer is over the list: ended rows stay until it leaves', () => {
    withPage(({ vm, clock, dom, open, rows, $ }) => {
        open();
        const list = $('#page-threads .list');
        list.dispatchEvent(new dom.window.Event('pointerenter'));
        rows()[1].querySelector('.kill').click();
        runFrame(vm);
        clock.t += 60000;
        open();
        assert.equal(rows().length, 2);
        list.dispatchEvent(new dom.window.Event('pointerleave'));
        open();
        assert.equal(rows().length, 1);
    });
});

test('a new script appears at the bottom and never reshuffles the rows above it', () => {
    withPage(({ vm, probe, open, names }) => {
        open();
        const before = names();
        probe.broadcast('jump');
        runFrame(vm);
        open();
        assert.deepEqual(names().slice(0, before.length), before);
        assert.equal(names().length, before.length + 1);
    });
});

test('expanding a row shows its stack and the controls for that one script', () => {
    withPage(({ probe, open, rows, $ }) => {
        open();
        const cat = rows().find(row => row.querySelector('.name').textContent === 'Cat');
        cat.querySelector('.trow').click();
        const drawer = $('#page-threads .tdrawer');
        assert.ok(drawer);
        assert.deepEqual([...drawer.querySelectorAll('.fb')].map(line => line.textContent.replace('▸', '')), ['forever', 'wait']);
        assert.ok(drawer.querySelector('.fb.cur').textContent.includes('wait'));
        const pause = [...drawer.querySelectorAll('button')].find(button => button.textContent === 'Pause');
        pause.click();
        assert.equal(probe.threads().find(entry => entry.sprite === 'Cat').state, 'paused');
        assert.match($('.status').textContent, /paused thread/);
        const step = [...$('#page-threads .tdrawer').querySelectorAll('button')].find(button => button.textContent === 'Step');
        assert.equal(step.disabled, false);
    });
});

test('the filter narrows by sprite, script or block, and Kill N follows it', () => {
    withPage(({ open, rows, type, $, probe }) => {
        open();
        type($('#page-threads input[type=search]'), 'dog');
        assert.deepEqual(rows().map(row => row.querySelector('.name').textContent), ['Dog']);
        const kill = [...$('#page-threads').querySelectorAll('button')].find(button => button.textContent.startsWith('Kill '));
        assert.equal(kill.textContent, 'Kill 1');
        kill.click();
        assert.equal(probe.threads().filter(row => row.state !== 'ended').length, 1);
    });
});

test('typing in the broadcast box suggests known messages, best match first, with who is listening', () => {
    withPage(({ open, type, $, $$ }) => {
        open();
        const input = $('#page-threads [role=combobox]');
        input.focus();
        type(input, 'jum');
        const options = $$('#page-threads [role=option]');
        assert.deepEqual(options.map(option => option.querySelector('.option-name').textContent), ['jump', 'jumper']);
        assert.equal(options[0].querySelector('.option-note').textContent, '1 listening');
        assert.equal(options[1].querySelector('.option-note').textContent, 'no listeners');
        assert.equal(input.getAttribute('aria-expanded'), 'true');
    });
});

test('arrow keys, Tab and Enter drive the suggestions', () => {
    withPage(({ open, type, press, $, $$, vm }) => {
        open();
        const input = $('#page-threads [role=combobox]');
        type(input, 'ju');
        press(input, 'ArrowDown');
        assert.equal($$('#page-threads [role=option]')[1].getAttribute('aria-selected'), 'true');
        press(input, 'Tab');
        assert.equal(input.value, 'jumper');
        type(input, 'ju');
        press(input, 'Enter');
        assert.match($('.status').textContent, /^jump: started 1 script on Cat/);
        assert.equal($('#page-threads .suggest').hidden, true);
        assert.ok(vm);
    });
});

test('Escape closes the suggestions without closing the panel', () => {
    withPage(({ open, type, press, $, probe }) => {
        open();
        const input = $('#page-threads [role=combobox]');
        type(input, 'ju');
        press(input, 'Escape');
        assert.equal($('#page-threads .suggest').hidden, true);
        assert.equal(probe.ui(true), true);
    });
});

test('broadcasting a name nobody knows says so and suggests the right one', () => {
    withPage(({ open, type, press, $ }) => {
        open();
        const input = $('#page-threads [role=combobox]');
        type(input, 'jmup');
        press(input, 'Enter');
        assert.match($('.status').textContent, /no broadcast named "jmup".*jump/);
        assert.equal($('.status').dataset.tone, 'error');
    });
});

test('Start runs the picked script like a click', () => {
    withPage(({ open, $, probe }) => {
        open();
        const pick = $('#page-threads select[aria-label="Script to start"]');
        pick.dispatchEvent(new (pick.ownerDocument.defaultView.Event)('focus'));
        const option = [...pick.querySelectorAll('option')].find(entry => entry.textContent === 'when I receive jump');
        assert.ok(option);
        pick.value = option.value;
        [...$('#page-threads .launch').querySelectorAll('button')].find(button => button.textContent === 'Start').click();
        assert.match($('.status').textContent, /started Cat: when I receive jump as thread #\d+/);
        assert.ok(probe.threads().some(row => row.script === 'when I receive jump'));
    });
});

const fakeList = (count, rowHeight = 30) => {
    const list = { scrollTop: 0, children: [] };
    const add = (id, index = list.children.length) => {
        const row = { id, isConnected: true, parentNode: list, offsetHeight: rowHeight };
        Object.defineProperty(row, 'offsetTop', { get: () => list.children.indexOf(row) * rowHeight });
        list.children.splice(index, 0, row);
        return row;
    };
    for (let i = 0; i < count; i++) add(i);
    const remove = row => {
        list.children.splice(list.children.indexOf(row), 1);
        row.isConnected = false;
        row.parentNode = null;
    };
    return { list, add, remove };
};

test('keepScroll holds the row you are looking at when rows appear above it', () => {
    const { list, add } = fakeList(40);
    list.scrollTop = 300;
    const watching = list.children[10];
    keepScroll(list, () => { add('a', 0); add('b', 3); });
    assert.equal(watching.offsetTop - list.scrollTop, 0);
});

test('keepScroll holds position when rows above disappear', () => {
    const { list, remove } = fakeList(40);
    list.scrollTop = 305;
    const watching = list.children[10];
    keepScroll(list, () => { remove(list.children[0]); remove(list.children[2]); remove(list.children[4]); });
    assert.equal(watching.offsetTop - list.scrollTop, -5);
});

test('keepScroll falls back to the next row when the one you were on is removed', () => {
    const { list, remove } = fakeList(40);
    list.scrollTop = 300;
    const next = list.children[11];
    keepScroll(list, () => { remove(list.children[10]); remove(list.children[0]); });
    assert.equal(next.offsetTop - list.scrollTop, 30);
});

test('keepScroll leaves a list at the top alone, so it keeps showing the newest end', () => {
    const { list, add } = fakeList(40);
    keepScroll(list, () => add('a', 0));
    assert.equal(list.scrollTop, 0);
});

const row = (id, over = {}) => ({ id, sprite: 'Cat', clone: 0, script: 'when flag clicked', block: 'wait', state: 'running', long: false, waitedMs: 0, ageMs: 0, ms: 0, ...over });

test('stableOrder keeps what is there, appends what is new, and drops what is gone', () => {
    const order = stableOrder([3, 1, 2], [row(1), row(2), row(4), row(5)], 'Oldest', false);
    assert.deepEqual(order, [1, 2, 4, 5]);
});

test('stableOrder re-sorts only when asked', () => {
    const rows = [row(1, { ms: 1 }), row(2, { ms: 9 }), row(3, { ms: 5 })];
    assert.deepEqual(stableOrder([1, 2, 3], rows, 'Cost', false), [1, 2, 3]);
    assert.deepEqual(stableOrder([1, 2, 3], rows, 'Cost', true), [2, 3, 1]);
});

test('withLingering keeps a vanished script as ended for a moment, then lets go', () => {
    const memory = new Map();
    assert.equal(withLingering(memory, [row(1), row(2)], 0).length, 2);
    const shown = withLingering(memory, [row(1)], 100);
    assert.deepEqual(shown.map(r => [r.id, r.state]), [[1, 'running'], [2, 'ended']]);
    assert.equal(withLingering(memory, [row(1)], 5000).length, 1);
    assert.equal(memory.has(2), false);
});

test('withLingering holds ended rows indefinitely while asked to, and does not bring dropped ones back', () => {
    const memory = new Map();
    withLingering(memory, [row(1), row(2)], 0);
    assert.equal(withLingering(memory, [row(1)], 60000, { hold: true }).length, 2);
    assert.equal(withLingering(memory, [row(1)], 60001).length, 2);
    assert.equal(withLingering(memory, [row(1)], 61501).length, 1);
    const stillListed = [row(1), row(9, { state: 'ended' })];
    const fresh = new Map();
    assert.equal(withLingering(fresh, stillListed, 0).length, 2);
    assert.equal(withLingering(fresh, stillListed, 5000).length, 1);
    assert.equal(withLingering(fresh, stillListed, 9000).length, 1);
});

test('suggestMessages ranks exact, prefix, word start and substring, then who is listening', () => {
    const messages = [
        { name: 'game over', listeners: 1 }, { name: 'over', listeners: 0 }, { name: 'turnover', listeners: 4 }, { name: 'overload', listeners: 2 }, { name: 'jump', listeners: 1 },
    ];
    assert.deepEqual(suggestMessages(messages, 'over').map(m => m.name), ['over', 'overload', 'game over', 'turnover']);
    assert.deepEqual(suggestMessages(messages, '').map(m => m.name).length, 5);
    assert.deepEqual(suggestMessages(messages, 'zzz'), []);
    assert.equal(suggestMessages(Array.from({ length: 30 }, (_, i) => ({ name: `m${i}`, listeners: 0 })), 'm').length, 8);
});

test('thread row formatting: hat shorthand, wait time, summary and filtering', () => {
    assert.deepEqual(['when flag clicked', 'when I receive jump', 'when I start as a clone', 'when space key pressed', 'define pathfind'].map(hatShort), ['flag', 'jump', 'clone', 'key space', 'define pathfind']);
    assert.equal(threadStateText(row(1, { state: 'waiting', waitedMs: 400 })), 'waiting');
    assert.equal(threadStateText(row(1, { state: 'waiting', waitedMs: 15000 })), 'waiting 15s');
    assert.equal(threadSummary([row(1), row(2, { state: 'waiting' }), row(3, { state: 'ended' })]), '2 scripts · 1 running · 1 waiting');
    assert.equal(threadMatches(row(1), { text: '/^wait$/', filter: 'All' }), false);
    assert.equal(threadMatches(row(1, { clone: 3 }), { text: '#3', filter: 'All' }), true);
    assert.equal(threadMatches(row(1), { text: '', filter: 'Waiting' }), false);
});
