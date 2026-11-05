// Simple Damage Meter: a Wyndlewood SDK example (docs/design/addon-api.md 10).
// Sums COMBAT_LOG damage or healing per party member (pets fold into their
// owner), segments by COMBAT_START / COMBAT_END, and draws sorted bars in a
// movable frame. Everything it reads is what the built-in meters read.
/// <reference path="../../wynd-addon-api.d.ts" />

const ROW_H = 18;
const WIDTH = 220;
const db = wynd.saved.account;
db.fights = typeof db.fights === 'number' ? db.fights : 0;

const fresh = (start, active) => ({ active, start, end: 0, damage: new Map(), healing: new Map() });
let segment = fresh(0, false);
let maxRows = Number(wynd.settings.get('rows')) || 5;

const frame = wynd.ui.create('frame', {
  name: 'main',
  point: 'TOPRIGHT',
  relativePoint: 'TOPRIGHT',
  x: -240,
  y: 220,
  width: WIDTH,
  height: 24 + ROW_H * maxRows,
  movable: true,
  backdrop: { color: '#0d0d13cc', borderColor: 'accent' },
});
const title = wynd.ui.create('text', {
  parent: frame,
  point: 'TOPLEFT',
  x: 6,
  y: 4,
  size: 12,
  bold: true,
  color: 'accent',
});

const rows = [];
for (let i = 0; i < 10; i++) {
  const bar = wynd.ui.create('bar', {
    parent: frame,
    point: 'TOPLEFT',
    x: 4,
    y: 22 + i * ROW_H,
    width: WIDTH - 8,
    height: ROW_H - 2,
    min: 0,
    max: 1,
    value: 0,
    shown: false,
  });
  const label = wynd.ui.create('text', { parent: bar, point: 'LEFT', x: 4, size: 11 });
  const amount = wynd.ui.create('text', {
    parent: bar,
    point: 'RIGHT',
    relativePoint: 'RIGHT',
    x: -4,
    size: 11,
  });
  rows.push({ bar, label, amount });
}

function ownerName(actor) {
  if (!actor) return null;
  if (actor.isPet) return actor.ownerName || null;
  return actor.isParty ? actor.name : null;
}

function add(map, who, n) {
  map.set(who, (map.get(who) || 0) + n);
}

wynd.on('COMBAT_LOG', (e) => {
  if (!segment.active) return;
  const who = ownerName(e.source);
  if (!who || !e.source.isParty) return;
  if (e.kind === 'damage' && e.amount > 0) add(segment.damage, who, e.amount);
  if (e.kind === 'heal') add(segment.healing, who, Math.max(0, e.amount - (e.overheal || 0)));
});

wynd.on('COMBAT_START', (e) => {
  segment = fresh(e.time, true);
});
wynd.on('COMBAT_END', (e) => {
  segment.active = false;
  segment.end = e.time;
  db.fights += 1;
});

function paint() {
  const mode = wynd.settings.get('mode') === 'healing' ? 'healing' : 'damage';
  const map = mode === 'healing' ? segment.healing : segment.damage;
  const now = segment.end || wynd.time();
  const began = segment.active || segment.end > 0;
  const secs = began ? Math.max(1, now - segment.start) : 1;
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.length > 0 ? sorted[0][1] : 1;
  title.set({
    text: `${mode === 'healing' ? 'HPS' : 'DPS'}  ${wynd.format.duration(began ? secs : 0)}`,
  });
  frame.set({ height: 24 + ROW_H * maxRows });
  rows.forEach((row, i) => {
    const entry = i < maxRows ? sorted[i] : undefined;
    if (!entry) {
      row.bar.set({ shown: false });
      return;
    }
    const [name, total] = entry;
    const color = mode === 'healing' ? 'good' : 'bad';
    row.bar.set({ shown: true, value: total / top, color, bgColor: '#00000066' });
    row.label.set({ text: `${i + 1}. ${name}` });
    row.amount.set({ text: wynd.format.number(total / secs, { maximumFractionDigits: 0 }) });
  });
}

wynd.every(0.5, paint);
wynd.on('SETTING_CHANGED', (e) => {
  if (e.key === 'rows') maxRows = Number(e.value) || 5;
  paint();
});

wynd.slash('sdm', (args) => {
  if (args === 'reset') {
    segment = fresh(0, false);
    paint();
    wynd.print('Meter reset.');
  } else {
    wynd.print(`Fights recorded: ${db.fights}. Use /sdm reset to clear.`);
  }
});

paint();
