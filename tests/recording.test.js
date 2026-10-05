import { VirtualMachine, test, assert, addTarget, project, catOf, stageOf, rigged, scoreAfterFrames } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';

test('startrec samples at start and every frame, and stoprec summarizes the recording', () => {
    const { vm, probe, frame } = rigged();
    const original = vm.runtime._step;
    const started = probe.startrec('first');
    assert.equal(started.recording, true);
    assert.notEqual(vm.runtime._step, original);
    frame();
    frame();
    const stopped = probe.stoprec();
    assert.deepEqual(stopped, { name: 'first', recording: false, frames: 3, seconds: 0.2, variables: 2, sprites: 2, dropped: 0, stoppedBy: 'stoprec' });
    assert.equal(vm.runtime._step, original);
    assert.deepEqual(probe.recs(), [stopped]);
});

test('playrec at speed 1 replays the recorded values one frame at a time', async () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.set('score', 99);
    const handle = rig.probe.playrec('r', 1);
    assert.equal(rig.probe.get('score'), 0);
    assert.deepEqual(scoreAfterFrames(rig, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(await handle.done, { completed: true });
    assert.equal(rig.probe.info().playing, null);
});

test('playrec at speed 2 skips frames and finishes sooner', () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.playrec('r', 2);
    assert.deepEqual(scoreAfterFrames(rig, 3), [2, 4, 5]);
});

test('playrec at a fractional speed plays in slow motion', () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.playrec('r', 0.5);
    assert.deepEqual(scoreAfterFrames(rig, 4), [0, 1, 1, 2]);
});

test('playrec at speed 0 holds the first frame until the speed changes', () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 0);
    assert.deepEqual(scoreAfterFrames(rig, 3), [0, 0, 0]);
    handle.speed(1);
    assert.deepEqual(scoreAfterFrames(rig, 2), [1, 2]);
    assert.equal(handle.speed(), 1);
});

test('playrec at Infinity jumps to the last frame and releases the step hook', async () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    rig.record('r');
    const handle = rig.probe.playrec('r', Infinity);
    assert.equal(rig.probe.get('score'), 5);
    assert.deepEqual(await handle.done, { completed: true });
    assert.equal(rig.vm.runtime._step, original);
});

test('seek jumps within the recording and position reports where it is', () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 0);
    handle.seek(0.5);
    assert.equal(rig.probe.get('score'), 2);
    assert.equal(handle.position(), 0.5);
    handle.seek(7);
    assert.equal(rig.probe.get('score'), 5);
    assert.equal(handle.position(), 1);
    handle.seek(-3);
    assert.equal(rig.probe.get('score'), 0);
});

test('stop ends playback early and leaves the current frame in place', async () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 1);
    scoreAfterFrames(rig, 2);
    handle.stop();
    assert.deepEqual(await handle.done, { completed: false });
    assert.deepEqual(scoreAfterFrames(rig, 2), [2, 2]);
    handle.seek(1);
    assert.equal(rig.probe.get('score'), 2);
});

test('stopplay stops whatever is playing', async () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 1);
    rig.probe.stopplay();
    assert.deepEqual(await handle.done, { completed: false });
    assert.equal(rig.probe.info().playing, null);
    assert.doesNotThrow(() => rig.probe.stopplay());
});

test('starting a second playback stops the first', async () => {
    const rig = rigged();
    rig.record('r');
    const first = rig.probe.playrec('r', 1);
    rig.probe.playrec('r', 1);
    assert.deepEqual(await first.done, { completed: false });
});

test('restore puts the project back the way it was when playback ends', () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.set('score', 99);
    rig.probe.set('hp', 42, { sprite: 'Cat' });
    rig.probe.playrec('r', Infinity, { restore: true });
    assert.equal(rig.probe.get('score'), 99);
    assert.equal(rig.probe.get('hp', { sprite: 'Cat' }), 42);
});

