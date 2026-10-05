const MAX_FRAMES_PER_TICK = 1000;

export function createStepper(runtime, clock) {
    const taps = [];
    let wrapped = null;
    let original = null;
    let hadOwnStep = false;
    let speedFactor = 1;
    let owed = 0;
    let paused = false;
    let pausedAt = null;
    let pausedTotal = 0;
    let clockPatched = false;
    let scaledClock = false;
    let virtualNow = 0;
    let clockOffset = 0;

    const now = () => (pausedAt ?? clock()) - pausedTotal;
    const frameMs = () => runtime.currentStepTime ?? 1000 / 30;

    function tap(entry) {
        taps.push(entry);
        taps.sort((a, b) => a.order - b.order);
    }

    function hook() {
        if (wrapped) return;
        original = runtime._step;
        hadOwnStep = Object.hasOwn(runtime, '_step');
        wrapped = function () {
            const started = clock();
            const due = framesDue();
            for (let i = 0; i < due; i++) {
                runFrame();
                if (speedFactor === Infinity && clock() - started >= frameMs() / 2) break;
            }
        };
        runtime._step = wrapped;
    }

    function unhook() {
        if (!wrapped || paused || speedFactor !== 1 || taps.some(t => t.active()) || runtime._step !== wrapped) return;
        if (hadOwnStep) runtime._step = original;
        else delete runtime._step;
        wrapped = null;
    }

    function framesDue() {
        if (paused) return 0;
        if (speedFactor === Infinity) return MAX_FRAMES_PER_TICK;
        owed += speedFactor;
        const due = Math.floor(owed + 1e-9);
        owed -= due;
        return Math.min(due, MAX_FRAMES_PER_TICK);
    }

    function runFrame() {
        if (scaledClock) virtualNow += frameMs();
        for (const { before } of taps) before?.();
        original.call(runtime);
        for (const { after } of taps) after?.();
    }

    function syncClock() {
        const wantScaled = paused || speedFactor !== 1;
        if (wantScaled === scaledClock) return;
        if (wantScaled) {
            if (!clockPatched) {
                clockPatched = true;
                runtime.updateCurrentMSecs = () => {
                    runtime.currentMSecs = scaledClock ? virtualNow : Date.now() + clockOffset;
                };
            }
            virtualNow = runtime.currentMSecs;
        } else {
            clockOffset = virtualNow - Date.now();
        }
        scaledClock = wantScaled;
    }

    function reset() {
        speedFactor = 1;
        paused = false;
        pausedAt = null;
        syncClock();
        if (clockPatched) delete runtime.updateCurrentMSecs;
        clockPatched = false;
        scaledClock = false;
    }

    const api = {
        speed(value) {
            if (value === undefined) return speedFactor;
            if (typeof value !== 'number' || !(value > 0)) {
                throw new RangeError('speed must be above 0 (pause() stops the project); Infinity runs as many frames as fit in half a frame');
            }
            speedFactor = value;
            owed = 0;
            syncClock();
            if (speedFactor !== 1) hook();
            else unhook();
            return value;
        },

        pause() {
            if (paused) return;
            paused = true;
            pausedAt = clock();
            syncClock();
            hook();
        },

        resume() {
            if (!paused) return;
            pausedTotal += clock() - pausedAt;
            pausedAt = null;
            paused = false;
            owed = 0;
            syncClock();
            unhook();
        },

        step(count = 1) {
            if (!paused) throw new Error('not paused: pause() first');
            if (!Number.isInteger(count) || count < 1) throw new RangeError('step count must be a whole number from 1 up');
            for (let i = 0; i < count; i++) {
                pausedTotal -= frameMs();
                runFrame();
            }
            return count;
        },
    };

    return { tap, hook, unhook, now, reset, state: () => ({ speed: speedFactor, paused }), api };
}
