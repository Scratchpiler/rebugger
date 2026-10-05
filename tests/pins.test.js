import { VirtualMachine, test, assert, addTarget, runFrame, project, sequence } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

test('freeze holds a value against a running script and unfreeze releases it', () => {
    const { vm, probe } = project();
    const original = vm.runtime._step;
    const unfreeze = probe.freeze('score', 50);
    assert.notEqual(vm.runtime._step, original);
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 50);
    unfreeze();
    assert.equal(vm.runtime._step, original);
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 51);
});

test('without freeze the same script does change the value', () => {
    const { vm, probe } = project();
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 6);
});

test('freeze without a value pins the current one', () => {
    const { vm, probe } = project();
    probe.freeze('score');
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 5);
});

test('freezeAll pins every variable at its current value against a running script', () => {
    const { vm, probe } = project();
    const release = probe.freezeAll();
    assert.equal(release.count, 3);
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 5);
    release();
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 6);
});

test('freezeAll honours except and sprite', () => {
    const { vm, probe } = project();
    assert.equal(probe.freezeAll({ except: ['score'] }).count, 2);
    probe.unfreeze();
    assert.equal(probe.freezeAll({ sprite: 'Cat' }).count, 1);
    probe.set('hp', 1, { sprite: 'Cat' });
    runFrame(vm);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
    probe.set('hp', 2, { sprite: 'Dog' });
    runFrame(vm);
    assert.equal(probe.get('hp', { sprite: 'Dog' }), 2);
});

test('freezeAll skips cloud variables without warning', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { '☁ best': 1, score: 2 }, cloud: ['☁ best'] });
    const probe = makeRebugger(vm);
    const warnings = [];
    const realWarn = console.warn;
    console.warn = message => warnings.push(message);
    try {
        assert.equal(probe.freezeAll().count, 1);
    } finally {
        console.warn = realWarn;
    }
    assert.deepEqual(warnings, []);
    assert.deepEqual(probe.info().frozen, ['score']);
});

test('freezeAll leaves an individual freeze alone and its release does not drop it', () => {
    const { vm, probe } = project();
    probe.freeze('score', 50);
    const release = probe.freezeAll();
    assert.equal(release.count, 2);
    release();
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 50);
    assert.deepEqual(probe.info().frozen, ['score']);
});

test('freezeAll covers clones only when asked', () => {
    const { vm, probe } = project();
    const cat = vm.runtime.targets.find(t => t.sprite.name === 'Cat');
    vm.runtime.addTarget(cat.makeClone());
    assert.equal(probe.freezeAll().count, 3);
    probe.unfreeze();
    assert.equal(probe.freezeAll({ clones: true }).count, 4);
});

test('freezeAll releases the step hook along with the last freeze', () => {
    const { vm, probe } = project();
    const original = vm.runtime._step;
    const release = probe.freezeAll();
    assert.notEqual(vm.runtime._step, original);
    release();
    assert.equal(vm.runtime._step, original);
});

test('blank holds a variable at an empty string against a running script', () => {
    const { vm, probe } = project();
    const release = probe.blank('score');
    assert.equal(release.count, 1);
    assert.equal(probe.get('score'), '');
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), '');
    release();
    vm.greenFlag();
    runFrame(vm);
    assert.equal(probe.get('score'), 1);
});

test('blank empties a list every frame and flags the monitor stale', () => {
    const { vm, probe } = project();
    const inv = vm.runtime.targets[0].variables['Stage:inv'];
    probe.blank('inv');
    assert.deepEqual(probe.list('inv'), []);
    probe.push('inv', 'x');
    inv._monitorUpToDate = true;
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), []);
    assert.equal(inv._monitorUpToDate, false);
});

test('blank keeps the same array so references to the list stay valid', () => {
    const { vm, probe } = project();
    const inv = vm.runtime.targets[0].variables['Stage:inv'];
    const array = inv.value;
    probe.blank('inv');
    assert.equal(inv.value, array);
});

const crowded = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 5, speed: 9 }, lists: { log: ['a', 'b'] } });
    addTarget(vm, { name: 'Cat', vars: { speed: 3, hp: 10 }, lists: { log: ['c', 'd'] } });
    addTarget(vm, { name: 'Dog', vars: { speed: 4, hp: 20 } });
    return { vm, probe: makeRebugger(vm) };
};

test('blank takes exactly one variable or list: a name on several sprites asks which', () => {
    const { vm, probe } = crowded();
    assert.throws(() => probe.blank('speed'), /"speed" is ambiguous \(Stage, Cat, Dog\); pass \{ sprite \}/);
    assert.deepEqual(probe.frozen(), []);
    const release = probe.blank('hp', { sprite: 'Dog' });
    assert.equal(release.count, 1);
    runFrame(vm);
    assert.equal(probe.get('hp', { sprite: 'Dog' }), '');
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
    assert.deepEqual(probe.frozen().map(f => `${f.sprite}.${f.name}`), ['Dog.hp']);
});

