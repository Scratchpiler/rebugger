import { UNTIMED, WAITING, blockLabel } from './block-labels.js';
import { didYouMean } from './util.js';

const STATUS = { promiseWait: 1, yieldTick: 3, done: 4 };
const LONG_WAIT_MS = 10000;
const COST_SMOOTHING = 0.3;
const COST_FLOOR = 0.0005;

export function createThreads({ runtime, stepper, clock }) {
    const ids = new WeakMap();
    const seen = new WeakMap();
    const moved = new WeakMap();
    const costs = new Map();
    const frameCost = new Map();
    const held = new Set();
    const stepOnce = new Set();
    let nextId = 1;
    let profiling = false;
    let original = null;
    let hadOwnStep = false;

    const idOf = thread => {
        if (!ids.has(thread)) ids.set(thread, nextId++);
        return ids.get(thread);
    };

    const isEnded = thread => thread.isKilled || thread.status === STATUS.done || thread.stack.length === 0;
    const isLive = thread => runtime.threads.includes(thread) && !isEnded(thread);

    function wrapper(thread) {
        if (held.has(thread) && !stepOnce.delete(thread)) {
            thread.status = STATUS.yieldTick;
            return;
        }
        if (!profiling) return original.call(this, thread);
        const started = clock();
        original.call(this, thread);
        frameCost.set(thread, (frameCost.get(thread) ?? 0) + clock() - started);
    }

    function installWrapper() {
        const { sequencer } = runtime;
        if (sequencer.stepThread === wrapper) return;
        hadOwnStep = Object.hasOwn(sequencer, 'stepThread');
        original = sequencer.stepThread;
        sequencer.stepThread = wrapper;
    }

    function removeWrapper() {
        if (held.size || profiling) return;
        const { sequencer } = runtime;
        if (sequencer.stepThread !== wrapper) return;
        if (hadOwnStep) sequencer.stepThread = original;
        else delete sequencer.stepThread;
    }

    stepper.tap({
        order: 50,
        active: () => profiling,
        after() {
            for (const [thread, ms] of frameCost) costs.set(thread, (costs.get(thread) ?? ms) * (1 - COST_SMOOTHING) + ms * COST_SMOOTHING);
            for (const [thread, value] of costs) {
                if (frameCost.has(thread)) continue;
                if (value < COST_FLOOR || !isLive(thread)) costs.delete(thread);
                else costs.set(thread, value * (1 - COST_SMOOTHING));
            }
            frameCost.clear();
        },
    });

    function targetNames() {
        const names = new Map();
        const counts = {};
        for (const target of runtime.targets) {
            if (target.isStage) names.set(target, { sprite: 'Stage', clone: 0 });
            else if (target.isOriginal) names.set(target, { sprite: target.sprite.name, clone: 0 });
            else {
                const name = target.sprite.name;
                counts[name] = (counts[name] ?? 0) + 1;
                names.set(target, { sprite: name, clone: counts[name] });
            }
        }
        return names;
    }

    function describe(thread, names, now) {
        const blocks = thread.blockContainer;
        const ended = isEnded(thread);
        const current = ended ? '' : thread.peekStack();
        const opcode = current ? blocks.getBlock(current)?.opcode : undefined;
        const signature = `${thread.stack.join('|')}:${thread.status}`;
        if (!seen.has(thread)) seen.set(thread, now);
        if (moved.get(thread)?.signature !== signature) moved.set(thread, { signature, at: now });
        const waitedMs = now - moved.get(thread).at;
        const paused = held.has(thread);
        const blocked = thread.status === STATUS.promiseWait || WAITING.has(opcode);
        const state = ended ? 'ended' : paused ? 'paused' : blocked ? 'waiting' : 'running';
        const untimed = thread.status === STATUS.promiseWait || UNTIMED.has(opcode);
        const who = names.get(thread.target) ?? { sprite: '?', clone: 0 };
        return {
            id: idOf(thread),
            sprite: who.sprite,
            clone: who.clone,
            script: blockLabel(blocks, thread.topBlock),
            block: blockLabel(blocks, current),
            state,
            long: state === 'waiting' && untimed && waitedMs >= LONG_WAIT_MS,
            warp: !ended && !!thread.peekStackFrame()?.warpMode,
            ageMs: now - seen.get(thread),
            waitedMs,
            ms: costs.get(thread) ?? 0,
        };
    }

    function find(id) {
        const thread = runtime.threads.find(candidate => ids.get(candidate) === id);
        if (thread) return thread;
        const live = runtime.threads.map(candidate => idOf(candidate));
        throw new Error(`no thread #${id}${live.length ? ` (running: ${live.slice(0, 12).map(n => `#${n}`).join(', ')}${live.length > 12 ? ', …' : ''})` : ''}`);
    }

    function list({ monitors = false } = {}) {
        const names = targetNames();
        const now = stepper.now();
        return runtime.threads.filter(thread => monitors || !thread.updateMonitor).map(thread => describe(thread, names, now));
    }

    function frames(id) {
        const thread = find(id);
        const blocks = thread.blockContainer;
        const out = [];
        let root = null;
        thread.stack.forEach((blockId, index) => {
            const top = blocks.getTopLevelScript(blockId) ?? blockId;
            const frame = thread.stackFrames[index];
            if (!out.length || top !== root) {
                root = top;
                const procedure = blocks.getBlock(top)?.opcode === 'procedures_definition';
                const title = blockLabel(blocks, top);
                out.push({
                    title: procedure ? title.replace(/^define /, '') : title,
                    procedure,
                    args: procedure && frame?.params ? { ...frame.params } : null,
                    warp: !!frame?.warpMode,
                    blocks: [],
                });
            }
            out.at(-1).blocks.push({ label: blockLabel(blocks, blockId), current: index === thread.stack.length - 1 });
        });
        return out;
    }

    function kill(id) {
        const thread = find(id);
        const row = describe(thread, targetNames(), stepper.now());
        runtime._stopThread(thread);
        held.delete(thread);
        stepOnce.delete(thread);
        removeWrapper();
        return row;
    }

    function killAll({ sprite, clone } = {}) {
        const names = targetNames();
        const doomed = runtime.threads.filter(thread => {
            if (thread.updateMonitor || isEnded(thread)) return false;
            const who = names.get(thread.target);
            return (sprite === undefined || who?.sprite === sprite) && (clone === undefined || who?.clone === clone);
        });
        for (const thread of doomed) {
            runtime._stopThread(thread);
            held.delete(thread);
            stepOnce.delete(thread);
        }
        removeWrapper();
        return doomed.length;
    }

    function pause(id) {
        const thread = find(id);
        held.add(thread);
        installWrapper();
        return describe(thread, targetNames(), stepper.now());
    }

    function resume(id) {
        const thread = find(id);
        held.delete(thread);
        stepOnce.delete(thread);
        removeWrapper();
        return describe(thread, targetNames(), stepper.now());
    }

    function step(id) {
        const thread = find(id);
        if (!held.has(thread)) throw new Error(`thread #${id} is not paused: pause it first`);
        stepOnce.add(thread);
        return describe(thread, targetNames(), stepper.now());
    }

    function restart(id) {
        const thread = find(id);
        const fresh = runtime._restartThread(thread);
        held.delete(thread);
        stepOnce.delete(thread);
        removeWrapper();
        return describe(fresh, targetNames(), stepper.now());
    }

    function profile(on = true) {
        profiling = !!on;
        if (profiling) {
            installWrapper();
            stepper.hook();
        } else {
            costs.clear();
            frameCost.clear();
            removeWrapper();
            stepper.unhook();
        }
        return profiling;
    }

    const threads = Object.assign(list, { kill, killAll, pause, resume, step, restart, frames, profile, profiling: () => profiling });

    function messages() {
        const listeners = new Map();
        runtime.allScriptsByOpcodeDo('event_whenbroadcastreceived', script => {
            const key = String(script.fieldsOfInputs?.BROADCAST_OPTION?.value ?? '').toUpperCase();
            listeners.set(key, (listeners.get(key) ?? 0) + 1);
        });
        const stage = runtime.targets.find(target => target.isStage);
        const names = Object.values(stage?.variables ?? {}).filter(variable => variable.type === 'broadcast_msg').map(variable => variable.name);
        return [...new Set(names)]
            .map(name => ({ name, listeners: listeners.get(name.toUpperCase()) ?? 0 }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    function broadcast(message) {
        const text = String(message);
        const known = messages();
        if (!known.some(entry => entry.name.toUpperCase() === text.toUpperCase())) {
            throw new Error(`no broadcast named "${text}"${didYouMean(text, known.map(entry => entry.name))}`);
        }
        const before = new Set(runtime.threads);
        runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: text });
        const names = targetNames();
        const now = stepper.now();
        return runtime.threads.filter(thread => !before.has(thread)).map(thread => describe(thread, names, now));
    }

    function scripts() {
        const names = targetNames();
        const rows = [];
        for (const [target, who] of names) {
            if (!target.isStage && !target.isOriginal) continue;
            for (const id of target.blocks.getScripts()) {
                const block = target.blocks.getBlock(id);
                if (!runtime._hats[block?.opcode]) continue;
                rows.push({ key: `${target.id}\u0000${id}`, sprite: who.sprite, script: blockLabel(target.blocks, id) });
            }
        }
        return rows;
    }

    function start(query) {
        const rows = scripts();
        const key = typeof query === 'string' ? query : query?.key;
        let row = rows.find(candidate => candidate.key === key);
        if (!row && typeof query === 'string') {
            const wanted = query.toLowerCase();
            const hits = rows.filter(candidate => `${candidate.sprite}: ${candidate.script}`.toLowerCase() === wanted);
            if (hits.length > 1) throw new Error(`"${query}" matches ${hits.length} scripts`);
            row = hits[0];
        }
        if (!row) throw new Error(`no script "${key}"${didYouMean(String(key), rows.map(candidate => `${candidate.sprite}: ${candidate.script}`))}`);
        const [targetId, blockId] = row.key.split('\u0000');
        const target = runtime.getTargetById(targetId);
        for (const thread of runtime.threads) {
            if (thread.target === target && thread.topBlock === blockId && thread.stackClick && !isEnded(thread)) runtime._stopThread(thread);
        }
        const thread = runtime._pushThread(blockId, target, { stackClick: true });
        return describe(thread, targetNames(), stepper.now());
    }

    function dispose() {
        held.clear();
        stepOnce.clear();
        profiling = false;
        removeWrapper();
    }

    return { threads, messages, broadcast, scripts, start, dispose };
}
