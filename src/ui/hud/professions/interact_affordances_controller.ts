// The nearby-interaction press affordances, composed once for Hud: the
// feast-over-bed notice (farm_press_affordance_controller.ts) and the
// world-anchored "F Chop" chip over a tree the press would start chopping
// (chop_prompt_painter.ts). Hud makes ONE call per painted frame
// (`update(world, poll)`), with `poll` true on its medium (250 ms) band.
//
// Cadence split, and why. The RESOLVE (the press's full candidate ladder over
// the entity roster plus a decoration-window query for trees in reach) runs on
// the poll only, the farm notice's existing band. The PROJECTION runs every
// frame, because the chip is world-anchored and must track the camera. The
// cheap player gate (dead, combat, a cast starting, a drink) is also read every
// frame, so the chip goes away on the frame the chop begins instead of up to a
// poll later.
//
// Cold by contract (`*_controller.ts`): it writes nothing itself (both halves
// write through the shared PainterHost facet), arms no driver, and makes no
// layout read. It reads `window` for the viewport size, hence its
// UI_DOM_MODULES row. No relocalize(): the verb and the farm line are resolved
// through t() on every poll and the facet compares the RESOLVED string, so a
// language switch repaints by itself.

import {
  type ChopPromptTarget,
  chopPromptPlayerBlocked,
  resolveChopPromptTarget,
} from '../../../game/chop_prompt_core';
import type { CrossHotbarLayout } from '../../../game/cross_hotbar';
import { farmPressTarget } from '../../../game/farm_press_target_core';
import type { GamepadBindingEntry } from '../../../game/gamepad_bindings';
import { gamepadControlHint } from '../../../game/gamepad_control_hint';
import type { GamepadKind } from '../../../game/gamepad_map';
import { currentInputHintMode } from '../../../game/input_hint_mode';
import { interactKeyNodes } from '../../../game/interact_key_gather';
import type { IWorld } from '../../../world_api';
import { t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import type { ProjectedScreenPoint, PromptViewport } from '../../world_prompt_anchor_core';
import { type ChopPromptChip, ChopPromptPainter } from './chop_prompt_painter';
import { FarmPressAffordanceController } from './farm_press_affordance_controller';

/** The connected pad's bindings, as the Options hooks expose them (the same
 *  shape the island coach reads for its pad chips). */
export interface InteractPadBindings {
  entries(): GamepadBindingEntry[];
  kind(): GamepadKind;
  crossHotbarEnabled?(): boolean;
  crossHotbarSets?(): CrossHotbarLayout;
  crossHotbarSet?(): number;
}

export interface InteractAffordancesDeps {
  writers: PainterHostWriters;
  /** The #ui root the Chop chip mounts into. */
  ui: HTMLElement | null;
  /** The farm notice element (#interact-affordance). */
  notice: HTMLElement | null;
  worldToScreen(x: number, y: number, z: number): ProjectedScreenPoint;
  uiScale(): number;
  /** The live primary label of the interact bind (Keybinds.primaryLabel). */
  interactKeyLabel(): string;
  /** The connected pad's bindings, or null with no pad seam. */
  gamepad?(): InteractPadBindings | null;
}

export class InteractAffordancesController {
  private readonly farm: FarmPressAffordanceController;
  private readonly chop: ChopPromptPainter;
  private readonly target: ChopPromptTarget = { nodeId: '', x: 0, y: 0, z: 0 };
  private readonly viewport: PromptViewport = { width: 0, height: 0 };
  private hasTarget = false;
  private chip: ChopPromptChip = null;
  private verb = '';

  constructor(private readonly deps: InteractAffordancesDeps) {
    this.farm = new FarmPressAffordanceController({
      root: deps.notice,
      writers: deps.writers,
      text: (target) =>
        t(
          target === 'feast_over_harvest'
            ? 'hudChrome.farming.pressTarget.feastOverHarvest'
            : 'hudChrome.farming.pressTarget.feastOverPlant',
        ),
    });
    this.chop = new ChopPromptPainter({
      writers: deps.writers,
      host: deps.ui,
      worldToScreen: deps.worldToScreen,
      uiScale: deps.uiScale,
    });
  }

  /** The Chop chip's root, for tests. */
  get chopElement(): HTMLElement | null {
    return this.chop.element;
  }

  update(world: IWorld, poll: boolean): void {
    const p = world.player;
    if (poll) {
      this.farm.paint(farmPressTarget(world, p.pos, p.dead));
      this.hasTarget = resolveChopPromptTarget(world, interactKeyNodes(world), this.target);
      if (this.hasTarget) {
        this.chip = this.resolveChip();
        this.verb = t('hudChrome.gathering.chopPrompt');
      }
    }
    const show = this.hasTarget && !chopPromptPlayerBlocked(p);
    this.viewport.width = window.innerWidth;
    this.viewport.height = window.innerHeight;
    this.chop.paint(show ? this.target : null, this.chip, this.verb, this.viewport);
  }

  /** The chip beside the verb for the active input family: the live interact
   *  keycap on keyboard, the pad's resolved interact button, the Interact
   *  button's own glyph on touch. */
  private resolveChip(): ChopPromptChip {
    const mode = currentInputHintMode();
    if (mode === 'touch') return { button: true };
    if (mode === 'pad') {
      const pad = this.deps.gamepad?.() ?? null;
      if (!pad) return null;
      const caps = gamepadControlHint(
        {
          entries: pad.entries(),
          kind: pad.kind(),
          crossHotbarEnabled: pad.crossHotbarEnabled?.() ?? false,
          crossHotbarSets: pad.crossHotbarSets?.() ?? [],
          crossHotbarSet: pad.crossHotbarSet?.() ?? 0,
        },
        { type: 'interact' },
      );
      return caps.length > 0 ? { cap: caps.join(' ') } : null;
    }
    const label = this.deps.interactKeyLabel();
    return label ? { cap: label } : null;
  }
}
