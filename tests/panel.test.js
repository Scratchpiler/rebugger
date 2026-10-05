import { createRequire } from 'node:module';
import { mock } from 'node:test';
import { test, assert, VirtualMachine, addTarget, runFrame } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';
import { installHotkey, isHotkey } from '../src/hotkey.js';

const { JSDOM } = createRequire(new URL('../../scratchpiler/package.json', import.meta.url))('jsdom');

const fakeStorage = (seed = {}) => {
    const data = new Map(Object.entries(seed));
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data };
};

const setup = (options = {}) => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    const { document, KeyboardEvent, Event } = dom.window;
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 5, 'High score': 900 }, lists: { inv: ['a', 'b', 'c'] }, cloud: ['High score'] });
    addTarget(vm, { name: 'Cat', vars: { hp: 10 } });
    const storage = options.storage ?? fakeStorage();
    const { downloads, ...rebuggerOptions } = options;
    const clock = { t: 0 };
    const probe = makeRebugger(vm, { document, storage, clock: () => clock.t, ...rebuggerOptions, ...(downloads ? { download: (filename, text) => downloads.push({ filename, text }) } : {}) });
    const shadow = () => document.querySelector('#rebugger-panel')?.shadowRoot;
    const $ = selector => shadow().querySelector(selector);
    const $$ = selector => [...shadow().querySelectorAll(selector)];
    const row = name => $$('.item').find(item => item.querySelector('.name').textContent === name);
    const press = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }));
    const typeInto = (input, text) => { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); };
    const tab = label => $$('[role=tab]').find(button => button.textContent === label);
    const button = (scope, label) => [...scope.querySelectorAll('button')].find(b => b.textContent === label);
    return { dom, document, vm, probe, clock, storage, shadow, $, $$, row, press, typeInto, tab, button };
};

const withPanel = (options, run) => {
    const page = setup(options);
    try {
        run(page);
    } finally {
        page.probe.dispose();
        page.dom.window.close();
    }
};

const withPanelAsync = async (options, run) => {
    const page = setup(options);
    try {
        await run(page);
    } finally {
        page.probe.dispose();
        page.dom.window.close();
    }
};

test('ui needs a page, and toggles, opens and closes one panel', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true });
    const headless = makeRebugger(vm, { document: undefined });
    assert.throws(() => headless.ui(), /needs a page/);

    withPanel({}, ({ probe, document, shadow }) => {
        assert.equal(document.querySelector('#rebugger-panel'), null);
        assert.equal(probe.ui(), true);
        assert.equal(probe.ui(true), true);
        assert.equal(document.querySelectorAll('#rebugger-panel').length, 1);
        assert.equal(shadow().querySelector('.panel').hidden, false);
        assert.equal(probe.ui(), false);
        assert.equal(shadow().querySelector('.panel').hidden, true);
        probe.ui(true);
        probe.dispose();
        assert.equal(document.querySelector('#rebugger-panel'), null);
    });
});

test('the variables tab lists every variable with its sprite and a freeze toggle', () => {
    withPanel({}, ({ probe, $, $$, row }) => {
        probe.ui(true);
        assert.deepEqual($$('.item .name').map(n => n.textContent), ['hp', 'High score', 'inv', 'score']);
        assert.equal(row('hp').querySelector('.meta').textContent.trim(), 'Cat');
        assert.match(row('High score').querySelector('.meta').textContent, /☁/);
        assert.equal(row('score').querySelector('.pin').textContent, 'Freeze');
        assert.equal(row('inv').querySelector('.pin').textContent, 'Blank');
        assert.equal(row('inv').querySelector('.value').textContent, '3 items');
        assert.match($('.chip').textContent, /running 1×/);
    });
});

test('clicking a value edits it in place, Enter writes it and numbers stay numbers', () => {
    withPanel({}, ({ probe, row, press, $ }) => {
        probe.ui(true);
        row('hp').querySelector('.value').click();
        const input = row('hp').querySelector('input');
        assert.equal(input.value, '10');
        input.value = '42';
        press(input, 'Enter');
        assert.strictEqual(probe.get('hp'), 42);
        assert.equal(row('hp').querySelector('input'), null);
        assert.equal(row('hp').querySelector('.value').textContent, '42');
        assert.equal($('.status').textContent, 'set hp');

        row('hp').querySelector('.value').click();
        const text = row('hp').querySelector('input');
        text.value = 'ouch';
        press(text, 'Enter');
        assert.strictEqual(probe.get('hp'), 'ouch');
    });
});

test('Escape cancels an edit without writing and without closing the panel', () => {
    withPanel({}, ({ probe, row, press, $ }) => {
        probe.ui(true);
        row('hp').querySelector('.value').click();
        const input = row('hp').querySelector('input');
        input.value = '999';
        press(input, 'Escape');
        assert.strictEqual(probe.get('hp'), 10);
        assert.equal($('.panel').hidden, false);
        assert.equal(row('hp').querySelector('input'), null);
    });
});

test('an edit is not overwritten by the live refresh while it is open', () => {
    withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        row('hp').querySelector('.value').click();
        const input = row('hp').querySelector('input');
        input.value = '77';
        probe.set('hp', 11);
        probe.ui(true);
        assert.equal(row('hp').querySelector('input'), input);
        assert.equal(input.value, '77');
    });
});

