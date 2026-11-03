// Session preferences the server keeps on the live PlayerMeta only (never in the
// character save): a fresh join (a reconnect hands the server a brand-new
// PlayerMeta) needs the last value of each re-pushed. ClientWorld remembers the
// last command it sent per preference here and replays them, in first-set order,
// once it can send commands again (after `connected` flips true on reconnect, and
// after spectate ends). Nothing is replayed for a preference never set this
// session.

export type SessionPreferenceCommand =
  | { cmd: 'stopAutoAttackOnTargetSwitch'; enabled: boolean }
  | { cmd: 'set_auto_loot'; enabled: boolean };

export class SessionPreferenceMemo {
  private readonly last = new Map<SessionPreferenceCommand['cmd'], SessionPreferenceCommand>();

  /** Remember `pref` as the latest value of its preference; returns this memo
   *  (so a client built without field initializers can adopt one in a line). */
  with(pref: SessionPreferenceCommand): this {
    this.last.set(pref.cmd, { ...pref });
    return this;
  }

  replay(send: (pref: SessionPreferenceCommand) => void): void {
    for (const pref of this.last.values()) send({ ...pref });
  }
}
