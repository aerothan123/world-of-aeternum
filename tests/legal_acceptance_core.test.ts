import { describe, expect, it } from 'vitest';
import { CURRENT_LEGAL_VERSIONS, LEGAL_DOC_IDS, outdatedLegalDocs } from '../src/legal_versions';
import { t } from '../src/ui/i18n';
import {
  documentsToAccept,
  legalAcceptanceView,
  legalGateDecision,
  localLegalRecord,
  parseLegalServerStatus,
  parseLocalLegalRecord,
} from '../src/ui/legal_acceptance_core';

const cur = CURRENT_LEGAL_VERSIONS;
const stale = { terms: '2020-01-01-old', privacy: cur.privacy, eula: cur.eula };

describe('legalGateDecision', () => {
  it('passes when the server record is current', () => {
    expect(legalGateDecision({ current: cur, serverAccepted: cur, localAccepted: null })).toBe(
      'pass',
    );
  });
  it('prompts when nothing is accepted anywhere', () => {
    expect(legalGateDecision({ current: cur, serverAccepted: null, localAccepted: null })).toBe(
      'prompt',
    );
  });
  it('prompts when any single document is outdated on the server and locally', () => {
    expect(legalGateDecision({ current: cur, serverAccepted: stale, localAccepted: stale })).toBe(
      'prompt',
    );
  });
  it('syncs a local acceptance the server lacks, and passes when the server is unreachable', () => {
    expect(legalGateDecision({ current: cur, serverAccepted: null, localAccepted: cur })).toBe(
      'pass-sync',
    );
    expect(legalGateDecision({ current: cur, serverAccepted: undefined, localAccepted: cur })).toBe(
      'pass',
    );
  });
  it('re-prompts when the server bumps a version the local cache predates', () => {
    const bumped = { ...cur, terms: '2099-01-01-new' };
    expect(legalGateDecision({ current: bumped, serverAccepted: cur, localAccepted: cur })).toBe(
      'prompt',
    );
  });
});

describe('parseLegalServerStatus', () => {
  it('reads the server versions and the account record', () => {
    expect(parseLegalServerStatus({ current: cur, accepted: null })).toEqual({
      current: cur,
      accepted: null,
    });
    expect(parseLegalServerStatus({ current: cur, accepted: stale })?.accepted).toEqual(stale);
  });
  it('rejects a body without a full set of current versions', () => {
    expect(parseLegalServerStatus(null)).toBeUndefined();
    expect(parseLegalServerStatus({})).toBeUndefined();
    expect(parseLegalServerStatus({ current: { terms: cur.terms } })).toBeUndefined();
    expect(
      parseLegalServerStatus({ current: { ...cur, eula: 'no spaces allowed' } }),
    ).toBeUndefined();
  });
});

describe('local record', () => {
  it('round-trips and still reads the old EULA-only { v } record', () => {
    expect(parseLocalLegalRecord(localLegalRecord(cur))).toEqual(cur);
    expect(parseLocalLegalRecord(JSON.stringify({ v: cur.eula }))).toEqual({
      eula: cur.eula,
      terms: null,
      privacy: null,
    });
  });
  it('treats junk as never accepted', () => {
    for (const raw of [null, '', 'not json', '[]', '{}', '{"v":5}']) {
      expect(parseLocalLegalRecord(raw)).toBeNull();
    }
  });
});

describe('outdated documents and the view model', () => {
  it('lists outdated documents in prompt order', () => {
    expect(outdatedLegalDocs(null)).toEqual([...LEGAL_DOC_IDS]);
    expect(documentsToAccept(stale)).toEqual(['terms']);
    expect(documentsToAccept(cur)).toEqual([]);
  });
  it('flags only the document the player accepted an older version of', () => {
    const view = legalAcceptanceView({ ...stale, eula: null });
    const byDoc = Object.fromEntries(view.sections.map((s) => [s.doc, s.updated]));
    expect(byDoc).toEqual({ terms: true, privacy: false, eula: false });
  });
  it('shows the versions it was given, not the bundled ones', () => {
    const view = legalAcceptanceView(null, { ...cur, terms: '2099-01-01-new' });
    expect(view.sections.find((s) => s.doc === 'terms')?.version).toBe('2099-01-01-new');
  });
  it('resolves every key in the view to real English text', () => {
    const view = legalAcceptanceView(null);
    const keys = [
      view.titleKey,
      view.introKey,
      view.earlyAccessKey,
      view.publisherKey,
      view.readFullKey,
      view.versionKey,
      view.updatedKey,
      view.acceptKey,
      view.declineKey,
      ...view.sections.flatMap((s) => [s.headingKey, ...s.pointKeys]),
    ];
    for (const key of keys) {
      const text = t(key, { version: 'x' });
      expect(text, key).not.toBe(key);
      expect(text.trim().length, key).toBeGreaterThan(0);
    }
  });
});
