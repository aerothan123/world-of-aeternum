// The consolidated outbox poll: the bot's ONE periodic pickup from the game
// server, and every decision it makes.
//
// It replaced the separate poll loops (relay, activity feed, and the retired
// daily-rewards winners feed), each with its own timer and its own request, plus
// the flex re-read the sweep used to do. One request answers every stream at once
// and carries the link-change feed that tells the sweep who actually moved.
//
// Written as a module rather than in main.ts for the reason every other
// extracted piece is (ledger L8): main.ts calls main() at module scope, so
// nothing inside it is reachable from a test. Everything here is decided over an
// injected IO seam, the member_writes.ts pattern, so the ordering rules below
// (per-item isolation, the breaker gate, the queue-pop deadline) are unit-tested
// with no network, no Discord token and no clock. main.ts binds the seam and
// registers the task; it decides nothing.

import {
  type ActivityItem,
  buildActivityMessage,
  buildHillAnnouncementMessage,
  buildPvpKillFeedMessage,
  buildQueuePopMessage,
  buildRelayMessage,
  chunkPvpKills,
  type HillAnnouncementItem,
  hillAnnouncementIsStale,
  type PvpKillItem,
  type RelayItem,
} from './logic';
import type { BreakerState } from './rate_governor';
import type { OutboxEnvelope, OutboxLinkChangeItem, OutboxQueuePopItem } from './server_client';

/**
 * Thrown by a post whose target channel id is not configured.
 *
 * It is an ERROR rather than a silent success so a caller can never mistake
 * "there was nowhere to post it" for a delivered post. Reported once
 * per channel by the factory (onMissingChannel) and then deliberately NOT passed
 * to onError, so a deployment that never set a channel logs one line rather than
 * one every poll for the life of the process.
 */
export class OutboxChannelUnsetError extends Error {
  readonly channel: string;
  constructor(channel: string) {
    super(`[bot] outbox channel ${channel} is not configured`);
    this.name = 'OutboxChannelUnsetError';
    this.channel = channel;
  }
}

/** Everything one poll needs from the outside world. */
export interface OutboxIo {
  /** The rate governor's breaker, read fresh per run (see the gate in runOutboxPoll). */
  breakerState: () => BreakerState;
  /** One poll. Null is a FAILED poll: the server preserved every stream. */
  drain: () => Promise<OutboxEnvelope | null>;
  /** Rejects on a failed post, the way the Discord shell already behaves. */
  postRelay: (item: RelayItem) => Promise<unknown>;
  postActivity: (item: ActivityItem) => Promise<unknown>;
  /** One digest post for a batch from chunkPvpKills (never more than a post's lines). */
  postPvpKills: (batch: readonly PvpKillItem[]) => Promise<unknown>;
  /** One King of the Hill spawn card, to the same channel as the kill feed. */
  postHillAnnouncement: (item: HillAnnouncementItem) => Promise<unknown>;
  /** Pure: the sweep's belief update. Cannot fail, so it is not wrapped. */
  applyLinkChanges: (items: readonly OutboxLinkChangeItem[]) => void;
  /** DM one queue pop to its player. Rejects on a failed send, like the posts. */
  postQueuePop: (item: OutboxQueuePopItem) => Promise<unknown>;
  /** Wall clock, for the queue-pop deadline check (see runOutboxPoll). */
  now: () => number;
  onError?: (error: unknown, where: string) => void;
}

/** Which channel id each stream posts to. */
export interface OutboxChannels {
  relay: string;
  activity: string;
  /** The World PvP kill feed and the King of the Hill spawn calls. No
   *  fallback: unset means both are off. */
  pvpFeed: string;
}

export interface OutboxIoOptions {
  createMessage: (channelId: string, payload: Record<string, unknown>) => Promise<unknown>;
  /** The Discord shell's DM path (open the channel, then post), by user id. */
  sendDirectMessage: (userId: string, payload: Record<string, unknown>) => Promise<unknown>;
  channels: OutboxChannels;
  /** Public game URL, for the relay embed's respond deep link and the DM's button. */
  gameUrl: string;
  breakerState: () => BreakerState;
  drain: () => Promise<OutboxEnvelope | null>;
  applyLinkChanges: (items: readonly OutboxLinkChangeItem[]) => void;
  /** Wall clock for the queue-pop deadline; the forwarding default reads Date.now. */
  now?: () => number;
  onError?: (error: unknown, where: string) => void;
  /** Called AT MOST ONCE per unset channel, the first time it is needed. */
  onMissingChannel?: (channel: keyof OutboxChannels) => void;
}