test('blank with a sprite never drags along the stage variable that shares its name', () => {
    const { vm, probe } = crowded();
    probe.blank('speed', { sprite: 'Cat' });
    runFrame(vm);
    assert.deepEqual(probe.frozen().map(f => `${f.sprite}.${f.name}`), ['Cat.speed']);
    assert.equal(probe.get('speed', { sprite: 'Cat' }), '');
    assert.equal(probe.get('speed', { sprite: 'Stage' }), 9);
    assert.equal(probe.get('speed', { sprite: 'Dog' }), 4);
    assert.equal(probe.get('score'), 5);
});

test('blank on a list leaves the same-named list on another sprite and the project variables alone', () => {
    const { vm, probe } = crowded();
    probe.blank('log', { sprite: 'Cat' });
    runFrame(vm);
    assert.deepEqual(probe.list('log', { sprite: 'Cat' }), []);
    assert.deepEqual(probe.list('log', { sprite: 'Stage' }), ['a', 'b']);
    assert.equal(probe.get('score'), 5);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
});

test('kind picks the variable or the list when one sprite has both under a name', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { box: 'v' } });
    vm.runtime.targets[0].createVariable('Stage:box-list', 'box', 'list');
    vm.runtime.targets[0].variables['Stage:box-list'].value = ['x'];
    const probe = makeRebugger(vm);
    probe.blank('box', { kind: 'list' });
    assert.deepEqual(probe.frozen().map(f => [f.name, f.kind]), [['box', 'list']]);
    assert.equal(probe.get('box'), 'v');
    probe.unfreeze('box', { kind: 'var' });
    assert.equal(probe.frozen().length, 1);
    probe.unfreeze('box', { kind: 'list' });
    assert.deepEqual(probe.frozen(), []);
    assert.throws(() => probe.blank('box', { kind: 'both' }), /kind must be one of/);
});

test('unfreeze by name releases only the sprite you mean, and asks when several sprites hold that name', () => {
    const { probe } = crowded();
    probe.freeze('hp', 1, { sprite: 'Cat' });
    probe.freeze('hp', 2, { sprite: 'Dog' });
    assert.throws(() => probe.unfreeze('hp'), /"hp" is held on several sprites \(Cat, Dog\); pass \{ sprite \}/);
    probe.unfreeze('hp', { sprite: 'Dog' });
    assert.deepEqual(probe.frozen().map(f => f.sprite), ['Cat']);
    probe.unfreeze('hp');
    assert.deepEqual(probe.frozen(), []);
});

test('unfreeze with a sprite leaves the stage variable that shares its name held', () => {
    const { probe } = crowded();
    probe.freeze('speed', 1, { sprite: 'Stage' });
    probe.freeze('speed', 2, { sprite: 'Cat' });
    probe.unfreeze('speed', { sprite: 'Cat' });
    assert.deepEqual(probe.frozen().map(f => `${f.sprite}.${f.name}`), ['Stage.speed']);
});

test('blank reports a name that matches nothing', () => {
    const { probe } = project();
    assert.throws(() => probe.blank('nope'), /no variable or list named "nope"/);
});

test('blankAll blanks variables and lists by default and the kind option narrows it', () => {
    const { probe } = project();
    assert.equal(probe.blankAll().count, 4);
    assert.equal(probe.get('score'), '');
    assert.deepEqual(probe.list('inv'), []);
    probe.unfreeze();
    assert.equal(probe.blankAll({ kind: 'list' }).count, 1);
    probe.unfreeze();
    assert.equal(probe.blankAll({ kind: 'var' }).count, 3);
    assert.throws(() => probe.blankAll({ kind: 'both' }), /kind must be one of/);
});

test('blankAll honours except and sprite and skips cloud variables', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { '☁ best': 1, score: 2 }, lists: { inv: ['a'] }, cloud: ['☁ best'] });
    addTarget(vm, { name: 'Cat', vars: { hp: 10 } });
    const probe = makeRebugger(vm);
    const realWarn = console.warn;
    console.warn = () => assert.fail('blankAll should not warn about cloud variables');
    try {
        assert.equal(probe.blankAll({ except: ['score'] }).count, 2);
        assert.equal(probe.get('score'), 2);
        probe.unfreeze();
        assert.equal(probe.blankAll({ sprite: 'Cat' }).count, 1);
        probe.unfreeze();
        assert.equal(probe.blankAll().count, 3);
    } finally {
        console.warn = realWarn;
    }
    assert.equal(probe.info().frozen.includes('☁ best'), false);
});

