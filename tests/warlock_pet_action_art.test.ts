import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { abilityImageUrl } from '../src/ui/icons';
import { wyndlewoodAbilityRow, wyndlewoodRecord } from './helpers/wyndlewood_art';

const ACCEPTED_PATH = path.resolve(
  'docs/achievements/release-art-audit-v036-2026-08-10/warlock-pet-action-art.accepted.json',
);
const EXPECTED_IDS = ['emberkin_felbolt', 'gloomshade_abyssal_chain'] as const;

interface AcceptedAsset {
  id: string;
  shipping: {
    path: string;
    bytes: number;
    sha256: string;
    width: number;
    height: number;
    format: string;
    colorspace: string;
    opaque: boolean;
    deterministicReencodeMatch: boolean;
  };
}

interface AcceptedManifest {
  schemaVersion: number;
  batch: string;
  mapping: { path: string; bytes: number; sha256: string };
  processing: { width?: number; quality: number };
  visualReview: { accepted: boolean; attemptsPerAsset: number; retries: number };
  assets: AcceptedAsset[];
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('Warlock pet signature action art', () => {
  const accepted = JSON.parse(readFileSync(ACCEPTED_PATH, 'utf8')) as AcceptedManifest;

  it('keeps the accepted batch history and the repainted mapping records', () => {
    expect(accepted.schemaVersion).toBe(1);
    expect(accepted.batch).toBe('warlock-pet-action-art-2026-08-10');
    expect(accepted.visualReview).toEqual(
      expect.objectContaining({ accepted: true, attemptsPerAsset: 1, retries: 0 }),
    );
    expect(accepted.assets.map(({ id }) => id)).toEqual(EXPECTED_IDS);

    // The Wyndlewood repaint superseded both accepted paintings and rewrote their mapping
    // rows; the accepted manifest stays as history and each row now names its repaint cell.
    const mappingBytes = readFileSync(path.resolve(accepted.mapping.path));
    expect(sha256(mappingBytes)).not.toBe(accepted.mapping.sha256);
    const mapping = JSON.parse(mappingBytes.toString('utf8')) as {
      abilities: Array<{ abilityId: string }>;
    };
    for (const id of EXPECTED_IDS) {
      const records = mapping.abilities.filter(({ abilityId }) => abilityId === id);
      expect(records, id).toEqual([wyndlewoodAbilityRow('warlock', id)]);
    }
  });

  it('ships unique opaque 128px WebPs through the runtime ability route', async () => {
    const hashes = new Set<string>();
    for (const asset of accepted.assets) {
      const bytes = readFileSync(path.resolve(asset.shipping.path));
      const metadata = await sharp(bytes).metadata();
      const stats = await sharp(bytes).stats();
      const repaint = wyndlewoodRecord(asset.shipping.path);
      expect(bytes.length, asset.id).toBe(repaint.shippingBytes);
      expect(sha256(bytes), asset.id).toBe(repaint.shippingSha256);
      expect(sha256(bytes), asset.id).not.toBe(asset.shipping.sha256);
      expect(metadata, asset.id).toMatchObject({
        format: 'webp',
        width: 128,
        height: 128,
        space: 'srgb',
      });
      expect(stats.isOpaque, asset.id).toBe(true);
      expect(abilityImageUrl(asset.id), asset.id).toBe(`/ui/skills/warlock/${asset.id}.webp`);
      hashes.add(sha256(bytes));
    }
    expect(hashes.size).toBe(EXPECTED_IDS.length);
  });
});
