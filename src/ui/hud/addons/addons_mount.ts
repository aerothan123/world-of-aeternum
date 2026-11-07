// Composition of the add-on platform for Hud: builds the runtime with the
// browser host bindings and the Addons window, registers the /addons and
// add-on slash commands on the chat seam, and starts the runtime. A DOM module
// (UI_DOM_MODULES): it reads location, localStorage and the clock.

import { getLanguage } from '../../i18n';
import { findOwnPet } from '../../pet_frame_view';
import { registerLocalChatCommandHook } from '../chat/local_command_hooks';
import { AddonRuntime, type AddonRuntimeDeps } from './addon_runtime_controller';
import { listAddonPackages } from './addon_sources';
import { AddonsWindowController } from './addons_window_controller';

/** What Hud hands the platform: the world, the shared writers, and the few
 *  player-equivalent actions a SECURE button may trigger (one per click). */
export interface AddonsMountDeps
  extends Pick<
    AddonRuntimeDeps,
    'world' | 'writers' | 'uiRoot' | 'uiScale' | 'focus' | 'isIgnored'
  > {
  print(text: string, color: string | null): void;
  castSlot(slot: number): void;
  toggleWindow(window: string): void;
}

export interface MountedAddons {
  runtime: AddonRuntime;
  window: AddonsWindowController;
}

let menuOpener: (() => void) | null = null;

/** The Esc menu's AddOns row; null when the platform is not mounted. */
export function openAddonsWindowFromMenu(): (() => void) | null {
  return menuOpener;
}

export function mountAddons(deps: AddonsMountDeps): MountedAddons {
  const world = deps.world;
  const search = typeof location === 'undefined' ? '' : location.search;
  const urlFlag = /[?&]addons=(?:safe|off)\b/.test(search);
  let win: AddonsWindowController | null = null;
  const runtime = new AddonRuntime({
    ...deps,
    document,
    window,
    storage: localStorage,
    locale: () => getLanguage(),
    listPackages: listAddonPackages,
    defaultEnabled: import.meta.env.DEV,
    urlSafeMode: urlFlag,
    now: () => performance.now(),
    onChange: () => win?.refresh(),
    secure: {
      pressActionSlot: (slot) => deps.castSlot(slot),
      toggleWindow: (w) => deps.toggleWindow(w),
      targetUnit: (unit) => {
        // Exactly what clicking that unit frame does.
        if (unit === 'player') return world.targetEntity(world.playerId);
        if (unit === 'pet') {
          const pet = findOwnPet(world.entities.values(), world.playerId);
          if (pet) world.targetEntity(pet.id);
          return;
        }
        const n = Number(unit.replace('party', ''));
        const others = (world.partyInfo?.members ?? []).filter((m) => m.pid !== world.playerId);
        const m = others[n - 1];
        if (m) world.targetEntity(m.pid);
      },
    },
  });
  win = new AddonsWindowController({
    document,
    uiRoot: deps.uiRoot,
    focus: deps.focus,
    runtime,
  });
  const w = win;
  menuOpener = () => w.open();
  registerLocalChatCommandHook((raw) => {
    if (/^\/addons?\s*$/i.test(raw.trim())) {
      w.toggle();
      return true;
    }
    return runtime.handleSlash(raw);
  });
  void runtime.start();
  return { runtime, window: w };
}
