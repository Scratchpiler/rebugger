import { test, assert, VirtualMachine, addTarget, runFrame, catBlocks, dogBlocks } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

const setup = () => {
    const vm = new VirtualMachine();
    const stage = addTarget(vm, { name: 'Stage', stage: true });
    stage.createVariable('msg', 'jump', 'broadcast_msg');
    stage.createVariable('msg2', 'game over', 'broadcast_msg');
    const cat = addTarget(vm, { name: 'Cat', blocks: catBlocks() });
    const dog = addTarget(vm, { name: 'Dog', blocks: dogBlocks() });
    let t = 0;
    const move = vm.runtime._primitives.motion_changexby;
    vm.runtime._primitives.motion_changexby = (args, util) => {
        move(args, util);
        vm.runtime.requestRedraw();
    };
    const probe = makeRebugger(vm, { clock: () => (t += 0.25) });
    vm.runtime.startHats('event_whenflagclicked');
    runFrame(vm);
    return { vm, probe, cat, dog };
};

const byScript = (probe, sprite) => probe.threads().find(row => row.sprite === sprite);

test('threads() lists every running script with what it is doing', () => {
    const { vm, probe } = setup();
    const rows = probe.threads();
    assert.equal(rows.length, 2);
    const cat = byScript(probe, 'Cat');
    assert.equal(cat.script, 'when flag clicked');
    assert.equal(cat.block, 'wait');
    assert.equal(cat.state, 'waiting');
    assert.equal(byScript(probe, 'Dog').block, 'wait until');
    assert.ok(rows.every(row => Number.isInteger(row.id)));
    probe.dispose();
    assert.ok(vm);
});

test('thread ids are stable across calls', () => {
    const { probe } = setup();
    const first = probe.threads().map(row => row.id);
    runFrame(probe.vm);
    assert.deepEqual(probe.threads().map(row => row.id), first);
    probe.dispose();
});

test('broadcast starts the listening scripts and returns them', () => {
    const { probe, cat } = setup();
    const started = probe.broadcast('jump');
    assert.equal(started.length, 1);
    assert.equal(started[0].sprite, 'Cat');
    assert.equal(started[0].script, 'when I receive jump');
    runFrame(probe.vm);
    assert.equal(cat.x, 5);
    probe.dispose();
});

test('broadcast matches case-insensitively and rejects unknown names with a suggestion', () => {
    const { probe } = setup();
    assert.equal(probe.broadcast('JUMP').length, 1);
    assert.throws(() => probe.broadcast('jmup'), /no broadcast named "jmup".*jump/);
    probe.dispose();
});

test('messages() lists broadcasts with how many scripts listen', () => {
    const { probe } = setup();
    assert.deepEqual(probe.messages(), [{ name: 'game over', listeners: 0 }, { name: 'jump', listeners: 1 }]);
    probe.dispose();
});

