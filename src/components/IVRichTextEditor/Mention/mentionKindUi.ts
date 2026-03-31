/** Human-readable mention entity kind (Trustfolio `type` on mentions). */
export function mentionKindLabel(type: string | undefined | null): string {
  const t = String(type || '').toLowerCase()
  const labels: Record<string, string> = {
    member: 'Member',
    membership: 'Membership',
    review: 'Review',
    collection: 'Collection',
    tag: 'Tag',
    article: 'Article',
    leaderboard: 'Leaderboard',
    buyer: 'Buyer',
  }
  return labels[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Mention')
}

/** Short prefix for inline / pill mentions in the editor. */
export function mentionKindAbbrev(type: string | undefined | null): string {
  const t = String(type || '').toLowerCase()
  const abbrevs: Record<string, string> = {
    member: 'Mem',
    membership: 'Mbs',
    review: 'Rev',
    collection: 'Col',
    tag: 'Tag',
    article: 'Art',
    leaderboard: 'Ldr',
    buyer: 'Buy',
  }
  return abbrevs[t] || (t ? t.slice(0, 3).toUpperCase() : '?')
}
