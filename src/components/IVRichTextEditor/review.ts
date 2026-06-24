import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type ReviewComment = {
  id: string
  status: 'PENDING' | 'RESOLVED'
  comment: string
  selectedText?: string | null
  anchor?: {
    from: number
    to: number
    text?: string | null
  } | null
  authorName?: string | null
  authorEmail?: string | null
  createdAt?: string | null
  resolvedAt?: string | null
}

type MutableRefValue<T> = {
  current: T
}

export const reviewCommentsPluginKey = new PluginKey('iv-review-comments')

const clampCommentRange = (docSize: number, comment: ReviewComment) => {
  if (
    !comment.anchor ||
    typeof comment.anchor.from !== 'number' ||
    typeof comment.anchor.to !== 'number'
  ) {
    return null
  }

  const min = Math.min(comment.anchor.from, comment.anchor.to)
  const max = Math.max(comment.anchor.from, comment.anchor.to)
  const safeFrom = Math.max(1, Math.min(min, docSize))
  const safeTo = Math.max(safeFrom + 1, Math.min(max, docSize))

  if (docSize < 2 || safeFrom >= docSize) {
    return null
  }

  return {
    from: safeFrom,
    to: safeTo,
  }
}

type DocTextIndex = {
  text: string
  positions: number[]
}

/**
 * Flatten the doc's text nodes into one string plus a parallel array mapping
 * each character to its ProseMirror position. Lets us re-locate a comment by
 * its quoted text instead of trusting stored offsets — those drift the moment
 * the editor changes the document, and don't even line up to begin with (the
 * preview captures offsets against a stripped doc, the editor loads the raw one).
 *
 * ponytail: rebuilt on every decorations() call — O(doc) per render. Fine for
 * review docs (a few thousand chars, a handful of comments); cache by doc
 * identity if it ever shows up in a profile.
 */
const buildDocTextIndex = (doc: ProseMirrorNode): DocTextIndex => {
  const chunks: string[] = []
  const positions: number[] = []

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text
      chunks.push(text)
      for (let i = 0; i < text.length; i++) {
        positions.push(pos + i)
      }
    }
    return true
  })

  return { text: chunks.join(''), positions }
}

/**
 * Re-locate a comment by its quoted text in the current doc. When the quote
 * occurs more than once, pick the occurrence closest to the stored offset.
 * Returns null when there's no quote or it can no longer be found (e.g. the
 * editor rewrote the highlighted text) — caller falls back to stored offsets.
 */
export const locateCommentRange = (
  docIndex: DocTextIndex,
  comment: ReviewComment
) => {
  const needle = (comment.anchor?.text ?? comment.selectedText ?? '').trim()
  if (!needle) return null

  const { text, positions } = docIndex
  const target = comment.anchor?.from ?? 0

  let bestStart = -1
  let bestDistance = Infinity
  for (
    let idx = text.indexOf(needle);
    idx !== -1;
    idx = text.indexOf(needle, idx + 1)
  ) {
    const distance = Math.abs(positions[idx] - target)
    if (distance < bestDistance) {
      bestDistance = distance
      bestStart = idx
    }
  }

  if (bestStart === -1) return null

  return {
    from: positions[bestStart],
    to: positions[bestStart + needle.length - 1] + 1,
  }
}

const getDecorationStyle = (comment: ReviewComment, isSelected: boolean) => {
  if (isSelected) {
    return [
      'background: rgba(99, 102, 241, 0.20)',
      'box-shadow: inset 0 -2px 0 rgba(79, 70, 229, 0.75)',
      'border-radius: 0.15rem',
      'cursor: pointer',
    ].join('; ')
  }

  if (comment.status === 'RESOLVED') {
    return [
      'background: rgba(148, 163, 184, 0.18)',
      'box-shadow: inset 0 -1px 0 rgba(100, 116, 139, 0.45)',
      'border-radius: 0.15rem',
      'cursor: pointer',
    ].join('; ')
  }

  return [
    'background: rgba(250, 204, 21, 0.24)',
    'box-shadow: inset 0 -2px 0 rgba(234, 179, 8, 0.75)',
    'border-radius: 0.15rem',
    'cursor: pointer',
  ].join('; ')
}

export const createReviewCommentsExtension = ({
  commentsRef,
  selectedCommentIdRef,
  onSelectComment,
}: {
  commentsRef: MutableRefValue<ReviewComment[]>
  selectedCommentIdRef: MutableRefValue<string | null>
  onSelectComment: (commentId: string) => void
}) =>
  Extension.create({
    name: 'reviewComments',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: reviewCommentsPluginKey,
          state: {
            init() {
              return 0
            },
            apply(tr, value) {
              return tr.getMeta(reviewCommentsPluginKey) ? value + 1 : value
            },
          },
          props: {
            decorations(state) {
              const comments = commentsRef.current
              const selectedCommentId = selectedCommentIdRef.current
              const docSize = state.doc.content.size
              const docIndex = buildDocTextIndex(state.doc)

              return DecorationSet.create(
                state.doc,
                comments
                  .map(comment => {
                    const range =
                      locateCommentRange(docIndex, comment) ??
                      clampCommentRange(docSize, comment)
                    if (!range) return null

                    const isSelected = selectedCommentId === comment.id

                    return Decoration.inline(range.from, range.to, {
                      class: `iv-review-comment iv-review-comment-${comment.status.toLowerCase()}${
                        isSelected ? ' iv-review-comment-selected' : ''
                      }`,
                      'data-review-comment-id': comment.id,
                      'data-review-comment-status': comment.status,
                      style: getDecorationStyle(comment, isSelected),
                    })
                  })
                  .filter(Boolean) as Decoration[]
              )
            },
            handleClick(_view, _pos, event) {
              const target = event.target as HTMLElement | null
              const commentId = target
                ?.closest?.('[data-review-comment-id]')
                ?.getAttribute('data-review-comment-id')

              if (!commentId) {
                return false
              }

              onSelectComment(commentId)
              return false
            },
          },
        }),
      ]
    },
  })

export const getDefaultSelectedCommentId = (
  comments: ReviewComment[],
  preferredCommentId?: string | null
) => {
  if (!comments.length) {
    return null
  }

  if (preferredCommentId && comments.some(comment => comment.id === preferredCommentId)) {
    return preferredCommentId
  }

  return (
    comments.find(comment => comment.status === 'PENDING')?.id ??
    comments[0]?.id ??
    null
  )
}

export const sortReviewComments = (comments: ReviewComment[]) =>
  [...comments].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'PENDING' ? -1 : 1
    }

    const leftDate = left.createdAt ?? ''
    const rightDate = right.createdAt ?? ''
    return leftDate.localeCompare(rightDate)
  })

export const focusReviewComment = (editor: Editor | null, comment: ReviewComment) => {
  if (!editor || !comment.anchor) return

  const docIndex = buildDocTextIndex(editor.state.doc)
  const range =
    locateCommentRange(docIndex, comment) ??
    clampCommentRange(editor.state.doc.content.size, comment)
  if (!range) return

  editor
    .chain()
    .focus()
    .setTextSelection({ from: range.from, to: range.to })
    .run()
}
