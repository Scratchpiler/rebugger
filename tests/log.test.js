import { test, assert, project } from './helpers.js';
import { HELP } from '../src/help.js';
import { log, styled, styledHelp, styledReady, styledStatus } from '../src/log.js';

const specifiers = format => format.match(/%c/g)?.length ?? 0;

const captured = (method, run) => {
    const calls = [];
    const real = console[method];
    console[method] = (...args) => calls.push(args);
    try {
        run();
    } finally {
        console[method] = real;
    }
    return calls;
};

test('styled puts a coloured badge in front of the message and keeps one style per specifier', () => {
    const [format, ...styles] = styled('warn', 'careful');
    assert.equal(format, '%crebugger%c careful');
    assert.equal(styles.length, specifiers(format));
    assert.match(styles[0], /background:#d97706/);
    assert.equal(styles[1], '');
});

test('each level has its own badge colour', () => {
    const colours = ['info', 'warn', 'error'].map(level => styled(level, 'x')[1]);
    assert.equal(new Set(colours).size, 3);
});

test('a percent sign in a message is escaped so a variable name cannot become a format specifier', () => {
    const [format] = styled('info', '"100%d %c" is a cloud variable');
    assert.equal(format, '%crebugger%c "100%%d %%c" is a cloud variable');
    assert.equal(specifiers(format.replaceAll('%%', '')), 2);
});

test('extra arguments such as an error come after the styles', () => {
    const error = new Error('boom');
    const calls = captured('error', () => log.error('watcher threw', error));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].at(-1), error);
    assert.equal(calls[0].length, 1 + 2 + 1);
});

test('log writes to the console method that matches its level', () => {
    assert.equal(captured('info', () => log.info('a')).length, 1);
    assert.equal(captured('warn', () => log.warn('a')).length, 1);
    assert.equal(captured('error', () => log.error('a')).length, 1);
});

test('the ready banner names the version and points at help', () => {
    const [format, ...styles] = styledReady('9.9.9');
    assert.match(format, /v9\.9\.9 ready/);
    assert.match(format, /rebugger\.help\(\)/);
    assert.equal(styles.length, specifiers(format));
});

test('styledHelp has a style for every specifier, a title per group and every command', () => {
    const [format, ...styles] = styledHelp('1.2.3', HELP);
    assert.equal(styles.length, specifiers(format));
    assert.match(format, /v1\.2\.3/);
    for (const { title, rows } of HELP) {
        assert.ok(format.includes(title), title);
        for (const [command] of rows) assert.ok(format.includes(command), command);
    }
});

test('styledHelp lines the descriptions up in one column', () => {
    const [format] = styledHelp('1', [{ title: 'T', rows: [['short', 'one'], ['a much longer command', 'two']] }]);
    const rows = format.split('\n').filter(line => line.startsWith('  '));
    const columns = rows.map(line => line.replace(/%c/g, '').search(/one|two/));
    assert.equal(columns[0], columns[1]);
});

test('help prints once through console.log in the styled form', () => {
    const { probe } = project();
    const calls = captured('log', () => probe.help());
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], styledHelp(probe.version, HELP));
});

test('every command the help lists exists on the rebugger', () => {
    const { probe } = project();
    for (const { rows } of HELP) {
        for (const [command] of rows) {
            const [, name] = command.match(/^rebugger\.(\w+)/) ?? [];
            if (name) assert.ok(name in probe, command);
        }
    }
});

test('the ready banner names the panel hotkey', () => {
    const [format, ...styles] = styledReady('1', 'Alt+Shift+D');
    assert.match(format, /Alt\+Shift\+D/);
    assert.equal(styles.length, specifiers(format));
});

test('status prints one row per fact with the labels lined up', () => {
    const [format, ...styles] = styledStatus('2', [['time', 'paused'], ['savestates', '3']]);
    assert.equal(styles.length, specifiers(format));
    const rows = format.split('\n').slice(1).map(line => line.replace(/%c/g, ''));
    assert.deepEqual(rows, ['  time        paused', '  savestates  3']);
});

test('status and table print through the console, and table shortens list cells', () => {
    const { probe } = project();
    probe.freeze('score', 3);
    assert.equal(captured('log', () => probe.status()).length, 1);
    const tables = [];
    const real = console.table;
    console.table = rows => tables.push(rows);
    try {
        probe.table(probe.vars());
    } finally {
        console.table = real;
    }
    const inv = tables[0].find(row => row.name === 'inv');
    assert.equal(inv.value, '[3] ["a","b","c"]');
    assert.equal(tables[0].find(row => row.name === 'score').value, 3);
});

test('help(topic) shows only the matching groups and warns about an unknown topic', () => {
    const { probe } = project();
    const [format] = captured('log', () => probe.help('savestate'))[0];
    assert.match(format, /Savestates/);
    assert.doesNotMatch(format, /Recording/);
    const [byTitle] = captured('log', () => probe.help('time'))[0];
    assert.match(byTitle, /Time/);
    assert.equal(captured('log', () => probe.help('zzzz')).length, 0);
    const [warning] = captured('warn', () => probe.help('zzzz'))[0];
    assert.match(warning, /no help for "zzzz" \(topics: Variables and lists/);
});
