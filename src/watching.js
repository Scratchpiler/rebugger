import { same, snapshot } from './util.js';
import { log } from './log.js';

export function createWatching({ world, stepper }) {
    const watchers = new Set();

    function notifyWatchers() {
        for (const watcher of [...watchers]) {
            const { target, variable } = watcher;
            if (target.variables[variable.id] !== variable) { watchers.delete(watcher); continue; }
            if (same(variable.value, watcher.last)) continue;
            const previous = watcher.last;
            watcher.last = snapshot(variable.value);
            try {
                watcher.fn(snapshot(variable.value), previous, variable.name);
            } catch (e) {
                log.error('watcher threw', e);
            }
        }
    }

    stepper.tap({ order: 40, after: notifyWatchers, active: () => watchers.size > 0 });

    return {
        count: () => watchers.size,
        clear: () => watchers.clear(),

        api: {
            watch(name, fn, { kind = 'var', ...scope } = {}) {
                const { target, variable } = world.find(name, kind, scope);
                const watcher = { target, variable, fn, last: snapshot(variable.value) };
                watchers.add(watcher);
                stepper.hook();
                return () => { watchers.delete(watcher); stepper.unhook(); };
            },
        },
    };
}
