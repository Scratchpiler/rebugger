const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export const createAnimator = win => (element, keyframes, options) => {
    if (typeof element.animate !== 'function' || win?.matchMedia?.(REDUCED_MOTION).matches) return null;
    return element.animate(keyframes, { easing: 'cubic-bezier(.2, .8, .2, 1)', ...options });
};

export const MOTION = {
    settle: [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.4 }, { transform: 'scale(1)' }],
    arrive: [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
    shake: [
        { transform: 'translateX(0)' }, { transform: 'translateX(-3px)', offset: 0.25 },
        { transform: 'translateX(3px)', offset: 0.5 }, { transform: 'translateX(-2px)', offset: 0.75 }, { transform: 'translateX(0)' },
    ],
};

export const DURATION = { settle: 240, arrive: 160, shake: 260 };
