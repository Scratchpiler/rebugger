import { test, assert, runFrame, project } from './helpers.js';

test('watch reports changes made by scripts and stops when asked', () => {
    const { vm, probe } = project();
    const seen = [];
    const stop = probe.watch('score', (now, before, name) => seen.push([name, before, now]));
    vm.greenFlag();
    runFrame(vm);
    assert.deepEqual(seen, [['score', 5, 6]]);
    runFrame(vm);
    assert.equal(seen.length, 1);
    stop();
    vm.greenFlag();
    runFrame(vm);
    assert.equal(seen.length, 1);
});

test('watch on a list sees edits and compares by content', () => {
    const { vm, probe } = project();
    const seen = [];
    probe.watch('inv', (now, before) => seen.push([before, now]), { kind: 'list' });
    runFrame(vm);
    assert.equal(seen.length, 0);
    probe.push('inv', 'd');
    runFrame(vm);
    assert.deepEqual(seen, [[['a', 'b', 'c'], ['a', 'b', 'c', 'd']]]);
});

test('a throwing watcher does not break the frame', () => {
    const { vm, probe } = project();
    const realError = console.error;
    console.error = () => {};
    try {
        probe.watch('score', () => { throw new Error('boom'); });
        probe.set('score', 7);
        assert.doesNotThrow(() => runFrame(vm));
    } finally {
        console.error = realError;
    }
});