test('the pin button freezes a variable, shows its mode and releases it; lists blank', () => {
    withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        row('score').querySelector('.pin').click();
        assert.deepEqual(probe.frozen().map(f => [f.name, f.mode]), [['score', 'freeze']]);
        assert.equal(row('score').querySelector('.pin').textContent, 'Frozen');
        assert.equal(row('score').querySelector('.pin').getAttribute('aria-pressed'), 'true');
        row('score').querySelector('.pin').click();
        assert.deepEqual(probe.frozen(), []);

        row('inv').querySelector('.pin').click();
        assert.deepEqual(probe.frozen().map(f => [f.name, f.mode]), [['inv', 'blank']]);
        assert.equal(row('inv').querySelector('.pin').textContent, 'Blanked');
        row('inv').querySelector('.pin').click();
        assert.deepEqual(probe.frozen(), []);
    });
});

test('the filter narrows rows by text or regex, and Frozen only shows what is held', () => {
    withPanel({}, ({ dom, probe, $, $$, typeInto, row }) => {
        probe.ui(true);
        const names = () => $$('.item .name').map(n => n.textContent);
        typeInto($('input[type=search]'), 'h');
        assert.deepEqual(names(), ['hp', 'High score']);
        typeInto($('input[type=search]'), '/^s/');
        assert.deepEqual(names(), ['score']);
        typeInto($('input[type=search]'), 'nothing');
        assert.equal($('.empty').hidden, false);
        assert.match($('.empty').textContent, /No variables match that filter/);
        typeInto($('input[type=search]'), '');
        probe.freeze('hp');
        const frozenOnly = $$('.toolbar input[type=checkbox]')[0];
        frozenOnly.checked = true;
        frozenOnly.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        assert.deepEqual(names(), ['hp']);
        assert.equal(row('hp').querySelector('.pin').textContent, 'Frozen');
    });
});

test('the drawer holds a variable at a value, shitposts it and edits list items', () => {
    withPanel({}, ({ probe, row, press, button }) => {
        probe.ui(true);
        row('score').querySelector('.chev').click();
        const drawer = row('score').querySelector('.drawer');
        drawer.querySelector('input.wide').value = '500';
        button(drawer, 'Freeze').click();
        assert.deepEqual(probe.frozen().map(f => f.mode), ['freeze']);
        assert.strictEqual(probe.get('score'), 500);

        const [low, high] = drawer.querySelectorAll('input[type=number]');
        low.value = '1';
        high.value = '3';
        button(drawer, 'Go').click();
        assert.deepEqual(probe.frozen().map(f => f.mode), ['shitpost']);
        button(drawer, 'Release').click();
        assert.deepEqual(probe.frozen(), []);

        row('inv').querySelector('.chev').click();
        const items = [...row('inv').querySelectorAll('.items input')];
        assert.deepEqual(items.map(i => i.value), ['a', 'b', 'c']);
        items[1].value = '7';
        press(items[1], 'Enter');
        assert.deepEqual(probe.list('inv'), ['a', 7, 'c']);
        const add = row('inv').querySelector('input[placeholder="new item"]');
        add.value = 'd';
        press(add, 'Enter');
        assert.deepEqual(probe.list('inv'), ['a', 7, 'c', 'd']);
        assert.equal(row('inv').querySelectorAll('.items input').length, 4);
        row('inv').querySelector('button[aria-label="Remove item 1"]').click();
        assert.deepEqual(probe.list('inv'), [7, 'c', 'd']);
        button(row('inv').querySelector('.drawer'), 'Clear').click();
        assert.deepEqual(probe.list('inv'), []);
        assert.match(row('inv').querySelector('.note').textContent, /empty list/);
    });
});

test('a failing action shows its message in the status line instead of throwing', () => {
    withPanel({}, ({ probe, tab, $, $$, button }) => {
        probe.ui(true);
        tab('Scan').click();
        button($('#page-scan'), 'Scan').click();
        assert.equal($('.status').dataset.tone, 'error');
        assert.match($('.status').textContent, /type a value to scan for/);
        assert.ok($$('#page-scan .segments button').every(b => b.disabled));
        assert.equal(button($('#page-scan'), 'Snapshot').hidden, false);
        assert.equal(button($('#page-scan'), 'Reset').hidden, true);
    });
});

test('scan narrows from the panel and its results can be frozen', () => {
    withPanel({}, ({ probe, tab, $, $$, press, button }) => {
        probe.ui(true);
        tab('Scan').click();
        const value = $('input[aria-label="Value to scan for"]');
        value.value = '10';
        press(value, 'Enter');
        assert.deepEqual($$('#page-scan .item .name').map(n => n.textContent), ['hp']);
        assert.equal(button($('#page-scan'), 'Narrow').textContent, 'Narrow');
        assert.equal(button($('#page-scan'), 'Snapshot').hidden, true);
        assert.equal(button($('#page-scan'), 'Reset').hidden, false);
        assert.equal(probe.info().scanning, 1);
        $('#page-scan .item .pin').click();
        assert.deepEqual(probe.frozen().map(f => f.name), ['hp']);
        button($('#page-scan'), 'Reset').click();
        assert.equal(probe.info().scanning, null);
        assert.equal($('#page-scan .empty').hidden, false);
        assert.equal(button($('#page-scan'), 'Scan').textContent, 'Scan');
    });
});

test('states can be saved, loaded and dropped from the panel', () => {
    withPanel({}, ({ probe, tab, $, $$, button }) => {
        probe.ui(true);
        tab('Savestates').click();
        const page = $('#page-states');
        assert.equal($('#page-states .empty').hidden, false);
        button(page, 'Save').click();
        assert.equal(probe.states().length, 1);
        assert.match($('.status').textContent, /saved state-1/);
        probe.set('hp', 1);
        button($('.saved'), 'Load').click();
        assert.strictEqual(probe.get('hp'), 10);
        assert.match($('.status').textContent, /loaded state-1: \d+ variables and lists/);
        assert.match($('.saved .detail').textContent, /2 variables, 1 list, 2 sprites, saved just now/);
        button($('.saved'), 'Drop').click();
        assert.equal($$('.saved').length, 0);
        assert.equal($('#page-states .empty').hidden, false);
    });
});

