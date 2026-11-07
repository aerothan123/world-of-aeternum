// Encounter Timer: a Wyndlewood SDK example (docs/design/addon-api.md 10).
// A stopwatch that starts on COMBAT_START, best times per target saved per
// character, the target's cast mirrored from the same state the target cast
// bar shows, and player-started countdown bars. A pull timer is local only:
// telling the party is the player typing in chat, never the add-on.
/// <reference path="../../wynd-addon-api.d.ts" />

const db = wynd.saved.character;
db.best = db.best && typeof db.best === 'object' ? db.best : {};

const WIDTH = 200;
const frame = wynd.ui.create('frame', {
  name: 'main',
  point: 'TOP',
  relativePoint: 'TOP',
  y: 120,
  width: WIDTH,
  height: 46,
  movable: true,
  backdrop: { color: '#0d0d13b3', borderColor: '#c9a54a' },
});
const clock = wynd.ui.create('text', {
  parent: frame,
  point: 'TOP',
  relativePoint: 'TOP',
  y: 4,
  size: 16,
  bold: true,
  text: '0',
});
const sub = wynd.ui.create('text', {
  parent: frame,
  point: 'BOTTOM',
  relativePoint: 'BOTTOM',
  y: -4,
  size: 11,
  color: 'muted',
  text: 'Out of combat',
});
const castBar = wynd.ui.create('bar', {
  parent: frame,
  point: 'TOPLEFT',
  relativePoint: 'BOTTOMLEFT',
  y: 2,
  width: WIDTH,
  height: 14,
  min: 0,
  max: 1,
  color: 'warn',
  shown: false,
});
const castText = wynd.ui.create('text', { parent: castBar, point: 'LEFT', x: 4, size: 10 });

let fight = null; // { start, target }
const timers = []; // { label, end, total, bar, text }

function timerRowY(i) {
  return 64 + i * 18;
}

function addTimer(label, seconds) {
  if (timers.length >= 6) timers.shift().bar.destroy();
  const bar = wynd.ui.create('bar', {
    parent: frame,
    point: 'TOPLEFT',
    relativePoint: 'TOPLEFT',
    width: WIDTH,
    height: 16,
    min: 0,
    max: seconds,
    value: seconds,
    color: 'info',
  });
  const text = wynd.ui.create('text', { parent: bar, point: 'LEFT', x: 4, size: 10 });
  timers.push({ label, end: wynd.time() + seconds, total: seconds, bar, text });
}

wynd.on('COMBAT_START', (e) => {
  const t = wynd.unit('target');
  fight = { start: e.time, target: t?.hostile ? t.name : null };
});

wynd.on('COMBAT_END', (e) => {
  if (!fight) return;
  const secs = Math.round(e.time - fight.start);
  if (fight.target) {
    const prev = db.best[fight.target];
    if (typeof prev !== 'number' || secs < prev) {
      db.best[fight.target] = secs;
      wynd.print(`New best against ${fight.target}: ${wynd.format.duration(secs)}`);
    }
    wynd.saved.save();
  }
  sub.set({ text: `Last fight ${wynd.format.duration(secs)}` });
  fight = null;
});

wynd.on('UPDATE', () => {
  const now = wynd.time();
  if (fight) {
    clock.set({ text: wynd.format.duration(now - fight.start), color: 'warn' });
    const best = fight.target ? db.best[fight.target] : undefined;
    sub.set({
      text: fight.target
        ? `${fight.target}${typeof best === 'number' ? `  best ${wynd.format.duration(best)}` : ''}`
        : 'In combat',
    });
  } else {
    clock.set({ color: 'text' });
  }
  const target = wynd.unit('target');
  const cast = target?.cast;
  if (cast) {
    castBar.set({ shown: true, value: cast.progress, color: cast.channel ? 'info' : 'warn' });
    castText.set({ text: `${target.name}: ${cast.ability}` });
  } else {
    castBar.set({ shown: false });
  }
  for (let i = timers.length - 1; i >= 0; i--) {
    const tm = timers[i];
    const left = tm.end - now;
    if (left <= 0) {
      wynd.print(`${tm.label} now!`, 'warn');
      tm.bar.destroy();
      timers.splice(i, 1);
    }
  }
  timers.forEach((tm, i) => {
    const left = Math.max(0, tm.end - now);
    tm.bar.set({ value: left, y: timerRowY(i) });
    tm.text.set({ text: `${tm.label}  ${wynd.format.number(left, { maximumFractionDigits: 1 })}` });
  });
  frame.set({ height: 46 });
});

wynd.slash('et', (args) => {
  const parts = args.split(/\s+/).filter(Boolean);
  if (parts[0] === 'clear') {
    for (const tm of timers.splice(0)) tm.bar.destroy();
    return;
  }
  if (parts[0] === 'pull') {
    const n = Math.min(60, Math.max(1, Number(parts[1]) || 10));
    addTimer('Pull', n);
    return;
  }
  const secs = Number(parts[0]);
  if (!Number.isFinite(secs) || secs <= 0 || secs > 3600) {
    wynd.print('Usage: /et <seconds> [label], /et pull <seconds>, /et clear');
    return;
  }
  addTimer(parts.slice(1).join(' ') || 'Timer', secs);
});
