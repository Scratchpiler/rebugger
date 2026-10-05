import { test, assert, addTarget, flight } from './helpers.js';

test('scan finds every variable holding a value, across sprites', () => {
    const { probe } = flight();
    const hits = probe.scan(100);
    assert.deepEqual(hits.map(h => [h.sprite, h.name]).sort(), [['Plane', 'fuel'], ['Stage', 'score']]);
});

test('grep is the same function as scan', () => {
    const { probe } = flight();
    assert.equal(probe.grep, probe.scan);
    assert.equal(probe.grep(5000).length, 1);
    assert.equal(probe.grep.results().length, 1);
});

test('scan compares numbers and numeric strings by value and text case-insensitively', () => {
    const { vm, probe } = flight();
    vm.runtime.targets.find(t => t.isStage).variables['Stage:score'].value = '100';
    assert.equal(probe.scan(100).length, 2);
    probe.scan.reset();
    assert.deepEqual(probe.scan('HELLO').map(h => h.name), ['label']);
});

test('scan within tolerates a displayed value that is rounded', () => {
    const { probe } = flight();
    assert.deepEqual(probe.scan(5001, { within: 1 }).map(h => h.name), ['alt']);
});

test('a second scan narrows the first and reflects changes made in between', () => {
    const { probe } = flight();
    probe.scan(100);
    probe.set('fuel', 90, { sprite: 'Plane' });
    assert.deepEqual(probe.scan(90).map(h => h.name), ['fuel']);
    assert.deepEqual(probe.scan(100), []);
});

test('scan accepts a predicate that gets the current and previous value', () => {
    const { probe } = flight();
    assert.deepEqual(probe.scan(value => value > 200).map(h => h.name).sort(), ['alt', 'speed']);
});

test('snapshot then changed and increased find a moving variable', () => {
    const { probe } = flight();
    assert.ok(probe.scan.snapshot() >= 5);
    probe.set('alt', 5200);
    probe.set('fuel', 99, { sprite: 'Plane' });
    assert.deepEqual(probe.scan.changed().map(h => h.name).sort(), ['alt', 'fuel']);
    probe.set('alt', 5400);
    probe.set('fuel', 98, { sprite: 'Plane' });
    assert.deepEqual(probe.scan.increased().map(h => h.name), ['alt']);
    assert.deepEqual(probe.scan.unchanged().map(h => h.name), ['alt']);
    probe.set('alt', 100);
    assert.deepEqual(probe.scan.decreased().map(h => h.name), ['alt']);
});

test('changed without a scan in progress explains how to start one', () => {
    const { probe } = flight();
    assert.throws(() => probe.scan.changed(), /no scan in progress/);
});

test('reset starts over and results reads the hits without narrowing', () => {
    const { probe } = flight();
    probe.scan(5000);
    assert.equal(probe.scan(1).length, 0);
    assert.deepEqual(probe.scan.results(), []);
    probe.scan.reset();
    assert.equal(probe.scan(5000).length, 1);
    assert.equal(probe.info().scanning, 1);
    probe.dispose();
    assert.equal(probe.info().scanning, null);
});

test('scan skips clones unless asked and numbers the ones it includes', () => {
    const { vm, probe } = flight();
    const plane = vm.runtime.targets.find(t => t.sprite.name === 'Plane');
    vm.runtime.addTarget(plane.makeClone());
    assert.equal(probe.scan(5000).length, 1);
    probe.scan.reset();
    const hits = probe.scan(5000, { clones: true });
    assert.deepEqual(hits.map(h => h.clone).sort(), [0, 1]);
});

test('a scan hit can be handed straight to set', () => {
    const { vm, probe } = flight();
    const [hit] = probe.scan(5000);
    probe.set(hit.name, 9000, { sprite: hit.sprite, clone: hit.clone });
    assert.equal(vm.runtime.targets.find(t => t.sprite.name === 'Plane').variables['Plane:alt'].value, 9000);
});

test('a scan drops variables that were deleted in between', () => {
    const { vm, probe } = flight();
    probe.scan(100);
    vm.runtime.targets.find(t => t.sprite.name === 'Plane').deleteVariable('Plane:fuel');
    assert.deepEqual(probe.scan(100).map(h => h.name), ['score']);
});