test('Export hands the savestate JSON to the download hook', () => {
    const downloads = [];
    withPanel({ downloads }, ({ probe, tab, $, button }) => {
        probe.ui(true);
        tab('Savestates').click();
        button($('#page-states'), 'Save').click();
        button($('.saved'), 'Export').click();
        assert.equal(downloads.length, 1);
        assert.equal(downloads[0].filename, 'state-1.rebugger-state.json');
        assert.deepEqual(JSON.parse(downloads[0].text), probe.export('state-1'));
        assert.match($('.status').textContent, /exported state-1/);
    });
});

test('recording starts and stops from the panel, and a recording can be replayed and dropped', () => {
    withPanel({}, ({ vm, probe, tab, $, $$, button }) => {
        probe.ui(true);
        tab('Record').click();
        const page = $('#page-rec');
        button(page, 'Record').click();
        assert.equal(probe.info().recording, 'rec-1');
        assert.match($('.chip').textContent, /recording rec-1/);
        assert.equal(button(page, 'Stop').textContent, 'Stop');
        runFrame(vm);
        button(page, 'Stop').click();
        assert.equal(probe.info().recording, null);
        assert.equal($$('.saved').length, 1);
        assert.match($('.saved .detail').textContent, /\d+ frames?, /);
        assert.equal($('.deck').hidden, true);

        button($('.saved'), 'Replay').click();
        assert.equal(probe.info().playing, 'rec-1');
        assert.equal($('.deck').hidden, false);
        assert.equal(button($('.saved'), 'Stop').textContent, 'Stop');
        button($('.saved'), 'Stop').click();
        assert.equal(probe.info().playing, null);
        assert.equal($('.deck').hidden, true);
        button($('.saved'), 'Drop').click();
        assert.equal(probe.recs().length, 0);
    });
});

const withRecording = run => withPanel({}, page => {
    const { probe, vm, clock, tab } = page;
    probe.startrec('r', { motion: false });
    for (const score of [1, 2, 3, 4, 5]) {
        probe.set('score', score);
        clock.t += 100;
        runFrame(vm);
    }
    probe.stoprec();
    probe.ui(true);
    tab('Record').click();
    page.button(page.$('.saved'), 'Replay').click();
    run({ ...page, handle: probe.replay(), deck: page.$('.deck'), scrub: page.$('.scrub') });
});

const fire = (dom, target, type, init = {}) => target.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init }));

test('opening a replay shows the deck with the time, frame count and a plot of the variable that moves', () => {
    withRecording(({ deck, handle, $, $$ }) => {
        assert.equal(deck.hidden, false);
        assert.equal(deck.querySelector('.deck-title').textContent, 'r');
        assert.equal(deck.querySelector('.deck-clock').textContent, '0:00.00 of 0:00.50');
        assert.equal(deck.querySelector('.deck-frame').textContent, 'frame 1 of 6');
        assert.deepEqual([...deck.querySelectorAll('select[aria-label="Variable to plot"] option')].map(o => o.textContent), ['score', 'hp']);
        assert.equal(deck.querySelector('select[aria-label="Variable to plot"]').value, '0');
        assert.ok(deck.querySelector('.plot-line').getAttribute('points').split(' ').length >= 6);
        assert.equal(deck.querySelector('.deck-plot').textContent, 'score 5');
        assert.equal(handle.speed(), 1);
        assert.equal(deck.querySelector('.scrub').getAttribute('aria-valuetext'), '0:00.00 of 0:00.50, frame 1 of 6');
        assert.equal($$('.saved').length, 1);
    });
});

test('moving the scrubber puts the project on that moment and updates the readouts', () => {
    withRecording(({ dom, probe, deck, scrub, handle }) => {
        scrub.value = '500';
        fire(dom, scrub, 'input');
        assert.equal(handle.position(), 0.5);
        assert.equal(probe.get('score'), 2);
        assert.equal(deck.querySelector('.deck-clock').textContent, '0:00.25 of 0:00.50');
        assert.equal(deck.querySelector('.deck-frame').textContent, 'frame 3 of 6');
        assert.equal(deck.querySelector('.deck-plot').textContent, 'score 2');
        assert.equal(deck.querySelector('.playhead').style.left, '50%');
        assert.equal(deck.querySelector('.played').style.width, '50%');
    });
});

test('grabbing the scrubber pauses a playing replay and letting go resumes it', () => {
    withRecording(({ dom, scrub, handle }) => {
        assert.equal(handle.speed(), 1);
        fire(dom, scrub, 'pointerdown');
        assert.equal(handle.speed(), 0);
        scrub.value = '200';
        fire(dom, scrub, 'input');
        assert.equal(handle.speed(), 0);
        fire(dom, scrub, 'pointerup');
        assert.equal(handle.speed(), 1);
        assert.equal(handle.position(), 0.2);
    });
});

test('dragging a paused replay leaves it paused', () => {
    withRecording(({ dom, scrub, handle }) => {
        handle.speed(0);
        fire(dom, scrub, 'pointerdown');
        fire(dom, scrub, 'pointerup');
        assert.equal(handle.speed(), 0);
    });
});

test('the frame buttons step one frame and pause, and Shift steps ten, stopping at the ends', () => {
    withRecording(({ dom, deck, handle, probe }) => {
        const forward = deck.querySelector('button[aria-label="Next frame"]');
        const back = deck.querySelector('button[aria-label="Previous frame"]');
        forward.click();
        assert.deepEqual([handle.frame(), handle.speed(), probe.get('score')], [1, 0, 1]);
        forward.click();
        assert.equal(handle.frame(), 2);
        back.click();
        assert.equal(handle.frame(), 1);
        fire(dom, forward, 'click', { shiftKey: true });
        assert.equal(handle.frame(), 5);
        fire(dom, back, 'click', { shiftKey: true });
        assert.equal(handle.frame(), 0);
        assert.equal(deck.querySelector('.deck-frame').textContent, 'frame 1 of 6');
    });
});

