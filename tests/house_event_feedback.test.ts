// The housing SimEvent consumer (src/ui/hud/housing/house_event_feedback.ts):
// the purchase prompt is shown once while it is open. A repeated houseOffer
// for the same lot never stacks a second identical prompt; a prompt the
// player closed (Decline, Buy, timeout) lets the next offer through, as does
// an offer for another lot.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOUSE_LOTS } from '../src/sim/content/house_lots';
import {
  type HouseFeedbackHost,
  type HousePromptHandle,
  handleHouseEvent,
  houseOfferPromptOpen,
} from '../src/ui/hud/housing/house_event_feedback';
import { formatMoney, t } from '../src/ui/i18n';

const LOT = HOUSE_LOTS[0];
const OTHER = HOUSE_LOTS[1];

function rig() {
  const host: HouseFeedbackHost = { log() {}, showError() {}, showBanner() {} };
  const prompts: {
    text: string;
    accept: string;
    onAccept: () => void;
    handle: { isConnected: boolean };
  }[] = [];
  const prompt = (text: string, accept: string, onAccept: () => void): HousePromptHandle => {
    const handle = { isConnected: true };
    prompts.push({ text, accept, onAccept, handle });
    return handle;
  };
  const bought: string[] = [];
  const world = { buyHouse: (lotId: string) => bought.push(lotId) };
  const offer = (lotId = LOT.id) =>
    handleHouseEvent(
      { type: 'houseOffer', pid: 1, lotId, priceCopper: LOT.priceCopper },
      host,
      prompt,
      world,
    );
  return { host, prompts, offer, bought };
}

describe('house offer prompt (HUD side)', () => {
  it('shows the offer once and never stacks an identical open prompt', () => {
    const { host, prompts, offer } = rig();
    offer();
    offer();
    offer();
    expect(prompts).toHaveLength(1);
    expect(houseOfferPromptOpen(host, LOT.id)).toBe(true);
    expect(houseOfferPromptOpen(host, OTHER.id)).toBe(false);
  });

  it('offers again once the open prompt was closed', () => {
    const { host, prompts, offer } = rig();
    offer();
    prompts[0].handle.isConnected = false; // Decline, Buy or the timeout removed it
    expect(houseOfferPromptOpen(host, LOT.id)).toBe(false);
    offer();
    expect(prompts).toHaveLength(2);
  });

  it('an offer for another lot is its own prompt, and hosts never share one', () => {
    const a = rig();
    a.offer();
    a.offer(OTHER.id);
    expect(a.prompts.map((p) => p.text)).toHaveLength(2);
    const b = rig();
    b.offer();
    expect(b.prompts).toHaveLength(1);
  });

  it('the prompt text names the house and the price, and Buy sends the lot', () => {
    const { prompts, offer, bought } = rig();
    offer();
    expect(prompts[0].text).toContain(formatMoney(LOT.priceCopper));
    expect(prompts[0].accept).toBe(t('hudChrome.housing.buy'));
    expect(bought).toEqual([]);
    prompts[0].onAccept();
    expect(bought).toEqual([LOT.id]);
  });
});

describe('the world prompt button row (Buy House / Decline)', () => {
  it('is centred under the centred prompt text', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/hud.css'), 'utf8');
    const row = css.match(/\n {2}\.prompt-actions \{([^}]*)\}/)?.[1] ?? '';
    expect(row).toContain('justify-content: center');
    expect(css.match(/\n {2}\.prompt \{([^}]*)\}/)?.[1]).toContain('text-align: center');
  });
});
