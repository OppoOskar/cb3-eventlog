export const GROUP_COLLECTION = "logGroup";
export const EVENT_COLLECTION = "logEvent";
/**
 * Indexes the eventlog relies on, keyed by collection name. Exported rather
 * than created here so the app that owns index lifecycle for the shared
 * database (cbp3's indexes.ts) can include them in its own list.
 */
export const EVENTLOG_INDEXES = {
    [GROUP_COLLECTION]: [
        // Admin list: optional status/level filter, newest activity first.
        // (_id is the fingerprint, so lookups by fingerprint need no extra index.)
        { key: { status: 1, lastSeen: -1 } },
        { key: { level: 1, lastSeen: -1 } },
    ],
    [EVENT_COLLECTION]: [
        // Group detail: latest occurrences, period counts, daily series, distinct users.
        { key: { groupId: 1, at: -1 } },
        // Retention differs per level, so each event carries its own expiry.
        { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
    ],
};
//# sourceMappingURL=indexes.js.map