export const HELP = [
    {
        title: 'Variables and lists',
        rows: [
            ['rebugger.vars([scope])', 'list variables and lists'],
            ['rebugger.find(text|/regex/)', 'find variables and lists by name; { kind, sprite, clones } narrows it'],
            ['rebugger.sprites()', 'names of the stage and every sprite, for scope and filters'],
            ['rebugger.get(name) / set(name, value)', 'read / write a variable'],
            ['rebugger.list(name)', 'read a list (copy)'],
            ['rebugger.push / insert / setAt / removeAt / clear', 'edit a list (1-based indexes)'],
            ['rebugger.wipe(name)', 'set every row of a list to "" and keep the rows (clear removes them)'],
            ['rebugger.watch(name, fn, { kind })', 'fn(new, old, name) on change; returns a stop function'],
            ['rebugger.table(rows)', 'print vars(), find(), scan(), states() or recs() results as a table'],
            ['scope = { sprite, clone }', 'pick a sprite (default: the original) and a clone number'],
        ],
    },
    {
        title: 'Freezing',
        rows: [
            ['rebugger.freeze(name[, value])', 'hold a value every frame; returns an unfreeze function'],
            ['rebugger.freezeAt(name, index[, value])', 'hold one list item (1-based) every frame while the rest of the list stays free; returns a release function'],
            ['rebugger.unfreezeAt(name, index)', 'release one held list item'],
            ['rebugger.freezeAll([{ except, sprite, clones }])', 'hold every variable at its current value; returns a release function'],
            ['rebugger.blank(name[, { sprite, kind }])', 'hold one variable at "" or one list empty, every frame; a name on several sprites needs { sprite }; returns a release function'],
            ['rebugger.blankAll([{ kind, except, sprite, clones }])', 'blank every variable and list (kind: var | list | any)'],
            ['rebugger.shitpost(name, low, high)', 'set a variable to a random number from low to high every frame; returns a stop function'],
            ['rebugger.unfreeze([name])', 'release one or all (freezes, blanks and shitposts)'],
            ['rebugger.frozen()', 'what is held right now, with its mode (freeze, blank, shitpost)'],
        ],
    },
    {
        title: 'Scanning',
        rows: [
            ['rebugger.scan(value) (alias grep)', 'find variables holding a value; call again to narrow the hits'],
            ['rebugger.scan.changed/unchanged/increased/decreased()', 'narrow by what moved since the last scan'],
            ['rebugger.scan.snapshot() / reset() / results()', 'start from everything / start over / current hits'],
        ],
    },
    {
        title: 'Savestates',
        rows: [
            ['rebugger.save([name]) / load([name])', 'snapshot / restore variables, lists and sprite position; load defaults to the latest'],
            ['rebugger.states() / drop(name)', 'list / delete savestates'],
            ['rebugger.export(name) / import(data)', 'savestate as plain data (survives a reload via JSON) / bring one back'],
        ],
    },
    {
        title: 'Recording',
        rows: [
            ['rebugger.startrec([name][, opts])', 'record variables and sprite pose every frame; opts: only, except, sprite, clones, lists, motion, maxFrames, maxSeconds, until, tail'],
            ['rebugger.stoprec()', 'stop recording'],
            ['rebugger.playrec(name, speed[, opts])', 'replay a recording into the project; speed 0 holds, 1 is real time, Infinity jumps to the end; opts: restore, park (stay on the last frame), loop; returns a handle with seek, seekFrame, frame, time, loop, stop'],
            ['rebugger.replay()', 'the replay in progress (or null), so you can scrub it from the console or the panel'],
            ['rebugger.recvars(name) / recseries(name, variable)', 'the variables a recording holds / one of them over time as [{ t, value }]'],
            ['rebugger.recs() / droprec(name) / stopplay()', 'list / delete recordings / stop playback'],
        ],
    },
    {
        title: 'Time',
        rows: [
            ['rebugger.speed([n])', 'run the project at n times speed (0.1 slow, 5 fast, Infinity flat out); no argument reads it'],
            ['rebugger.pause() / resume() / step([n])', 'stop the project, continue it, or run n frames while paused'],
        ],
    },
    {
        title: 'Panel and output',
        rows: [
            ['rebugger.ui([open])', 'show, hide or toggle the on-page panel (Alt+Shift+D); drag it, resize it, or click a value to edit it'],
            ['rebugger.quiet([on])', 'silence or restore the one-line confirmations printed after each command'],
            ['rebugger.status()', 'print what is running: speed, freezes, scan, savestates, recording'],
        ],
    },
    {
        title: 'Other',
        rows: [
            ['rebugger.info() / dispose() / help([topic])', 'status as data, release every hook, this list (or one topic, e.g. help("freeze"))'],
            ['rebugger.vm', 'the raw Scratch VM'],
            ['rb', 'short for rebugger'],
        ],
    },
];
