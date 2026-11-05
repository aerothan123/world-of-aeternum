// Character storage shares one load/save boundary with the weekly ledger.

import { sanitizeBankState, savedBankState } from './bank';
import type { CharacterState } from './character_state';
import { sanitizeCourierState, savedCourierState } from './courier';
import { absorbLegacyHeroicMarkSlots, sanitizeHeroicMarks } from './heroic_marks';
import {
  type DroppedFurnitureRow,
  type HousingPlayerState,
  sanitizeFurnishingSkill,
  sanitizeHouseState,
  savedHouseState,
} from './housing/house_state';
import {
  type LifeSkillPlayerState,
  sanitizeLifeSkillStanding,
  savedLifeSkillStanding,
} from './life_skills/life_skill_state';
import { savedMaterialSlot } from './material_slot_load';
import * as vaultMod from './materials_vault';
import { BAG_SOCKETS, restoreMembershipBag } from './membership_bag_slot';
import type { PlayerMeta } from './sim';
import * as weeklyMod from './weekly_rewards';

export function restoreCharacterStorage(
  meta: PlayerMeta,
  s: CharacterState,
  droppedInstanceJunk: string[],
  playerId: number,
  players?: ReadonlyMap<number, PlayerMeta>,
): void {
  // Bank sanitizes on load (never destroys items; a pre-bank save sanitizes to
  // an empty bank; see bank.ts sanitizeBankState). Deliberately NO wire-rev bump
  // here, unlike the vault install below: bankInfoWireRevFor is banker-gated and
  // a load always pairs with an empty lastSent, so a fresh session resends anyway.
  meta.bank = sanitizeBankState(s.bank, meta.name, droppedInstanceJunk, playerId);
  meta.courier = sanitizeCourierState(s.courier, meta.name, droppedInstanceJunk, playerId);
  // The Materials Vault sanitizes on load too (never destroys stock; a pre-vault
  // save sanitizes to the empty locked vault): restoreVaultStateOnLoad owns the
  // whole-record replacement AND its vaultWireRev bump (the rationale sits there).
  vaultMod.restoreVaultStateOnLoad(meta, s.vault, droppedInstanceJunk, playerId);
  meta.weeklyRewards = weeklyMod.sanitizeWeeklyRewards(s.weeklyRewards, false, meta.cls);
  // Heroic Marks: the saved balance, plus any pre-currency `heroic_mark` stacks
  // still sitting in the bags or bank (both hydrated above), folded in once.
  meta.heroicMarks = sanitizeHeroicMarks(s.heroicMarks);
  absorbLegacyHeroicMarkSlots(meta);
  restoreMembershipBag(meta, s);
  // Player housing (Project H): the owned lot, or none (housing/house_state.ts),
  // with its placed furniture; a dropped placement row is a dev-channel
  // warning (never player text), the farm_load_report.ts shape.
  const droppedFurniture: DroppedFurnitureRow[] = [];
  const droppedStorageKeys: string[] = [];
  meta.house = sanitizeHouseState(s.house, droppedFurniture, droppedStorageKeys);
  if (droppedFurniture.length > 0) {
    console.warn(
      `house furniture load dropped ${droppedFurniture.length} row(s): ` +
        droppedFurniture.map((row) => `${row.anchorId}=${String(row.itemId)}`).join(', '),
    );
  }
  // Phase 3: the house storage's payload-key drops ride the same dev channel.
  if (droppedStorageKeys.length > 0) {
    console.warn(
      `house storage load dropped ${droppedStorageKeys.length} key(s): ${droppedStorageKeys.join(', ')}`,
    );
  }
  meta.furnishingSkill = sanitizeFurnishingSkill(s.furnishingSkill);
  meta.lifeSkillStanding = sanitizeLifeSkillStanding(s.lifeSkillStanding);
  // One house per account, shared by every character on it: a character of
  // the same account already online holds the LIVE record, so this one shares
  // that object (never a second copy that could diverge or duplicate stock).
  meta.accountHouseKey =
    typeof s.accountHouseKey === 'string' && s.accountHouseKey !== ''
      ? s.accountHouseKey.slice(0, 64)
      : undefined;
  const sharer = meta.accountHouseKey ? accountHouseSharer(players, meta) : undefined;
  if (sharer?.house) meta.house = sharer.house;
  // One house per account: the host names the holder when it is someone else.
  meta.accountHouseHolder =
    !meta.house && typeof s.accountHouseHolder === 'string' && s.accountHouseHolder !== ''
      ? s.accountHouseHolder.slice(0, 64)
      : undefined;
  meta.houseStorageRev = 0;
}

