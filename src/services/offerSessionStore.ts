/**
 * In-memory store for pending contract offers awaiting player response.
 * Keyed by a UUID that's embedded in the button custom IDs.
 * Offers auto-expire.
 */

const OFFER_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface PendingOffer {
  /** Internal UUID for button correlation */
  id: string;
  /** Discord ID of the player being offered */
  targetDiscordId: string;
  /** Discord ID of the management user who made the offer */
  offeredByDiscordId: string;
  /** Discord ID of the guild/server */
  guildId: string;
  /** Contract details (serialised from the command) */
  contractData: {
    discordId: string;
    username: string;
    teamName: string;
    position: string;
    region: string;
    robloxUsername?: string;
    roleInTeam?: string;
    nickname?: string;
  };
  /** The raw team name for display */
  teamName: string;
  /** Team emoji for display */
  teamEmoji: string;
  /** Expiration timestamp */
  expiresAt: number;
  /** Whether processed (accepted/declined) */
  processed: boolean;
}

const store = new Map<string, PendingOffer>();

/**
 * Create a pending offer and return its ID.
 */
export function createOffer(data: Omit<PendingOffer, "id" | "processed">): string {
  const id = crypto.randomUUID();
  store.set(id, { ...data, id, processed: false });
  return id;
}

/**
 * Get a pending offer by ID.
 */
export function getOffer(id: string): PendingOffer | undefined {
  const offer = store.get(id);
  if (!offer) return undefined;
  // Check expiration
  if (Date.now() > offer.expiresAt) {
    store.delete(id);
    return undefined;
  }
  return offer;
}

/**
 * Claim (consume) an offer — marks as processed so it can't be double-clicked.
 */
export function claimOffer(id: string): PendingOffer | undefined {
  const offer = store.get(id);
  if (!offer || offer.processed || Date.now() > offer.expiresAt) {
    if (offer) store.delete(id);
    return undefined;
  }
  offer.processed = true;
  return offer;
}

/**
 * Delete an offer from the store.
 */
export function removeOffer(id: string): void {
  store.delete(id);
}

/**
 * Periodic cleanup of expired offers.
 */
setInterval(() => {
  const now = Date.now();
  for (const [id, offer] of store.entries()) {
    if (now > offer.expiresAt) store.delete(id);
  }
}, 60_000);
