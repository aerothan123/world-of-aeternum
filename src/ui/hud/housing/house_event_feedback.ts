// Player housing (Project H): the thin consumer of the housing SimEvents.
// The pure resolution (which line, which params) is house_feedback_view.ts; this
// module localizes, formats money, and pushes through the host seam. The HUD's
// event switch keeps a one-call arm (the farm_event_feedback.ts shape).
//
// The house name and price are interpolated into the prompt's HTML, so both
// pass through esc().
//
// The purchase prompt is shown ONCE while it is open: the sim offers once per
// approach (housing/ownership.ts houseOfferDue), and this side keeps the last
// offer prompt per host, so a repeated offer for the same lot (a replayed
// event, a version-skewed server) never stacks a second identical prompt
// behind the first. Keyed on the host through a WeakMap so the Hud grows no
// field and two hosts never share a prompt.

import { esc } from '../../esc';
import { formatMoney, t } from '../../i18n';
import { PROF_LOG_NEWS } from '../professions/profession_log_tones';
import { type HouseEvent, houseFeedbackPlan } from './house_feedback_view';

/** The HUD surfaces the housing arms write to. The Hud satisfies this
 *  structurally (the farm_event_feedback.ts FarmFeedbackHost shape). */
export interface HouseFeedbackHost {
  log(text: string, color: string): void;
  showError(text: string): void;
  showBanner(text: string): void;
}

/** What the prompt painter hands back: whether the prompt is still mounted
 *  (an HTMLElement satisfies it through `isConnected`; a prompt removed by
 *  Buy, Decline or its timeout reads false). */
export interface HousePromptHandle {
  readonly isConnected: boolean;
}

/** Shows an accept/decline prompt; `textHtml` is already escaped. The Hud
 *  wires its private two-button world prompt here. */
export type HousePromptFn = (
  textHtml: string,
  acceptLabel: string,
  onAccept: () => void,
) => HousePromptHandle;

interface OpenHouseOffer {
  lotId: string;
  handle: HousePromptHandle;
}

const openOffers = new WeakMap<HouseFeedbackHost, OpenHouseOffer>();

/** Whether an offer prompt for `lotId` is still open on `host`. */
export function houseOfferPromptOpen(host: HouseFeedbackHost, lotId: string): boolean {
  const open = openOffers.get(host);
  return open !== undefined && open.lotId === lotId && open.handle.isConnected;
}

export function handleHouseEvent(
  ev: HouseEvent,
  host: HouseFeedbackHost,
  prompt: HousePromptFn,
  world: { buyHouse(lotId: string): void },
): void {
  const plan = houseFeedbackPlan(ev);
  switch (plan.kind) {
    case 'offer': {
      const lotId = plan.lotId;
      if (houseOfferPromptOpen(host, lotId)) return;
      const text = t('hudChrome.housing.offerText', {
        house: esc(plan.house),
        price: esc(formatMoney(plan.priceCopper)),
      });
      const handle = prompt(text, t('hudChrome.housing.buy'), () => world.buyHouse(lotId));
      openOffers.set(host, { lotId, handle });
      return;
    }
    case 'error':
      host.showError(t(plan.key, { house: plan.house }));
      return;
    case 'purchased': {
      const line = t('hudChrome.housing.purchased', { house: plan.house });
      host.showBanner(line);
      host.log(line, PROF_LOG_NEWS);
      return;
    }
    case 'furniture':
      host.log(t(plan.key, { item: plan.item, anchor: plan.anchor }), PROF_LOG_NEWS);
      return;
    case 'none':
      return;
  }
}
