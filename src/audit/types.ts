export type AuditCategory =
  | 'STALE'
  | 'CONTRADICTORY'
  | 'SENSITIVE'
  | 'THIRD_PARTY_PII';

/** A sensitive/PII span within an item's text, used for redaction on the card. */
export interface Span {
  start: number;
  end: number;
  /** Typed placeholder the card substitutes, e.g. "[HEALTH]", "[NAME]". */
  placeholder: string;
  /** True for credential/secret spans — these force the whole line to be withheld. */
  secret?: boolean;
}

export interface Finding {
  itemId: string;
  category: AuditCategory;
  subtype?: string;
  /** Plain-English explanation. Never contains a raw secret value. */
  why: string;
  /** For CONTRADICTORY: the other item in the conflicting pair. */
  relatedItemId?: string;
  /** Sensitive/PII spans within the item text (for redaction). */
  spans?: Span[];
}

export interface AuditConfig {
  /** Injected reference "now" (ISO) so audits are reproducible. */
  now: string;
  staleMonths: number;
  volatileMonths: number;
  driftMonths: number;
  ownerNames?: string[];
  ownerEmails?: string[];
  ownerPhones?: string[];
}

export interface AuditCounts {
  stale: number;
  contradictory: number;
  sensitive: number;
  third_party_pii: number;
}

export interface AuditReport {
  findings: Finding[];
  counts: AuditCounts;
  /** Sensitive/PII spans per item id, used to redact the shareable card. */
  spans: Record<string, Span[]>;
  /** Whether owner identity was known (affects third-party confidence). */
  conservativeMode: boolean;
  config: Pick<AuditConfig, 'now' | 'staleMonths' | 'volatileMonths' | 'driftMonths'>;
}