test('kill stops a script and it is gone after the next frame', () => {
    const { vm, probe } = setup();
    const dog = byScript(probe, 'Dog');
    assert.equal(probe.threads.kill(dog.id).sprite, 'Dog');
    assert.equal(byScript(probe, 'Dog').state, 'ended');
    runFrame(vm);
    assert.equal(byScript(probe, 'Dog'), undefined);
    assert.throws(() => probe.threads.kill(dog.id), /no thread #/);
    probe.dispose();
});

test('killAll can be limited to a sprite', () => {
    const { vm, probe } = setup();
    assert.equal(probe.threads.killAll({ sprite: 'Cat' }), 1);
    runFrame(vm);
    assert.deepEqual(probe.threads().map(row => row.sprite), ['Dog']);
    probe.dispose();
});

test('pause holds one script while the others run, step runs it for one frame', () => {
    const { vm, probe, cat } = setup();
    probe.broadcast('jump');
    runFrame(vm);
    const spin = probe.threads().find(row => row.script === 'when I receive jump');
    const before = cat.x;
    probe.threads.pause(spin.id);
    for (let i = 0; i < 4; i++) runFrame(vm);
    assert.equal(cat.x, before);
    assert.equal(probe.threads().find(row => row.id === spin.id).state, 'paused');
    probe.threads.step(spin.id);
    runFrame(vm);
    assert.equal(cat.x, before + 5);
    runFrame(vm);
    assert.equal(cat.x, before + 5);
    probe.threads.resume(spin.id);
    runFrame(vm);
    assert.equal(cat.x, before + 10);
    probe.dispose();
});

test('a paused script does not keep the sequencer looping within a frame', () => {
    const { vm, probe } = setup();
    probe.threads.killAll();
    runFrame(vm);
    probe.broadcast('jump');
    runFrame(vm);
    probe.threads.pause(probe.threads()[0].id);
    let calls = 0;
    const wrapped = vm.runtime.sequencer.stepThread;
    vm.runtime.sequencer.stepThread = function (thread) {
        calls++;
        return wrapped.call(this, thread);
    };
    runFrame(vm);
    assert.ok(calls <= 2, `stepThread ran ${calls} times in one frame`);
    probe.dispose();
});

test('step needs a paused script', () => {
    const { probe } = setup();
    assert.throws(() => probe.threads.step(byScript(probe, 'Dog').id), /not paused/);
    probe.dispose();
});

test('the sequencer is put back once nothing is paused or profiled', () => {
    const { vm, probe } = setup();
    const dog = byScript(probe, 'Dog');
    probe.threads.pause(dog.id);
    assert.ok(Object.hasOwn(vm.runtime.sequencer, 'stepThread'));
    probe.threads.resume(dog.id);
    assert.ok(!Object.hasOwn(vm.runtime.sequencer, 'stepThread'));
    probe.threads.profile(true);
    assert.ok(Object.hasOwn(vm.runtime.sequencer, 'stepThread'));
    probe.threads.profile(false);
    assert.ok(!Object.hasOwn(vm.runtime.sequencer, 'stepThread'));
    probe.dispose();
});

test('profile measures milliseconds per frame for each script', () => {
    const { vm, probe } = setup();
    assert.equal(byScript(probe, 'Cat').ms, 0);
    probe.threads.profile(true);
    for (let i = 0; i < 5; i++) runFrame(vm);
    assert.ok(byScript(probe, 'Cat').ms > 0);
    probe.threads.profile(false);
    assert.equal(byScript(probe, 'Cat').ms, 0);
    probe.dispose();
});

test('frames shows the stack from the hat to the block that is running', () => {
    const { probe } = setup();
    const [frame] = probe.threads.frames(byScript(probe, 'Cat').id);
    assert.equal(frame.title, 'when flag clicked');
    assert.deepEqual(frame.blocks.map(b => [b.label, b.current]), [['forever', false], ['wait', true]]);
});

test('restart starts a script again from its hat under a new id', () => {
    const { vm, probe, cat } = setup();
    probe.broadcast('jump');
    runFrame(vm);
    const spin = probe.threads().find(row => row.script === 'when I receive jump');
    const fresh = probe.threads.restart(spin.id);
    assert.notEqual(fresh.id, spin.id);
    assert.equal(fresh.script, 'when I receive jump');
    runFrame(vm);
    assert.ok(cat.x >= 10);
    probe.dispose();
});

test('scripts() lists hat scripts and startScript runs one like a click', () => {
    const { vm, probe } = setup();
    const rows = probe.scripts();
    assert.deepEqual(rows.map(row => `${row.sprite}: ${row.script}`).sort(), ['Cat: when I receive jump', 'Cat: when flag clicked', 'Dog: when flag clicked'].sort());
    probe.threads.killAll();
    runFrame(vm);
    const row = probe.startScript('Dog: when flag clicked');
    assert.equal(row.sprite, 'Dog');
    assert.equal(probe.threads().length, 1);
    assert.throws(() => probe.startScript('Dog: when flag clickd'), /no script.*Dog: when flag clicked/);
    probe.dispose();
});

test('monitor threads are hidden unless asked for', () => {
    const { vm, probe } = setup();
    vm.runtime._pushThread('flag', vm.runtime.targets[1], { updateMonitor: true });
    assert.equal(probe.threads().length, 2);
    assert.equal(probe.threads({ monitors: true }).length, 3);
    probe.dispose();
});

const loudSetup = () => {
    const page = setup();
    page.probe.dispose();
    const probe = makeRebugger(page.vm, { announce: true });
    return { ...page, probe };
};

const heard = (run) => {
    const lines = [];
    const real = { info: console.info, warn: console.warn };
    console.info = (format, ...rest) => lines.push(format.replace(/%c/g, ''), ...rest.filter(part => typeof part !== 'string' || !part.startsWith('color')));
    console.warn = console.info;
    try {
        run();
    } finally {
        Object.assign(console, real);
    }
    return lines.join(' ').replace(/\s+/g, ' ');
};

test('the console says what thread commands did', () => {
    const { vm, probe } = loudSetup();
    const dog = probe.threads().find(row => row.sprite === 'Dog');
    assert.match(heard(() => probe.broadcast('jump')), /broadcast "jump": started 1 script on Cat/);
    assert.match(heard(() => probe.threads.pause(dog.id)), /paused thread #\d+ \(Dog: when flag clicked\)/);
    assert.match(heard(() => probe.threads.resume(dog.id)), /resumed thread/);
    assert.match(heard(() => probe.threads.kill(dog.id)), /killed thread #\d+ \(Dog: when flag clicked\)/);
    assert.match(heard(() => probe.startScript('Dog: when flag clicked')), /started Dog: when flag clicked as thread #\d+/);
    assert.match(heard(() => probe.threads.killAll()), /killed \d+ threads/);
    assert.ok(vm);
    probe.dispose();
});

test('a quiet console stays quiet about threads', () => {
    const { probe } = setup();
    assert.equal(heard(() => probe.broadcast('jump')), '');
    probe.dispose();
});