/**
 * Bind the channel routing and the message builders.
 *
 * This lives here rather than in main.ts because the pairing is exactly the
 * thing a test has to be able to state: which builder shapes each stream, and
 * which channel id it is sent to. Wired inline at the registration, a swap
 * (relay items posted to the activity channel, or shaped by the activity
 * builder) would type-check, deploy, and be invisible to every assertion.
 */
export function outboxIoFor(options: OutboxIoOptions): OutboxIo {
  const reported = new Set<string>();
  const post = async (
    channel: keyof OutboxChannels,
    payload: Record<string, unknown>,
  ): Promise<void> => {
    const channelId = options.channels[channel];
    if (!channelId) {
      if (!reported.has(channel)) {
        reported.add(channel);
        options.onMissingChannel?.(channel);
      }
      throw new OutboxChannelUnsetError(channel);
    }
    await options.createMessage(channelId, payload);
  };
  return {
    breakerState: options.breakerState,
    drain: options.drain,
    postRelay: (item) => post('relay', buildRelayMessage(item, options.gameUrl)),
    // buildActivityMessage answers null for a kind this build does not know (a
    // newer server mid-deploy). Dropping the item beats posting an empty embed:
    // the feed is at-most-once by design, so a drop loses a card, never state.
    postActivity: async (item) => {
      const payload = buildActivityMessage(item);
      if (payload) await post('activity', payload);
    },
    postPvpKills: (batch) => post('pvpFeed', buildPvpKillFeedMessage(batch)),
    postHillAnnouncement: (item) => post('pvpFeed', buildHillAnnouncementMessage(item)),
    applyLinkChanges: options.applyLinkChanges,
    // A DM has no channel to route: the user id IS the destination, so the
    // unset-channel machinery above never applies to this stream.
    postQueuePop: (item) =>
      options.sendDirectMessage(item.discordUserId, buildQueuePopMessage(item, options.gameUrl)),
    now: options.now ?? (() => Date.now()),
    onError: options.onError,
  };
}

/**
 * The list a stream carries, tolerating a payload that omits it.
 *
 * The types say every stream is present, and they describe what THIS
 * server sends. A poll answered by an older build, or by a proxy that trimmed
 * the body, would otherwise throw inside the loop, and by then the drain has
 * already consumed everything the server had.
 */
function listOf<T>(list: readonly T[] | undefined): readonly T[] {
  return Array.isArray(list) ? list : [];
}

/**
 * One poll: drain, fan the streams out, and report whether there was work.
 *
 * The return value is the scheduler's didWork signal, so it decides the cadence:
 * true holds the fast active interval while a backlog exists, false lets each
 * empty run decay the delay toward idle. The drained streams (relay, activity,
 * link changes, queue pops, PvP kills, hill announcements) count by CARRIAGE,
 * not post outcome: the drain consumed them, so fifty relay items with every
 * post refused still means a backlog existed, and backing off then would be
 * exactly backwards.
 */
