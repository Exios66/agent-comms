const MENTION_RE = /@([a-z][a-z0-9_-]{1,31})\b/g;

export function extractMentions(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION_RE)) {
    found.add(match[1]);
  }
  return [...found];
}
