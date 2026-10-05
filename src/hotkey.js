export const HOTKEY_LABEL = 'Alt+Shift+D';

export const isHotkey = event =>
    event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyD';

export function installHotkey(target, toggle) {
    const onKeyDown = event => {
        if (!isHotkey(event) || event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
    };
    target.addEventListener('keydown', onKeyDown, true);
    return () => target.removeEventListener('keydown', onKeyDown, true);
}