/** Another online character of the same account that holds the live house. */
export function accountHouseSharer(
  players: ReadonlyMap<number, PlayerMeta> | undefined,
  meta: Pick<PlayerMeta, 'accountHouseKey'>,
): PlayerMeta | undefined {
  if (!players || !meta.accountHouseKey) return undefined;
  for (const other of players.values()) {
    if (other !== meta && other.accountHouseKey === meta.accountHouseKey && other.house) {
      return other;
    }
  }
  return undefined;
}

export function savedCharacterStorage(
  meta: PlayerMeta,
): Pick<
  CharacterState,
  | 'inventory'
  | 'bags'
  | 'bank'
  | 'vault'
  | 'weeklyRewards'
  | 'heroicMarks'
  | 'vendorBuyback'
  | 'courier'
  | 'membershipBag'
  | 'house'
  | 'furnishingSkill'
  | 'lifeSkillStanding'
  | 'accountHouseKey'
> {
  const lifeSkillStanding = savedLifeSkillStanding(meta.lifeSkillStanding);
  return {
    inventory: meta.inventory.map(savedMaterialSlot),
    bags: meta.bags.slice(0, BAG_SOCKETS),
    ...(meta.membershipBag ? { membershipBag: meta.membershipBag } : {}),
    vendorBuyback: meta.vendorBuyback.map(savedMaterialSlot),
    bank: savedBankState(meta.bank),
    ...(meta.courier ? { courier: savedCourierState(meta.courier) } : {}),
    // Hand-enumerated clone: tsc forces a new REQUIRED MaterialsVaultState field
    // to appear here, but an optional one would compile unpersisted; add it by hand.
    vault: vaultMod.savedVaultState(meta.vault),
    ...(meta.weeklyRewards
      ? { weeklyRewards: weeklyMod.sanitizeWeeklyRewards(meta.weeklyRewards, false, meta.cls) }
      : {}),
    // Absent at zero, so a character that never earned a mark saves unchanged.
    ...(meta.heroicMarks > 0 ? { heroicMarks: meta.heroicMarks } : {}),
    // Absent until a house is bought, so every other save stays byte-equal.
    ...(meta.house ? { house: savedHouseState(meta.house) } : {}),
    // Absent at zero (the Furnishing craft's own counter, Project H phase 2).
    ...(meta.furnishingSkill > 0 ? { furnishingSkill: meta.furnishingSkill } : {}),
    // The host-supplied account house key rides the save as the marker that
    // this save also writes the account's house row (server/
    // account_house_migration.ts upsertAccountHouseFromSave); the host
    // re-supplies it at every join, so a stale one is never trusted.
    ...(meta.accountHouseKey ? { accountHouseKey: meta.accountHouseKey } : {}),
    // Absent until a life skill first pays standing (life_skills/life_skill_state.ts).
    ...(lifeSkillStanding ? { lifeSkillStanding } : {}),
  };
}

/** Live storage owned by this load/save boundary. */
export interface CharacterVaultStorageState extends HousingPlayerState, LifeSkillPlayerState {
  // The per-character Materials Vault: a count per material id with a gold-bought
  // per-material ceiling. Capacity and move math live in materials_vault.ts.
  // Persisted (inside the character save, exactly like inventory/bags/bank).
  weeklyRewards?: weeklyMod.WeeklyRewardState;
  vault: vaultMod.MaterialsVaultState;
  // Runtime-only change signals for the owner-only bank/vault wires (bumped by
  // every write to meta.bank state / vault state respectively); never persisted.
  bankWireRev: number;
  vaultWireRev: number;
}
