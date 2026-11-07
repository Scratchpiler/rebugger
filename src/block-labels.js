const TEMPLATES = {
    event_whenflagclicked: 'when flag clicked',
    event_whenkeypressed: 'when {KEY_OPTION} key pressed',
    event_whenthisspriteclicked: 'when this sprite clicked',
    event_whenstageclicked: 'when stage clicked',
    event_whenbackdropswitchesto: 'when backdrop switches to {BACKDROP}',
    event_whengreaterthan: 'when {WHENGREATERTHANMENU} > value',
    event_whenbroadcastreceived: 'when I receive {BROADCAST_OPTION}',
    event_broadcast: 'broadcast {BROADCAST_INPUT}',
    event_broadcastandwait: 'broadcast {BROADCAST_INPUT} and wait',
    control_wait: 'wait',
    control_repeat: 'repeat',
    control_forever: 'forever',
    control_if: 'if',
    control_if_else: 'if else',
    control_wait_until: 'wait until',
    control_repeat_until: 'repeat until',
    control_while: 'while',
    control_for_each: 'for each {VARIABLE}',
    control_stop: 'stop {STOP_OPTION}',
    control_start_as_clone: 'when I start as a clone',
    control_create_clone_of: 'create clone of {CLONE_OPTION}',
    control_delete_this_clone: 'delete this clone',
    motion_movesteps: 'move steps',
    motion_turnright: 'turn right',
    motion_turnleft: 'turn left',
    motion_goto: 'go to {TO}',
    motion_gotoxy: 'go to x y',
    motion_glideto: 'glide to {TO}',
    motion_glidesecstoxy: 'glide to x y',
    motion_pointindirection: 'point in direction',
    motion_pointtowards: 'point towards {TOWARDS}',
    motion_changexby: 'change x by',
    motion_setx: 'set x',
    motion_changeyby: 'change y by',
    motion_sety: 'set y',
    motion_ifonedgebounce: 'if on edge, bounce',
    motion_setrotationstyle: 'set rotation style {STYLE}',
    looks_sayforsecs: 'say for secs',
    looks_say: 'say',
    looks_thinkforsecs: 'think for secs',
    looks_think: 'think',
    looks_switchcostumeto: 'switch costume to {COSTUME}',
    looks_nextcostume: 'next costume',
    looks_switchbackdropto: 'switch backdrop to {BACKDROP}',
    looks_nextbackdrop: 'next backdrop',
    looks_changesizeby: 'change size by',
    looks_setsizeto: 'set size to',
    looks_changeeffectby: 'change {EFFECT} effect by',
    looks_seteffectto: 'set {EFFECT} effect to',
    looks_cleargraphiceffects: 'clear graphic effects',
    looks_show: 'show',
    looks_hide: 'hide',
    sound_playuntildone: 'play sound {SOUND_MENU} until done',
    sound_play: 'start sound {SOUND_MENU}',
    sound_stopallsounds: 'stop all sounds',
    sound_changevolumeby: 'change volume by',
    sound_setvolumeto: 'set volume to',
    sensing_askandwait: 'ask and wait',
    sensing_resettimer: 'reset timer',
    data_setvariableto: 'set {VARIABLE} to',
    data_changevariableby: 'change {VARIABLE} by',
    data_showvariable: 'show variable {VARIABLE}',
    data_hidevariable: 'hide variable {VARIABLE}',
    data_addtolist: 'add to {LIST}',
    data_deleteoflist: 'delete of {LIST}',
    data_deletealloflist: 'delete all of {LIST}',
    data_insertatlist: 'insert at {LIST}',
    data_replaceitemoflist: 'replace item of {LIST}',
    pen_clear: 'erase all',
    pen_stamp: 'stamp',
    pen_penDown: 'pen down',
    pen_penUp: 'pen up',
};

export const WAITING = new Set([
    'control_wait', 'control_wait_until', 'motion_glideto', 'motion_glidesecstoxy', 'looks_sayforsecs', 'looks_thinkforsecs',
    'sound_playuntildone', 'sensing_askandwait', 'event_broadcastandwait',
]);

export const UNTIMED = new Set(['control_wait_until', 'sensing_askandwait', 'event_broadcastandwait', 'sound_playuntildone']);

const fieldValue = (blocks, block, name) => {
    const field = block.fields?.[name];
    if (field) return String(field.value);
    const input = block.inputs?.[name];
    const menu = input && blocks.getBlock(input.shadow ?? input.block);
    const first = menu && Object.values(menu.fields ?? {})[0];
    return first ? String(first.value) : '';
};

const proccodeOf = mutation => String(mutation?.proccode ?? '').replace(/%[sbn]/g, '').replace(/\s+/g, ' ').trim();

const fallback = opcode => opcode.replace(/^[a-z0-9]+_/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

export function blockLabel(blocks, id) {
    const block = id && blocks?.getBlock(id);
    if (!block) return '';
    if (block.opcode === 'procedures_call') return proccodeOf(block.mutation) || 'call';
    if (block.opcode === 'procedures_definition') {
        const prototype = blocks.getBlock(block.inputs?.custom_block?.block);
        return `define ${proccodeOf(prototype?.mutation)}`.trim();
    }
    const template = TEMPLATES[block.opcode];
    if (!template) return fallback(block.opcode);
    return template.replace(/\{(\w+)\}/g, (_, name) => fieldValue(blocks, block, name)).replace(/\s+/g, ' ').trim();
}

export const proccodeLabel = proccodeOf;
