const CELL_LENGTH = 60;

const cell = value => {
    if (!Array.isArray(value)) return value;
    const text = JSON.stringify(value);
    return `[${value.length}] ${text.length > CELL_LENGTH ? `${text.slice(0, CELL_LENGTH - 1)}…` : text}`;
};

export const tableRows = rows => rows.map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cell(value)])));
