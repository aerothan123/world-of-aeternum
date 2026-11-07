// A tiny registry of client-answered chat commands owned OUTSIDE the chat
// controller (the add-on platform's /addons, /reloadui and add-on declared
// commands). ChatWindowController.maybeHandleLocalChatCommand consults it
// before a line reaches the world; a hook returns true when it consumed the
// line, and a consumed line is never sent.

export type LocalChatCommandHook = (raw: string) => boolean;

const hooks: LocalChatCommandHook[] = [];

/** Register a hook; returns its unregister function. */
export function registerLocalChatCommandHook(hook: LocalChatCommandHook): () => void {
  hooks.push(hook);
  return () => {
    const i = hooks.indexOf(hook);
    if (i >= 0) hooks.splice(i, 1);
  };
}

/** True when a registered hook consumed the line. A throwing hook is skipped. */
export function runLocalChatCommandHooks(raw: string): boolean {
  if (!raw.startsWith('/')) return false;
  for (const hook of [...hooks]) {
    try {
      if (hook(raw)) return true;
    } catch {
      /* a broken hook never blocks chat */
    }
  }
  return false;
}
