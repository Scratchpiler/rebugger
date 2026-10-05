const NAME = 'rebugger';
const COLORS = { info: '#7c3aed', warn: '#d97706', error: '#dc2626' };
const COMMAND = 'color:#8b5cf6;font-weight:600';
const TITLE = 'font-weight:700;text-decoration:underline';
const RESET = '';

const badge = level => `background:${COLORS[level]};color:#fff;font-weight:700;border-radius:3px;padding:1px 6px`;
const literal = text => String(text).replaceAll('%', '%%');

export const styled = (level, message, ...rest) => [`%c${NAME}%c ${literal(message)}`, badge(level), RESET, ...rest];

export const styledHelp = (version, groups) => {
    const width = Math.max(...groups.flatMap(({ rows }) => rows.map(([command]) => command.length)));
    let format = `%c${NAME}%c v${version}`;
    const styles = [badge('info'), RESET];
    for (const { title, rows } of groups) {
        format += `\n\n%c${literal(title)}`;
        styles.push(TITLE);
        for (const [command, description] of rows) {
            format += `\n  %c${literal(command.padEnd(width))}%c  ${literal(description)}`;
            styles.push(COMMAND, RESET);
        }
    }
    return [format, ...styles];
};

export const styledReady = (version, hotkey) => [
    `%c${NAME}%c v${version} ready: %crebugger.help()%c for commands, %c${literal(hotkey)}%c for the panel`,
    badge('info'), RESET, COMMAND, RESET, COMMAND, RESET,
];

export const styledStatus = (version, rows) => {
    const width = Math.max(...rows.map(([label]) => label.length));
    const format = [`%c${NAME}%c v${version}`, ...rows.map(([label, value]) =>
        `  %c${label.padEnd(width)}%c  ${literal(value)}`)].join('\n');
    return [format, badge('info'), RESET, ...rows.flatMap(() => [COMMAND, RESET])];
};

export const log = {
    info: (message, ...rest) => console.info(...styled('info', message, ...rest)),
    warn: (message, ...rest) => console.warn(...styled('warn', message, ...rest)),
    error: (message, ...rest) => console.error(...styled('error', message, ...rest)),
    ready: (version, hotkey) => console.info(...styledReady(version, hotkey)),
    status: (version, rows) => console.log(...styledStatus(version, rows)),
    help: (version, groups) => console.log(...styledHelp(version, groups)),
};
