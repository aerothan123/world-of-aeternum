// Minimum client version (MIN_CLIENT_VERSION): a realm can refuse a game
// client older than the build it needs, with a clear "update required" line
// instead of a confusing wire failure later. The client sends its bundle
// version (__APP_VERSION__, package.json at build) in the world auth frame
// (src/net/world_auth_message.ts clientVersion); server/ws_auth.ts refuses
// below the minimum with CLIENT_UPDATE_REQUIRED, which the client localizes
// (src/ui/api_error_i18n.ts, loading.updateRequired). Steam keeps installs
// current, so this mostly catches a player who has not restarted Steam after
// a forced update, or a stale self-hosted website build.
//
// Unset or garbage MIN_CLIENT_VERSION disables the gate (fail open: a typo in
// an ops env must never lock every player out). A client that sends no
// version predates this check and so is older than any minimum: refused when
// a minimum is set.

export const CLIENT_UPDATE_REQUIRED = 'client update required';

/** [major, minor, patch] for a plain x.y.z (an optional -pre suffix is ignored). */
export function parseClientVersion(raw: unknown): [number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+][0-9A-Za-z.-]{0,64})?$/.exec(raw.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function clientVersionAllowed(minRaw: string | undefined, clientRaw: unknown): boolean {
  const min = parseClientVersion(minRaw ?? '');
  if (min === null) return true;
  const client = parseClientVersion(clientRaw);
  if (client === null) return false;
  return compare(client, min) >= 0;
}