test('blank is destructive: releasing it leaves the blank value in place', () => {
    const { probe } = project();
    const release = probe.blank('score');
    release();
    assert.equal(probe.get('score'), '');
    assert.deepEqual(probe.info().frozen, []);
});

test('freeze still works on a variable after the hold refactor and ignores list shape', () => {
    const { probe } = project();
    probe.freeze('score', [1, 2]);
    assert.deepEqual(probe.get('score'), [1, 2]);
});

test('shitpost writes a random whole number in range every frame when both bounds are whole', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 } });
    const probe = makeRebugger(vm, { random: sequence([0, 0.999, 0.5, 0.5, 0.2, 0.2, 0.3]) });
    probe.shitpost('score', 1, 6);
    assert.equal(probe.get('score'), 1);
    runFrame(vm);
    assert.equal(probe.get('score'), 4);
    runFrame(vm);
    assert.equal(probe.get('score'), 2);
});

test('shitpost with a fractional bound rolls fractions, and either order of bounds works', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 } });
    const probe = makeRebugger(vm, { random: () => 0.5 });
    probe.shitpost('score', 1, 0.5);
    assert.equal(probe.get('score'), 0.75);
    probe.shitpost('score', 6, 1);
    assert.equal(probe.get('score'), 4);
    probe.shitpost('score', 10, -10);
    assert.equal(probe.get('score'), 0);
    probe.shitpost('score', 0.5, 1.5);
    assert.equal(probe.get('score'), 1);
});

test('shitpost stays inside its range across many frames', () => {
    const { vm, probe } = project();
    probe.shitpost('score', -3, 3);
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        runFrame(vm);
        const value = probe.get('score');
        assert.ok(Number.isInteger(value) && value >= -3 && value <= 3, `out of range: ${value}`);
        seen.add(value);
    }
    assert.ok(seen.size > 1);
});

test('shitpost beats the project script, and its stop function and unfreeze release it', () => {
    const { vm, probe } = project();
    const stop = probe.shitpost('score', 100, 100);
    vm.runtime.toggleScript('hat', { target: vm.runtime.getTargetForStage() });
    runFrame(vm);
    assert.equal(probe.get('score'), 100);
    stop();
    probe.set('score', 7);
    runFrame(vm);
    assert.equal(probe.get('score'), 7);
    probe.shitpost('score', 1, 1);
    probe.unfreeze('score');
    probe.set('score', 7);
    runFrame(vm);
    assert.equal(probe.get('score'), 7);
});

test('shitpost takes a scope, replaces a freeze on the same variable and shows in info', () => {
    const { vm, probe } = project();
    probe.freeze('hp', 1, { sprite: 'Cat' });
    probe.shitpost('hp', 50, 50, { sprite: 'Cat' });
    runFrame(vm);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 50);
    assert.equal(probe.get('hp', { sprite: 'Dog' }), 20);
    assert.deepEqual(probe.info().frozen, ['hp']);
});

test('shitpost rejects bad bounds and unknown or ambiguous names', () => {
    const { probe } = project();
    assert.throws(() => probe.shitpost('score'), /low and high must be finite numbers/);
    assert.throws(() => probe.shitpost('score', 1), /low and high must be finite numbers/);
    assert.throws(() => probe.shitpost('score', 1, Infinity), /finite/);
    assert.throws(() => probe.shitpost('score', '1', '5'), /finite/);
    assert.throws(() => probe.shitpost('nope', 1, 2), /no variable named "nope"/);
    assert.throws(() => probe.shitpost('hp', 1, 2), /ambiguous/);
});

test('frozen lists what is pinned with its mode, and unfreeze(name) releases a blanked list', () => {
    const { vm, probe } = project();
    probe.freeze('score', 7);
    probe.blank('inv');
    probe.shitpost('hp', 1, 3, { sprite: 'Cat' });
    assert.deepEqual(probe.frozen(), [
        { sprite: 'Stage', clone: 0, name: 'score', kind: 'var', mode: 'freeze' },
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', mode: 'blank' },
        { sprite: 'Cat', clone: 0, name: 'hp', kind: 'var', mode: 'shitpost' },
    ]);
    probe.unfreeze('inv');
    assert.deepEqual(probe.frozen().map(row => row.name), ['score', 'hp']);
    assert.throws(() => probe.unfreeze('nope'), /no variable or list named "nope"/);
    probe.unfreeze();
    assert.deepEqual(probe.frozen(), []);
});

test('freezeAt holds one list item against edits while the rest of the list stays free', () => {
    const { vm, probe } = project();
    const release = probe.freezeAt('inv', 2);
    probe.setAt('inv', 2, 'changed');
    probe.setAt('inv', 1, 'free');
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), ['free', 'b', 'c']);
    probe.setAt('inv', 3, 'also free');
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), ['free', 'b', 'also free']);
    release();
    probe.setAt('inv', 2, 'released');
    runFrame(vm);
    assert.equal(probe.list('inv')[1], 'released');
});

