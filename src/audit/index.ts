import type { ExtractedMemory } from '../model/memory.js';
import { runRubric } from './rubric.js';
import type { AuditConfig, AuditReport, Span } from './types.js';

export type { AuditReport, Finding, AuditCategory, Span } from './types.js';

const DEFAULTS = { staleMonths: 12, volatileMonths: 6, driftMonths: 10 };

/**
 * Run the audit over an extraction. Owner identity (name/email) is read from the
 * export account so third-party detection can exclude the owner. Pass `now`
 * (and any threshold override) in tests for reproducible output.
 */
export function runAudit(
  memory: ExtractedMemory,
  partial: Partial<AuditConfig> = {},
): AuditReport {
  const ownerNames = memory.account?.name
    ? memory.account.name.split(/\s+/).filter((t) => t.length > 1)
    : [];
  const ownerEmails = memory.account?.email ? [memory.account.email] : [];

  const cfg: AuditConfig = {
    now: partial.now ?? new Date().toISOString(),
    staleMonths: partial.staleMonths ?? DEFAULTS.staleMonths,
    volatileMonths: partial.volatileMonths ?? DEFAULTS.volatileMonths,
    driftMonths: partial.driftMonths ?? DEFAULTS.driftMonths,
    ownerNames: partial.ownerNames ?? ownerNames,
    ownerEmails: partial.ownerEmails ?? ownerEmails,
    ownerPhones: partial.ownerPhones ?? [],
  };

  const { findings, spansByItem } = runRubric(memory.items, cfg);

  const counts = {
    stale: findings.filter((f) => f.category === 'STALE').length,
    contradictory: findings.filter((f) => f.category === 'CONTRADICTORY').length,
    sensitive: findings.filter((f) => f.category === 'SENSITIVE').length,
    third_party_pii: findings.filter((f) => f.category === 'THIRD_PARTY_PII').length,
  };

  const spans: Record<string, Span[]> = {};
  for (const [id, s] of spansByItem) spans[id] = s;

  return {
    findings,
    counts,
    spans,
    conservativeMode: (cfg.ownerNames?.length ?? 0) === 0,
    config: {
      now: cfg.now,
      staleMonths: cfg.staleMonths,
      volatileMonths: cfg.volatileMonths,
      driftMonths: cfg.driftMonths,
    },
  };
}