test('without restore the project is left at the last frame', () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.set('score', 99);
    rig.probe.playrec('r', Infinity);
    assert.equal(rig.probe.get('score'), 5);
});

test('sprite position is recorded and replayed', () => {
    const rig = rigged();
    const cat = catOf(rig.vm);
    rig.probe.startrec('walk');
    for (const x of [10, 20, 30]) { cat.setXY(x, -x, true); rig.frame(); }
    rig.probe.stoprec();
    cat.setXY(500, 500, true);
    rig.probe.playrec('walk', Infinity);
    assert.deepEqual([cat.x, cat.y], [30, -30]);
    rig.probe.playrec('walk', 0).seek(0);
    assert.deepEqual([cat.x, cat.y], [0, 0]);
});

test('motion false leaves sprites out of the recording and out of playback', () => {
    const rig = rigged();
    const cat = catOf(rig.vm);
    const stopped = rig.record('quiet', [1, 2], { motion: false });
    assert.equal(stopped.sprites, 0);
    cat.setXY(9, 9, true);
    rig.probe.playrec('quiet', Infinity);
    assert.deepEqual([cat.x, cat.y], [9, 9]);
});

test('only, except and sprite choose which variables are recorded', () => {
    const rig = rigged();
    assert.equal(rig.record('a', [1], { only: ['hp'] }).variables, 1);
    assert.equal(rig.record('b', [1], { only: /sco/ }).variables, 1);
    assert.equal(rig.record('c', [1], { except: ['score'] }).variables, 1);
    const cat = rig.record('d', [1], { sprite: 'Cat' });
    assert.deepEqual([cat.variables, cat.sprites], [1, 1]);
});

test('an only filter that matches nothing is an error unless sprites are still recorded', () => {
    const rig = rigged();
    assert.equal(rig.record('x', [1], { only: ['nope'] }).variables, 0);
    assert.throws(() => rig.probe.startrec('y', { only: ['nope'], motion: false }), /nothing to record/);
});

test('lists are recorded only when asked and replay with their contents', () => {
    const rig = rigged();
    assert.equal(rig.record('plain', [1]).variables, 2);
    rig.probe.startrec('with', { lists: true });
    rig.probe.push('log', 'a');
    rig.frame();
    rig.probe.push('log', 'b');
    rig.frame();
    rig.frame();
    const stopped = rig.probe.stoprec();
    assert.equal(stopped.variables, 3);
    rig.probe.clear('log');
    rig.probe.playrec('with', Infinity);
    assert.deepEqual(rig.probe.list('log'), ['a', 'b']);
    rig.probe.playrec('with', 0).seek(0.34);
    assert.deepEqual(rig.probe.list('log'), ['a']);
    rig.probe.stopplay();
});

test('cloud variables are never recorded', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { '☁ best': 1, score: 2 }, cloud: ['☁ best'] });
    const probe = makeRebugger(vm);
    assert.equal(probe.startrec('r').variables, 1);
    probe.stoprec();
});

test('maxFrames keeps only the latest frames and counts what it dropped', () => {
    const rig = rigged();
    const stopped = rig.record('ring', [1, 2, 3, 4, 5], { maxFrames: 3 });
    assert.deepEqual([stopped.frames, stopped.dropped], [3, 3]);
    rig.probe.playrec('ring', 0).seek(0);
    assert.equal(rig.probe.get('score'), 3);
    rig.probe.stopplay();
});

test('until stops the recording itself, keeping a tail of frames after the trigger', () => {
    const rig = rigged();
    rig.probe.startrec('crash', { until: () => rig.probe.get('score') >= 3, tail: 1 });
    for (const score of [1, 2, 3, 4, 5]) {
        rig.probe.set('score', score);
        rig.frame();
    }
    assert.equal(rig.probe.info().recording, null);
    const [summary] = rig.probe.recs();
    assert.deepEqual([summary.frames, summary.stoppedBy], [5, 'until']);
    assert.throws(() => rig.probe.stoprec(), /not recording/);
});

