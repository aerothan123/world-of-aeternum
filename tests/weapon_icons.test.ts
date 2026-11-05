import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { WEAPON_IMAGE_IDS, weaponIconUrl } from '../src/ui/icons';
import { ITEM_WEAPON_VARIANTS } from '../src/ui/weapon_variants';
import {
  WYNDLEWOOD_ITEM_BATCH,
  WYNDLEWOOD_LICENSE,
  WYNDLEWOOD_OWNER,
  WYNDLEWOOD_PROVENANCE_RECORD,
  WYNDLEWOOD_SOURCE,
  wyndlewoodRecord,
} from './helpers/wyndlewood_art';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const itemsDir = path.join(repoRoot, 'public/ui/items');
const weaponProvenanceRecord = 'docs/achievements/placeholder-art-completion-2026-08-09/';
const itemConsistencyProvenanceRecord = 'docs/achievements/item-art-consistency-2026-08-09/';
const weaponGenerationRecordFiles = [
  'weapons-a-generation-record.json',
  'weapons-b-generation-record.json',
  'weapons-c-generation-record.md',
  'weapons-d-generation-record.json',
] as const;
const itemMapping = JSON.parse(readFileSync(path.join(itemsDir, 'mapping.json'), 'utf8')) as {
  entries: Array<{ itemId: string }>;
  generatedBatches?: Array<{
    batchId?: string;
    source: string;
    owner?: string;
    license: string;
    provenanceRecord?: string;
    itemIds: string[];
  }>;
};

