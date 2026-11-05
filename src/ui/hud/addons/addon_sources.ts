// Where add-on packages come from. Dev builds bundle the SDK examples
// (sdk/addons/examples/*) through import.meta.glob; the branch is behind
// import.meta.env.DEV so production strips both the glob and the sources. The
// desktop shell lists the local AddOns folder and installed Steam Workshop
// items over IPC (electron/addons.cjs). The website build has no source.

import { type DesktopAddonList, type DesktopAddonPackage, desktopBridge } from '../../../runtime';

export type AddonOrigin = 'dev' | 'local' | 'workshop';

export interface AddonPackage {
  origin: AddonOrigin;
  /** Folder name (dev/local) or Workshop item id; unique per origin. */
  folder: string;
  manifestText: string;
  /** Relative path -> file text, for the files the manifest lists. */
  files: Record<string, string>;
  workshopId?: string;
  /** A Workshop item still downloading (listed, not loadable yet). */
  pending?: boolean;
}

export interface AddonSourceList {
  packages: AddonPackage[];
  /** The desktop shell's own safe-mode flag (launch argument). */
  shellSafeMode: boolean;
  /** Whether Workshop listing worked (false: no Steam, local folder only). */
  workshopAvailable: boolean;
  /** Whether this host can open the local folder / publish. */
  desktop: boolean;
  localFolder: string | null;
}

function devExamples(): AddonPackage[] {
  if (!import.meta.env.DEV) return [];
  const raw = import.meta.glob('/sdk/addons/examples/*/*.{json,js}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const byFolder = new Map<string, AddonPackage>();
  for (const [path, text] of Object.entries(raw)) {
    const m = /\/sdk\/addons\/examples\/([^/]+)\/([^/]+)$/.exec(path);
    if (!m) continue;
    const [, folder, file] = m;
    let pkg = byFolder.get(folder);
    if (!pkg) {
      pkg = { origin: 'dev', folder, manifestText: '', files: {} };
      byFolder.set(folder, pkg);
    }
    if (file === 'addon.json') pkg.manifestText = text;
    else if (file.endsWith('.js')) pkg.files[file] = text;
  }
  return [...byFolder.values()].filter((p) => p.manifestText !== '');
}

function fromDesktop(p: DesktopAddonPackage): AddonPackage {
  return {
    origin: p.origin === 'workshop' ? 'workshop' : 'local',
    folder: String(p.folder),
    manifestText: String(p.manifestText ?? ''),
    files: p.files && typeof p.files === 'object' ? { ...p.files } : {},
    workshopId: p.workshopId ? String(p.workshopId) : undefined,
    pending: p.pending === true,
  };
}

/** Gather every available package. Never throws: a failed shell call degrades
 *  to the dev examples (or nothing). */
export async function listAddonPackages(): Promise<AddonSourceList> {
  const packages = devExamples();
  const bridge = desktopBridge();
  let list: DesktopAddonList | null = null;
  if (bridge?.listAddons) {
    try {
      list = await bridge.listAddons();
    } catch {
      list = null;
    }
  }
  if (list && Array.isArray(list.packages)) {
    for (const p of list.packages) packages.push(fromDesktop(p));
  }
  return {
    packages,
    shellSafeMode: list?.safeMode === true,
    workshopAvailable: list?.workshopAvailable === true,
    desktop: !!bridge?.listAddons,
    localFolder: typeof list?.localFolder === 'string' ? list.localFolder : null,
  };
}
