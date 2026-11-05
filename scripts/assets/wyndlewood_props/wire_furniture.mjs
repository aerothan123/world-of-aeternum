// Wire the Wyndlewood furniture catalogue (assets_src/wyndlewood_props/
// furniture_catalog.json) into the housing records: for every `new` row whose
// GLB ships (public/models/props/wyn_<id>.glb) a FurnitureRenderKey, a
// FurnitureDef, an ItemDef, a Furnishing recipe, the house renderer's key list,
// the English catalog name and the non-Latin locale fills (M16); for every
// `repoint` row whose model ships, the existing FurnitureDef's renderKey and
// scale (the item, its recipe and its function stay). Idempotent: a row
// already wired is skipped. Prints the counts the pinned tests need.
// usage: node scripts/assets/wyndlewood_props/wire_furniture.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const cat = JSON.parse(readFileSync('assets_src/wyndlewood_props/furniture_catalog.json', 'utf8'));
const pascal = (s) => s.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const keyFor = (id) => `wyn${pascal(id.replace(/^[a-z]+_/, ''))}`;
const ships = (id) => existsSync(`public/models/props/wyn_${id}.glb`);
const files = {};
const read = (f) => (files[f] ??= readFileSync(f, 'utf8'));
const put = (f, s) => {
  files[f] = s;
};
function insertBefore(f, re, text, label) {
  const s = read(f);
  const m = re.exec(s);
  if (!m) throw new Error(`${label}: anchor not found in ${f}`);
  put(f, s.slice(0, m.index) + text + s.slice(m.index));
}
function insertAfterLine(f, needle, text, label) {
  const s = read(f);
  const at = s.indexOf(needle);
  if (at < 0) throw new Error(`${label}: anchor not found in ${f}`);
  const end = s.indexOf('\n', at) + 1;
  put(f, s.slice(0, end) + text + s.slice(end));
}
const FURN = 'src/sim/content/furniture.ts';
const HOUSE = 'src/render/house_furniture.ts';
const ITEMS = 'src/ui/i18n.catalog/items.ts';
const RECIPES = 'src/sim/content/recipes.ts';
const LOCALES = ['ja_JP', 'ko_KR', 'ru_RU', 'zh_CN', 'zh_TW'];

const renderKeys = [];
const unionHas = (k) => read(FURN).includes(`| '${k}'`);
const addKey = (k) => {
  if (!unionHas(k) && !renderKeys.includes(k)) renderKeys.push(k);
};

// Repoints: swap renderKey + scale on the existing def line.
let repointed = 0;
for (const r of cat.repoint) {
  if (!ships(r.model)) continue;
  const k = keyFor(r.model);
  addKey(k);
  const re = new RegExp(
    `(\\{ itemId: '${r.itemId}', kind: '\\w+', renderKey: )'\\w+'(, scale: )[\\d.]+`,
  );
  const s = read(FURN);
  if (re.test(s)) {
    put(FURN, s.replace(re, `$1'${k}'$2${r.scale}`));
  } else {
    // A multi-line station def: renderKey and scale on their own lines.
    const block = new RegExp(
      `(itemId: '${r.itemId}',[\\s\\S]*?renderKey: )'\\w+'(,\\s*scale: )[\\d.]+`,
    );
    if (!block.test(s)) throw new Error(`repoint ${r.itemId}: def not found`);
    put(FURN, s.replace(block, `$1'${k}'$2${r.scale}`));
  }
  repointed++;
}

const fresh = cat.new.filter(
  (n) => ships(n.itemId) && !read(FURN).includes(`itemId: '${n.itemId}'`),
);
for (const n of fresh) addKey(keyFor(n.itemId));

if (renderKeys.length) {
  insertBefore(
    FURN,
    /;\n\nexport interface FurnitureDef/,
    renderKeys.map((k) => `\n  | '${k}'`).join(''),
    'render key union',
  );
  insertBefore(
    HOUSE,
    /\n\] as const satisfies readonly Exclude<FurnitureRenderKey, 'rug'>\[\];/,
    renderKeys.map((k) => `\n  '${k}',`).join(''),
    'house key list',
  );
}

