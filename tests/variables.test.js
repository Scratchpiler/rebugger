import { suggest } from '../src/util.js';
import { VirtualMachine, test, assert, addTarget, project, cockpit } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

test('vars lists variables and lists with their scope', () => {
    const { probe } = project();
    const rows = probe.vars();
    assert.deepEqual(rows.find(r => r.name === 'score'), { sprite: 'Stage', name: 'score', kind: 'var', cloud: false, value: 5 });
    assert.deepEqual(rows.find(r => r.name === 'inv').value, ['a', 'b', 'c']);
    assert.equal(rows.filter(r => r.name === 'hp').length, 2);
});

test('get and set address a global by name', () => {
    const { vm, probe } = project();
    assert.equal(probe.get('score'), 5);
    probe.set('score', 99);
    assert.equal(vm.runtime.targets[0].variables['Stage:score'].value, 99);
});

test('a name shared by two sprites is ambiguous until a sprite is given', () => {
    const { probe } = project();
    assert.throws(() => probe.get('hp'), /ambiguous \(Cat, Dog\)/);
    assert.equal(probe.get('hp', { sprite: 'Dog' }), 20);
});

test('a sprite scope falls back to the stage for globals', () => {
    const { probe } = project();
    assert.equal(probe.get('score', { sprite: 'Cat' }), 5);
});

test('a missing name says when the other kind has it', () => {
    const { probe } = project();
    assert.throws(() => probe.get('inv'), /no variable named "inv" \(a list has that name\)/);
    assert.throws(() => probe.get('nope'), /no variable named "nope"$/);
    assert.throws(() => probe.get('hp', { sprite: 'Bird' }), /no sprite named "Bird"/);
});

test('clones are addressed by number and keep their own values', () => {
    const { vm, probe } = project();
    const cat = vm.runtime.targets.find(t => t.sprite.name === 'Cat');
    vm.runtime.addTarget(cat.makeClone());
    probe.set('hp', 1, { sprite: 'Cat', clone: 1 });
    assert.equal(probe.get('hp', { sprite: 'Cat', clone: 1 }), 1);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
    assert.throws(() => probe.get('hp', { sprite: 'Cat', clone: 2 }), /no clone #2/);
});

test('list edits use 1-based indexes and flag the monitor stale', () => {
    const { vm, probe } = project();
    const inv = vm.runtime.targets[0].variables['Stage:inv'];
    inv._monitorUpToDate = true;
    assert.equal(probe.push('inv', 'd'), 4);
    assert.equal(inv._monitorUpToDate, false);
    probe.insert('inv', 1, 'z');
    probe.insert('inv', 6, 'end');
    probe.setAt('inv', 2, 'A');
    probe.removeAt('inv', 3);
    assert.deepEqual(probe.list('inv'), ['z', 'A', 'c', 'd', 'end']);
    assert.equal(probe.clear('inv'), 0);
});

test('list indexes outside the list are rejected', () => {
    const { probe } = project();
    assert.throws(() => probe.removeAt('inv', 0), RangeError);
    assert.throws(() => probe.removeAt('inv', 4), RangeError);
    assert.throws(() => probe.insert('inv', 5, 'x'), RangeError);
    assert.throws(() => probe.setAt('inv', 1.5, 'x'), RangeError);
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'c']);
});

test('list returns a copy', () => {
    const { probe } = project();
    probe.list('inv').push('x');
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'c']);
});

test('a cloud variable is written locally without touching the cloud device', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { '☁ best': 1 }, cloud: ['☁ best'] });
    const sent = [];
    vm.runtime.ioDevices.cloud.requestUpdateVariable = (...args) => sent.push(args);
    const warnings = [];
    const realWarn = console.warn;
    console.warn = message => warnings.push(message);
    try {
        const probe = makeRebugger(vm);
        probe.set('☁ best', 999);
        probe.set('☁ best', 1000);
    } finally {
        console.warn = realWarn;
    }
    assert.equal(vm.runtime.targets[0].variables['Stage:☁ best'].value, 1000);
    assert.deepEqual(sent, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /cloud variable/);
});

test('find matches a name fragment case-insensitively across variables and lists', () => {
    const { probe } = cockpit();
    const hits = probe.find('ALT');
    assert.deepEqual(hits.map(h => h.name).sort(), ['Alt-Hold', 'alt', 'altLog', 'altitude_ft']);
    assert.deepEqual(hits.find(h => h.name === 'altLog'), { sprite: 'Stage', clone: 0, name: 'altLog', cloud: false, value: [1, 2], kind: 'list' });
    assert.deepEqual(hits.find(h => h.name === 'alt'), { sprite: 'Plane', clone: 0, name: 'alt', cloud: false, value: 5000, kind: 'var' });
});

