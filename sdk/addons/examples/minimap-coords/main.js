// Minimap Coordinates: a Wyndlewood SDK example (docs/design/addon-api.md 10).
// Shows player coordinates, heading and marker counts under the minimap, and a
// square radar that redraws wynd.minimap().markers. It can only show what the
// built-in minimap already shows: markers arrive clipped to its radius.
/// <reference path="../../wynd-addon-api.d.ts" />

const SIZE = 120;
const DOTS = 48;
const COLORS = {
  mob: 'bad',
  npc: 'accent',
  'party-disc': 'good',
  'party-arrow': 'good',
  'gather-node': 'info',
  ally: 'buff',
};
const HEADINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const panel = wynd.ui.create('frame', {
  name: 'coords',
  point: 'TOPRIGHT',
  relativePoint: 'TOPRIGHT',
  x: -20,
  y: 200,
  width: 170,
  height: 38,
  movable: true,
  backdrop: { color: '#0d0d13b3' },
});
const coords = wynd.ui.create('text', { parent: panel, point: 'TOPLEFT', x: 6, y: 4, size: 12 });
const counts = wynd.ui.create('text', {
  parent: panel,
  point: 'BOTTOMLEFT',
  relativePoint: 'BOTTOMLEFT',
  x: 6,
  y: -4,
  size: 10,
  color: 'muted',
});

const radar = wynd.ui.create('frame', {
  name: 'radar',
  point: 'TOPRIGHT',
  relativePoint: 'TOPRIGHT',
  x: -20,
  y: 244,
  width: SIZE,
  height: SIZE,
  movable: true,
  backdrop: { color: '#0d0d1399', borderColor: 'muted' },
});
const center = wynd.ui.create('frame', {
  parent: radar,
  point: 'CENTER',
  relativePoint: 'CENTER',
  width: 5,
  height: 5,
  backdrop: { color: 'text' },
});
const dots = [];
for (let i = 0; i < DOTS; i++) {
  dots.push(
    wynd.ui.create('frame', {
      parent: radar,
      point: 'CENTER',
      relativePoint: 'CENTER',
      width: 4,
      height: 4,
      shown: false,
    }),
  );
}

function heading(facing) {
  // facing 0 = +Z (south on the minimap), growing counter-clockwise.
  const deg = (((180 - (facing * 180) / Math.PI) % 360) + 360) % 360;
  return HEADINGS[Math.round(deg / 45) % 8];
}

const db = wynd.saved.account;

function radarShown() {
  return wynd.settings.get('radar') !== false && db.radarHidden !== true;
}

wynd.every(0.2, () => {
  const mm = wynd.minimap();
  if (!mm) return;
  coords.set({ text: `${Math.round(mm.x)}, ${Math.round(mm.z)}  ${heading(mm.facing)}` });
  const tally = {};
  for (const m of mm.markers) tally[m.kind] = (tally[m.kind] || 0) + 1;
  counts.set({
    text: `mobs ${tally.mob || 0}  npcs ${tally.npc || 0}  nodes ${tally['gather-node'] || 0}`,
  });
  const show = radarShown();
  radar.set({ shown: show });
  center.set({ shown: show });
  if (!show) return;
  const scale = SIZE / 2 / mm.radiusYards;
  dots.forEach((dot, i) => {
    const m = mm.markers[i];
    if (!m || !COLORS[m.kind]) {
      dot.set({ shown: false });
      return;
    }
    dot.set({
      shown: true,
      x: Math.round(m.dx * scale),
      y: Math.round(m.dz * scale),
      backdrop: { color: COLORS[m.kind] },
    });
  });
});

wynd.slash('mmc', (args) => {
  if (args === 'radar') {
    db.radarHidden = db.radarHidden !== true;
    wynd.saved.save();
    wynd.print(db.radarHidden ? 'Radar hidden.' : 'Radar shown.');
  } else {
    wynd.print('Minimap Coordinates: /mmc radar');
  }
});
