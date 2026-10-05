import { VirtualMachine, test, assert, addTarget, runFrame, project, rigged, counted } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

test('dispose releases every hook', () => {
    const { vm, probe } = project();
    const original = vm.runtime._step;
    probe.freeze('score', 1);
    probe.watch('inv', () => {}, { kind: 'list' });
    probe.dispose();
    assert.equal(vm.runtime._step, original);
    assert.deepEqual(probe.info().frozen, []);
});

test('a step wrapped by someone else after us is left in place', () => {
    const { vm, probe } = project();
    const stop = probe.watch('score', () => {});
    const ours = vm.runtime._step;
    const theirs = function (...args) { return ours.apply(this, args); };
    vm.runtime._step = theirs;
    stop();
    assert.equal(vm.runtime._step, theirs);
    assert.doesNotThrow(() => runFrame(vm));
});

test('speed runs several frames per tick when above 1 and skips ticks when below 1', () => {
    const rig = rigged();
    const counter = counted(rig);
    rig.probe.speed(3);
    rig.frame();
    rig.frame();
    assert.equal(counter.frames, 6);
    counter.frames = 0;
    rig.probe.speed(0.25);
    for (let i = 0; i < 8; i++) rig.frame();
    assert.equal(counter.frames, 2);
    counter.frames = 0;
    rig.probe.speed(1.5);
    for (let i = 0; i < 4; i++) rig.frame();
    assert.equal(counter.frames, 6);
});

test('speed reads back, defaults to 1 and releases the step hook at 1', () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    assert.equal(rig.probe.speed(), 1);
    assert.equal(rig.probe.speed(2), 2);
    assert.equal(rig.probe.speed(), 2);
    assert.notEqual(rig.vm.runtime._step, original);
    rig.probe.speed(1);
    assert.equal(rig.vm.runtime._step, original);
    assert.equal(rig.probe.info().speed, 1);
});

test('speed rejects zero, negatives and non-numbers, pointing at pause', () => {
    const { probe } = project();
    assert.throws(() => probe.speed(0), /pause\(\)/);
    assert.throws(() => probe.speed(-1), RangeError);
    assert.throws(() => probe.speed('fast'), RangeError);
    assert.throws(() => probe.speed(NaN), RangeError);
});

test('speed is capped per tick so a huge number cannot hang the page', () => {
    const rig = rigged();
    const counter = counted(rig);
    rig.probe.speed(1e9);
    rig.frame();
    assert.equal(counter.frames, 1000);
});

test('speed Infinity runs frames until half a frame of time is spent, and at least one', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 } });
    let now = 0;
    const probe = makeRebugger(vm, { clock: () => (now += 5) });
    let frames = 0;
    const original = vm.runtime._step;
    vm.runtime._step = function () { frames++; return original.call(this); };
    probe.speed(Infinity);
    runFrame(vm);
    assert.ok(frames >= 1 && frames < 10, `ran ${frames} frames`);
    now = 0;
    probe.speed(1);
    assert.equal(probe.speed(), 1);
});

test('speed Infinity still runs one frame when the clock is slow', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 } });
    const probe = makeRebugger(vm, { clock: (() => { let t = 0; return () => (t += 1000); })() });
    let frames = 0;
    const original = vm.runtime._step;
    vm.runtime._step = function () { frames++; return original.call(this); };
    probe.speed(Infinity);
    runFrame(vm);
    assert.equal(frames, 1);
});

test('speed keeps freezes, watches and recordings running on every extra frame', () => {
    const rig = rigged();
    const seen = [];
    rig.probe.watch('score', value => seen.push(value));
    rig.probe.speed(2);
    rig.probe.startrec('r');
    rig.probe.freeze('hp', 3);
    rig.frame();
    rig.probe.set('score', 4);
    rig.frame();
    assert.equal(rig.probe.stoprec().frames, 5);
    assert.equal(rig.probe.get('hp', { sprite: 'Cat' }), 3);
    assert.deepEqual(seen, [4]);
});

test('pause stops the project and resume continues it', () => {
    const rig = rigged();
    const counter = counted(rig);
    rig.frame();
    rig.probe.pause();
    rig.frame();
    rig.frame();
    assert.equal(counter.frames, 1);
    assert.equal(rig.probe.info().paused, true);
    rig.probe.resume();
    rig.frame();
    assert.equal(counter.frames, 2);
    assert.equal(rig.probe.info().paused, false);
});

test('pause and resume release the step hook and tolerate being repeated', () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    rig.probe.pause();
    rig.probe.pause();
    assert.notEqual(rig.vm.runtime._step, original);
    rig.probe.resume();
    rig.probe.resume();
    assert.equal(rig.vm.runtime._step, original);
});

test('step runs exactly n frames while paused and returns n', () => {
    const rig = rigged();
    const counter = counted(rig);
    rig.probe.pause();
    assert.equal(rig.probe.step(), 1);
    assert.equal(counter.frames, 1);
    assert.equal(rig.probe.step(4), 4);
    assert.equal(counter.frames, 5);
    rig.frame();
    assert.equal(counter.frames, 5);
});