test('until with no tail stops on the triggering frame', () => {
    const rig = rigged();
    rig.probe.startrec('crash', { until: () => rig.probe.get('score') === 2 });
    for (const score of [1, 2, 3]) { rig.probe.set('score', score); rig.frame(); }
    assert.equal(rig.probe.recs()[0].frames, 3);
});

test('an until that throws stops the recording instead of looping on the error', () => {
    const rig = rigged();
    const realError = console.error;
    const errors = [];
    console.error = (...args) => errors.push(args);
    try {
        rig.probe.startrec('bad', { until: () => { throw new Error('nope'); } });
    } finally {
        console.error = realError;
    }
    assert.equal(errors.length, 1);
    assert.equal(rig.probe.info().recording, null);
});

test('startrec names recordings itself and accepts options as the first argument', () => {
    const rig = rigged();
    assert.equal(rig.probe.startrec().name, 'rec-1');
    rig.probe.stoprec();
    assert.equal(rig.probe.startrec({ only: ['hp'] }).name, 'rec-2');
    assert.equal(rig.probe.stoprec().variables, 1);
});

test('startrec and playrec reject bad use with messages that say what to do', () => {
    const rig = rigged();
    assert.throws(() => rig.probe.stoprec(), /not recording/);
    rig.probe.startrec('a');
    assert.throws(() => rig.probe.startrec('b'), /already recording "a": stoprec\(\) first/);
    assert.throws(() => rig.probe.playrec('a'), /still recording/);
    rig.probe.stoprec();
    assert.throws(() => rig.probe.playrec('zzz'), /no recording named "zzz" \(have: a\)/);
    assert.throws(() => rig.probe.playrec('a', -1), RangeError);
    assert.throws(() => rig.probe.playrec('a', NaN), RangeError);
    assert.throws(() => rig.probe.playrec('a', '2'), RangeError);
    assert.throws(() => rig.probe.startrec('c', { maxFrames: 0 }), RangeError);
    assert.throws(() => rig.probe.startrec('c', { until: 5 }), TypeError);
    const handle = rig.probe.playrec('a', 0);
    assert.throws(() => handle.speed(-2), RangeError);
    handle.stop();
});

test('playrec with no name plays the latest recording and droprec removes one', () => {
    const rig = rigged();
    rig.record('old', [1]);
    rig.record('new', [7, 8]);
    rig.probe.playrec(undefined, Infinity);
    assert.equal(rig.probe.get('score'), 8);
    rig.probe.droprec('new');
    assert.deepEqual(rig.probe.recs().map(r => r.name), ['old']);
    assert.throws(() => rig.probe.droprec('new'), /no recording named "new"/);
});

test('re-recording over a name replaces it and makes it the latest', () => {
    const rig = rigged();
    rig.record('a', [1]);
    rig.record('b', [2]);
    rig.record('a', [3, 3]);
    assert.deepEqual(rig.probe.recs().map(r => r.name), ['b', 'a']);
    assert.equal(rig.probe.recs()[1].frames, 3);
});

test('a freeze still wins over playback', () => {
    const rig = rigged();
    rig.record('r');
    rig.probe.freeze('score', 77);
    rig.probe.playrec('r', 1);
    assert.deepEqual(scoreAfterFrames(rig, 3), [77, 77, 77]);
});

test('playback copes with a variable deleted after recording', () => {
    const rig = rigged();
    rig.record('r');
    stageOf(rig.vm).deleteVariable('Stage:score');
    assert.doesNotThrow(() => rig.probe.playrec('r', Infinity));
    assert.equal(stageOf(rig.vm).variables['Stage:score'], undefined);
});

test('a variable deleted while recording leaves a gap instead of breaking the recording', () => {
    const rig = rigged();
    rig.probe.startrec('r');
    rig.frame();
    stageOf(rig.vm).deleteVariable('Stage:score');
    rig.frame();
    assert.equal(rig.probe.stoprec().frames, 3);
});