describe('painted weapon inventory icons', () => {
  const baseWeapons = Object.values(ITEMS)
    .filter((item) => item.kind === 'weapon' && item.heroicOf === undefined)
    .map((item) => item.id)
    .sort();

  it('covers every authored base weapon exactly once', () => {
    // 123 with the class-overhaul integration daggers (rimefang, marrowpoint,
    // duskwhisper, boneglass_shiv), painted in integration-dagger-icons-2026-08-10;
    // 125 with the Masterwrought phase 09 pair (duskforged_warblade,
    // ridgebreaker), now repainted in the final Masterwrought completion wave;
    // 132 with the nine Crucible raid weapons (crucible-raid-weapons-2026-08-28;
    // the Emberflight Longbow was pulled: bows wait for the hunter rework);
    // 133 with the Ignivar legendary maul (varkhul_forgebreaker, rendered in
    // ignivar-varkhul-drop-renders-2026-08-28), landed by the base merge:
    // base 133 for this merge.
    //
    // RE-PINNED at this merge of release/v0.42.0 into feature/masterwrought.
    // BOTH parent pins for the record: ours 135 (the masterwrought phase 09
    // pair), the release 136 (the three Nythraxis gap-fill one-handers
    // courtiers_bonefang, thornpeak_wardblade, gravecourt_hewer, rendered in
    // nythraxis-gap-weapon-renders-2026-09-04 and confirmed present in the
    // resolved src/sim/content/zone3.ts). Arithmetic (base 133 + ours' delta
    // +2 + theirs' delta +3 = 138), CONFIRMED by an actual
    // `npx vitest run tests/weapon_icons.test.ts` run on the merged tree:
    // this assertion, and the 19-heroic-copy count in the next test, both
    // pass as-is.
    // 141 with the three faction quartermaster epics (riftwarden_voidblade,
    // dawnkeeper_consecrated_mace, forgemaster_crag_cleaver; batch
    // faction-vendor-icons-2026-09-16), landed by the wq-reputation merge.
    // 141 -> 145: the four Warfare Season 2 honor weapons, painted in
    // warfare-season2-weapons-2026-09-25 (second release/v0.44.0 base merge).
    // 148 with the Mirefen world-boss branch's foremans_barrowmaul, skerrits_shardpike
    // and muster_shardpike. 149 with Balgath's caster spoil, craterglass_stave.
    // + the five-dungeon rework (PR 4352) on the v0.45.0 integration: 163.
    // + the membership Staff of Changing (PR 4281): 164.
    // The restored Season 2 feral staff is one additional authored weapon.
    expect(baseWeapons).toHaveLength(165);
    expect([...WEAPON_IMAGE_IDS].sort()).toEqual(baseWeapons);
    expect(Object.keys(ITEM_WEAPON_VARIANTS).sort()).toEqual(baseWeapons);
    for (const id of baseWeapons) {
      expect(weaponIconUrl(id), id).toBe(`/ui/items/${id}.webp`);
      expect(existsSync(path.join(itemsDir, `${id}.webp`)), `${id}.webp`).toBe(true);
    }
  });

  it('keeps Heroic copies on their canonical base painting', () => {
    const heroics = Object.values(ITEMS).filter(
      (item) => item.kind === 'weapon' && item.heroicOf !== undefined,
    );
    // 16 with heroic_duskwhisper (aliases the duskwhisper base painting); 19
    // with the three Nythraxis gap-fill one-handers' raid-tier variants.
    // 25 with the dungeon rework's six generated Heroic weapons, 30 with the
    // lower dungeons' normal blues' five.
    expect(heroics).toHaveLength(30);
    for (const heroic of heroics) {
      expect(WEAPON_IMAGE_IDS.has(heroic.id), heroic.id).toBe(false);
      expect(weaponIconUrl(heroic.id), heroic.id).toBe(
        `/ui/items/${heroic.heroicOf as string}.webp`,
      );
    }
  });

  it('keeps the historical registry while every weapon has one current generated-art owner', () => {
    const expected = Object.keys(ITEM_WEAPON_VARIANTS).sort();
    const batches = itemMapping.generatedBatches ?? [];
    const weaponBatches = batches.filter((batch) =>
      batch.itemIds.some((id) => Object.hasOwn(ITEM_WEAPON_VARIANTS, id)),
    );
    // The Wyndlewood repaint (scripts/assets/wyndlewood_2d/apply_provenance.mjs) moved every
    // weapon painting out of its upstream batch and dropped each emptied batch, so one batch
    // now owns every weapon and the provenance record pins each weapon's shipped bytes.
    expect(weaponBatches.map(({ batchId }) => batchId)).toEqual([WYNDLEWOOD_ITEM_BATCH]);
    const [repaintBatch] = weaponBatches;
    expect(repaintBatch).toMatchObject({
      source: WYNDLEWOOD_SOURCE,
      owner: WYNDLEWOOD_OWNER,
      license: WYNDLEWOOD_LICENSE,
      provenanceRecord: WYNDLEWOOD_PROVENANCE_RECORD,
    });
    expect(
      repaintBatch.itemIds.filter((id) => Object.hasOwn(ITEM_WEAPON_VARIANTS, id)).sort(),
    ).toEqual(expected);
    for (const id of expected) {
      const bytes = readFileSync(path.join(itemsDir, `${id}.webp`));
      const repaint = wyndlewoodRecord(`public/ui/items/${id}.webp`);
      expect(createHash('sha256').update(bytes).digest('hex'), id).toBe(repaint.shippingSha256);
      expect(bytes.length, id).toBe(repaint.shippingBytes);
    }

    // The superseded weapon batches, each with the exact weapon ids it owned before the
    // repaint. Every one has left the mapping, and every id it named is still a live,
    // painted weapon (so the lineage below still slices the real roster).
    const supersededWeaponBatches: Record<string, string[]> = {
      'integration-dagger-icons-2026-08-10': [
        'boneglass_shiv',
        'duskwhisper',
        'marrowpoint',
        'rimefang',
      ],
      'masterwrought-art-completion-2026-09-02': ['duskforged_warblade', 'ridgebreaker'],
      'crucible-raid-weapons-2026-08-28': [
        'anvilguard_blade',
        'cinderfang_kris',
        'forgefathers_warhammer',
        'forgefire_spire',
        'heart_of_the_end_greatblade',
        'slagrender_cleaver',
        'springtouched_crozier',
        'staff_of_the_last_spring',
        'wand_of_quenched_sparks',
      ],
      'ignivar-varkhul-drop-renders-2026-08-28': ['varkhul_forgebreaker'],
      'nythraxis-gap-weapon-renders-2026-09-04': [
        'courtiers_bonefang',
        'gravecourt_hewer',
        'thornpeak_wardblade',
      ],
      'faction-automaton-painted-icons-v045-2026-10-22': ['forgemaster_crag_cleaver'],
      'faction-church-painted-icons-v045-2026-10-22': ['dawnkeeper_consecrated_mace'],
      'faction-rift-painted-icons-v045-2026-10-22': ['riftwarden_voidblade'],
      'warfare-season2-weapons-2026-09-25': [
        'vanguard_fang_dagger',
        'vanguard_oath_blade',
        'vanguard_verdict_greatsword',
        'vanguard_warstaff',
      ],
      'warfare-season2-feral-staff-2026-09-29': ['vanguard_feral_staff'],
      'balgath-boss-icons-2026-08-18': ['foremans_barrowmaul'],
      'shardpike-mechanic-icons-2026-08-20': ['skerrits_shardpike'],
      'muster-shardpike-icon-2026-09-26': ['muster_shardpike'],
      'balgath-loot-icons-2026-09-28': ['craterglass_stave'],
      'membership-weapon-2026-10-14': ['membership_staff'],
    };
    // The five-dungeon rework's painted batches, which together owned these weapons.
    const reworkBatchIds = [
      'dungeon-temple-blues-painted-icons-v045-2026-10-22',
      'dungeon-bastion-blues-painted-icons-v045-2026-10-22',
      'dungeon-bastion-painted-icons-v045-2026-10-22',
      'dungeon-temple-painted-icons-v045-2026-10-22',
      'dungeon-wildheart-painted-icons-v045-2026-10-22',
      'dungeon-gravewyrm-painted-icons-v045-2026-10-22',
      'dungeon-crypt-painted-icons-v045-2026-10-22',
      'dungeon-crypt-blues-painted-icons-v045-2026-10-22',
    ];
    const reworkWeaponIds = [
      'falls_blessed_staff',
      'fogbinders_rod',
      'gaolyard_cudgel',
      'gravecallers_rod',
      'hammer_of_the_open_lock',
      'knight_commanders_longsword',
      'merecleaver',
      'moonwrack_stave',
      'rimeweb_fang',
      'sextons_burial_spade',
      'sextons_spadehaft',
      'tideglass_shiv',
      'tideglass_warmaul',
      'turnkeys_shank',
    ];
    const liveBatchIds = new Set(batches.map(({ batchId }) => batchId));
    for (const batchId of [
      'placeholder-art-completion-weapons-2026-08-09',
      'item-art-consistency-2026-08-09',
      ...Object.keys(supersededWeaponBatches),
      ...reworkBatchIds,
    ]) {
      expect(liveBatchIds.has(batchId), `${batchId} was superseded by the repaint`).toBe(false);
    }
    const laterWeaponIds = [...Object.values(supersededWeaponBatches).flat(), ...reworkWeaponIds];
    for (const id of laterWeaponIds) {
      expect(expected, `${id} is still a live painted weapon`).toContain(id);
    }

    const replacementManifest = JSON.parse(
      readFileSync(
        path.join(repoRoot, itemConsistencyProvenanceRecord, 'accepted-art.json'),
        'utf8',
      ),
    ) as {
      supersedes: Array<{
        itemId: string;
        historicalAcceptedArt?: { path: string; assetKey: string };
      }>;
    };
    const replacementWeaponIds = replacementManifest.supersedes
      .filter(
        ({ itemId, historicalAcceptedArt }) =>
          Object.hasOwn(ITEM_WEAPON_VARIANTS, itemId) &&
          historicalAcceptedArt?.path === `${weaponProvenanceRecord}accepted-art.json`,
      )
      .map(({ itemId }) => itemId)
      .sort();
    expect(replacementWeaponIds).toEqual([
      'craghorn_staff',
      'drovers_staff',
      'hollow_vigil_staff',
      'widowfang_dirk',
    ]);

    const provenanceDir = path.join(repoRoot, weaponProvenanceRecord);
    const readJsonRecord = (filename: string): unknown =>
      JSON.parse(readFileSync(path.join(provenanceDir, filename), 'utf8'));
    const chunkA = readJsonRecord(weaponGenerationRecordFiles[0]) as {
      assets: Array<{ id: string }>;
    };
    const chunkB = readJsonRecord(weaponGenerationRecordFiles[1]) as {
      assets: Array<{ id: string }>;
    };
    const chunkCSource = readFileSync(
      path.join(provenanceDir, weaponGenerationRecordFiles[2]),
      'utf8',
    );
    const chunkC = [...chunkCSource.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|\s*`[a-f0-9]{64}`/gm)].map(
      (match) => match[1],
    );
    const chunkD = readJsonRecord(weaponGenerationRecordFiles[3]) as {
      finalAssets: Array<{ id: string }>;
    };
    // The chunk records are the frozen weapon campaign's generation reports:
    // they slice the pre-integration weapon roster, without the four
    // integration daggers, the two Masterwrought phase 09 weapons, the nine
    // Crucible raid weapons, the Ignivar legendary, the Nythraxis gap-fill
    // one-handers, the Mirefen world-boss maul, or Skerrit's Shardpike, all
    // of which postdate the campaign and own their own art. Any weapon added
    // from here on has to be excluded here too, or it shifts every slice
    // boundary and all four chunk assertions fail at once.
    const campaignExpected = expected.filter((id) => !laterWeaponIds.includes(id));
    expect(chunkA.assets.map(({ id }) => id)).toEqual(campaignExpected.slice(0, 40));
    expect(chunkB.assets.map(({ id }) => id)).toEqual(campaignExpected.slice(40, 80));
    expect(chunkC).toEqual(campaignExpected.slice(80, 100));
    expect(chunkD.finalAssets.map(({ id }) => id)).toEqual(campaignExpected.slice(100));

    const provenanceReadme = readFileSync(path.join(provenanceDir, 'README.md'), 'utf8');
    for (const filename of weaponGenerationRecordFiles) {
      expect(provenanceReadme, `${filename} lineage`).toContain(`\`${filename}\``);
    }

    for (const id of expected) {
      const owners = [
        ...itemMapping.entries.filter((entry) => entry.itemId === id),
        ...batches.filter((batch) => batch.itemIds.includes(id)),
      ];
      expect(owners, `${id} provenance owner`).toHaveLength(1);
    }
  });

  // FORK: four Scorching Wastes weapons are authored but not yet painted; the
  // coverage test above reds on them by design. This shipping-contract sweep
  // reads the painted rest.
  const FORK_UNPAINTED = new Set([
    'duneforged_warblade',
    'emberglass_scepter',
    'glasscut_dirk',
    'sunbleached_staff',
  ]);
  it('ships every painted base weapon as a distinct opaque 128px painting within budget', async () => {
    const hashes = new Set<string>();
    for (const id of baseWeapons.filter((weaponId) => !FORK_UNPAINTED.has(weaponId))) {
      const violations: string[] = [];
      const bytes = readFileSync(path.join(itemsDir, `${id}.webp`));
      if (bytes.length > 15 * 1024) {
        violations.push(`byte budget: ${bytes.length} > ${15 * 1024}`);
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hashes.has(hash)) {
        violations.push(`duplicates an earlier weapon (${hash})`);
      }
      hashes.add(hash);

      const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (decoded.info.width !== 128 || decoded.info.height !== 128) {
        violations.push(
          `dimensions: ${decoded.info.width}x${decoded.info.height} instead of 128x128`,
        );
      }
      let nonOpaqueAlphaBytes = 0;
      let firstNonOpaqueOffset: number | undefined;
      for (let offset = 3; offset < decoded.data.length; offset += decoded.info.channels) {
        if (decoded.data[offset] !== 255) {
          nonOpaqueAlphaBytes += 1;
          firstNonOpaqueOffset ??= offset;
        }
      }
      if (nonOpaqueAlphaBytes > 0) {
        violations.push(
          `opacity: ${nonOpaqueAlphaBytes} alpha bytes are not 255 (first at byte ${firstNonOpaqueOffset})`,
        );
      }
      expect(violations, `${id} shipping contract`).toEqual([]);
    }
  });
});
