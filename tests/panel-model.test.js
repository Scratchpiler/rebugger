import { test, assert, project } from './helpers.js';
import {
    ROW_LIMIT, ageLabel, withPins, displayValue, editableText, formatClock, parseFilter, parseValue, pickMoving, scanRows, sparkline, spriteNames, timeSummary, variableRows, varies,
} from '../src/panel-model.js';

test('parseValue stores numbers as numbers only when the text round-trips', () => {
    assert.equal(parseValue('42'), 42);
    assert.equal(parseValue('-3.5'), -3.5);
    assert.equal(parseValue('007'), '007');
    assert.equal(parseValue('1e3'), '1e3');
    assert.equal(parseValue(' 5 '), 5);
    assert.equal(parseValue(''), '');
    assert.equal(parseValue('hello'), 'hello');
    assert.equal(parseValue('Infinity'), 'Infinity');
});

test('displayValue trims float noise, names empty strings and counts list items', () => {
    assert.equal(displayValue(98.50000000000009), '98.5');
    assert.equal(displayValue(7), '7');
    assert.equal(displayValue(''), '""');
    assert.equal(displayValue('hi'), 'hi');
    assert.equal(displayValue(['a']), '1 item');
    assert.equal(displayValue([1, 2]), '2 items');
    assert.equal(editableText(98.50000000000009), '98.50000000000009');
});

test('parseFilter turns /text/flags into a regex and leaves anything else as trimmed text', () => {
    assert.deepEqual(parseFilter(' hp '), 'hp');
    assert.ok(parseFilter('/^h/i') instanceof RegExp);
    assert.equal(parseFilter('/^h/i').flags, 'i');
    assert.equal(parseFilter('/(/'), '/(/');
    assert.equal(parseFilter('a/b'), 'a/b');
});

test('variableRows lists everything sorted by sprite then name, with pin modes', () => {
    const { probe } = project();
    probe.freeze('score', 9);
    probe.blank('inv');
    const { rows, total } = variableRows(probe, { filter: '', sprite: '', frozenOnly: false, clones: false });
    assert.equal(total, 4);
    assert.deepEqual(rows.map(r => `${r.sprite}:${r.name}`), ['Cat:hp', 'Dog:hp', 'Stage:inv', 'Stage:score']);
});

test('variableRows filters by name, sprite and pinned state', () => {
    const { probe } = project();
    probe.freeze('score', 9);
    const base = { filter: '', sprite: '', frozenOnly: false, clones: false };
    assert.deepEqual(variableRows(probe, { ...base, filter: 'hp' }).rows.map(r => r.sprite), ['Cat', 'Dog']);
    assert.deepEqual(variableRows(probe, { ...base, filter: 'hp', sprite: 'Dog' }).rows.map(r => r.sprite), ['Dog']);
    assert.deepEqual(variableRows(probe, { ...base, filter: '/^s/' }).rows.map(r => r.name), ['score']);
    const held = variableRows(probe, { ...base, frozenOnly: true }).rows;
    assert.deepEqual(held.map(r => [r.name, r.pin]), [['score', 'freeze']]);
});

test('variableRows caps the rows but reports the real total', () => {
    const { vm, probe } = project();
    const stage = vm.runtime.targets.find(t => t.isStage);
    for (let i = 0; i < ROW_LIMIT + 20; i++) stage.createVariable(`bulk${i}`, `bulk${i}`, '');
    const { rows, total } = variableRows(probe, { filter: 'bulk', sprite: '', frozenOnly: false, clones: false });
    assert.equal(rows.length, ROW_LIMIT);
    assert.equal(total, ROW_LIMIT + 20);
});

test('scanRows carries live values and pin state, and spriteNames puts the stage first', () => {
    const { probe } = project();
    probe.scan(5);
    assert.deepEqual(scanRows(probe).map(r => [r.name, r.kind, r.pin]), [['score', 'var', null]]);
    probe.set('score', 6);
    assert.equal(scanRows(probe)[0].value, 6);
    assert.deepEqual(spriteNames(probe), ['Stage', 'Cat', 'Dog']);
});

