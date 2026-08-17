/**
 * True when a D1Database binding looks like the real thing. Production D1
 * always exposes both `prepare` and `batch`; test harnesses range from
 * `DB: {}` (no methods at all) to minimal mocks that only implement
 * `prepare`→`bind`→{`run`,`all`} without `batch`. Using the presence of
 * `batch` as the probe means every existing test keeps its KV fallback path
 * while production eagerly routes through D1.
 */
export function canUseD1(db: D1Database | undefined | null): boolean {
  return typeof db?.prepare === "function" && typeof (db as D1Database).batch === "function";
}