test('play and pause toggle, and play at the end starts over from the first frame', () => {
    withRecording(({ deck, handle }) => {
        const play = deck.querySelector('.tbtn.primary');
        assert.equal(play.getAttribute('aria-label'), 'Pause');
        play.click();
        assert.equal(handle.speed(), 0);
        assert.equal(play.getAttribute('aria-label'), 'Play');
        handle.seek(1);
        play.click();
        assert.equal(handle.position(), 0);
        assert.equal(handle.speed(), 1);
        assert.equal(play.getAttribute('aria-label'), 'Pause');
    });
});

test('loop and speed controls reach the replay, and changing speed while paused does not start it', () => {
    withRecording(({ dom, deck, handle }) => {
        const loop = [...deck.querySelectorAll('button')].find(b => b.textContent === 'Loop');
        loop.click();
        assert.equal(handle.loop(), true);
        assert.equal(loop.getAttribute('aria-pressed'), 'true');
        loop.click();
        assert.equal(handle.loop(), false);

        const speed = deck.querySelector('select[aria-label="Replay speed"]');
        speed.value = '2';
        fire(dom, speed, 'change');
        assert.equal(handle.speed(), 2);
        handle.speed(0);
        speed.value = '0.5';
        fire(dom, speed, 'change');
        assert.equal(handle.speed(), 0);
        deck.querySelector('.tbtn.primary').click();
        assert.equal(handle.speed(), 0.5);
    });
});

test('the deck has keyboard control: arrows step frames, Shift jumps ten, Home and End, Space plays', () => {
    withRecording(({ press, deck, scrub, handle }) => {
        const key = (name, init) => press(scrub, name, init);
        assert.equal(key('ArrowRight'), false);
        assert.deepEqual([handle.frame(), handle.speed()], [1, 0]);
        key('ArrowRight');
        key('ArrowLeft');
        assert.equal(handle.frame(), 1);
        key('ArrowRight', { shiftKey: true });
        assert.equal(handle.frame(), 5);
        key('Home');
        assert.equal(handle.frame(), 0);
        key('End');
        assert.equal(handle.position(), 1);
        key(' ');
        assert.equal(handle.position(), 0);
        assert.equal(handle.speed(), 1);
        key(' ');
        assert.equal(handle.speed(), 0);
        assert.equal(deck.querySelector('.tbtn.primary').getAttribute('aria-label'), 'Play');
    });
});

test('deck shortcuts do not hijack a focused select', () => {
    withRecording(({ press, deck, handle }) => {
        const select = deck.querySelector('select[aria-label="Variable to plot"]');
        assert.equal(press(select, 'ArrowRight'), true);
        assert.equal(handle.speed(), 1);
    });
});

test('the plot can be switched to another variable and shows its value at the playhead', () => {
    withRecording(({ dom, deck, handle }) => {
        const select = deck.querySelector('select[aria-label="Variable to plot"]');
        select.value = '1';
        fire(dom, select, 'change');
        assert.equal(deck.querySelector('.deck-plot').textContent, 'hp 10');
        assert.ok(deck.querySelector('.plot-line').getAttribute('points').length > 0);
        select.value = '0';
        fire(dom, select, 'change');
        handle.seekFrame(2);
        fire(dom, deck.querySelector('.scrub'), 'pointerup');
        assert.equal(deck.querySelector('.deck-plot').textContent, 'score 5');
    });
});

test('Close ends the replay and hides the deck', () => {
    withRecording(({ probe, deck, button }) => {
        button(deck, 'Close').click();
        assert.equal(probe.replay(), null);
        assert.equal(deck.hidden, true);
        assert.equal(probe.info().playing, null);
    });
});

test('a replay started from the console shows up in the deck and the deck lets go when it ends', () => {
    withRecording(({ probe, deck, button }) => {
        button(deck, 'Close').click();
        const handle = probe.playrec('r', 0, { park: true });
        probe.ui(true);
        assert.equal(deck.hidden, false);
        assert.equal(deck.querySelector('.tbtn.primary').getAttribute('aria-label'), 'Play');
        handle.stop();
        probe.ui(true);
        assert.equal(deck.hidden, true);
    });
});
test('pause, step and speed controls drive the stepper and show its state', () => {
    withPanel({}, ({ probe, $, $$, button }) => {
        probe.ui(true);
        const steps = $$('.time button').filter(b => b.textContent === 'Step' || b.textContent === '+10');
        assert.ok(steps.every(b => b.disabled));
        button($('.time'), 'Pause').click();
        assert.equal(probe.info().paused, true);
        assert.match($('.chip').textContent, /paused/);
        assert.ok(steps.every(b => !b.disabled));
        button($('.time'), 'Step').click();
        assert.match($('.status').textContent, /stepped 1 frame$/);
        const speed = label => $$('.time .segments button').find(b => b.textContent === label);
        speed('2').click();
        assert.equal(probe.speed(), 2);
        assert.equal(speed('2').getAttribute('aria-pressed'), 'true');
        assert.equal(speed('1').getAttribute('aria-pressed'), 'false');
        speed('∞').click();
        assert.equal(probe.speed(), Infinity);
        button($('.time'), 'Resume').click();
        assert.equal(probe.info().paused, false);
    });
});

test('values follow the project while the panel is open', async () => {
    await withPanelAsync({}, async ({ probe, row }) => {
        probe.ui(true);
        probe.set('hp', 55);
        await new Promise(resolve => setTimeout(resolve, 400));
        assert.equal(row('hp').querySelector('.value').textContent, '55');
    });
});