export async function runOutboxPoll(io: OutboxIo): Promise<boolean> {
  // THE BREAKER GATE, and it is the reason this returns before the drain rather
  // than after it. Relay posts and activity cards are all
  // non-essential createMessage calls, which the governor REFUSES while the
  // breaker is open or half-open. Draining then would pull items out of the
  // server's queues (a 200 is the only acknowledgement the outbox has) and feed
  // them straight into refusals: ledger item L9's loss window. Skipping the
  // drain leaves them server-side, where the contract preserves them.
  //
  // It cannot deadlock recovery. The half-open probe is supplied by the sweep's
  // own cheap refused attempts, which keep running on their own task, so the
  // breaker still closes with this loop asleep.
  if (io.breakerState() !== 'closed') return false;

  const envelope = await io.drain();
  // A failed poll: the server preserved every stream, so this costs one cycle of
  // latency and nothing else. Counted as no work, so a server that is refusing
  // sees the cadence decay instead of a retry every three seconds.
  //
  // `== null` on purpose: null is ServerClient's failure signal, but a success
  // envelope with no data field resolves to UNDEFINED, and a strict null check let that shape through to throw on the
  // first property read. Neither shape observed anything, so neither is work.
  if (envelope == null) return false;

  const streams = envelope as Partial<OutboxEnvelope>;
  const relayItems = listOf(streams.relay?.items);
  const activityItems = listOf(streams.activity?.items);
  const linkChanges = listOf(streams.linkChanges?.items);
  const queuePops = listOf(streams.queuePops?.items);
  const pvpKills = listOf(streams.pvpKills?.items);
  const hillAnnouncements = listOf(streams.hillAnnouncements?.items);
  // The watch signal counts as work WITHOUT anything being drained: an
  // opted-in, linked player is waiting in a queue, and the pop that ends the
  // wait has a 30 s answer window, so the loop holds its fast cadence rather
  // than decaying to the idle interval and finding the pop half a window late.
  // Tolerant of an older server that sends no such field (false).
  const watching = streams.queuePops?.watching === true;
  const consumedWork =
    relayItems.length > 0 ||
    activityItems.length > 0 ||
    linkChanges.length > 0 ||
    queuePops.length > 0 ||
    pvpKills.length > 0 ||
    hillAnnouncements.length > 0;

  const report = (error: unknown, where: string): void => {
    // The unset-channel case has already been reported once by the factory;
    // passing it on would log it again every poll forever.
    if (error instanceof OutboxChannelUnsetError) return;
    io.onError?.(error, where);
  };

  // The link changes apply FIRST, before any post, and outside any catch: a
  // pure in-memory belief update over the sweep, so it cannot fail, and it is
  // the one stream here the server does NOT re-serve (the drain consumed it).
  // The post loops below are sequential and governor-paced, so on a backlog
  // they can run for minutes; applying after them left a process death
  // mid-loop to lose these beliefs for no ordering gain at all, since nothing
  // below reads them.
  io.applyLinkChanges(linkChanges);

  // Queue pops go FIRST, ahead of every channel post: they are the one stream
  // with a deadline measured in seconds, and the loops below can run for
  // minutes on a backlog. Each item's deadline is re-checked here, at send time
  // and against this process's clock, because the governor can hold a DM
  // behind a backlog or a pause for longer than an Accept window lasts, and a
  // DM about an offer that already lapsed is worse than none. A lapsed item is
  // skipped silently: it is not a failure, and the server already dropped the
  // ones that lapsed before the drain. Sequential and per-item, the same rule
  // as the posts below.
  for (const item of queuePops) {
    if (!(item.expiresAtMs > io.now())) continue;
    try {
      await io.postQueuePop(item);
    } catch (error) {
      report(error, 'queue-pop');
    }
  }
  // Sequential, and each post in its own catch. Sequential because the governor
  // paces these anyway and a burst of parallel posts would only queue deeper;
  // per item because one refusal (an open breaker mid-run, a 403 on one channel)
  // must cost that item and not the rest of the drain, which is already consumed
  // and cannot be handed back.
  for (const item of relayItems) {
    try {
      await io.postRelay(item);
    } catch (error) {
      report(error, 'relay');
    }
  }
  for (const item of activityItems) {
    try {
      await io.postActivity(item);
    } catch (error) {
      report(error, 'activity');
    }
  }
  // King of the Hill spawn calls go ahead of the kill digests in the shared
  // PvP channel: they have a deadline (the rise, then the fall), and an item
  // whose moment already passed while it sat in a backlog is skipped
  // silently rather than calling players to a hill that is not there.
  for (const item of hillAnnouncements) {
    if (hillAnnouncementIsStale(item, io.now())) continue;
    try {
      await io.postHillAnnouncement(item);
    } catch (error) {
      report(error, 'hill');
    }
  }
  // The kill feed posts DIGESTS: one createMessage per batch of
  // PVP_FEED_LINES_PER_POST lines, never one per kill, so a brawl cannot hit
  // the channel's rate limit on its own. Each batch in its own catch, the
  // per-item rule above: a refused digest costs its lines, not the rest.
  for (const batch of chunkPvpKills(pvpKills)) {
    try {
      await io.postPvpKills(batch);
    } catch (error) {
      report(error, 'pvp-kills');
    }
  }
  return consumedWork || watching;
}