test('find takes a regular expression and ignores the global flag state', () => {
    const { probe } = cockpit();
    const pattern = /^alt$/g;
    assert.deepEqual(probe.find(pattern).map(h => h.name), ['alt']);
    assert.deepEqual(probe.find(pattern).map(h => h.name), ['alt']);
    assert.equal(pattern.lastIndex, 0);
});

test('find narrows by kind and sprite and reports no match as an empty list', () => {
    const { probe } = cockpit();
    assert.deepEqual(probe.find('alt', { kind: 'list' }).map(h => h.name), ['altLog']);
    assert.deepEqual(probe.find('alt', { kind: 'var', sprite: 'Plane' }).map(h => h.name).sort(), ['alt', 'altitude_ft']);
    assert.deepEqual(probe.find('zzz'), []);
    assert.throws(() => probe.find('alt', { kind: 'both' }), /kind must be one of/);
});

test('find skips clones unless asked and numbers the ones it includes', () => {
    const { vm, probe } = cockpit();
    const plane = vm.runtime.targets.find(t => t.sprite.name === 'Plane');
    vm.runtime.addTarget(plane.makeClone());
    assert.equal(probe.find('speed').length, 1);
    assert.deepEqual(probe.find('speed', { clones: true }).map(h => h.clone).sort(), [0, 1]);
});

test('find returns a copy of a list value and its hits feed straight into set', () => {
    const { vm, probe } = cockpit();
    probe.find('altLog')[0].value.push(99);
    assert.deepEqual(probe.list('altLog'), [1, 2]);
    const [hit] = probe.find(/^speed$/);
    probe.set(hit.name, 1, { sprite: hit.sprite, clone: hit.clone });
    assert.equal(vm.runtime.targets.find(t => t.sprite.name === 'Plane').variables['Plane:speed'].value, 1);
});

test('a mistyped name suggests the closest variables, but only when something is close', () => {
    const { probe } = project();
    assert.throws(() => probe.get('scor'), /no variable named "scor" \(did you mean "score"\?\)/);
    assert.throws(() => probe.get('Score'), /no variable named "Score" \(did you mean "score"\?\)/);
    assert.throws(() => probe.get('xylophone'), /no variable named "xylophone"$/);
    assert.throws(() => probe.get('hp', { sprite: 'Cta' }), /no sprite named "Cta" \(did you mean "Cat"\?\)/);
});

test('suggest ranks substrings first, then edit distance, and skips exact matches', () => {
    assert.deepEqual(suggest('alt', ['altitude_ft', 'alert', 'speed']), ['altitude_ft']);
    assert.deepEqual(suggest('speeed', ['speed', 'seed', 'altitude']), ['speed', 'seed']);
    assert.deepEqual(suggest('speed', ['speed']), []);
    assert.deepEqual(suggest('x', ['yy', 'zz']), []);
});

test('sprites lists the stage and every original sprite', () => {
    const { probe } = project();
    assert.deepEqual(probe.sprites(), ['Stage', 'Cat', 'Dog']);
});

test('find copies list values unless live is asked for, which hands back the list itself', () => {
    const { probe } = project();
    const copy = probe.find('inv')[0];
    const live = probe.find('inv', { live: true })[0];
    probe.push('inv', 'd');
    assert.equal(copy.value.length, 3);
    assert.equal(live.value.length, 4);
    assert.strictEqual(live.value, probe.find('inv', { live: true })[0].value);
});

test('wipe sets every row of a list to empty text and keeps the rows', () => {
    const { vm, probe } = project();
    const inv = vm.runtime.targets[0].variables['Stage:inv'];
    const array = inv.value;
    inv._monitorUpToDate = true;
    assert.equal(probe.wipe('inv'), 3);
    assert.deepEqual(probe.list('inv'), ['', '', '']);
    assert.equal(inv.value, array);
    assert.equal(inv._monitorUpToDate, false);
    probe.push('inv', 'x');
    assert.deepEqual(probe.list('inv'), ['', '', '', 'x']);
});

test('wipe on an empty list does nothing, and it only accepts lists', () => {
    const { probe } = project();
    probe.clear('inv');
    assert.equal(probe.wipe('inv'), 0);
    assert.deepEqual(probe.list('inv'), []);
    assert.throws(() => probe.wipe('score'), /no list named "score" \(a variable has that name\)/);
    assert.throws(() => probe.wipe('inv', { sprite: 'Bird' }), /no sprite named "Bird"/);
});