test('tabs are a real tablist: aria state follows the selection and arrows move it', () => {
    withPanel({}, ({ probe, $, $$, tab, press }) => {
        probe.ui(true);
        assert.equal(tab('Variables').getAttribute('aria-selected'), 'true');
        assert.equal(tab('Scan').getAttribute('aria-selected'), 'false');
        assert.equal($('#page-scan').hidden, true);
        press($('[role=tablist]'), 'ArrowRight');
        assert.equal(tab('Scan').getAttribute('aria-selected'), 'true');
        assert.equal($('#page-scan').hidden, false);
        press($('[role=tablist]'), 'ArrowLeft');
        press($('[role=tablist]'), 'ArrowLeft');
        assert.equal(tab('Record').getAttribute('aria-selected'), 'true');
        assert.equal($$('[role=tabpanel]').filter(p => !p.hidden).length, 1);
    });
});

test('keystrokes typed in the panel never reach the project page', () => {
    withPanel({}, ({ probe, document, $, press }) => {
        probe.ui(true);
        const seen = [];
        document.addEventListener('keydown', event => seen.push(event.key));
        press($('input[type=search]'), 'a');
        press($('input[type=search]'), ' ');
        assert.deepEqual(seen, []);
        press(document.body, 'x');
        assert.deepEqual(seen, ['x']);
    });
});

test('Escape inside the panel closes it, and the open state, tab and size are remembered', () => {
    const storage = fakeStorage();
    withPanel({ storage }, ({ probe, $, tab, press }) => {
        probe.ui(true);
        tab('Savestates').click();
        assert.equal(JSON.parse(storage.data.get('rebugger.panel')).tab, 'states');
        assert.equal(JSON.parse(storage.data.get('rebugger.panel')).open, true);
        press($('.panel'), 'Escape');
        assert.equal($('.panel').hidden, true);
        assert.equal(JSON.parse(storage.data.get('rebugger.panel')).open, false);
    });
    withPanel({ storage, restorePanel: true }, ({ document }) => {
        assert.equal(document.querySelector('#rebugger-panel'), null);
    });
    storage.setItem('rebugger.panel', JSON.stringify({ open: true, tab: 'scan', minimized: true }));
    withPanel({ storage, restorePanel: true }, ({ $, tab }) => {
        assert.equal($('.panel').hidden, false);
        assert.equal(tab('Scan').getAttribute('aria-selected'), 'true');
        assert.equal($('.panel').classList.contains('minimized'), true);
    });
});

test('corrupt or blocked storage falls back to defaults instead of breaking the panel', () => {
    withPanel({ storage: fakeStorage({ 'rebugger.panel': '{nope' }) }, ({ probe, $ }) => {
        probe.ui(true);
        assert.equal($('.panel').hidden, false);
    });
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    withPanel({ storage: blocked }, ({ probe, $, tab }) => {
        probe.ui(true);
        tab('Scan').click();
        assert.equal($('#page-scan').hidden, false);
    });
});

test('the minimize button collapses the panel to its header', () => {
    withPanel({}, ({ probe, $, button }) => {
        probe.ui(true);
        const toggle = $('.bar .icon');
        toggle.click();
        assert.equal($('.panel').classList.contains('minimized'), true);
        assert.equal(toggle.getAttribute('aria-label'), 'Expand');
        toggle.click();
        assert.equal($('.panel').classList.contains('minimized'), false);
    });
});

test('the hotkey is Alt+Shift+D and toggles through installHotkey, ignoring repeats and other modifiers', () => {
    const dom = new JSDOM('');
    const { KeyboardEvent } = dom.window;
    const fire = init => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        dom.window.dispatchEvent(event);
        return event;
    };
    let toggles = 0;
    const uninstall = installHotkey(dom.window, () => { toggles++; });
    const hotkey = { altKey: true, shiftKey: true, code: 'KeyD', key: 'Ð' };
    const event = fire(hotkey);
    assert.equal(toggles, 1);
    assert.equal(event.defaultPrevented, true);
    fire({ ...hotkey, repeat: true });
    fire({ ...hotkey, ctrlKey: true });
    fire({ ...hotkey, metaKey: true });
    fire({ altKey: true, code: 'KeyD' });
    fire({ code: 'KeyD' });
    assert.equal(toggles, 1);
    uninstall();
    fire(hotkey);
    assert.equal(toggles, 1);
    assert.equal(isHotkey(hotkey), true);
    dom.window.close();
});

test('each row and tab carries the hue that colours it: value kind, pin mode and section', () => {
    withPanel({}, ({ probe, $, $$, row }) => {
        probe.ui(true);
        assert.equal(row('hp').dataset.mode, 'var');
        assert.equal(row('inv').dataset.mode, 'list');
        probe.freeze('hp');
        probe.shitpost('score', 1, 2);
        probe.blank('inv');
        probe.ui(true);
        assert.equal(row('hp').dataset.mode, 'freeze');
        assert.equal(row('score').dataset.mode, 'shitpost');
        assert.equal(row('inv').dataset.mode, 'blank');
        probe.unfreeze();
        probe.ui(true);
        assert.equal(row('hp').dataset.mode, 'var');
        assert.deepEqual($$('[role=tab]').map(tab => tab.dataset.hue), ['var', 'sense', 'events', 'rec']);
    });
});

const withRecordedAnimations = (run, { reduced = false } = {}) => withPanel({}, page => {
    const played = [];
    const { HTMLElement } = page.dom.window;
    HTMLElement.prototype.animate = function (keyframes, options) {
        played.push({ element: this, className: this.className, keyframes, duration: options.duration });
        return {};
    };
    page.dom.window.matchMedia = () => ({ matches: reduced });
    run({ ...page, played });
});

