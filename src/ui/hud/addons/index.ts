// The add-on platform's public surface (docs/design/addon-api.md). Hud composes
// it with mountAddons(); the Esc menu reaches the window through
// openAddonsWindowFromMenu(); everything else stays internal to this directory.

export { ADDON_API_VERSION } from './addon_manifest_core';
export type { AddonRuntime } from './addon_runtime_controller';
export {
  type AddonsMountDeps,
  type MountedAddons,
  mountAddons,
  openAddonsWindowFromMenu,
} from './addons_mount';
export type { AddonsWindowController } from './addons_window_controller';
