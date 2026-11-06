// Hand-written declarations for electron/steam_overlay.cjs (same convention as
// the other electron/*.d.cts files). Keep in sync with the .cjs exports.

export const OVERLAY_OPT_OUT_FLAG: string;

export interface SteamOverlayPlan {
  enable: boolean;
  reason: 'not-steam' | 'platform' | 'opted-out' | 'steam-windows';
}

export function planSteamOverlay(input?: {
  distribution?: string;
  platform?: string;
  argv?: readonly string[];
  steamEnabled?: boolean;
}): SteamOverlayPlan;

export function applySteamOverlay(input?: {
  plan?: SteamOverlayPlan;
  requireSteamworks?: () => {
    electronEnableSteamOverlay?: (disableEachFrameInvalidation?: boolean) => void;
  };
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void };
}): boolean;