test('a changing value updates in place without any animation, even while the project ticks it every frame', () => {
    withRecordedAnimations(({ probe, row, played }) => {
        probe.ui(true);
        played.length = 0;
        for (let i = 0; i < 6; i++) {
            probe.set('hp', 100 + i);
            probe.ui(true);
        }
        assert.equal(row('hp').querySelector('.value').textContent, '105');
        assert.equal(played.length, 0);
    });
});

test('the value pill settles when its mode changes, and not on first paint or when only the value moves', () => {
    withRecordedAnimations(({ probe, row, played }) => {
        probe.ui(true);
        assert.equal(played.filter(p => p.className === 'value').length, 0);
        row('score').querySelector('.pin').click();
        const settles = played.filter(p => p.className === 'value');
        assert.equal(settles.length, 1);
        assert.equal(settles[0].duration, 240);
        assert.equal(settles[0].element, row('score').querySelector('.value'));
    });
});

test('status messages arrive with a fade and errors shake, while the resting hint stays still', () => {
    withRecordedAnimations(({ probe, row, tab, $, button, played }) => {
        probe.ui(true);
        played.length = 0;
        row('hp').querySelector('.pin').click();
        assert.deepEqual(played.filter(p => p.className === 'status').map(p => p.duration), [160]);
        tab('Scan').click();
        played.length = 0;
        button($('#page-scan'), 'Scan').click();
        const shake = played.find(p => p.className === 'status');
        assert.equal(shake.duration, 260);
        assert.ok(shake.keyframes.some(frame => frame.transform === 'translateX(3px)'));
        tab('Variables').click();
        played.length = 0;
        tab('Scan').click();
        assert.equal(played.filter(p => p.className === 'status').length, 0);
    });
});

test('with reduced motion requested nothing is animated', () => {
    withRecordedAnimations(({ probe, row, played }) => {
        probe.ui(true);
        row('score').querySelector('.pin').click();
        probe.set('hp', 3);
        probe.ui(true);
        assert.equal(played.length, 0);
    }, { reduced: true });
});

const withFakeTimers = run => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        run();
    } finally {
        mock.timers.reset();
    }
};

test('the panel refreshes four times a second while the project runs, and not at all once closed', () => {
    withFakeTimers(() => withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        probe.set('hp', 21);
        mock.timers.tick(249);
        assert.equal(row('hp').querySelector('.value').textContent, '10');
        mock.timers.tick(1);
        assert.equal(row('hp').querySelector('.value').textContent, '21');

        const stale = row('hp');
        probe.ui(false);
        probe.set('hp', 22);
        mock.timers.tick(10000);
        assert.equal(stale.querySelector('.value').textContent, '21');
    }));
});

test('while the project is paused nothing can change by itself, so the panel only polls once a second', () => {
    withFakeTimers(() => withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        probe.pause();
        mock.timers.tick(250);
        probe.set('hp', 31);
        mock.timers.tick(750);
        assert.equal(row('hp').querySelector('.value').textContent, '10');
        mock.timers.tick(250);
        assert.equal(row('hp').querySelector('.value').textContent, '31');
    }));
});

test('a refresh that is slow pushes the next one out so the panel never takes more than a tenth of the thread', () => {
    withFakeTimers(() => withPanel({}, ({ probe, row }) => {
        let clock = 0;
        const now = mock.method(performance, 'now', () => clock);
        try {
            probe.ui(true);
            probe.set('hp', 41);
            now.mock.mockImplementation(() => (clock += 50));
            mock.timers.tick(250);
            probe.set('hp', 42);
            mock.timers.tick(250);
            assert.equal(row('hp').querySelector('.value').textContent, '41');
            mock.timers.tick(450);
            assert.equal(row('hp').querySelector('.value').textContent, '42');
        } finally {
            now.mock.restore();
        }
    }));
});

test('the panel is an outer shell around an inner core that holds all the chrome', () => {
    withPanel({}, ({ probe, $, $$ }) => {
        probe.ui(true);
        const panel = $('.panel');
        assert.deepEqual([...panel.children].map(child => child.className), ['core']);
        assert.deepEqual([...$('.core').children].map(child => child.className.split(' ')[0]), ['bar', 'tabs', 'body', 'time', 'status']);
        assert.equal($$('.core').length, 1);
    });
});

test('header controls and row chevrons are line icons, and the collapse control swaps its icon', () => {
    withPanel({}, ({ probe, $, $$, row }) => {
        probe.ui(true);
        const [minimize, close] = $$('.bar .icon');
        assert.ok(minimize.querySelector('svg.glyph'));
        assert.ok(close.querySelector('svg.glyph'));
        const minus = minimize.querySelector('path').getAttribute('d');
        minimize.click();
        assert.notEqual(minimize.querySelector('path').getAttribute('d'), minus);
        minimize.click();
        assert.equal(minimize.querySelector('path').getAttribute('d'), minus);
        assert.ok(row('hp').querySelector('.chev svg.glyph'));
        assert.equal(minimize.textContent, '');
    });
});

test('an expanded row is marked open so its edge accent shows, and collapsing clears it', () => {
    withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        assert.equal(row('hp').hasAttribute('data-open'), false);
        row('hp').querySelector('.chev').click();
        assert.equal(row('hp').hasAttribute('data-open'), true);
        row('inv').querySelector('.chev').click();
        assert.equal(row('inv').hasAttribute('data-open'), true);
        row('hp').querySelector('.chev').click();
        assert.equal(row('hp').hasAttribute('data-open'), false);
        assert.equal(row('inv').hasAttribute('data-open'), true);
    });
});

