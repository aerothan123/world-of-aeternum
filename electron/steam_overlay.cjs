'use strict';

// Steam overlay (Shift+Tab, Steam screenshots, friends chat, later the Steam
// purchase dialog) for the Windows Steam build. Electron renders through
// Chromium's GPU process with DirectComposition, which the overlay cannot
// hook, so steamworks.js ships electronEnableSteamOverlay(): it appends
// --in-process-gpu and --disable-direct-composition and, unless told not to,
// keeps every window repainting so the overlay has frames to draw over.
//
// This module only DECIDES; electron/main.cjs calls the steamworks.js helper
// before app 'ready' (Chromium reads switches only then) when the plan says so.
// Scope, deliberately narrow:
//   - Windows Steam builds only. Linux keeps electron/steam_overlay_guard.cjs
//     (the GPU-sandbox relaxation Steam's injected overlay needs just to boot),
//     and the in-process GPU switch is exactly what that guard measured and
//     rejected on the Deck. Website and Epic builds never load Steam code.
//   - The game renders every frame with requestAnimationFrame, so the
//     steamworks.js per-frame invalidator would only add a 60 Hz timer per
//     window: it is skipped (disableEachFrameInvalidation = true).
//   - Opt-out without a rebuild: the Steam launch option --no-steam-overlay
//     (Steamworks > Installation > Launch Options, or a player's own launch
//     options) keeps the stock GPU process, for a machine where in-process GPU
//     misbehaves. The overlay is cosmetic convenience, never gameplay, so the
//     fallback loses nothing a player acts on.

const OVERLAY_OPT_OUT_FLAG = '--no-steam-overlay';

function planSteamOverlay({ distribution, platform, argv, steamEnabled } = {}) {
  if (distribution !== 'steam' && steamEnabled !== true) {
    return { enable: false, reason: 'not-steam' };
  }
  if (platform !== 'win32') return { enable: false, reason: 'platform' };
  if (Array.isArray(argv) && argv.includes(OVERLAY_OPT_OUT_FLAG)) {
    return { enable: false, reason: 'opted-out' };
  }
  return { enable: true, reason: 'steam-windows' };
}

// Apply the plan. Never throws: a missing native module or an Electron that
// refuses the switch only costs the overlay, never the launch.
function applySteamOverlay({ plan, requireSteamworks, log } = {}) {
  if (!plan?.enable) {
    log?.info?.(`[steam] overlay hook off (${plan?.reason ?? 'no plan'})`);
    return false;
  }
  try {
    const load = requireSteamworks ?? (() => require('steamworks.js'));
    const steamworks = load();
    if (typeof steamworks?.electronEnableSteamOverlay !== 'function') {
      log?.warn?.('[steam] overlay hook unavailable in this steamworks.js');
      return false;
    }
    steamworks.electronEnableSteamOverlay(true);
    log?.info?.('[steam] overlay hook on (in-process GPU, no direct composition)');
    return true;
  } catch (err) {
    log?.warn?.('[steam] overlay hook failed', err?.message ?? err);
    return false;
  }
}

module.exports = { OVERLAY_OPT_OUT_FLAG, planSteamOverlay, applySteamOverlay };
