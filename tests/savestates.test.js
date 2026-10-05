import { VirtualMachine, test, assert, addTarget, runFrame, project, catOf, stageOf } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

test('save and load restore variables and lists and report what they did', () => {
    const { probe } = project();
    const saved = probe.save('before');
    assert.deepEqual({ ...saved, takenAt: undefined }, { name: 'before', takenAt: undefined, targets: 3, clones: 0, variables: 3, lists: 1 });
    probe.set('score', 999);
    probe.set('hp', 1, { sprite: 'Cat' });
    probe.push('inv', 'extra');
    probe.clear('inv');
    const report = probe.load('before');
    assert.deepEqual(report, { name: 'before', targets: 3, variables: 4, recreated: 0, missingTargets: [], missingVariables: 0, frozen: [] });
    assert.equal(probe.get('score'), 5);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'c']);
});

test('load restores a list in place and flags its monitor stale', () => {
    const { vm, probe } = project();
    const inv = stageOf(vm).variables['Stage:inv'];
    const array = inv.value;
    probe.save('a');
    probe.clear('inv');
    inv._monitorUpToDate = true;
    probe.load('a');
    assert.equal(inv.value, array);
    assert.equal(inv._monitorUpToDate, false);
});

test('save and load restore sprite position, direction and visibility', () => {
    const { vm, probe } = project();
    const cat = catOf(vm);
    cat.setXY(10, 20, true);
    cat.setDirection(45);
    cat.setVisible(false);
    probe.save('pose');
    cat.setXY(-100, -50, true);
    cat.setDirection(-90);
    cat.setVisible(true);
    probe.load('pose');
    assert.deepEqual([cat.x, cat.y, cat.direction, cat.visible], [10, 20, 45, false]);
});

test('load with motion false leaves sprites where they are', () => {
    const { vm, probe } = project();
    const cat = catOf(vm);
    probe.save('pose');
    cat.setXY(77, 88, true);
    probe.set('hp', 1, { sprite: 'Cat' });
    probe.load('pose', { motion: false });
    assert.deepEqual([cat.x, cat.y], [77, 88]);
    assert.equal(probe.get('hp', { sprite: 'Cat' }), 10);
});

test('a sprite without costumes keeps a valid costume index through save and load', () => {
    const { vm, probe } = project();
    probe.save('a');
    probe.load('a');
    probe.save('b');
    assert.equal(catOf(vm).currentCostume, 0);
});

test('load without a name takes the latest save, and saving over a name makes it the latest', () => {
    const { probe } = project();
    probe.set('score', 1);
    probe.save('one');
    probe.set('score', 2);
    probe.save('two');
    probe.set('score', 3);
    probe.save('one');
    probe.set('score', 4);
    probe.load();
    assert.equal(probe.get('score'), 3);
    assert.deepEqual(probe.states().map(s => s.name), ['two', 'one']);
});

test('save without a name numbers the states and skips names already taken', () => {
    const { probe } = project();
    probe.save('state-1');
    assert.equal(probe.save().name, 'state-2');
    assert.equal(probe.info().savestates, 2);
});

test('load and drop name the available states when one is missing', () => {
    const { probe } = project();
    assert.throws(() => probe.load(), /no savestates yet/);
    probe.save('a');
    assert.throws(() => probe.load('b'), /no savestate named "b" \(have: a\)/);
    assert.throws(() => probe.drop('b'), /no savestate named "b"/);
    probe.drop('a');
    assert.deepEqual(probe.states(), []);
});

test('drop without a name removes the latest save', () => {
    const { probe } = project();
    probe.save('a');
    probe.save('b');
    probe.drop();
    assert.deepEqual(probe.states().map(s => s.name), ['a']);
});

test('load reports variables that are frozen and the freeze still wins', () => {
    const { vm, probe } = project();
    probe.save('a');
    probe.freeze('score', 50);
    const report = probe.load('a');
    assert.deepEqual(report.frozen, ['score']);
    assert.equal(probe.get('score'), 5);
    runFrame(vm);
    assert.equal(probe.get('score'), 50);
});