test('a recorded clone that has since been disposed is skipped on playback', () => {
    const rig = rigged();
    const clone = catOf(rig.vm).makeClone();
    rig.vm.runtime.addTarget(clone);
    rig.probe.startrec('with', { clones: true });
    rig.frame();
    rig.probe.stoprec();
    rig.vm.runtime.disposeTarget(clone);
    assert.doesNotThrow(() => rig.probe.playrec('with', Infinity));
});

test('dispose ends a recording and a playback but keeps the recordings', () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    rig.record('kept');
    rig.probe.startrec('live');
    rig.probe.dispose();
    assert.equal(rig.probe.info().recording, null);
    assert.deepEqual(rig.probe.recs().map(r => [r.name, r.stoppedBy]), [['kept', 'stoprec'], ['live', 'dispose']]);
    rig.probe.playrec('kept', 0);
    rig.probe.dispose();
    assert.equal(rig.probe.info().playing, null);
    assert.equal(rig.vm.runtime._step, original);
});

test('recording and watching share the step hook and release it together', () => {
    const rig = rigged();
    const original = rig.vm.runtime._step;
    const stop = rig.probe.watch('score', () => {});
    rig.probe.startrec('r');
    stop();
    assert.notEqual(rig.vm.runtime._step, original);
    rig.probe.stoprec();
    assert.equal(rig.vm.runtime._step, original);
});

test('the default clock is the page performance clock', () => {
    const { probe } = project();
    probe.startrec('real');
    const stopped = probe.stoprec();
    assert.equal(stopped.frames, 1);
});

const settled = async promise => Promise.race([promise, Promise.resolve('pending')]);

test('a parked replay stays open on its last frame, paused, until it is stopped', async () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 1, { park: true });
    assert.deepEqual(scoreAfterFrames(rig, 8), [1, 2, 3, 4, 5, 5, 5, 5]);
    assert.equal(rig.probe.info().playing, 'r');
    assert.equal(handle.speed(), 0);
    assert.equal(handle.position(), 1);
    assert.equal(rig.probe.replay(), handle);
    assert.equal(await settled(handle.done), 'pending');
    handle.seek(0);
    handle.speed(1);
    assert.deepEqual(scoreAfterFrames(rig, 2), [1, 2]);
    handle.stop();
    assert.deepEqual(await handle.done, { completed: false });
    assert.equal(rig.probe.replay(), null);
});

test('a looping replay wraps from the last frame back to the first and keeps playing', () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 1, { loop: true });
    assert.equal(handle.loop(), true);
    assert.deepEqual(scoreAfterFrames(rig, 7), [1, 2, 3, 4, 5, 1, 2]);
    assert.equal(rig.probe.info().playing, 'r');
    assert.equal(handle.loop(false), false);
    assert.deepEqual(scoreAfterFrames(rig, 4), [3, 4, 5, 5]);
    assert.equal(rig.probe.info().playing, null);
});

test('loop is ignored at Infinity speed, which still jumps to the end and finishes', async () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', Infinity, { loop: true });
    assert.deepEqual(await handle.done, { completed: true });
    assert.equal(rig.probe.get('score'), 5);
});

test('seekFrame lands exactly on a frame and frame, time and duration describe where it is', () => {
    const rig = rigged();
    rig.record('r');
    const handle = rig.probe.playrec('r', 0);
    assert.equal(handle.frames, 6);
    assert.equal(handle.duration, 500);
    assert.equal(handle.frame(), 0);
    assert.equal(handle.time(), 0);
    handle.seekFrame(3);
    assert.deepEqual([handle.frame(), handle.time(), rig.probe.get('score')], [3, 300, 3]);
    handle.seekFrame(99);
    assert.deepEqual([handle.frame(), rig.probe.get('score')], [5, 5]);
    handle.seekFrame(-4);
    assert.deepEqual([handle.frame(), rig.probe.get('score')], [0, 0]);
    handle.seek(0.5);
    assert.equal(handle.frame(), 2);
    handle.stop();
});

