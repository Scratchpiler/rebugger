import { log } from './log.js';
import { applyPose, poseOf } from './motion.js';
import { didYouMean, makeNamer, named, nameMatcher, same, snapshot } from './util.js';

const checkSpeed = speed => {
    if (typeof speed !== 'number' || Number.isNaN(speed) || speed < 0) {
        throw new RangeError('speed must be a number from 0 up; Infinity jumps to the end');
    }
};

const triggered = condition => {
    try {
        return !!condition();
    } catch (e) {
        log.error('until threw', e);
        return true;
    }
};

const exceedsSeconds = (frames, maxSeconds) => frames.length > 1 && frames.at(-1).t - frames[0].t > maxSeconds * 1000;

function frameIndexAt(frames, head) {
    let low = 0;
    let high = frames.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (frames[mid].t <= head) low = mid;
        else high = mid - 1;
    }
    return low;
}

export function createRecording({ world, stepper, savestates }) {
    const recordings = new Map();
    const nextName = makeNamer();
    let recorder = null;
    let player = null;

    const summarizeRecording = rec => ({
        name: rec.name,
        recording: recorder?.rec === rec,
        frames: rec.frames.length,
        seconds: rec.frames.length ? Math.round((rec.frames.at(-1).t - rec.frames[0].t) / 10) / 100 : 0,
        variables: rec.columns.length,
        sprites: rec.poses.length,
        dropped: rec.dropped,
        stoppedBy: rec.stoppedBy,
    });

    function recordingNamed(name) {
        const rec = named(recordings, name, 'recording');
        if (recorder?.rec === rec) throw new Error(`"${rec.name}" is still recording: stoprec() first`);
        return rec;
    }

    function startRecording(name, options) {
        if (recorder) throw new Error(`already recording "${recorder.rec.name}": stoprec() first`);
        const { only, except = [], sprite, clones = false, lists = false, motion = true, maxFrames = 3600, maxSeconds = Infinity, until, tail = 0 } = options;
        if (!(maxFrames >= 1)) throw new RangeError('maxFrames must be at least 1');
        if (!(maxSeconds > 0)) throw new RangeError('maxSeconds must be above 0');
        if (until !== undefined && typeof until !== 'function') throw new TypeError('until must be a function');
        const wanted = only === undefined ? () => true : Array.isArray(only) ? n => only.includes(n) : nameMatcher(only);
        const inScope = target => sprite === undefined || world.spriteName(target) === sprite;
        const entries = world.everyVariable(clones, world.typesFor(lists ? 'any' : 'var')).filter(({ target, variable }) =>
            !variable.isCloud && wanted(variable.name) && !except.includes(variable.name) && inScope(target));
        const poseTargets = motion ? world.targetsWithClones(clones).filter(inScope) : [];
        if (!entries.length && !poseTargets.length) throw new Error('nothing to record: no variables matched');
        const rec = {
            version: 1,
            name,
            startedAt: new Date().toISOString(),
            columns: entries.map(({ target, variable }) => ({
                key: world.stateKey(target), id: variable.id, name: variable.name, type: variable.type,
            })),
            poses: poseTargets.map(world.stateKey),
            frames: [],
            dropped: 0,
            stoppedBy: null,
        };
        recordings.delete(name);
        recordings.set(name, rec);
        recorder = { rec, entries, poseTargets, previous: [], origin: stepper.now(), maxFrames, maxSeconds, until, tail, remaining: null };
        stepper.hook();
        sampleRecording();
        return summarizeRecording(rec);
    }

    function sampleRecording() {
        if (!recorder) return;
        const { rec, entries, poseTargets, previous } = recorder;
        const values = entries.map(({ target, variable }, i) => {
            if (target.variables[variable.id] !== variable) return undefined;
            if (variable.type !== 'list') return variable.value;
            return same(previous[i], variable.value) ? previous[i] : snapshot(variable.value);
        });
        recorder.previous = values;
        rec.frames.push({ t: stepper.now() - recorder.origin, values, poses: poseTargets.map(poseOf) });
        while (rec.frames.length > recorder.maxFrames || exceedsSeconds(rec.frames, recorder.maxSeconds)) {
            rec.frames.shift();
            rec.dropped++;
        }
        if (recorder.remaining === null && recorder.until && triggered(recorder.until)) recorder.remaining = recorder.tail;
        if (recorder.remaining !== null && recorder.remaining-- <= 0) finishRecording('until');
    }

    function finishRecording(stoppedBy) {
        const { rec } = recorder;
        rec.stoppedBy = stoppedBy;
        recorder = null;
        stepper.unhook();
        return summarizeRecording(rec);
    }

    function applyPlayerFrame() {
        if (!player) return;
        const { rec, bindings, poseTargets, head, lastPoses } = player;
        const frame = rec.frames[frameIndexAt(rec.frames, head)];
        bindings.forEach((variable, i) => {
            if (variable && frame.values[i] !== undefined) world.hold(variable, frame.values[i]);
        });
        poseTargets.forEach((target, i) => {
            if (!target || same(lastPoses[i], frame.poses[i])) return;
            applyPose(target, frame.poses[i]);
            lastPoses[i] = frame.poses[i];
        });
    }

    function advancePlayback() {
        if (!player) return;
        const current = stepper.now();
        const elapsed = current - player.last;
        player.last = current;
        const { frames } = player.rec;
        const first = frames[0].t;
        const end = frames.at(-1).t;
        const wraps = player.loop && player.speed !== Infinity && end > first;
        const target = player.speed === Infinity ? end : player.head + elapsed * player.speed;
        player.head = target <= end ? target : wraps ? first + ((target - first) % (end - first)) : end;
        applyPlayerFrame();
        if (player.head >= end && player.speed > 0 && !wraps) {
            if (player.park) player.speed = 0;
            else finishPlayback(true);
        }
    }

    function finishPlayback(completed) {
        const finished = player;
        player = null;
        if (finished.before) savestates.restore(finished.before);
        finished.resolve({ completed });
        stepper.unhook();
    }

    function startPlayback(rec, speed, { restore: restoreAfter = false, park = false, loop = false } = {}) {
        if (!rec.frames.length) throw new Error(`recording "${rec.name}" has no frames`);
        if (player) finishPlayback(false);
        let resolve;
        const done = new Promise(r => { resolve = r; });
        const mine = {
            rec,
            speed,
            head: rec.frames[0].t,
            last: stepper.now(),
            bindings: rec.columns.map(col => world.liveTarget(col.key)?.variables[col.id] ?? null),
            poseTargets: rec.poses.map(key => world.liveTarget(key) ?? null),
            lastPoses: [],
            before: restoreAfter ? savestates.capture('playrec-restore', false) : null,
            park,
            loop,
            resolve,
        };
        player = mine;
        stepper.hook();
        applyPlayerFrame();
        if (speed === Infinity) advancePlayback();
        const first = rec.frames[0].t;
        const span = rec.frames.at(-1).t - first;
        const alive = () => player === mine;
        const seekTo = head => {
            if (!alive()) return;
            mine.head = head;
            mine.last = stepper.now();
            applyPlayerFrame();
        };
        const frameAt = () => frameIndexAt(rec.frames, mine.head);
        mine.handle = {
            name: rec.name,
            done,
            frames: rec.frames.length,
            duration: span,
            speed(value) {
                if (value === undefined) return mine.speed;
                checkSpeed(value);
                mine.speed = value;
                mine.last = stepper.now();
            },
            loop(value) {
                if (value !== undefined) mine.loop = !!value;
                return mine.loop;
            },
            seek: fraction => seekTo(first + Math.min(1, Math.max(0, fraction)) * span),
            seekFrame: index => seekTo(rec.frames[Math.min(rec.frames.length - 1, Math.max(0, index))].t),
            frame: frameAt,
            time: () => mine.head - first,
            position: () => span ? (mine.head - first) / span : 1,
            stop() {
                if (alive()) finishPlayback(false);
            },
        };
        return mine.handle;
    }

    stepper.tap({ order: 10, before: applyPlayerFrame, after: advancePlayback, active: () => !!player });
    stepper.tap({ order: 30, after: sampleRecording, active: () => !!recorder });

    return {
        recording: () => recorder ? recorder.rec.name : null,
        playing: () => player ? player.rec.name : null,

        dispose() {
            if (player) finishPlayback(false);
            if (recorder) finishRecording('dispose');
        },

        api: {
            startrec(name, options = {}) {
                if (name !== null && typeof name === 'object') [name, options] = [undefined, name];
                return startRecording(name ?? nextName('rec', recordings), options);
            },

            stoprec() {
                if (!recorder) throw new Error('not recording');
                return finishRecording('stoprec');
            },

            playrec(name, speed = 1, options = {}) {
                checkSpeed(speed);
                return startPlayback(recordingNamed(name), speed, options);
            },

            stopplay() {
                if (player) finishPlayback(false);
            },

            replay: () => player?.handle ?? null,

            recvars(name) {
                const rec = named(recordings, name, 'recording');
                return rec.columns.map(col => {
                    const target = world.liveTarget(col.key);
                    return {
                        sprite: target ? world.spriteName(target) : col.key,
                        clone: target ? world.cloneNumber(target) : 0,
                        name: col.name,
                        kind: col.type === 'list' ? 'list' : 'var',
                    };
                });
            },

            recseries(name, variable, scope) {
                const rec = named(recordings, name, 'recording');
                const matches = rec.columns.map((col, i) => ({ col, i })).filter(({ col }) => col.name === variable && col.type !== 'list');
                if (!matches.length) throw new Error(`recording "${rec.name}" has no variable named "${variable}"${didYouMean(variable, rec.columns.map(c => c.name))}`);
                const wanted = scope?.sprite === undefined ? matches : matches.filter(({ col }) => {
                    const target = world.liveTarget(col.key);
                    return target && world.spriteName(target) === scope.sprite;
                });
                if (!wanted.length) throw new Error(`"${variable}" was not recorded on sprite "${scope.sprite}"`);
                if (scope?.sprite === undefined && wanted.length > 1) throw new Error(`"${variable}" is ambiguous in "${rec.name}"; pass { sprite }`);
                const origin = rec.frames[0]?.t ?? 0;
                return rec.frames.map(frame => ({ t: frame.t - origin, value: frame.values[wanted[0].i] }));
            },

            recs: () => [...recordings.values()].map(summarizeRecording),

            droprec(name) {
                recordings.delete(recordingNamed(name).name);
            },
        },
    };
}