const keepControls = ({ $ }) => ({ amount: $('.keep input'), unit: $('.keep select') });
const chooseUnit = (dom, unit, name) => {
    unit.value = name;
    unit.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
};

test('how much a recording keeps is a number with a Frames or Seconds unit, and each unit remembers its own number', () => {
    withPanel({}, page => {
        const { dom, probe, tab } = page;
        probe.ui(true);
        tab('Record').click();
        const { amount, unit } = keepControls(page);
        assert.deepEqual([...unit.options].map(option => option.textContent), ['Frames', 'Seconds']);
        assert.deepEqual([unit.value, amount.value], ['frames', '3600']);
        amount.value = '900';
        chooseUnit(dom, unit, 'seconds');
        assert.deepEqual([amount.value, amount.min, amount.step], ['120', '0.1', 'any']);
        amount.value = '30';
        chooseUnit(dom, unit, 'frames');
        assert.deepEqual([amount.value, amount.min, amount.step], ['900', '1', '1']);
        chooseUnit(dom, unit, 'seconds');
        assert.equal(amount.value, '30');
    });
});

test('Record keeps the last stretch of seconds or the last number of frames, depending on the unit', () => {
    withPanel({}, page => {
        const { dom, probe, vm, clock, tab, $, button } = page;
        probe.ui(true);
        tab('Record').click();
        const { amount, unit } = keepControls(page);
        const recordFor = (unitName, amountText) => {
            chooseUnit(dom, unit, unitName);
            amount.value = amountText;
            button($('#page-rec'), 'Record').click();
            for (let i = 0; i < 6; i++) {
                clock.t += 100;
                runFrame(vm);
            }
            button($('#page-rec'), 'Stop').click();
            return probe.recs().at(-1);
        };
        const bySeconds = recordFor('seconds', '0.25');
        assert.deepEqual([bySeconds.frames, bySeconds.dropped > 0], [3, true]);
        const byFrames = recordFor('frames', '2');
        assert.equal(byFrames.frames, 2);
    });
});

test('an empty or zero amount falls back to the unit default instead of failing', () => {
    withPanel({}, page => {
        const { dom, probe, vm, clock, tab, $, button } = page;
        probe.ui(true);
        tab('Record').click();
        const { amount, unit } = keepControls(page);
        chooseUnit(dom, unit, 'seconds');
        amount.value = '';
        button($('#page-rec'), 'Record').click();
        clock.t += 100;
        runFrame(vm);
        button($('#page-rec'), 'Stop').click();
        assert.equal(probe.recs().at(-1).dropped, 0);
        assert.notEqual($('.status').dataset.tone, 'error');
    });
});

const heldPositions = probe => probe.frozen().filter(f => f.index !== undefined).map(f => f.index);

test('each list item has a lock that holds it at its current value and releases it again', () => {
    withPanel({}, ({ probe, row, vm }) => {
        probe.ui(true);
        row('inv').querySelector('.chev').click();
        const lock = position => row('inv').querySelector(`button[aria-label$="item ${position}"].hold`);
        assert.equal(row('inv').querySelectorAll('.items .hold').length, 3);
        assert.equal(lock(2).getAttribute('aria-pressed'), 'false');
        lock(2).click();
        assert.deepEqual(heldPositions(probe), [2]);
        assert.equal(lock(2).getAttribute('aria-pressed'), 'true');
        assert.equal(lock(2).getAttribute('aria-label'), 'Release item 2');
        assert.equal(lock(1).getAttribute('aria-pressed'), 'false');
        probe.setAt('inv', 2, 'edited elsewhere');
        runFrame(vm);
        assert.equal(probe.list('inv')[1], 'b');
        lock(2).click();
        assert.deepEqual(heldPositions(probe), []);
        assert.equal(lock(2).getAttribute('aria-pressed'), 'false');
    });
});

test('a held item shows as held, cannot be removed, and editing it changes the value being held', () => {
    withPanel({}, ({ probe, row, press, vm }) => {
        probe.ui(true);
        row('inv').querySelector('.chev').click();
        row('inv').querySelector('button[aria-label$="item 2"].hold').click();
        const line = row('inv').querySelectorAll('.items .line')[1];
        assert.equal(line.classList.contains('held'), true);
        assert.equal(row('inv').querySelector('button[aria-label="Remove item 2"]').disabled, true);
        assert.equal(row('inv').querySelector('button[aria-label="Remove item 1"]').disabled, false);
        const input = line.querySelector('input');
        input.value = 'new held value';
        press(input, 'Enter');
        runFrame(vm);
        assert.equal(probe.list('inv')[1], 'new held value');
        assert.deepEqual(heldPositions(probe), [2]);
        assert.equal(probe.frozen().length, 1);
    });
});

test('the list row shows how many items are held, and the Frozen filter finds lists with held items', () => {
    withPanel({}, ({ dom, probe, $, $$, row }) => {
        probe.ui(true);
        const badge = () => row('inv').querySelector('.held-badge');
        assert.equal(badge().hidden, true);
        assert.equal(row('inv').querySelector('.meta').textContent.trim(), 'Stage');
        probe.freezeAt('inv', 1);
        probe.freezeAt('inv', 3);
        probe.ui(true);
        assert.equal(badge().hidden, false);
        assert.equal(badge().textContent, '2');
        assert.equal(badge().title, '2 held items');
        assert.equal(row('inv').dataset.mode, 'list');
        assert.equal(row('inv').querySelector('.pin').textContent, 'Blank');

        const frozenOnly = $$('.toolbar input[type=checkbox]')[0];
        frozenOnly.checked = true;
        frozenOnly.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        assert.deepEqual($$('.item .name').map(n => n.textContent), ['inv']);
        probe.unfreezeAt('inv', 1);
        probe.ui(true);
        assert.equal(badge().title, '1 held item');
    });
});