test('step applies freezes and notifies watchers like a normal frame', () => {
    const rig = rigged();
    const seen = [];
    rig.probe.watch('score', (now, before) => seen.push([before, now]));
    rig.probe.freeze('hp', 9);
    rig.probe.pause();
    rig.probe.set('hp', 1);
    rig.probe.set('score', 8);
    assert.equal(rig.probe.get('hp'), 1);
    rig.probe.step();
    assert.equal(rig.probe.get('hp'), 9);
    assert.deepEqual(seen, [[0, 8]]);
});

test('step rejects use while running and bad counts', () => {
    const rig = rigged();
    assert.throws(() => rig.probe.step(), /pause\(\) first/);
    rig.probe.pause();
    assert.throws(() => rig.probe.step(0), RangeError);
    assert.throws(() => rig.probe.step(1.5), RangeError);
    assert.throws(() => rig.probe.step('2'), RangeError);
});

test('project time advances one frame per frame at any speed, and not at all while paused', () => {
    const rig = rigged();
    const { runtime } = rig.vm;
    const frameMs = 1000 / 30;
    rig.probe.speed(2);
    rig.frame();
    const start = runtime.currentMSecs;
    rig.frame();
    rig.frame();
    assert.ok(Math.abs(runtime.currentMSecs - start - 4 * frameMs) < 0.01);
    rig.probe.speed(1);
    rig.probe.pause();
    const held = runtime.currentMSecs;
    rig.frame();
    rig.frame();
    assert.equal(runtime.currentMSecs, held);
    rig.probe.step(3);
    assert.ok(Math.abs(runtime.currentMSecs - held - 3 * frameMs) < 0.01);
});

test('project time carries on from where it was when speed returns to 1', () => {
    const rig = rigged();
    const { runtime } = rig.vm;
    rig.probe.speed(10);
    for (let i = 0; i < 30; i++) rig.frame();
    const scaled = runtime.currentMSecs;
    rig.probe.speed(1);
    rig.frame();
    assert.ok(Math.abs(runtime.currentMSecs - scaled) < 100, `jumped by ${runtime.currentMSecs - scaled}`);
});

test('a wait block counts project time, so it finishes in fewer ticks at higher speed', () => {
    const waitScript = [
        { id: 'hat', opcode: 'event_whenflagclicked', next: 'wait', parent: null, topLevel: true, shadow: false, inputs: {}, fields: {} },
        {
            id: 'wait', opcode: 'control_wait', next: 'set', parent: 'hat', topLevel: false, shadow: false,
            inputs: { DURATION: { name: 'DURATION', block: 'secs', shadow: 'secs' } }, fields: {},
        },
        { id: 'secs', opcode: 'math_positive_number', next: null, parent: 'wait', topLevel: false, shadow: true, inputs: {}, fields: { NUM: { name: 'NUM', value: '1' } } },
        {
            id: 'set', opcode: 'data_setvariableto', next: null, parent: 'wait', topLevel: false, shadow: false,
            inputs: { VALUE: { name: 'VALUE', block: 'done', shadow: 'done' } },
            fields: { VARIABLE: { name: 'VARIABLE', id: 'Stage:score', value: 'score' } },
        },
        { id: 'done', opcode: 'text', next: null, parent: 'set', topLevel: false, shadow: true, inputs: {}, fields: { TEXT: { name: 'TEXT', value: 'done' } } },
    ];
    const ticksUntilDone = speed => {
        const vm = new VirtualMachine();
        addTarget(vm, { name: 'Stage', stage: true, vars: { score: 0 }, blocks: waitScript });
        const probe = makeRebugger(vm);
        probe.speed(speed);
        vm.runtime.toggleScript('hat', { target: vm.runtime.getTargetForStage() });
        let ticks = 0;
        while (probe.get('score') !== 'done' && ticks < 500) { runFrame(vm); ticks++; }
        return ticks;
    };
    const double = ticksUntilDone(2);
    const quintuple = ticksUntilDone(5);
    assert.ok(double >= 14 && double <= 17, `2x took ${double} ticks`);
    assert.ok(quintuple >= 5 && quintuple <= 8, `5x took ${quintuple} ticks`);
});

test('pause freezes recording time and playback time, and step advances them one frame', () => {
    const rig = rigged();
    rig.probe.startrec('r');
    rig.frame();
    rig.probe.pause();
    rig.clock.t += 5000;
    rig.probe.step();
    rig.probe.resume();
    rig.frame();
    const { frames, seconds } = rig.probe.stoprec();
    assert.equal(frames, 4);
    assert.ok(seconds < 0.5, `recording spans ${seconds}s`);
});

test('dispose releases speed and pause and puts the clock method back', () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    const hadOwn = Object.hasOwn(rig.vm.runtime, 'updateCurrentMSecs');
    rig.probe.speed(3);
    rig.probe.pause();
    assert.ok(Object.hasOwn(rig.vm.runtime, 'updateCurrentMSecs'));
    rig.probe.dispose();
    assert.equal(rig.probe.speed(), 1);
    assert.equal(rig.probe.info().paused, false);
    assert.equal(rig.vm.runtime._step, original);
    assert.equal(Object.hasOwn(rig.vm.runtime, 'updateCurrentMSecs'), hadOwn);
});