test('freezeAt with a value sets it at once, and marks the list monitor stale when a frame rewrites it', () => {
    const { vm, probe } = project();
    probe.freezeAt('inv', 3, 'Z');
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'Z']);
    const list = vm.runtime.targets.find(t => t.isStage).variables['Stage:inv'];
    probe.setAt('inv', 3, 'nope');
    list._monitorUpToDate = true;
    runFrame(vm);
    assert.equal(list.value[2], 'Z');
    assert.equal(list._monitorUpToDate, false);
});

test('holding several items, unfreezeAt, unfreeze(name) and unfreeze() release them and free the step hook', () => {
    const { vm, probe } = project();
    const original = vm.runtime._step;
    probe.freezeAt('inv', 1);
    probe.freezeAt('inv', 3);
    assert.notEqual(vm.runtime._step, original);
    probe.unfreezeAt('inv', 1);
    probe.setAt('inv', 1, 'free');
    probe.setAt('inv', 3, 'locked?');
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), ['free', 'b', 'c']);
    probe.unfreezeAt('inv', 3);
    assert.equal(vm.runtime._step, original);

    probe.freezeAt('inv', 1);
    probe.freezeAt('inv', 2);
    probe.unfreeze('inv');
    assert.deepEqual(probe.frozen(), []);
    assert.equal(vm.runtime._step, original);

    probe.freezeAt('inv', 2);
    probe.unfreeze();
    assert.deepEqual(probe.frozen(), []);
    assert.equal(vm.runtime._step, original);
});

test('frozen lists held items with their index, in order, next to whole-variable holds', () => {
    const { probe } = project();
    probe.freeze('score', 7);
    probe.freezeAt('inv', 3);
    probe.freezeAt('inv', 1);
    assert.deepEqual(probe.frozen(), [
        { sprite: 'Stage', clone: 0, name: 'score', kind: 'var', mode: 'freeze' },
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', mode: 'freeze', index: 1 },
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', mode: 'freeze', index: 3 },
    ]);
    assert.deepEqual(probe.info().frozen, ['score', 'inv']);
});

test('freezeAt rejects an index that is not an item, and a name that is not a list', () => {
    const { probe } = project();
    for (const bad of [0, 4, 1.5, -1, '2', NaN]) assert.throws(() => probe.freezeAt('inv', bad), RangeError, String(bad));
    assert.throws(() => probe.freezeAt('inv', 4), /index 4 is outside 1\.\.3/);
    assert.throws(() => probe.freezeAt('score', 1), /no list named "score" \(a variable has that name\)/);
    assert.throws(() => probe.freezeAt('nope', 1), /no list named "nope"/);
    assert.deepEqual(probe.frozen(), []);
});

test('a held item never grows the list: it waits while the list is shorter and applies again once it is long enough', () => {
    const { vm, probe } = project();
    probe.freezeAt('inv', 3);
    probe.removeAt('inv', 3);
    probe.removeAt('inv', 2);
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), ['a']);
    probe.push('inv', 'x');
    probe.push('inv', 'y');
    runFrame(vm);
    assert.deepEqual(probe.list('inv'), ['a', 'x', 'c']);
});

test('a held item is reapplied around every step so scripts see it and monitors show it', () => {
    const { vm, probe } = project();
    let seenDuringStep;
    const original = vm.runtime._step;
    vm.runtime._step = function () {
        seenDuringStep = probe.list('inv')[1];
        return original.call(this);
    };
    probe.freezeAt('inv', 2, 'seen');
    probe.setAt('inv', 2, 'script wrote this');
    runFrame(vm);
    assert.equal(seenDuringStep, 'seen');
});

test('loading a savestate over a held item reports the list as frozen so the warning can name it', () => {
    const { probe } = project();
    probe.save('a');
    probe.freezeAt('inv', 1);
    assert.deepEqual(probe.load('a').frozen, ['inv']);
});

test('freezeAt on a list in another sprite uses the scope, and a held item survives its list being replaced', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true });
    addTarget(vm, { name: 'Cat', lists: { bag: ['x', 'y'] } });
    const probe = makeRebugger(vm);
    probe.freezeAt('bag', 2, 'held', { sprite: 'Cat' });
    assert.deepEqual(probe.frozen().map(f => [f.sprite, f.name, f.index]), [['Cat', 'bag', 2]]);
    probe.clear('bag', { sprite: 'Cat' });
    probe.push('bag', 'p', { sprite: 'Cat' });
    probe.push('bag', 'q', { sprite: 'Cat' });
    runFrame(vm);
    assert.deepEqual(probe.list('bag', { sprite: 'Cat' }), ['p', 'held']);
});
