import { test, assert } from './helpers.js';
import { createAnimator, MOTION, DURATION } from '../src/animate.js';

const element = () => {
    const calls = [];
    return { calls, animate: (keyframes, options) => { calls.push({ keyframes, options }); return 'animation'; } };
};

test('the animator plays keyframes through the Web Animations API with a default easing', () => {
    const play = createAnimator({ matchMedia: () => ({ matches: false }) });
    const el = element();
    assert.equal(play(el, MOTION.arrive, { duration: DURATION.arrive }), 'animation');
    assert.equal(el.calls[0].keyframes, MOTION.arrive);
    assert.equal(el.calls[0].options.duration, 160);
    assert.match(el.calls[0].options.easing, /cubic-bezier/);
});

test('reduced motion and missing support turn every animation into a no-op', () => {
    const el = element();
    assert.equal(createAnimator({ matchMedia: () => ({ matches: true }) })(el, MOTION.settle, {}), null);
    assert.equal(el.calls.length, 0);
    assert.equal(createAnimator({ matchMedia: () => ({ matches: false }) })({}, MOTION.settle, {}), null);
    assert.equal(createAnimator(undefined)(el, MOTION.settle, {}).valueOf(), 'animation');
});

test('the preference is read on every call so a change takes effect immediately', () => {
    let reduced = false;
    const play = createAnimator({ matchMedia: () => ({ matches: reduced }) });
    const el = element();
    play(el, MOTION.settle, {});
    reduced = true;
    play(el, MOTION.settle, {});
    assert.equal(el.calls.length, 1);
});

test('every motion has a duration and only moves compositor properties', () => {
    for (const name of Object.keys(MOTION)) {
        assert.ok(DURATION[name] > 0, name);
        for (const frame of MOTION[name]) {
            assert.deepEqual(Object.keys(frame).filter(key => !['opacity', 'transform', 'offset'].includes(key)), [], name);
        }
    }
});