test('replay is null when nothing plays and follows a new playrec', () => {
    const rig = rigged();
    rig.record('r');
    assert.equal(rig.probe.replay(), null);
    const first = rig.probe.playrec('r', 0);
    const second = rig.probe.playrec('r', 0);
    assert.notEqual(first, second);
    assert.equal(rig.probe.replay(), second);
    rig.probe.stopplay();
    assert.equal(rig.probe.replay(), null);
});

test('recvars lists what a recording holds and recseries gives one variable over time', () => {
    const rig = rigged();
    rig.record('r');
    assert.deepEqual(rig.probe.recvars('r'), [
        { sprite: 'Stage', clone: 0, name: 'score', kind: 'var' },
        { sprite: 'Cat', clone: 0, name: 'hp', kind: 'var' },
    ]);
    assert.deepEqual(rig.probe.recseries('r', 'score').map(p => [p.t, p.value]), [[0, 0], [100, 1], [200, 2], [300, 3], [400, 4], [500, 5]]);
    assert.deepEqual(rig.probe.recseries('r', 'hp', { sprite: 'Cat' }).map(p => p.value), [10, 10, 10, 10, 10, 10]);
    assert.throws(() => rig.probe.recseries('r', 'scor'), /no variable named "scor" \(did you mean "score"\?\)/);
    assert.throws(() => rig.probe.recseries('r', 'score', { sprite: 'Cat' }), /not recorded on sprite "Cat"/);
    assert.throws(() => rig.probe.recseries('zzz', 'score'), /no recording named "zzz"/);
});

test('recseries refuses a name recorded on two sprites unless the sprite is given', () => {
    const { probe } = project();
    probe.startrec('both', { motion: false });
    probe.stoprec();
    assert.throws(() => probe.recseries('both', 'hp'), /"hp" is ambiguous in "both"; pass \{ sprite \}/);
    assert.deepEqual(probe.recseries('both', 'hp', { sprite: 'Dog' }).map(p => p.value), [20]);
});

test('maxSeconds keeps only the most recent stretch of project time, whatever the frame rate', () => {
    const rig = rigged();
    rig.probe.startrec('t', { motion: false, maxSeconds: 0.25 });
    for (let i = 0; i < 5; i++) rig.frame();
    const summary = rig.probe.stoprec();
    assert.deepEqual(rig.probe.recseries('t', 'score').map(point => point.t), [0, 100, 200]);
    assert.deepEqual([summary.frames, summary.dropped, summary.seconds], [3, 3, 0.2]);
});

test('maxSeconds and maxFrames both apply and the tighter one wins', () => {
    const rig = rigged();
    rig.probe.startrec('both', { motion: false, maxSeconds: 10, maxFrames: 2 });
    for (let i = 0; i < 4; i++) rig.frame();
    assert.equal(rig.probe.stoprec().frames, 2);
    rig.probe.startrec('time', { motion: false, maxSeconds: 0.15, maxFrames: 100 });
    for (let i = 0; i < 4; i++) rig.frame();
    assert.equal(rig.probe.stoprec().frames, 2);
});

test('maxSeconds always leaves at least the newest frame and rejects nonsense', () => {
    const rig = rigged();
    rig.probe.startrec('tiny', { motion: false, maxSeconds: 0.001 });
    for (let i = 0; i < 3; i++) rig.frame();
    assert.equal(rig.probe.stoprec().frames, 1);
    for (const bad of [0, -1, NaN, 'x']) assert.throws(() => rig.probe.startrec('bad', { maxSeconds: bad }), RangeError);
    assert.doesNotThrow(() => { rig.probe.startrec('forever', { maxSeconds: Infinity }); rig.probe.stoprec(); });
});