if (fresh.length) {
  const fam = (f) => fresh.filter((n) => n.family === f);
  const defRows = ['rustic', 'cottage', 'noble', 'crafter']
    .filter((f) => fam(f).length)
    .map(
      (f) =>
        `  // The Wyndlewood ${f} family (assets_src/wyndlewood_props/furniture_catalog.json).\n` +
        fam(f)
          .map(
            (n) =>
              `  { itemId: '${n.itemId}', kind: '${n.kind}', renderKey: '${keyFor(n.itemId)}', scale: ${n.scale} },\n`,
          )
          .join(''),
    )
    .join('');
  insertBefore(FURN, /\]\);\n\nconst DEF_BY_ITEM/, defRows, 'defs');

  const price = cat.price;
  const input = (n) => n.reagents.reduce((s, r) => s + price[r.itemId] * r.count, 0);
  const sell = (n) => Math.max(1, Math.floor(input(n) * 0.6));
  const itemsAt = read(FURN).indexOf('export const FURNITURE_ITEMS');
  const close = read(FURN).indexOf('\n};', itemsAt);
  const itemRows = fresh
    .map((n) => `  ${n.itemId}: furnitureItem('${n.itemId}', '${n.name}', ${sell(n)}),\n`)
    .join('');
  const s = read(FURN);
  put(FURN, `${s.slice(0, close + 1)}${itemRows}${s.slice(close + 1)}`);

  const recipeRows = fresh
    .map(
      (n) => `  {
    id: 'recipe_${n.itemId}',
    professionId: 'furnishing',
    resultItemId: '${n.itemId}',
    resultCount: 1,
    // Input ${input(n)} vs output ${sell(n)}.
    reagents: [
${n.reagents.map((r) => `      { itemId: '${r.itemId}', count: ${r.count} },`).join('\n')}
    ],
    skillReq: 0,
    itemLevelBudget: ${n.level},
    level: ${n.level},
    stationType: 'toolworks',
    acquisition: ['trainer'],
  },
`,
    )
    .join('');
  const rs = read(RECIPES);
  const ra = rs.indexOf('export const FURNISHING_RECIPES');
  const rc = rs.indexOf('\n];', ra);
  put(RECIPES, `${rs.slice(0, rc + 1)}${recipeRows}${rs.slice(rc + 1)}`);

  insertBefore(
    ITEMS,
    /\n\] as const;\n\ntype ItemEntityId/,
    fresh.map((n) => `\n  '${n.itemId}',`).join(''),
    'item entity ids',
  );
  insertAfterLine(
    ITEMS,
    "  furn_folding_worktable: 'Folding Worktable',",
    fresh.map((n) => `  ${n.itemId}: '${n.name.replace(/'/g, "\\'")}',\n`).join(''),
    'item names',
  );
  for (const loc of LOCALES) {
    const f = `src/ui/i18n.locales/${loc}.ts`;
    insertAfterLine(
      f,
      "'entities.items.furn_folding_worktable.name'",
      fresh
        .map(
          (n) => `  'entities.items.${n.itemId}.name': '${n.names[loc].replace(/'/g, "\\'")}',\n`,
        )
        .join(''),
      `${loc} names`,
    );
  }
}

for (const [f, s] of Object.entries(files)) writeFileSync(f, s);
const recipes = (() => {
  const s = read(RECIPES);
  const a = s.indexOf('export const FURNISHING_RECIPES');
  return (s.slice(a, s.indexOf('\n];', a)).match(/resultItemId:/g) ?? []).length;
})();
const defs = (read(FURN).match(/itemId: 'furn_/g) ?? []).length;
console.log(
  `wire_furniture: ${fresh.length} new, ${repointed} repointed, ${renderKeys.length} render keys;`,
  `FURNISHING_RECIPES rows ${recipes}; furniture defs ${defs}; new ids: ${fresh.map((n) => n.itemId).join(' ')}`,
);
