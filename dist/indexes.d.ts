import type { CreateIndexesOptions, IndexSpecification } from "mongodb";
export declare const GROUP_COLLECTION = "logGroup";
export declare const EVENT_COLLECTION = "logEvent";
export interface IndexDef {
    key: IndexSpecification;
    options?: CreateIndexesOptions;
}
/**
 * Indexes the eventlog relies on, keyed by collection name. Exported rather
 * than created here so the app that owns index lifecycle for the shared
 * database (cbp3's indexes.ts) can include them in its own list.
 */
export declare const EVENTLOG_INDEXES: Record<string, IndexDef[]>;
