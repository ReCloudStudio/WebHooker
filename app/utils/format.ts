/** Split a comma-separated input into trimmed non-empty parts. */
export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Comma-separated filter match → single value, list, or null when empty. */
export function parseMatch(text: string): string | string[] | null {
  const parts = splitList(text);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0]! : parts;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}
