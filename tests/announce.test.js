import { test, assert, VirtualMachine, addTarget, incrementOnFlag, runFrame } from './helpers.js';
import { makeRebugger } from '../src/rebugger.js';
import { preview } from '../src/announce.js';

const loud = () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 5 }, lists: { inv: ['a', 'b'] }, blocks: incrementOnFlag('Stage:score') });
    addTarget(vm, { name: 'Cat', vars: { hp: 10 } });
    return { vm, probe: makeRebugger(vm, { announce: true }) };
};

const heard = run => {
    const lines = [];
    const real = { info: console.info, warn: console.warn };
    console.info = (format, ...rest) => lines.push(['info', format.replace(/%c/g, ''), ...rest]);
    console.warn = (format, ...rest) => lines.push(['warn', format.replace(/%c/g, ''), ...rest]);
    try {
        run();
    } finally {
        Object.assign(console, real);
    }
    return lines.map(([level, text]) => `${level}: ${text}`);
};

test('commands stay silent unless announcements are on', () => {
    const vm = new VirtualMachine();
    addTarget(vm, { name: 'Stage', stage: true, vars: { score: 5 } });
    const probe = makeRebugger(vm);
    assert.deepEqual(heard(() => probe.set('score', 1)), []);
});

test('set, freeze and unfreeze confirm in one line and still return what they always did', () => {
    const { probe } = loud();
    let release;
    const lines = heard(() => {
        assert.equal(probe.set('score', 7), 7);
        release = probe.freeze('score', 'x'.repeat(40));
        probe.unfreeze('score');
        probe.unfreeze();
    });
    assert.equal(typeof release, 'function');
    assert.deepEqual(lines, [
        'info: rebugger score = 7',
        `info: rebugger froze "score" at "${'x'.repeat(23)}…"`,
        'info: rebugger released "score"',
        'info: rebugger released every freeze',
    ]);
});

test('bulk commands count what they touched', () => {
    const { probe } = loud();
    const lines = heard(() => {
        probe.freezeAll();
        probe.unfreeze();
        probe.blankAll();
    });
    assert.deepEqual(lines.map(l => l.replace(/\d+/, 'N')), [
        'info: rebugger froze N variables',
        'info: rebugger released every freeze',
        'info: rebugger blanking N variables',
    ]);
});

test('scan prints how many hits are left and a sample of them', () => {
    const { probe } = loud();
    const lines = heard(() => {
        probe.scan(5);
        probe.scan.unchanged();
        probe.scan(99);
        probe.scan.reset();
        probe.scan.snapshot();
    });
    assert.deepEqual(lines, [
        'info: rebugger scan: 1 hit: score=5',
        'info: rebugger scan: 1 hit: score=5',
        'info: rebugger scan: no hits',
        'info: rebugger scan: cleared',
        'info: rebugger scan: started from 2 variables',
    ]);
    assert.equal(typeof probe.grep.changed, 'function');
    assert.equal(probe.grep, probe.scan);
});

test('scan keeps working through the wrapper and its helpers still return rows', () => {
    const { probe } = loud();
    const rows = heard(() => {}) && probe.scan(5);
    assert.deepEqual(rows.map(r => r.name), ['score']);
    assert.equal(probe.scan.results().length, 1);
});

test('save, load, record and time commands announce themselves', () => {
    const { vm, probe } = loud();
    const lines = heard(() => {
        probe.save('a');
        probe.load('a');
        probe.startrec('r', { motion: false });
        runFrame(vm);
        probe.stoprec();
        probe.pause();
        probe.step(2);
        probe.resume();
        probe.speed(2);
        probe.speed();
        probe.speed(1);
    });
    assert.deepEqual(lines.map(l => l.replace(/[\d.]+s\b/, 'Ns')), [
        'info: rebugger saved "a": 2 variables, 1 list',
        'info: rebugger loaded "a": 3 variables and lists in 2 sprites',
        'info: rebugger recording "r": 2 variables, 0 sprites',
        'info: rebugger stopped "r": 2 frames, Ns',
        'info: rebugger paused',
        'info: rebugger stepped 2 frames',
        'info: rebugger resumed',
        'info: rebugger speed 2×',
        'info: rebugger speed 1×',
    ]);
});

test('loading over a frozen variable warns that it will snap back', () => {
    const { probe } = loud();
    probe.save('a');
    probe.freeze('score', 1);
    const lines = heard(() => probe.load('a'));
    assert.match(lines.join('\n'), /warn: rebugger "a" restored, but frozen variables snap back: score/);
});

test('quiet silences confirmations and quiet(false) brings them back', () => {
    const { probe } = loud();
    probe.quiet();
    assert.deepEqual(heard(() => probe.set('score', 1)), []);
    probe.quiet(false);
    assert.equal(heard(() => probe.set('score', 2)).length, 1);
});

test('errors still throw instead of being announced', () => {
    const { probe } = loud();
    assert.deepEqual(heard(() => assert.throws(() => probe.set('nope', 1), /no variable named "nope"/)), []);
});

test('preview shortens long text and summarises lists', () => {
    assert.equal(preview('abc'), '"abc"');
    assert.equal(preview(4), '4');
    assert.equal(preview(['a', 'b']), '[2 items]');
    assert.equal(preview(['a']), '[1 item]');
    assert.equal(preview('y'.repeat(30)).length, 26);
});

test('holding and releasing a list item name the list and the position', () => {
    const { probe } = loud();
    const lines = heard(() => {
        probe.freezeAt('inv', 2);
        probe.freezeAt('inv', 1, 'x'.repeat(40));
        probe.unfreezeAt('inv', 2);
    });
    assert.deepEqual(lines, [
        'info: rebugger froze "inv"[2]',
        `info: rebugger froze "inv"[1] at "${'x'.repeat(23)}…"`,
        'info: rebugger released "inv"[2]',
    ]);
});

test('wipe says how many rows it blanked, and an ambiguous blank throws instead of announcing', () => {
    const { probe } = loud();
    assert.deepEqual(heard(() => probe.wipe('inv')), ['info: rebugger wiped 2 rows of "inv" to empty text']);
    probe.clear('inv');
    probe.push('inv', 'a');
    assert.deepEqual(heard(() => probe.wipe('inv')), ['info: rebugger wiped 1 row of "inv" to empty text']);
});
