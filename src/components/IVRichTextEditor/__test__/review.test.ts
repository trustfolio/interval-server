import { locateCommentRange, type ReviewComment } from '../review'

/** Build the {text, positions} index the way buildDocTextIndex would for a
 *  single text node that starts at ProseMirror position `start`. */
const indexFor = (s: string, start = 1) => ({
  text: s,
  positions: Array.from({ length: s.length }, (_v, i) => start + i),
})

const comment = (over: Partial<ReviewComment>): ReviewComment => ({
  id: 'c1',
  status: 'PENDING',
  comment: '',
  ...over,
})

describe('locateCommentRange', () => {
  it('finds the quote and returns live positions, ignoring stale offsets', () => {
    // "hello world", text node starts at pos 1 → "world" at chars 6..10 → pos 7..12
    const idx = indexFor('hello world')
    const range = locateCommentRange(
      idx,
      comment({ anchor: { from: 999, to: 1004, text: 'world' } })
    )
    expect(range).toEqual({ from: 7, to: 12 })
  })

  it('picks the occurrence closest to the stored offset on duplicates', () => {
    // "ab ab ab" → "ab" at positions 1, 4, 7. Stored from=5 → nearest is the
    // second occurrence (pos 4).
    const idx = indexFor('ab ab ab')
    const range = locateCommentRange(
      idx,
      comment({ anchor: { from: 5, to: 7, text: 'ab' } })
    )
    expect(range).toEqual({ from: 4, to: 6 })
  })

  it('returns null when the quote no longer exists', () => {
    expect(
      locateCommentRange(
        indexFor('nothing matches here'),
        comment({ anchor: { from: 1, to: 5, text: 'absent' } })
      )
    ).toBeNull()
  })

  it('returns null for general (un-anchored) comments', () => {
    expect(locateCommentRange(indexFor('whatever'), comment({}))).toBeNull()
  })
})
