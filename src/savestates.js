import { log } from './log.js';
import { applyMotion, motionOf } from './motion.js';
import { makeNamer, named, snapshot } from './util.js';

export function createSavestates({ vm, runtime, world, pins }) {
    const savedStates = new Map();
    const nextName = makeNamer();

    const savedVariables = target => Object.values(target.variables)
        .filter(v => (v.type === '' || v.type === 'list') && !v.isCloud)
        .map(v => ({ id: v.id, name: v.name, type: v.type, value: snapshot(v.value) }));

    const capture = (name, clones) => ({
        version: 1,
        name,
        takenAt: new Date().toISOString(),
        targets: world.targetsWithClones(clones).map(target => ({
            key: world.stateKey(target),
            motion: motionOf(target),
            variables: savedVariables(target),
        })),
    });

    const countVariables = (state, type) => state.targets
        .reduce((sum, t) => sum + t.variables.filter(v => v.type === type).length, 0);

    const summarize = state => ({
        name: state.name,
        takenAt: state.takenAt,
        targets: state.targets.length,
        clones: state.targets.filter(t => t.key.startsWith('clone:')).length,
        variables: countVariables(state, ''),
        lists: countVariables(state, 'list'),
    });

    const stateNamed = name => named(savedStates, name, 'savestate');

    function storeState(state) {
        savedStates.delete(state.name);
        savedStates.set(state.name, state);
        return summarize(state);
    }

    function restore(state, { motion = true, recreate = false } = {}) {
        const report = {
            name: state.name,
            targets: 0,
            variables: 0,
            recreated: 0,
            missingTargets: [],
            missingVariables: 0,
            frozen: [],
        };
        for (const saved of state.targets) {
            const target = world.liveTarget(saved.key);
            if (!target) { report.missingTargets.push(saved.key); continue; }
            report.targets++;
            for (const entry of saved.variables) {
                let variable = target.variables[entry.id];
                if (!variable && recreate) {
                    target.createVariable(entry.id, entry.name, entry.type, false);
                    variable = target.variables[entry.id];
                    report.recreated++;
                }
                if (!variable) { report.missingVariables++; continue; }
                world.hold(variable, entry.value);
                report.variables++;
                if (pins.isPinned(variable)) report.frozen.push(variable.name);
            }
            if (motion) applyMotion(target, saved.motion);
        }
        if (report.recreated) {
            try { vm.emitWorkspaceUpdate(); } catch (e) { log.warn('workspace refresh failed', e); }
        }
        return report;
    }

    return {
        capture,
        restore,
        count: () => savedStates.size,

        api: {
            save: (name, { clones = false } = {}) =>
                storeState(capture(name ?? nextName('state', savedStates), clones)),

            load: (name, options) => restore(stateNamed(name), options),

            states: () => [...savedStates.values()].map(summarize),

            drop(name) {
                savedStates.delete(stateNamed(name).name);
            },

            export: name => structuredClone(stateNamed(name)),

            import(data, name) {
                const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                if (parsed?.version !== 1 || !Array.isArray(parsed.targets)) throw new Error('not a rebugger savestate');
                return storeState({ ...structuredClone(parsed), name: name ?? parsed.name ?? nextName('state', savedStates) });
            },
        },
    };
}