test('Hold all holds every item in one click and Release held lets them go, leaving other holds alone', () => {
    withPanel({}, ({ probe, row, button }) => {
        probe.ui(true);
        probe.freeze('score', 9);
        row('inv').querySelector('.chev').click();
        const drawer = () => row('inv').querySelector('.drawer');
        assert.equal(button(drawer(), 'Release held').disabled, true);
        button(drawer(), 'Hold all').click();
        assert.deepEqual(heldPositions(probe), [1, 2, 3]);
        assert.equal(button(drawer(), 'Hold all').disabled, true);
        assert.equal(button(drawer(), 'Release held').disabled, false);
        assert.equal(row('inv').querySelectorAll('.items .line.held').length, 3);
        button(drawer(), 'Release held').click();
        assert.deepEqual(heldPositions(probe), []);
        assert.deepEqual(probe.frozen().map(f => f.name), ['score']);
    });
});

test('Hold all is unavailable on a list too long to show every item', () => {
    withPanel({}, ({ probe, row, button }) => {
        for (let i = 0; i < 120; i++) probe.push('inv', i);
        probe.ui(true);
        row('inv').querySelector('.chev').click();
        const all = button(row('inv').querySelector('.drawer'), 'Hold all');
        assert.equal(all.disabled, true);
        assert.match(all.title, /over 100 items/);
        assert.equal(row('inv').querySelectorAll('.items .line').length, 100);
    });
});

test('a list with held items still shows its held count when it is collapsed again', () => {
    withPanel({}, ({ probe, row }) => {
        probe.ui(true);
        row('inv').querySelector('.chev').click();
        row('inv').querySelector('button[aria-label$="item 1"].hold').click();
        row('inv').querySelector('.chev').click();
        assert.equal(row('inv').querySelector('.held-badge').textContent, '1');
        assert.equal(row('inv').hasAttribute('data-open'), false);
    });
});

test('Wipe rows sets every row to empty text and keeps the rows, from the list drawer', () => {
    withPanel({}, ({ probe, row, button, $ }) => {
        probe.ui(true);
        row('inv').querySelector('.chev').click();
        const wipe = () => button(row('inv').querySelector('.drawer'), 'Wipe rows');
        assert.equal(wipe().disabled, false);
        wipe().click();
        assert.deepEqual(probe.list('inv'), ['', '', '']);
        assert.equal(row('inv').querySelector('.value').textContent, '3 items');
        assert.deepEqual([...row('inv').querySelectorAll('.items input')].map(input => input.value), ['', '', '']);
        assert.match($('.status').textContent, /wiped 3 rows/);
        probe.clear('inv');
        probe.ui(true);
        assert.equal(wipe().disabled, true);
    });
});

const sameNamed = page => {
    const cat = page.vm.runtime.targets.find(t => t.sprite.name === 'Cat');
    cat.createVariable('Cat:score', 'score', '');
    cat.variables['Cat:score'].value = 77;
    cat.createVariable('Cat:inv', 'inv', 'list');
    cat.variables['Cat:inv'].value = ['p', 'q'];
    page.probe.ui(true);
    return (name, sprite) => page.$$('.item').find(item =>
        item.querySelector('.name').textContent === name && item.querySelector('.meta').textContent.trim().startsWith(sprite));
};

test('freezing, blanking and releasing a row only touches that sprite even when another sprite has the same name', () => {
    withPanel({}, page => {
        const { probe } = page;
        const rowOf = sameNamed(page);
        assert.ok(rowOf('score', 'Stage') && rowOf('score', 'Cat'));
        rowOf('score', 'Cat').querySelector('.pin').click();
        assert.deepEqual(probe.frozen().map(f => `${f.sprite}.${f.name}`), ['Cat.score']);
        assert.equal(rowOf('score', 'Stage').querySelector('.pin').textContent, 'Freeze');
        assert.equal(rowOf('score', 'Cat').querySelector('.pin').textContent, 'Frozen');
        rowOf('score', 'Cat').querySelector('.pin').click();
        assert.deepEqual(probe.frozen(), []);

        rowOf('inv', 'Cat').querySelector('.pin').click();
        assert.deepEqual(probe.frozen().map(f => `${f.sprite}.${f.name}`), ['Cat.inv']);
        assert.deepEqual(probe.list('inv', { sprite: 'Stage' }), ['a', 'b', 'c']);
        assert.equal(rowOf('inv', 'Stage').querySelector('.pin').textContent, 'Blank');
        rowOf('inv', 'Cat').querySelector('.pin').click();
        assert.deepEqual(probe.frozen(), []);
    });
});

test('the list drawer actions on a sprite list leave the stage list with the same name alone', () => {
    withPanel({}, page => {
        const { probe, button } = page;
        const rowOf = sameNamed(page);
        rowOf('inv', 'Cat').querySelector('.chev').click();
        const drawer = () => rowOf('inv', 'Cat').querySelector('.drawer');
        button(drawer(), 'Wipe rows').click();
        assert.deepEqual(probe.list('inv', { sprite: 'Cat' }).slice(0, 2), ['', '']);
        assert.deepEqual(probe.list('inv', { sprite: 'Stage' }), ['a', 'b', 'c']);
        button(drawer(), 'Hold all').click();
        assert.deepEqual(probe.frozen().map(f => [f.sprite, f.index]), [['Cat', 1], ['Cat', 2]]);
        button(drawer(), 'Blank').click();
        assert.deepEqual(probe.list('inv', { sprite: 'Stage' }), ['a', 'b', 'c']);
        assert.equal(probe.get('score', { sprite: 'Stage' }), 5);
        assert.equal(rowOf('inv', 'Stage').querySelector('.pin').textContent, 'Blank');
    });
});
