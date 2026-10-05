import { log } from './log.js';

const PREVIEW_LENGTH = 24;
const HITS_SHOWN = 5;

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const quoted = name => `"${name}"`;
const times = n => `${n}×`;

export function preview(value) {
    if (Array.isArray(value)) return `[${plural(value.length, 'item')}]`;
    if (typeof value !== 'string') return String(value);
    const shown = value.length > PREVIEW_LENGTH ? `${value.slice(0, PREVIEW_LENGTH - 1)}…` : value;
    return JSON.stringify(shown);
}

const hitSummary = hits => {
    if (!hits.length) return 'scan: no hits';
    const sample = hits.slice(0, HITS_SHOWN).map(h => `${h.name}=${preview(h.value)}`).join(', ');
    const more = hits.length > HITS_SHOWN ? `, +${hits.length - HITS_SHOWN} more` : '';
    return `scan: ${plural(hits.length, 'hit')}: ${sample}${more}`;
};

const listEdit = ([name]) => `edited list ${quoted(name)}`;

const MESSAGES = {
    set: ([name, value]) => `${name} = ${preview(value)}`,
    push: listEdit,
    insert: listEdit,
    setAt: listEdit,
    removeAt: listEdit,
    clear: ([name]) => `emptied list ${quoted(name)}`,
    wipe: ([name], length) => `wiped ${plural(length, 'row')} of ${quoted(name)} to empty text`,
    freeze: ([name, value]) => `froze ${quoted(name)}${value === undefined ? '' : ` at ${preview(value)}`}`,
    freezeAt: ([name, index, value]) => `froze ${quoted(name)}[${index}]${value === undefined ? '' : ` at ${preview(value)}`}`,
    unfreezeAt: ([name, index]) => `released ${quoted(name)}[${index}]`,
    freezeAll: (_, release) => `froze ${plural(release.count, 'variable')}`,
    blank: ([name]) => `blanking ${quoted(name)}`,
    blankAll: (_, release) => `blanking ${plural(release.count, 'variable')}`,
    shitpost: ([name, low, high]) => `shitposting ${quoted(name)} between ${low} and ${high}`,
    unfreeze: ([name]) => name === undefined ? 'released every freeze' : `released ${quoted(name)}`,
    speed: ([value]) => value === undefined ? null : `speed ${times(value)}`,
    pause: () => 'paused',
    resume: () => 'resumed',
    step: (_, count) => `stepped ${plural(count, 'frame')}`,
    save: (_, saved) => `saved ${quoted(saved.name)}: ${plural(saved.variables, 'variable')}, ${plural(saved.lists, 'list')}`,
    load: (_, report) => `loaded ${quoted(report.name)}: ${report.variables} variables and lists in ${plural(report.targets, 'sprite')}`,
    drop: ([name]) => `dropped savestate${name === undefined ? '' : ` ${quoted(name)}`}`,
    import: (_, saved) => `imported ${quoted(saved.name)}`,
    startrec: (_, rec) => `recording ${quoted(rec.name)}: ${plural(rec.variables, 'variable')}, ${plural(rec.sprites, 'sprite')}`,
    stoprec: (_, rec) => `stopped ${quoted(rec.name)}: ${plural(rec.frames, 'frame')}, ${rec.seconds}s`,
    playrec: (_, handle) => `playing ${quoted(handle.name)}`,
    stopplay: () => 'stopped playback',
    droprec: ([name]) => `dropped recording${name === undefined ? '' : ` ${quoted(name)}`}`,
};

const SCAN_MESSAGES = {
    changed: hitSummary,
    unchanged: hitSummary,
    increased: hitSummary,
    decreased: hitSummary,
    snapshot: count => `scan: started from ${plural(count, 'variable')}`,
    reset: () => 'scan: cleared',
};

const warnAboutPins = (name, report) => {
    if (report.frozen.length) log.warn(`${quoted(name)} restored, but frozen variables snap back: ${report.frozen.join(', ')}`);
    if (report.missingTargets.length) log.warn(`${plural(report.missingTargets.length, 'sprite')} in the savestate no longer exist`);
};

export function announced(core, { enabled }) {
    const say = message => { if (enabled() && message) log.info(message); };

    const wrap = (name, make) => (...args) => {
        const result = core[name](...args);
        say(make(args, result));
        return result;
    };

    const wrapped = { ...core };
    for (const [name, make] of Object.entries(MESSAGES)) wrapped[name] = wrap(name, make);

    wrapped.load = (...args) => {
        const report = core.load(...args);
        say(MESSAGES.load(args, report));
        if (enabled()) warnAboutPins(report.name, report);
        return report;
    };

    const scan = (...args) => {
        const hits = core.scan(...args);
        say(hitSummary(hits));
        return hits;
    };
    Object.assign(scan, core.scan);
    for (const [name, make] of Object.entries(SCAN_MESSAGES)) {
        scan[name] = (...args) => {
            const result = core.scan[name](...args);
            say(make(result));
            return result;
        };
    }
    wrapped.scan = wrapped.grep = scan;
    return wrapped;
}