test('timeSummary prefers playback, then recording, then paused, then speed', () => {
    const idle = { playing: null, recording: null, paused: false, speed: 2 };
    assert.deepEqual(timeSummary(idle), { tone: 'run', text: 'running 2×' });
    assert.deepEqual(timeSummary({ ...idle, speed: Infinity }), { tone: 'run', text: 'running ∞' });
    assert.deepEqual(timeSummary({ ...idle, paused: true }), { tone: 'paused', text: 'paused' });
    assert.deepEqual(timeSummary({ ...idle, paused: true, recording: 'r' }), { tone: 'record', text: 'recording r' });
    assert.deepEqual(timeSummary({ ...idle, recording: 'r', playing: 'p' }), { tone: 'play', text: 'playing p' });
});

test('ageLabel reads naturally', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    const ago = seconds => new Date(now - seconds * 1000).toISOString();
    assert.equal(ageLabel(ago(2), now), 'just now');
    assert.equal(ageLabel(ago(30), now), '30s ago');
    assert.equal(ageLabel(ago(300), now), '5m ago');
    assert.equal(ageLabel(ago(7300), now), '2h ago');
});

test('formatClock shows minutes, seconds and hundredths', () => {
    assert.equal(formatClock(0), '0:00.00');
    assert.equal(formatClock(1234), '0:01.23');
    assert.equal(formatClock(59999), '0:59.99');
    assert.equal(formatClock(61000), '1:01.00');
    assert.equal(formatClock(-5), '0:00.00');
});

const series = values => values.map((value, i) => ({ t: i * 100, value }));

test('varies and pickMoving find the first series that actually changes', () => {
    assert.equal(varies(series([3, 3, 3])), false);
    assert.equal(varies(series(['a', 'b'])), false);
    assert.equal(varies(series([1, '2', 3])), true);
    assert.equal(varies(series([7])), false);
    assert.equal(pickMoving([series([1, 1]), series([1, 2]), series([5, 9])]), 1);
    assert.equal(pickMoving([series([1, 1]), series(['x', 'y'])]), 0);
    assert.equal(pickMoving([]), 0);
});

test('sparkline maps time to x and value to y, inside a margin, and closes an area under the line', () => {
    const shape = sparkline(series([0, 10, 5]), 200);
    assert.deepEqual(shape.line.split(' '), ['0.00,92.00', '50.00,8.00', '100.00,50.00']);
    assert.equal(shape.area, `0,100 ${shape.line} 100,100`);
    assert.deepEqual([shape.low, shape.high], [0, 10]);
});

test('sparkline draws a constant series flat, spaces points evenly without a duration and skips text', () => {
    assert.deepEqual(sparkline(series([4, 4]), 100).line.split(' '), ['0.00,50.00', '100.00,50.00']);
    assert.deepEqual(sparkline(series([0, 1, 2]), 0).line.split(' ').map(p => p.split(',')[0]), ['0.00', '50.00', '100.00']);
    assert.equal(sparkline(series(['a', 'b', 'c']), 100), null);
    assert.equal(sparkline(series([1]), 100), null);
    assert.deepEqual(sparkline(series([1, 'x', 3]), 200).line.split(' ').length, 2);
});

test('sparkline keeps spikes when it thins a long recording', () => {
    const values = Array.from({ length: 3000 }, (_, i) => (i === 1500 ? 100 : 1));
    const shape = sparkline(series(values), 300000);
    const points = shape.line.split(' ');
    assert.ok(points.length <= 240 + 2);
    assert.ok(points.some(p => p.endsWith(',8.00')));
});

test('withPins keeps whole-variable pins and held list items apart', () => {
    const rows = [
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', value: [] },
        { sprite: 'Stage', clone: 0, name: 'score', kind: 'var', value: 1 },
    ];
    const held = [
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', mode: 'freeze', index: 3 },
        { sprite: 'Stage', clone: 0, name: 'inv', kind: 'list', mode: 'freeze', index: 1 },
        { sprite: 'Stage', clone: 0, name: 'score', kind: 'var', mode: 'shitpost' },
    ];
    const [inv, score] = withPins(rows, held);
    assert.deepEqual([inv.pin, inv.held], [null, [3, 1]]);
    assert.deepEqual([score.pin, score.held], ['shitpost', []]);
});

test('variableRows counts a list with held items as held for the Frozen filter', () => {
    const { probe } = project();
    probe.freezeAt('inv', 2);
    const found = variableRows(probe, { filter: '', sprite: '', frozenOnly: true, clones: false });
    assert.deepEqual(found.rows.map(r => [r.name, r.pin, r.held]), [['inv', null, [2]]]);
});