test('clones are saved only when asked and reported missing once they are gone', () => {
    const { vm, probe } = project();
    const clone = catOf(vm).makeClone();
    vm.runtime.addTarget(clone);
    assert.equal(probe.save('plain').clones, 0);
    assert.equal(probe.save('with', { clones: true }).clones, 1);
    assert.deepEqual(probe.load('plain').missingTargets, []);
    vm.runtime.disposeTarget(clone);
    assert.deepEqual(probe.load('with').missingTargets, [`clone:${clone.id}`]);
});

test('a clone that is still alive gets its own variables back', () => {
    const { vm, probe } = project();
    const clone = catOf(vm).makeClone();
    vm.runtime.addTarget(clone);
    probe.set('hp', 3, { sprite: 'Cat', clone: 1 });
    probe.save('with', { clones: true });
    probe.set('hp', 99, { sprite: 'Cat', clone: 1 });
    probe.load('with');
    assert.equal(probe.get('hp', { sprite: 'Cat', clone: 1 }), 3);
});

test('a deleted variable is reported missing unless recreate is set', () => {
    const { vm, probe } = project();
    probe.save('a');
    catOf(vm).deleteVariable('Cat:hp');
    stageOf(vm).deleteVariable('Stage:inv');
    const plain = probe.load('a');
    assert.equal(plain.missingVariables, 2);
    assert.equal(plain.recreated, 0);
    assert.equal(catOf(vm).variables['Cat:hp'], undefined);
    const realWarn = console.warn;
    console.warn = () => {};
    let recreated;
    try {
        recreated = probe.load('a', { recreate: true });
    } finally {
        console.warn = realWarn;
    }
    assert.equal(recreated.recreated, 2);
    assert.equal(catOf(vm).variables['Cat:hp'].value, 10);
    assert.equal(stageOf(vm).variables['Stage:inv'].type, 'list');
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'c']);
});

test('cloud variables are neither saved nor loaded', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { '☁ best': 1, score: 2 }, cloud: ['☁ best'] });
    const probe = makeRebugger(vm);
    assert.equal(probe.save('a').variables, 1);
    stageOf(vm).variables['Stage:☁ best'].value = 77;
    probe.load('a');
    assert.equal(stageOf(vm).variables['Stage:☁ best'].value, 77);
});

test('a very large list survives save and load', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, lists: { heap: Array.from({ length: 300000 }, (_, i) => i) } });
    const probe = makeRebugger(vm);
    probe.save('big');
    probe.clear('heap');
    assert.doesNotThrow(() => probe.load('big'));
    assert.equal(probe.list('heap').length, 300000);
    assert.equal(probe.list('heap')[299999], 299999);
});

test('a saved state is a copy, so later edits do not change it', () => {
    const { probe } = project();
    probe.save('a');
    probe.push('inv', 'z');
    probe.load('a');
    assert.deepEqual(probe.list('inv'), ['a', 'b', 'c']);
});

test('export and import round trip through JSON onto a freshly built project', () => {
    const first = project();
    first.probe.set('score', 321);
    catOf(first.vm).setXY(5, 6, true);
    first.probe.save('keep');
    const json = JSON.stringify(first.probe.export('keep'));
    const second = project();
    assert.equal(second.probe.import(json, 'imported').name, 'imported');
    second.probe.load('imported');
    assert.equal(second.probe.get('score'), 321);
    assert.deepEqual([catOf(second.vm).x, catOf(second.vm).y], [5, 6]);
});

test('export returns a copy and import rejects data that is not a savestate', () => {
    const { probe } = project();
    probe.save('a');
    probe.export('a').targets.length = 0;
    assert.equal(probe.export('a').targets.length, 3);
    assert.throws(() => probe.import({ version: 2 }), /not a rebugger savestate/);
    assert.throws(() => probe.import('{"version":1}'), /not a rebugger savestate/);
});

test('dispose leaves savestates alone', () => {
    const { probe } = project();
    probe.save('a');
    probe.dispose();
    assert.equal(probe.info().savestates, 1);
});
