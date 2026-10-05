import { announced } from './announce.js';
import { HELP } from './help.js';
import { log } from './log.js';
import { createPanel } from './panel.js';
import { createPins } from './pins.js';
import { createRecording } from './recording.js';
import { createSavestates } from './savestates.js';
import { createScan } from './scan.js';
import { createStepper } from './stepper.js';
import { tableRows } from './table.js';
import { createVariables } from './variables.js';
import { VERSION } from './version.js';
import { createWatching } from './watching.js';
import { createWorld } from './world.js';

const statusRows = info => [
    ['time', info.paused ? 'paused' : `running at ${info.speed}×`],
    ['frozen', info.frozen.length ? info.frozen.join(', ') : 'nothing'],
    ['watching', String(info.watching)],
    ['scan', info.scanning === null ? 'none' : `${info.scanning} hits`],
    ['savestates', String(info.savestates)],
    ['recording', info.recording ?? 'no'],
    ['playing', info.playing ?? 'no'],
];

const topicGroups = topic => {
    const needle = topic.toLowerCase();
    return HELP.flatMap(group => {
        if (group.title.toLowerCase().includes(needle)) return [group];
        const rows = group.rows.filter(row => row.some(text => text.toLowerCase().includes(needle)));
        return rows.length ? [{ title: group.title, rows }] : [];
    });
};

const pageStorage = () => {
    try {
        return globalThis.localStorage;
    } catch {
        return undefined;
    }
};

export function makeRebugger(vm, {
    clock = () => performance.now(),
    random = Math.random,
    announce = false,
    document = globalThis.document,
    storage = pageStorage(),
    restorePanel = false,
    download,
} = {}) {
    const runtime = vm.runtime;
    const world = createWorld(runtime);
    const stepper = createStepper(runtime, clock);
    const pins = createPins({ world, stepper, random });
    const watching = createWatching({ world, stepper });
    const { scan, pending } = createScan(world);
    const savestates = createSavestates({ vm, runtime, world, pins });
    const recording = createRecording({ world, stepper, savestates });
    let confirmations = announce;

    const core = {
        version: VERSION,
        vm,
        scan,
        grep: scan,
        ...createVariables(world),
        ...pins.api,
        ...watching.api,
        ...savestates.api,
        ...recording.api,
        ...stepper.api,

        info: () => ({
            version: VERSION,
            targets: runtime.targets.length,
            threads: runtime.threads.length,
            frozen: pins.names(),
            ...stepper.state(),
            watching: watching.count(),
            scanning: pending(),
            savestates: savestates.count(),
            recording: recording.recording(),
            playing: recording.playing(),
        }),
    };

    const panel = createPanel({ api: core, document, storage, restore: restorePanel, download });

    const rebugger = announced(core, { enabled: () => confirmations });

    return Object.assign(rebugger, {
        ui(open) {
            if (!panel) throw new Error('the panel needs a page: no document here');
            return open === undefined ? panel.toggle() : panel.setOpen(!!open);
        },

        quiet(on = true) {
            confirmations = !on;
            return on;
        },

        table(rows) {
            console.table(tableRows(rows));
        },

        status: () => log.status(VERSION, statusRows(core.info())),

        dispose() {
            panel?.destroy();
            pins.clear();
            watching.clear();
            scan.reset();
            recording.dispose();
            stepper.reset();
            stepper.unhook();
        },

        help(topic) {
            if (topic === undefined) return log.help(VERSION, HELP);
            const groups = topicGroups(String(topic));
            if (groups.length) return log.help(VERSION, groups);
            return log.warn(`no help for "${topic}" (topics: ${HELP.map(g => g.title).join(', ')})`);
        },
    });
}
