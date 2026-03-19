import {
  useState,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react'
import { Editor as CoreEditor, mergeAttributes, Node } from '@tiptap/core'
import { useEditor, Editor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { Level } from '@tiptap/extension-heading'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import Youtube from '@tiptap/extension-youtube'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import classNames from 'classnames'

import IVButton from '~/components/IVButton'
import IVDialog, { useDialogState } from '~/components/IVDialog'
import IVSelect from '~/components/IVSelect'
import FileUploadButton, { UploadStep } from '~/components/FileUploadButton'
import { RenderContext } from '~/components/RenderContext'

import QuoteLeftIcon from '~/icons/compiled/QuoteLeft'
import BulletedListIcon from '~/icons/compiled/BulletedList'
import NumberedListIcon from '~/icons/compiled/NumberedList'
import LinkIcon from '~/icons/compiled/Link'
import RedoIcon from '~/icons/compiled/Redo'
import UndoIcon from '~/icons/compiled/Undo'
import ClearFormattingIcon from '~/icons/compiled/ClearFormatting'
import ImageIcon from '~/icons/compiled/Image'
import VideoIcon from '~/icons/compiled/Play'
import MoreIcon from '~/icons/compiled/More'
import { ShortcutMap, getShortcuts } from '~/utils/usePlatform'
import { client as trpcClient } from '~/utils/trpc'
import { mentionSuggestionOptions } from './Mention/mentionSuggestionOptions'
import { Callout } from './Callout'
import CalloutEditor from './CalloutEditor'
import { Faq } from './Faq'
import type { FaqItem } from './Faq'
import {
  createReviewCommentsExtension,
  focusReviewComment,
  getDefaultSelectedCommentId,
  reviewCommentsPluginKey,
  sortReviewComments,
  type ReviewComment,
} from './review'

type VideoAspectRatio = 'horizontal' | 'square' | 'vertical'
type GalleryLayout = 'grid' | 'slider'
type GalleryItemType = 'image' | 'youtube'
type LinkInsertMode = 'text' | 'preview' | 'mention'

type GalleryItem = {
  type: GalleryItemType
  src: string
  alt?: string
  aspectRatio?: VideoAspectRatio
}

type LinkPreviewMetadata = {
  url: string
  finalUrl: string
  title: string
  description?: string
  imageUrl?: string
  faviconUrl?: string
  siteName?: string
}

const VIDEO_ASPECT_RATIO: Record<VideoAspectRatio, string> = {
  horizontal: '16 / 9',
  square: '1 / 1',
  vertical: '9 / 16',
}

function inferAspectRatioFromDimensions(
  width?: number,
  height?: number
): VideoAspectRatio {
  if (!width || !height) return 'horizontal'
  const ratio = width / height

  if (ratio < 0.85) return 'vertical'
  if (ratio > 1.2) return 'horizontal'
  return 'square'
}

function toAspectRatioString(aspectRatio: VideoAspectRatio): string {
  return VIDEO_ASPECT_RATIO[aspectRatio] ?? VIDEO_ASPECT_RATIO.horizontal
}

function getYoutubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)

    if (url.hostname.includes('youtu.be')) {
      return url.pathname.split('/').filter(Boolean)[0] ?? null
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) {
        return url.pathname.replace('/embed/', '').split('/')[0] ?? null
      }

      const fromQuery = url.searchParams.get('v')
      if (fromQuery) return fromQuery
    }

    return null
  } catch (_err) {
    return null
  }
}

function getYoutubeEmbedUrl(rawUrl: string): string {
  const videoId = getYoutubeVideoId(rawUrl)
  if (!videoId) return rawUrl
  return `https://www.youtube.com/embed/${videoId}`
}

function parseGalleryItems(value: string | null): GalleryItem[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        type: (item.type === 'youtube'
          ? 'youtube'
          : 'image') as GalleryItemType,
        src: typeof item.src === 'string' ? item.src : '',
        alt: typeof item.alt === 'string' ? item.alt : undefined,
        aspectRatio:
          item.aspectRatio === 'square' || item.aspectRatio === 'vertical'
            ? item.aspectRatio
            : 'horizontal',
      }))
      .filter(item => item.src)
  } catch (_err) {
    return []
  }
}

const LinkPreviewCard = Node.create({
  name: 'linkPreviewCard',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      imageUrl: { default: '' },
      faviconUrl: { default: '' },
      siteName: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-iv-link-preview]',
        getAttrs: element => {
          const el = element as HTMLElement
          return {
            url: el.getAttribute('data-url') ?? '',
            title: el.getAttribute('data-title') ?? '',
            description: el.getAttribute('data-description') ?? '',
            imageUrl: el.getAttribute('data-image-url') ?? '',
            faviconUrl: el.getAttribute('data-favicon-url') ?? '',
            siteName: el.getAttribute('data-site-name') ?? '',
          }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    const title = node.attrs.title || node.attrs.url
    const description = node.attrs.description || ''

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-iv-link-preview': '',
        'data-url': node.attrs.url,
        'data-title': title,
        'data-description': description,
        'data-image-url': node.attrs.imageUrl,
        'data-favicon-url': node.attrs.faviconUrl,
        'data-site-name': node.attrs.siteName,
        class: 'iv-link-preview-card',
      }),
      [
        'a',
        {
          href: node.attrs.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'iv-link-preview-anchor',
        },
        ...(node.attrs.imageUrl
          ? [
              [
                'img',
                {
                  src: node.attrs.imageUrl,
                  alt: title,
                  class: 'iv-link-preview-image',
                },
              ],
            ]
          : []),
        [
          'div',
          { class: 'iv-link-preview-content' },
          [
            'div',
            { class: 'iv-link-preview-title' },
            ...(node.attrs.faviconUrl
              ? [
                  [
                    'img',
                    {
                      src: node.attrs.faviconUrl,
                      alt: '',
                      class: 'iv-link-preview-favicon',
                    },
                  ],
                ]
              : []),
            ['span', {}, title],
          ],
          ...(description
            ? [['p', { class: 'iv-link-preview-description' }, description]]
            : []),
          ...(node.attrs.siteName
            ? [['p', { class: 'iv-link-preview-site' }, node.attrs.siteName]]
            : []),
        ],
      ],
    ]
  },
})

const LinkMentionChip = Node.create({
  name: 'linkMentionChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      faviconUrl: { default: '' },
      siteName: { default: '' },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-iv-link-mention]',
        getAttrs: element => {
          const el = element as HTMLElement
          return {
            url: el.getAttribute('data-url') ?? '',
            title: el.getAttribute('data-title') ?? '',
            faviconUrl: el.getAttribute('data-favicon-url') ?? '',
            siteName: el.getAttribute('data-site-name') ?? '',
          }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    const title = node.attrs.title || node.attrs.url
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-iv-link-mention': '',
        'data-url': node.attrs.url,
        'data-title': title,
        'data-favicon-url': node.attrs.faviconUrl,
        'data-site-name': node.attrs.siteName,
        class: 'iv-link-mention-chip',
      }),
      [
        'a',
        {
          href: node.attrs.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'iv-link-mention-anchor',
        },
        ...(node.attrs.faviconUrl
          ? [
              [
                'img',
                {
                  src: node.attrs.faviconUrl,
                  alt: '',
                  class: 'iv-link-mention-favicon',
                },
              ],
            ]
          : []),
        ['span', { class: 'iv-link-mention-title' }, title],
      ],
    ]
  },
})

const IVVideo = Node.create({
  name: 'ivVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: 'youtube' },
      src: { default: '' },
      aspectRatio: { default: 'horizontal' as VideoAspectRatio },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-iv-video]',
        getAttrs: element => {
          const el = element as HTMLElement
          return {
            provider: el.getAttribute('data-provider') ?? 'youtube',
            src: el.getAttribute('data-src') ?? '',
            aspectRatio:
              el.getAttribute('data-aspect-ratio') === 'square' ||
              el.getAttribute('data-aspect-ratio') === 'vertical'
                ? el.getAttribute('data-aspect-ratio')
                : 'horizontal',
          }
        },
      },
      {
        tag: 'iframe[src*="youtube"]',
        getAttrs: element => {
          const el = element as HTMLIFrameElement
          const width = parseInt(el.getAttribute('width') || '', 10)
          const height = parseInt(el.getAttribute('height') || '', 10)
          return {
            provider: 'youtube',
            src: el.getAttribute('src') ?? '',
            aspectRatio: inferAspectRatioFromDimensions(width, height),
          }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    const aspectRatio: VideoAspectRatio =
      node.attrs.aspectRatio === 'square' ||
      node.attrs.aspectRatio === 'vertical'
        ? node.attrs.aspectRatio
        : 'horizontal'

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-iv-video': '',
        'data-provider': node.attrs.provider,
        'data-src': node.attrs.src,
        'data-aspect-ratio': aspectRatio,
        class: 'iv-video',
      }),
      [
        'div',
        {
          class: 'iv-video-frame',
          style: `aspect-ratio: ${toAspectRatioString(aspectRatio)};`,
        },
        [
          'iframe',
          {
            src: getYoutubeEmbedUrl(node.attrs.src),
            allowfullscreen: 'true',
            frameborder: '0',
            loading: 'lazy',
          },
        ],
      ],
    ]
  },
})

const IVGallery = Node.create({
  name: 'ivGallery',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      layout: { default: 'grid' as GalleryLayout },
      items: { default: [] as GalleryItem[] },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-iv-gallery]',
        getAttrs: element => {
          const el = element as HTMLElement
          return {
            layout:
              el.getAttribute('data-layout') === 'slider' ? 'slider' : 'grid',
            items: parseGalleryItems(el.getAttribute('data-items')),
          }
        },
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    const layout: GalleryLayout =
      node.attrs.layout === 'slider' ? 'slider' : 'grid'
    const items: GalleryItem[] = Array.isArray(node.attrs.items)
      ? node.attrs.items
      : []

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-iv-gallery': '',
        'data-layout': layout,
        'data-items': JSON.stringify(items),
        class: classNames('iv-gallery', {
          'iv-gallery-grid': layout === 'grid',
          'iv-gallery-slider': layout === 'slider',
        }),
      }),
      ...items.map(item => {
        if (item.type === 'youtube') {
          return [
            'div',
            { class: 'iv-gallery-item iv-gallery-item-video' },
            [
              'iframe',
              {
                src: getYoutubeEmbedUrl(item.src),
                allowfullscreen: 'true',
                frameborder: '0',
                loading: 'lazy',
              },
            ],
          ]
        }

        return [
          'figure',
          { class: 'iv-gallery-item iv-gallery-item-image' },
          [
            'img',
            {
              src: item.src,
              alt: item.alt ?? '',
            },
          ],
        ]
      }),
    ]
  },
})

const CustomLink = Link.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-C': ({ editor }) => clearFormattingButtonHandler(editor),
      // Swallow Cmd+Enter
      'Mod-Enter': () => true,
    }
  },
  parseHTML() {
    return [
      {
        tag: 'a[href]',
        getAttrs: element => {
          const el = element as HTMLElement
          // Don't parse links that are mentions - let the Mention extension handle them
          if (
            el.hasAttribute('data-mention-type') ||
            el.classList.contains('mention')
          ) {
            return false
          }
          return {}
        },
      },
    ]
  },
})

function clearFormattingButtonHandler(editor: CoreEditor) {
  return editor
    .chain()
    .focus()
    .clearNodes()
    .unsetBold()
    .unsetItalic()
    .unsetUnderline()
    .unsetStrike()
    .unsetLink()
    .run()
}

function cleanUrl(url: string | undefined | null): string {
  if (!url) return ''
  // Extract only the URL part, removing any HTML that might have been incorrectly included
  const urlMatch = url.match(/^(https?:\/\/[^\s"<>]+)/)
  return urlMatch ? urlMatch[1] : url
}

function migrateLegacyYoutubeNodes(editor: Editor): boolean {
  const youtubeNode = editor.schema.nodes.youtube
  const ivVideoNode = editor.schema.nodes.ivVideo
  if (!youtubeNode || !ivVideoNode) return false

  const replacements: Array<{
    pos: number
    nodeSize: number
    src: string
    aspectRatio: VideoAspectRatio
  }> = []

  editor.state.doc.descendants((node, pos) => {
    if (node.type !== youtubeNode) return

    replacements.push({
      pos,
      nodeSize: node.nodeSize,
      src: node.attrs.src,
      aspectRatio: inferAspectRatioFromDimensions(
        node.attrs.width,
        node.attrs.height
      ),
    })
  })

  if (!replacements.length) return false

  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      for (const replacement of [...replacements].reverse()) {
        tr.replaceWith(
          replacement.pos,
          replacement.pos + replacement.nodeSize,
          state.schema.nodes.ivVideo.create({
            provider: 'youtube',
            src: replacement.src,
            aspectRatio: replacement.aspectRatio,
          })
        )
      }

      return true
    })
    .run()

  return true
}

function getAllMentions(doc: any): Array<any> {
  const result: Array<any> = []
  const mentionTypes = ['mention', 'mentionPill', 'mentionMegaPill']
  const allNodeTypes: Record<string, number> = {}

  // First pass: count all node types to understand document structure
  doc.descendants(node => {
    const nodeType = node.type.name
    allNodeTypes[nodeType] = (allNodeTypes[nodeType] || 0) + 1
  })

  // eslint-disable-next-line no-console
  console.log(
    '[IVRichTextEditor] getAllMentions: all node types in document',
    allNodeTypes
  )

  // Second pass: collect mentions and log potential mentions
  doc.descendants((node, pos) => {
    const nodeType = node.type.name

    // Check if this is a link node that might actually be a mention
    // (TipTap might parse mentions as links if Link extension parses first)
    if (nodeType === 'link' && node.attrs.href) {
      // Check if the link has mention attributes in the HTML
      // We need to check the actual HTML element to see if it has data-mention-* attributes
      // But we can't access the DOM from here, so we check the JSON structure
      // If the link has a class that suggests it's a mention, we should treat it as one
      const href = node.attrs.href
      // eslint-disable-next-line no-console
      console.log('[IVRichTextEditor] getAllMentions: found link node', {
        nodeType,
        pos,
        href,
        attrs: node.attrs,
        textContent: node.textContent?.substring(0, 50),
      })
    }

    // Log all nodes that might be mentions (for debugging)
    if (
      nodeType === 'mention' ||
      nodeType === 'mentionPill' ||
      nodeType === 'mentionMegaPill' ||
      nodeType === 'link' ||
      (nodeType === 'text' &&
        node.marks?.some((m: any) => m.type.name === 'mention'))
    ) {
      // eslint-disable-next-line no-console
      console.log('[IVRichTextEditor] getAllMentions: potential mention node', {
        nodeType,
        pos,
        attrs: node.attrs,
        marks: node.marks?.map((m: any) => m.type.name),
        textContent: node.textContent?.substring(0, 50),
      })
    }

    if (mentionTypes.includes(nodeType)) {
      // Clean the URL attribute to ensure it doesn't contain HTML
      const attrs = { ...node.attrs }
      if (attrs.url) {
        attrs.url = cleanUrl(attrs.url)
      }
      // Ensure variant is set correctly based on node type if not already set
      if (!attrs.variant) {
        if (nodeType === 'mentionPill') {
          attrs.variant = 'pill'
        } else if (nodeType === 'mentionMegaPill') {
          attrs.variant = 'mega-pill'
        } else {
          attrs.variant = 'inline'
        }
      }

      // Debug log for each mention node found in the document
      // Useful to understand what TipTap has parsed at load time (including existing HTML)
      // eslint-disable-next-line no-console
      console.log('[IVRichTextEditor] getAllMentions: found mention node', {
        nodeType: node.type.name,
        pos,
        attrs,
      })

      result.push(attrs)
    }
  })

  // Global debug log of all mentions extracted from the document
  // eslint-disable-next-line no-console
  console.log('[IVRichTextEditor] getAllMentions: final result', result)

  return result
}

export interface IVRichTextEditorProps {
  id?: string
  defaultValue?: { html: string; json?: any; mentions?: any[] }
  media?: any
  links?: any
  review?: {
    comments: {
      id: string
      status: 'PENDING' | 'RESOLVED'
      comment: string
      selectedText?: string | null
      anchor: { from: number; to: number; text?: string | null }
      authorName?: string | null
      authorEmail?: string | null
      createdAt?: string | null
      resolvedAt?: string | null
    }[]
    selectedCommentId?: string | null
  }
  inputGroupKey?: string
  transactionId?: string
  requestCustomUploadUrls?: (
    files: {
      name: string
      type: string
    }[]
  ) => Promise<{ uploadUrl: string; downloadUrl: string }[] | undefined>
  requestReviewAction?: (
    action: 'resolve' | 'unresolve',
    commentId: string
  ) => Promise<
    | {
        comments: NonNullable<IVRichTextEditorProps['review']>['comments']
        selectedCommentId?: string | null
      }
    | undefined
  >
  onChange: (
    content: { html: string; json?: any; mentions?: any[] },
    textContent: string
  ) => void
  onBlur?: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
  hasError?: boolean
}

export default function IVRichTextEditor({
  id,
  defaultValue,
  media,
  links,
  review,
  inputGroupKey,
  transactionId,
  requestCustomUploadUrls,
  requestReviewAction,
  onChange,
  onBlur = () => {
    /* */
  },
  disabled,
  placeholder = 'Write something ...',
  className,
  autoFocus = false,
  hasError,
}: IVRichTextEditorProps) {
  const renderContext = useContext(RenderContext)
  const getUploadUrls = renderContext?.getUploadUrls

  const imageDialog = useDialogState({ visible: false, modal: true })
  const videoDialog = useDialogState({ visible: false, modal: true })
  const galleryDialog = useDialogState({ visible: false, modal: true })
  const linkDialog = useDialogState({ visible: false, modal: true })
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>(
    review?.comments ?? []
  )
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(
    getDefaultSelectedCommentId(
      review?.comments ?? [],
      review?.selectedCommentId
    )
  )
  const [reviewFilter, setReviewFilter] = useState<
    'pending' | 'resolved' | 'all'
  >('pending')
  const [reviewActionCommentId, setReviewActionCommentId] = useState<
    string | null
  >(null)
  const reviewCommentsRef = useRef<ReviewComment[]>(review?.comments ?? [])
  const selectedCommentIdRef = useRef<string | null>(
    getDefaultSelectedCommentId(
      review?.comments ?? [],
      review?.selectedCommentId
    )
  )
  const reviewCommentsExtension = useMemo(
    () =>
      createReviewCommentsExtension({
        commentsRef: reviewCommentsRef,
        selectedCommentIdRef,
        onSelectComment: commentId => setSelectedCommentId(commentId),
      }),
    []
  )
  const canAddImage =
    (media?.image?.sources?.length ?? 2) > 0 &&
    (media?.image?.sources?.includes?.('upload') ||
      media?.image?.sources?.includes?.('url') ||
      !media?.image?.sources)
  const canAddVideo =
    (media?.video?.sources?.length ?? 1) > 0 &&
    (media?.video?.sources?.includes?.('youtube') || !media?.video?.sources)
  const canAddGallery = media?.gallery?.enabled !== false
  const canAddLink = (links?.modes?.length ?? 3) > 0

  const resolveUploadUrls = useCallback(
    async (files: { name: string; type: string }[]) => {
      if (requestCustomUploadUrls) {
        const customUrls = await requestCustomUploadUrls(files)
        if (customUrls?.length) return customUrls
      }

      if (!getUploadUrls || !id || !inputGroupKey || !transactionId) {
        return undefined
      }

      const objectKeys = files.map(
        (_file, i) =>
          `${id}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`
      )

      const urls = await getUploadUrls({
        objectKeys,
        inputGroupKey,
        transactionId,
      })

      if (!urls?.length) return undefined
      return urls
    },
    [getUploadUrls, id, inputGroupKey, requestCustomUploadUrls, transactionId]
  )

  const fetchLinkPreview = useCallback(async (url: string) => {
    const preview = await trpcClient.mutation('linkPreview.fetch', { url })
    return preview as LinkPreviewMetadata
  }, [])

  // Log the initial content to debug mention parsing
  // eslint-disable-next-line no-console
  console.log('[IVRichTextEditor] Initial content', {
    hasJson: !!defaultValue?.json,
    hasHtml: !!defaultValue?.html,
    htmlPreview: defaultValue?.html?.substring(0, 500),
    mentionsInDefaultValue: defaultValue?.mentions,
  })

  const editor = useEditor({
    content: defaultValue?.json || defaultValue?.html,
    editable: !disabled,
    extensions: [
      StarterKit,
      Underline,
      CustomLink.configure({
        openOnClick: true, // TODO: Disable this after adding custom handler
      }),
      Placeholder.configure({
        placeholder,
      }),
      Image,
      LinkPreviewCard,
      LinkMentionChip,
      IVVideo,
      IVGallery,
      Mention.extend({
        addAttributes() {
          return {
            type: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-type') || '',
            },
            url: {
              default: '',
              parseHTML: element => {
                // Prefer data-mention-url as it's more reliable
                const url = element.getAttribute('data-mention-url')
                if (url) return url
                // Fallback to href, but extract only the URL part (before any HTML attributes)
                const href = element.getAttribute('href')
                if (href) {
                  // Extract only the URL part, removing any HTML that might have been incorrectly included
                  const urlMatch = href.match(/^(https?:\/\/[^\s"<>]+)/)
                  return urlMatch ? urlMatch[1] : href
                }
                return ''
              },
            },
            label: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-label') ||
                element.textContent ||
                '',
            },
            id: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-id') || '',
            },
            variant: {
              default: 'inline',
              parseHTML: element =>
                element.getAttribute('data-mention-variant') || 'inline',
              renderHTML: attributes => {
                if (!attributes.variant || attributes.variant === 'inline') {
                  return {}
                }
                return {
                  'data-mention-variant': attributes.variant,
                }
              },
            },
          }
        },
        parseHTML() {
          return [
            {
              tag: 'a[data-mention-type]',
              getAttrs: element => {
                const el = element as HTMLElement
                // Only parse as mention if it has data-mention-type (not pill/megapill)
                const variant = el.getAttribute('data-mention-variant')
                if (variant === 'pill' || variant === 'mega-pill') {
                  return false
                }
                const attrs = {
                  type: el.getAttribute('data-mention-type') || '',
                  url: (() => {
                    const url = el.getAttribute('data-mention-url')
                    if (url) return url
                    const href = el.getAttribute('href')
                    if (href) {
                      const urlMatch = href.match(/^(https?:\/\/[^\s"<>]+)/)
                      return urlMatch ? urlMatch[1] : href
                    }
                    return ''
                  })(),
                  label:
                    el.getAttribute('data-mention-label') ||
                    el.textContent ||
                    '',
                  id: el.getAttribute('data-mention-id') || '',
                  variant: variant || 'inline',
                }
                // eslint-disable-next-line no-console
                console.log(
                  '[IVRichTextEditor] Mention.parseHTML a[data-mention-type]',
                  {
                    outerHTML: el.outerHTML,
                    attrs,
                  }
                )
                return attrs
              },
            },
            {
              tag: 'a.mention',
              getAttrs: element => {
                const el = element as HTMLElement
                // Only parse as mention if it doesn't have data-mention-pill or data-mention-mega-pill
                if (
                  el.hasAttribute('data-mention-pill') ||
                  el.hasAttribute('data-mention-mega-pill')
                ) {
                  return false
                }
                // Check if it has data-mention-type to confirm it's a mention
                if (!el.hasAttribute('data-mention-type')) {
                  return false
                }
                const attrs = {
                  type: el.getAttribute('data-mention-type') || '',
                  url: (() => {
                    const url = el.getAttribute('data-mention-url')
                    if (url) return url
                    const href = el.getAttribute('href')
                    if (href) {
                      const urlMatch = href.match(/^(https?:\/\/[^\s"<>]+)/)
                      return urlMatch ? urlMatch[1] : href
                    }
                    return ''
                  })(),
                  label:
                    el.getAttribute('data-mention-label') ||
                    el.textContent ||
                    '',
                  id: el.getAttribute('data-mention-id') || '',
                  variant: el.getAttribute('data-mention-variant') || 'inline',
                }
                // eslint-disable-next-line no-console
                console.log('[IVRichTextEditor] Mention.parseHTML a.mention', {
                  outerHTML: el.outerHTML,
                  attrs,
                })
                return attrs
              },
            },
          ]
        },
      }).configure({
        deleteTriggerWithBackspace: true,
        HTMLAttributes: {
          class: 'mention',
          target: '_blank',
        },
        renderHTML({ options, node }) {
          return [
            'a',
            mergeAttributes(
              {
                href: node.attrs.url,
                class: `mention-${node.attrs.type}`,
                'data-mention-type': node.attrs.type,
                'data-mention-id': node.attrs.id,
                'data-mention-label': node.attrs.label,
                'data-mention-url': node.attrs.url,
                'data-mention-variant': node.attrs.variant || 'inline',
              },
              options.HTMLAttributes
            ),
            `${node.attrs.label ?? node.attrs.id}`,
          ]
        },
        suggestion: mentionSuggestionOptions,
      }),
      // Block-level mention nodes for pill variants
      Node.create({
        name: 'mentionPill',
        group: 'block',
        atom: true,
        addAttributes() {
          return {
            type: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-type') || '',
            },
            url: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-url') || '',
            },
            label: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-label') ||
                element.textContent ||
                '',
            },
            id: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-id') || '',
            },
            variant: {
              default: 'pill',
              parseHTML: element =>
                element.getAttribute('data-mention-variant') || 'pill',
            },
          }
        },
        parseHTML() {
          return [
            {
              tag: 'div[data-mention-pill]',
              getAttrs: element => {
                const div = element as HTMLElement
                return {
                  type: div.getAttribute('data-mention-type') || '',
                  url: div.getAttribute('data-mention-url') || '',
                  label:
                    div.getAttribute('data-mention-label') ||
                    div.textContent ||
                    '',
                  id: div.getAttribute('data-mention-id') || '',
                  variant: div.getAttribute('data-mention-variant') || 'pill',
                }
              },
            },
          ]
        },
        renderHTML({ node }) {
          return [
            'div',
            {
              'data-mention-pill': '',
              'data-mention-type': node.attrs.type,
              'data-mention-id': node.attrs.id,
              'data-mention-label': node.attrs.label,
              'data-mention-url': node.attrs.url,
              'data-mention-variant': 'pill',
              class: `mention-pill mention-${node.attrs.type}`,
              style:
                'display: inline-block; padding: 0.5rem 1rem; border-radius: 9999px; margin: 0.25rem 0;',
            },
            `${node.attrs.label ?? node.attrs.id}`,
          ]
        },
      }),
      Node.create({
        name: 'mentionMegaPill',
        group: 'block',
        atom: true,
        addAttributes() {
          return {
            type: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-type') || '',
            },
            url: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-url') || '',
            },
            label: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-label') ||
                element.textContent ||
                '',
            },
            id: {
              default: '',
              parseHTML: element =>
                element.getAttribute('data-mention-id') || '',
            },
            variant: {
              default: 'mega-pill',
              parseHTML: element =>
                element.getAttribute('data-mention-variant') || 'mega-pill',
            },
          }
        },
        parseHTML() {
          return [
            {
              tag: 'div[data-mention-mega-pill]',
              getAttrs: element => {
                const div = element as HTMLElement
                return {
                  type: div.getAttribute('data-mention-type') || '',
                  url: div.getAttribute('data-mention-url') || '',
                  label:
                    div.getAttribute('data-mention-label') ||
                    div.textContent ||
                    '',
                  id: div.getAttribute('data-mention-id') || '',
                  variant:
                    div.getAttribute('data-mention-variant') || 'mega-pill',
                }
              },
            },
          ]
        },
        renderHTML({ node }) {
          return [
            'div',
            {
              'data-mention-mega-pill': '',
              'data-mention-type': node.attrs.type,
              'data-mention-id': node.attrs.id,
              'data-mention-label': node.attrs.label,
              'data-mention-url': node.attrs.url,
              'data-mention-variant': 'mega-pill',
              class: `mention-mega-pill mention-${node.attrs.type}`,
              style:
                'display: block; padding: 1rem 1.5rem; border-radius: 0.5rem; margin: 0.5rem 0; font-size: 1.125rem;',
            },
            `${node.attrs.label ?? node.attrs.id}`,
          ]
        },
      }),
      Callout,
      Faq,
      Youtube.configure({
        controls: false,
        nocookie: true,
        modestBranding: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      reviewCommentsExtension,
    ],
    onUpdate({ editor }) {
      if (migrateLegacyYoutubeNodes(editor)) {
        return
      }

      // This might be wastefully expensive to do both always but it's a nice
      // way for the parent to ensure that text is entered and not just empty
      // blocks.

      const mentions = getAllMentions(editor.state.doc)
      const json = editor.getJSON()

      // Also check the JSON structure for mentions that might not be detected
      const jsonStr = JSON.stringify(json)
      // eslint-disable-next-line no-console
      console.log('[IVRichTextEditor] onUpdate: checking JSON for mentions', {
        jsonMentionsCount: (jsonStr.match(/mention/g) || []).length,
        jsonPreview: jsonStr.substring(0, 1000),
      })

      // Debug log for every onUpdate with the mentions that will be sent upstream
      // eslint-disable-next-line no-console
      console.log('[IVRichTextEditor] onUpdate: mentions payload', mentions)

      onChange(
        {
          html: editor.getHTML(),
          json,
          mentions,
        },
        editor.getText()
      )
    },
    editorProps: {
      attributes: autoFocus ? { 'data-autofocus-target': 'true' } : undefined,
    },
    onBlur,
    // TODO: Add custom ctrl/cmd+click handler for links
    // editorProps: {
    //   handleClickOn(_view, pos, node, nodePos, event, direct) {
    //     if (event.ctrlKey) {
    //       console.log({ node, nodePos, pos })
    //     }
    //
    //     return true
    //   },
    // },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    const nextComments = review?.comments ?? []
    reviewCommentsRef.current = nextComments
    setReviewComments(nextComments)
    setSelectedCommentId(currentSelection =>
      getDefaultSelectedCommentId(
        nextComments,
        review?.selectedCommentId ?? currentSelection
      )
    )
  }, [review])

  useEffect(() => {
    reviewCommentsRef.current = reviewComments
  }, [reviewComments])

  useEffect(() => {
    selectedCommentIdRef.current = selectedCommentId
    if (!editor) return

    editor.view.dispatch(
      editor.state.tr.setMeta(reviewCommentsPluginKey, Date.now())
    )
  }, [editor, reviewComments, selectedCommentId])

  useEffect(() => {
    if (!selectedCommentId) return

    const selectedElement = document.getElementById(
      `iv-review-comment-${selectedCommentId}`
    )
    selectedElement?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedCommentId])

  const selectReviewComment = useCallback(
    (commentId: string) => {
      setSelectedCommentId(commentId)

      const comment = reviewCommentsRef.current.find(
        entry => entry.id === commentId
      )
      if (!comment) return

      focusReviewComment(editor, comment)
    },
    [editor]
  )

  const applyReviewAction = useCallback(
    async (commentId: string, action: 'resolve' | 'unresolve') => {
      const nextStatus = action === 'resolve' ? 'RESOLVED' : 'PENDING'
      setReviewActionCommentId(commentId)

      try {
        if (!requestReviewAction) {
          setReviewComments(currentComments =>
            currentComments.map(comment =>
              comment.id === commentId
                ? {
                    ...comment,
                    status: nextStatus,
                    resolvedAt:
                      nextStatus === 'RESOLVED'
                        ? new Date().toISOString()
                        : null,
                  }
                : comment
            )
          )
          setSelectedCommentId(commentId)
          return
        }

        const response = await requestReviewAction(action, commentId)
        if (!response) return

        setReviewComments(response.comments)
        setSelectedCommentId(
          getDefaultSelectedCommentId(
            response.comments,
            response.selectedCommentId ?? commentId
          )
        )
      } finally {
        setReviewActionCommentId(null)
      }
    },
    [requestReviewAction]
  )

  const addVideo = useCallback(
    (url: string, aspectRatio: VideoAspectRatio) => {
      if (!editor || !url) return
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'ivVideo',
          attrs: {
            provider: 'youtube',
            src: url,
            aspectRatio,
          },
        })
        .run()
    },
    [editor]
  )

  const addGallery = useCallback(
    (layout: GalleryLayout, items: GalleryItem[]) => {
      if (!editor || items.length === 0) return
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'ivGallery',
          attrs: {
            layout,
            items,
          },
        })
        .run()
    },
    [editor]
  )

  const insertLink = useCallback(
    async (
      mode: LinkInsertMode,
      url: string,
      label?: string,
      preview?: LinkPreviewMetadata
    ) => {
      if (!editor || !url) return

      if (mode === 'preview') {
        const payload = preview ?? (await fetchLinkPreview(url))
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'linkPreviewCard',
            attrs: {
              url: payload.finalUrl || payload.url,
              title: payload.title,
              description: payload.description,
              imageUrl: payload.imageUrl,
              faviconUrl: payload.faviconUrl,
              siteName: payload.siteName,
            },
          })
          .run()
        return
      }

      if (mode === 'mention') {
        const payload = preview ?? (await fetchLinkPreview(url))
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'linkMentionChip',
            attrs: {
              url: payload.finalUrl || payload.url,
              title: payload.title || label || url,
              faviconUrl: payload.faviconUrl,
              siteName: payload.siteName,
            },
          })
          .run()
        return
      }

      if (editor.state.selection.empty) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: label || url,
            marks: [
              {
                type: 'link',
                attrs: { href: url },
              },
            ],
          })
          .run()
      } else {
        editor.chain().focus().setLink({ href: url }).run()
      }
    },
    [editor, fetchLinkPreview]
  )

  const orderedReviewComments = sortReviewComments(reviewComments)
  const visibleReviewComments = orderedReviewComments.filter(comment => {
    if (reviewFilter === 'all') return true
    if (reviewFilter === 'pending') return comment.status === 'PENDING'
    return comment.status === 'RESOLVED'
  })
  const pendingReviewCount = orderedReviewComments.filter(
    comment => comment.status === 'PENDING'
  ).length
  const resolvedReviewCount = orderedReviewComments.length - pendingReviewCount
  const reviewModeEnabled = !!review
  const selectedReviewComment =
    orderedReviewComments.find(comment => comment.id === selectedCommentId) ??
    null

  return (
    <div
      className={classNames(
        className,
        'p-2 bg-white border rounded-md overflow-hidden w-full min-w-[300px]',
        {
          'border-amber-500': hasError,
          'border-gray-300': !hasError,
          'bg-gray-50': disabled,
          'focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ':
            !disabled,
        }
      )}
    >
      <MenuBar
        editor={editor}
        disabled={!!disabled}
        canAddImage={canAddImage}
        canAddVideo={canAddVideo}
        canAddGallery={canAddGallery}
        canAddLink={canAddLink}
        onAddImage={() => imageDialog.show()}
        onAddVideo={() => videoDialog.show()}
        onAddGallery={() => galleryDialog.show()}
        onAddLink={() => linkDialog.show()}
      />
      <div
        className={classNames('gap-4', {
          'grid grid-cols-[minmax(0,1fr)_20rem]': reviewModeEnabled,
        })}
      >
        <div className="min-w-0">
          <EditorContent
            editor={editor}
            className="prose max-w-none p-2 pt-4"
            disabled={disabled}
            id={id}
          />
        </div>
        {reviewModeEnabled ? (
          <ReviewSidebar
            comments={visibleReviewComments}
            selectedCommentId={selectedCommentId}
            selectedComment={selectedReviewComment}
            pendingCount={pendingReviewCount}
            resolvedCount={resolvedReviewCount}
            filter={reviewFilter}
            disabled={!!disabled}
            actionCommentId={reviewActionCommentId}
            onFilterChange={setReviewFilter}
            onSelectComment={selectReviewComment}
            onResolveComment={commentId =>
              applyReviewAction(commentId, 'resolve')
            }
            onUnresolveComment={commentId =>
              applyReviewAction(commentId, 'unresolve')
            }
          />
        ) : null}
      </div>
      <CalloutClickHandler editor={editor} />
      <MentionClickHandler editor={editor} />
      <ImageInsertModal
        dialog={imageDialog}
        allowUpload={media?.image?.sources?.includes?.('upload') ?? true}
        allowUrl={media?.image?.sources?.includes?.('url') ?? true}
        allowedExtensions={media?.image?.allowedExtensions}
        resolveUploadUrls={resolveUploadUrls}
        onInsert={src => {
          if (!editor) return
          editor.chain().focus().setImage({ src }).run()
        }}
      />
      <VideoInsertModal
        dialog={videoDialog}
        aspectRatioOptions={media?.video?.aspectRatioOptions}
        defaultAspectRatio={media?.video?.defaultAspectRatio}
        onInsert={addVideo}
      />
      <GalleryInsertModal
        dialog={galleryDialog}
        layouts={media?.gallery?.layouts}
        itemSources={media?.gallery?.itemSources}
        maxItems={media?.gallery?.maxItems}
        resolveUploadUrls={resolveUploadUrls}
        onInsert={addGallery}
      />
      <LinkInsertModal
        dialog={linkDialog}
        linksConfig={links}
        fetchPreview={fetchLinkPreview}
        onInsert={insertLink}
      />
    </div>
  )
}

function ReviewSidebar({
  comments,
  selectedCommentId,
  selectedComment,
  pendingCount,
  resolvedCount,
  filter,
  disabled,
  actionCommentId,
  onFilterChange,
  onSelectComment,
  onResolveComment,
  onUnresolveComment,
}: {
  comments: ReviewComment[]
  selectedCommentId: string | null
  selectedComment: ReviewComment | null
  pendingCount: number
  resolvedCount: number
  filter: 'pending' | 'resolved' | 'all'
  disabled: boolean
  actionCommentId: string | null
  onFilterChange: (filter: 'pending' | 'resolved' | 'all') => void
  onSelectComment: (commentId: string) => void
  onResolveComment: (commentId: string) => Promise<void>
  onUnresolveComment: (commentId: string) => Promise<void>
}) {
  return (
    <aside className="border border-gray-200 rounded-lg bg-gray-50 p-3 h-fit sticky top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Review inbox
          </div>
          <div className="text-xs text-gray-500">
            Resolve comments without leaving the editor.
          </div>
        </div>
        <div className="text-[11px] text-gray-500 whitespace-nowrap">
          {pendingCount} open
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {(
          [
            ['pending', `Open (${pendingCount})`],
            ['resolved', `Resolved (${resolvedCount})`],
            ['all', `All (${pendingCount + resolvedCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onFilterChange(value)}
            className={classNames(
              'rounded-full px-2.5 py-1 text-xs border transition-colors',
              {
                'border-indigo-200 bg-indigo-50 text-indigo-700':
                  filter === value,
                'border-gray-200 bg-white text-gray-600 hover:border-gray-300':
                  filter !== value,
              }
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-[28rem] overflow-auto space-y-2 pr-1">
        {comments.length ? (
          comments.map(comment => {
            const isSelected = comment.id === selectedCommentId
            const isLoading = actionCommentId === comment.id

            return (
              <button
                key={comment.id}
                id={`iv-review-comment-${comment.id}`}
                type="button"
                onClick={() => onSelectComment(comment.id)}
                className={classNames(
                  'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                  {
                    'border-indigo-300 bg-indigo-50': isSelected,
                    'border-gray-200 bg-white hover:border-gray-300':
                      !isSelected,
                  }
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-600">
                    {comment.authorName || comment.authorEmail || 'Contributor'}
                  </span>
                  <span
                    className={classNames('text-[11px] font-medium', {
                      'text-amber-700': comment.status === 'PENDING',
                      'text-slate-500': comment.status === 'RESOLVED',
                    })}
                  >
                    {comment.status === 'PENDING' ? 'Open' : 'Resolved'}
                  </span>
                </div>
                {comment.selectedText || comment.anchor.text ? (
                  <div className="mt-1 text-xs italic text-gray-500 line-clamp-2">
                    "{comment.selectedText || comment.anchor.text}"
                  </div>
                ) : null}
                <div className="mt-1 text-sm text-gray-800 line-clamp-3">
                  {comment.comment}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                  <span>{comment.createdAt || ''}</span>
                  <span>{isLoading ? 'Saving...' : ''}</span>
                </div>
              </button>
            )
          })
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
            No comments for this filter.
          </div>
        )}
      </div>

      {selectedComment ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Selected comment
          </div>
          <div className="mt-2 text-sm text-gray-900">
            {selectedComment.comment}
          </div>
          {selectedComment.selectedText || selectedComment.anchor.text ? (
            <div className="mt-2 text-xs italic text-gray-500">
              "{selectedComment.selectedText || selectedComment.anchor.text}"
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            {selectedComment.status === 'PENDING' ? (
              <IVButton
                label={
                  actionCommentId === selectedComment.id
                    ? 'Resolving...'
                    : 'Resolve'
                }
                theme="primary"
                disabled={disabled || actionCommentId === selectedComment.id}
                onClick={() => onResolveComment(selectedComment.id)}
              />
            ) : (
              <IVButton
                label={
                  actionCommentId === selectedComment.id
                    ? 'Reopening...'
                    : 'Mark as open'
                }
                theme="secondary"
                disabled={disabled || actionCommentId === selectedComment.id}
                onClick={() => onUnresolveComment(selectedComment.id)}
              />
            )}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

function CalloutClickHandler({ editor }: { editor: Editor | null }) {
  const [showEditor, setShowEditor] = useState(false)
  const [calloutAttrs, setCalloutAttrs] = useState<{
    backgroundColor?: string
    textColor?: string
    emoji?: string
  } | null>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  useEffect(() => {
    if (!editor) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const calloutElement = target.closest('[data-callout]')

      if (calloutElement) {
        event.preventDefault()
        event.stopPropagation()

        const rect = calloutElement.getBoundingClientRect()
        const { from } = editor.state.selection
        const node = editor.state.doc.nodeAt(from)

        if (node && node.type.name === 'callout') {
          setCalloutAttrs({
            backgroundColor: node.attrs.backgroundColor,
            textColor: node.attrs.textColor,
            emoji: node.attrs.emoji,
          })
          setPosition({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
          })
          setShowEditor(true)
        }
      } else {
        setShowEditor(false)
      }
    }

    const editorElement = editor.view.dom
    editorElement.addEventListener('click', handleClick)
    return () => {
      editorElement.removeEventListener('click', handleClick)
    }
  }, [editor])

  if (!editor || !showEditor || !position) return null

  return (
    <div
      className="fixed z-50"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <CalloutEditor
        editor={editor}
        onClose={() => setShowEditor(false)}
        initialAttrs={calloutAttrs || undefined}
      />
    </div>
  )
}

function MentionClickHandler({ editor }: { editor: Editor | null }) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const [mentionNode, setMentionNode] = useState<{
    node: {
      attrs: Record<string, unknown>
      type: { name: string }
      nodeSize: number
    }
    pos: number
  } | null>(null)

  useEffect(() => {
    if (!editor) return

    const findMentionNode = (element: HTMLElement) => {
      // Use ProseMirror's posAtDOM to find the position
      const pos = editor.view.posAtDOM(element, 0)
      if (pos === null || pos === undefined) return null

      const $pos = editor.state.doc.resolve(pos)
      let node = $pos.nodeAfter
      let nodePos = $pos.pos

      // If not found, check the node before
      if (
        !node ||
        (node.type.name !== 'mention' &&
          node.type.name !== 'mentionPill' &&
          node.type.name !== 'mentionMegaPill')
      ) {
        node = $pos.nodeBefore
        nodePos = $pos.pos - (node?.nodeSize || 0)
      }

      // If still not found, traverse the document
      if (
        !node ||
        (node.type.name !== 'mention' &&
          node.type.name !== 'mentionPill' &&
          node.type.name !== 'mentionMegaPill')
      ) {
        editor.state.doc.nodesBetween(
          Math.max(0, pos - 10),
          Math.min(editor.state.doc.content.size, pos + 10),
          (n, p) => {
            if (
              n.type.name === 'mention' ||
              n.type.name === 'mentionPill' ||
              n.type.name === 'mentionMegaPill'
            ) {
              node = n
              nodePos = p
              return false
            }
          }
        )
      }

      if (
        node &&
        (node.type.name === 'mention' ||
          node.type.name === 'mentionPill' ||
          node.type.name === 'mentionMegaPill')
      ) {
        return { node, pos: nodePos }
      }

      return null
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const mentionElement = target.closest(
        '.mention, [data-mention-pill], [data-mention-mega-pill]'
      )

      if (mentionElement && (event.ctrlKey || event.metaKey)) {
        // Ctrl/Cmd + Click to show variant menu
        event.preventDefault()
        event.stopPropagation()

        const found = findMentionNode(mentionElement as HTMLElement)
        if (found) {
          const rect = mentionElement.getBoundingClientRect()
          setMentionNode(found)
          setMenuPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
          })
          setShowMenu(true)
        }
      } else {
        setShowMenu(false)
      }
    }

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const mentionElement = target.closest(
        '.mention, [data-mention-pill], [data-mention-mega-pill]'
      )

      if (mentionElement) {
        event.preventDefault()
        event.stopPropagation()

        const found = findMentionNode(mentionElement as HTMLElement)
        if (found) {
          const rect = mentionElement.getBoundingClientRect()
          setMentionNode(found)
          setMenuPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
          })
          setShowMenu(true)
        }
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.mention-variant-menu')) {
        setShowMenu(false)
      }
    }

    const editorElement = editor.view.dom
    editorElement.addEventListener('click', handleClick)
    editorElement.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClickOutside)

    return () => {
      editorElement.removeEventListener('click', handleClick)
      editorElement.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [editor])

  const changeVariant = (variant: 'inline' | 'pill' | 'mega-pill') => {
    if (!editor || !mentionNode) return

    const { node, pos } = mentionNode
    const attrs = {
      type: node.attrs.type,
      url: node.attrs.url,
      label: node.attrs.label,
      id: node.attrs.id,
    }

    if (variant === 'inline') {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent({
          type: 'mention',
          attrs: { ...attrs, variant: 'inline' },
        })
        .run()
    } else if (variant === 'pill') {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent({
          type: 'mentionPill',
          attrs: { ...attrs, variant: 'pill' },
        })
        .run()
    } else {
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .insertContent({
          type: 'mentionMegaPill',
          attrs: { ...attrs, variant: 'mega-pill' },
        })
        .run()
    }

    setShowMenu(false)
  }

  if (!showMenu || !menuPosition || !mentionNode) return null

  const currentVariant =
    mentionNode.node.attrs.variant ||
    (mentionNode.node.type.name === 'mentionPill'
      ? 'pill'
      : mentionNode.node.type.name === 'mentionMegaPill'
      ? 'mega-pill'
      : 'inline')

  return (
    <div
      className="mention-variant-menu fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 min-w-[120px]"
      style={{
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
      }}
    >
      <div className="text-xs font-medium text-gray-700 mb-2 px-2">Variant</div>
      <button
        type="button"
        onClick={() => changeVariant('inline')}
        className={classNames(
          'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors',
          {
            'bg-indigo-50 text-indigo-700 font-medium':
              currentVariant === 'inline',
            'text-gray-700': currentVariant !== 'inline',
          }
        )}
      >
        Inline
      </button>
      <button
        type="button"
        onClick={() => changeVariant('pill')}
        className={classNames(
          'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors',
          {
            'bg-indigo-50 text-indigo-700 font-medium':
              currentVariant === 'pill',
            'text-gray-700': currentVariant !== 'pill',
          }
        )}
      >
        Pill
      </button>
      <button
        type="button"
        onClick={() => changeVariant('mega-pill')}
        className={classNames(
          'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors',
          {
            'bg-indigo-50 text-indigo-700 font-medium':
              currentVariant === 'mega-pill',
            'text-gray-700': currentVariant !== 'mega-pill',
          }
        )}
      >
        Mega Pill
      </button>
    </div>
  )
}

function MenuBar({
  editor,
  disabled,
  canAddImage,
  canAddVideo,
  canAddGallery,
  canAddLink,
  onAddImage,
  onAddVideo,
  onAddGallery,
  onAddLink,
}: {
  editor: Editor | null
  disabled: boolean
  canAddImage: boolean
  canAddVideo: boolean
  canAddGallery: boolean
  canAddLink: boolean
  onAddImage: () => void
  onAddVideo: () => void
  onAddGallery: () => void
  onAddLink: () => void
}) {
  const [headingLevel, setHeadingLevel] = useState(0)
  const [showCalloutEditor, setShowCalloutEditor] = useState(false)

  const setHeading = useCallback(({ editor }: { editor: any }) => {
    setHeadingLevel(editor.getAttributes('heading')?.level ?? 0)
  }, [])

  useEffect(() => {
    if (editor) {
      editor.on('selectionUpdate', setHeading)
      editor.on('update', setHeading)

      return () => {
        editor.off('selectionUpdate', setHeading)
        editor.off('update', setHeading)
      }
    }
  }, [editor, setHeading])

  if (!editor) return null

  return (
    <div
      className="sticky top-0 z-20 border-b border-solid border-gray-300 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 flex items-start gap-x-2"
      role="menu"
    >
      <div className="pb-2 flex flex-wrap gap-2">
        <IVSelect
          title="Heading level"
          aria-label="Heading level"
          className={classNames(
            'w-32 bg-white py-1.5 px-2 text-xs rounded text-gray-800 iv-rte-select',
            {
              'hover:bg-gray-100': !disabled,
            }
          )}
          tabIndex={-1}
          role="menuitem"
          value={headingLevel}
          disabled={disabled}
          options={[
            {
              label: 'Normal',
              value: '0',
              shortcuts: {
                mac: 'Meta+Alt+0',
                pc: 'Control+Alt+0',
              },
            },
            // {
            //   label: 'Heading 1',
            //   value: '1',
            //   shortcuts: {
            //     mac: 'Meta+Alt+1',
            //     pc: 'Control+Alt+1',
            //   },
            // },
            {
              label: 'Heading 2',
              value: '2',
              shortcuts: {
                mac: 'Meta+Alt+2',
                pc: 'Control+Alt+2',
              },
            },
            {
              label: 'Heading 3',
              value: '3',
              shortcuts: {
                mac: 'Meta+Alt+3',
                pc: 'Control+Alt+3',
              },
            },
            {
              label: 'Heading 4',
              value: '4',
              shortcuts: {
                mac: 'Meta+Alt+4',
                pc: 'Control+Alt+4',
              },
            },
          ]}
          onChange={(event: any) => {
            const level = Number(event.target.value)
            if (Number.isNaN(level) || level > 6) return

            setHeadingLevel(level)
            if (level === 0) {
              editor.chain().focus().clearNodes().run()
            } else {
              editor
                .chain()
                .focus()
                .toggleHeading({ level: level as Level })
                .run()
            }
          }}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Toggle bold',
              label: (
                <span className="font-bold inline-block w-3 text-center">
                  B
                </span>
              ),
              disabled: disabled || !editor.can().toggleBold(),
              isActive: editor.isActive('bold'),
              onClick() {
                editor.chain().focus().toggleBold().run()
              },
              shortcuts: {
                mac: 'Meta+B',
                pc: 'Control+B',
              },
            },
            {
              title: 'Toggle italic',
              label: (
                <span className="italic inline-block w-3 text-center">I</span>
              ),
              disabled: disabled || !editor.can().toggleItalic(),
              isActive: editor.isActive('italic'),
              onClick() {
                editor.chain().focus().toggleItalic().run()
              },
              shortcuts: {
                mac: 'Meta+I',
                pc: 'Control+I',
              },
            },
            {
              title: 'Toggle underline',
              label: (
                <span className="underline underline-offset-2 inline-block w-3 text-center">
                  U
                </span>
              ),
              disabled: disabled || !editor.can().toggleUnderline(),
              isActive: editor.isActive('underline'),
              onClick() {
                editor.chain().focus().toggleUnderline().run()
              },
              shortcuts: {
                mac: 'Meta+U',
                pc: 'Control+U',
              },
            },
            {
              title: 'Toggle strikethrough',
              label: (
                <span className="relative underline-offset-2 inline-block w-3 text-center">
                  <span className="absolute top-0 left-0 w-full h-1/2 border-b border-primary-700"></span>
                  S
                </span>
              ),
              disabled: disabled || !editor.can().toggleStrike(),
              isActive: editor.isActive('strikethrough'),
              onClick() {
                editor.chain().focus().toggleStrike().run()
              },
              shortcuts: {
                mac: 'Meta+Shift+X',
                pc: 'Control+Shift+X',
              },
            },
          ]}
        />
        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Toggle bulleted list',
              label: <BulletedListIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().toggleBulletList(),
              isActive: editor.isActive('bulletList'),
              onClick() {
                editor.chain().focus().toggleBulletList().run()
              },
              shortcuts: {
                mac: 'Meta+Shift+8',
                pc: 'Control+Shift+8',
              },
            },
            {
              title: 'Toggle ordered list',
              label: <NumberedListIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().toggleOrderedList(),
              isActive: editor.isActive('orderedList'),
              onClick() {
                editor.chain().focus().toggleOrderedList().run()
              },
              shortcuts: {
                mac: 'Meta+Shift+7',
                pc: 'Control+Shift+7',
              },
            },
            {
              title: 'Toggle blockquote',
              label: <QuoteLeftIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().toggleBlockquote(),
              isActive: editor.isActive('blockquote'),
              onClick() {
                editor.chain().focus().toggleBlockquote().run()
              },
              shortcuts: {
                mac: 'Meta+Shift+B',
                pc: 'Control+Shift+B',
              },
            },
          ]}
        />
        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Insert table',
              label: <span className="text-xs font-semibold">Tbl+</span>,
              disabled: disabled || !editor.can().insertTable(),
              onClick() {
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              },
            },
            {
              title: 'Add table row',
              label: <span className="text-xs font-semibold">Row+</span>,
              disabled: disabled || !editor.can().addRowAfter(),
              onClick() {
                editor.chain().focus().addRowAfter().run()
              },
            },
            {
              title: 'Add table column',
              label: <span className="text-xs font-semibold">Col+</span>,
              disabled: disabled || !editor.can().addColumnAfter(),
              onClick() {
                editor.chain().focus().addColumnAfter().run()
              },
            },
            {
              title: 'Delete table',
              label: <span className="text-xs font-semibold">Tbl-</span>,
              disabled: disabled || !editor.can().deleteTable(),
              onClick() {
                editor.chain().focus().deleteTable().run()
              },
            },
          ]}
        />
        <div className="relative">
          <MenuBarButtonGroup
            buttons={[
              {
                title: 'Add callout',
                label: <span className="text-base">💡</span>,
                disabled: disabled || !editor.can().setCallout(),
                onClick() {
                  setShowCalloutEditor(true)
                },
              },
            ]}
          />
          {showCalloutEditor && (
            <div className="absolute top-full left-0 z-50 mt-1">
              <CalloutEditor
                editor={editor}
                onClose={() => setShowCalloutEditor(false)}
              />
            </div>
          )}
        </div>
        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Add FAQ',
              label: <span className="text-xs font-semibold">❓</span>,
              disabled: disabled || !editor.can().setFaq(),
              onClick() {
                editor
                  .chain()
                  .focus()
                  .setFaq([{ question: '', answer: '' }])
                  .run()
              },
            },
          ]}
        />
        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Add link...',
              label: <LinkIcon className="w-4 h-4" />,
              disabled: disabled || !canAddLink,
              onClick: onAddLink,
              shortcuts: {
                mac: 'Meta+Shift+K',
                pc: 'Control+Shift+K',
              },
            },
          ]}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Undo',
              label: <UndoIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().undo(),
              onClick() {
                editor.chain().focus().undo().run()
              },
              shortcuts: {
                mac: 'Meta+U',
                pc: 'Control+U',
              },
            },
            {
              title: 'Redo',
              label: <RedoIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().redo(),
              onClick() {
                editor.chain().focus().redo().run()
              },
              shortcuts: {
                mac: 'Meta+R',
                pc: 'Control+R',
              },
            },
          ]}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Add image...',
              label: <ImageIcon className="w-4 h-4" />,
              disabled: disabled || !canAddImage,
              onClick: onAddImage,
              shortcuts: {
                mac: 'Meta+Shift+I',
                pc: 'Control+Shift+I',
              },
            },
          ]}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Add video...',
              label: <VideoIcon className="w-4 h-4" />,
              disabled: disabled || !canAddVideo,
              onClick: onAddVideo,
              shortcuts: {
                mac: 'Meta+Shift+V',
                pc: 'Control+Shift+V',
              },
            },
          ]}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Add gallery...',
              label: <MoreIcon className="w-4 h-4" />,
              disabled: disabled || !canAddGallery,
              onClick: onAddGallery,
            },
          ]}
        />

        <MenuBarButtonGroup
          buttons={[
            {
              title: 'Clear formatting',
              label: <ClearFormattingIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().clearNodes(),
              onClick: () => clearFormattingButtonHandler(editor),
              shortcuts: {
                mac: 'Meta+Shift+C',
                pc: 'Control+Shift+C',
              },
            },
          ]}
        />
      </div>
    </div>
  )
}

function MenuBarButtonGroup({ buttons }: { buttons: MenuBarButtonProps[] }) {
  return (
    <div className="relative inline-flex rounded-md" role="group">
      {buttons.map(({ className, ...button }, i) => {
        return (
          <MenuBarButton
            key={i}
            {...button}
            className={classNames(
              className,
              'relative inline-flex items-center first:rounded-l -ml-px first:-ml-px last:rounded-r'
            )}
          />
        )
      })}
    </div>
  )
}

interface MenuBarButtonProps {
  label: React.ReactNode
  title?: string
  onClick: () => void
  disabled?: boolean
  className?: string
  isActive?: boolean
  shortcuts?: string | ShortcutMap
}

function MenuBarButton({
  label,
  title,
  onClick,
  disabled,
  isActive,
  shortcuts,
  className = 'rounded-sm',
}: MenuBarButtonProps) {
  const deviceShortcuts = getShortcuts(shortcuts)
  return (
    <button
      type="button"
      title={[title, deviceShortcuts ? `(${deviceShortcuts})` : undefined].join(
        ' '
      )}
      role="menuitem"
      aria-label={title}
      aria-disabled={disabled}
      aria-keyshortcuts={deviceShortcuts}
      tabIndex={-1}
      className={classNames(
        className,
        'px-2 py-1 text-sm transition-all duration-100 ease-in relative ring-0 font-medium border border-solid focus:z-10',
        {
          'cursor-not-allowed bg-gray-50 opacity-50': disabled,
          'hover:bg-gray-100': !disabled && !isActive,
          'bg-gray-800 text-white border-gray-800': isActive,
          'bg-white text-gray-800 border-gray-300': !isActive,
        }
      )}
      onClick={
        disabled
          ? () => {
              return
            }
          : onClick
      }
    >
      {label}
    </button>
  )
}

async function uploadFiles(
  files: File[],
  urls: { uploadUrl: string; downloadUrl: string }[]
): Promise<string[]> {
  await Promise.all(
    files.map(async (file, i) => {
      const target = urls[i]
      if (!target) {
        throw new Error('Missing upload URL.')
      }

      const response = await fetch(target.uploadUrl, {
        method: 'PUT',
        body: file,
      })

      if (!response.ok) {
        throw new Error(`Upload failed for ${file.name}.`)
      }
    })
  )

  return urls.map(url => url.downloadUrl)
}

function isUrlAllowed(
  url: string,
  allowedProtocols: string[] = ['http', 'https']
) {
  try {
    const parsed = new URL(url)
    return allowedProtocols.includes(parsed.protocol.replace(':', ''))
  } catch (_err) {
    return false
  }
}

function ImageInsertModal({
  dialog,
  allowUpload,
  allowUrl,
  allowedExtensions,
  resolveUploadUrls,
  onInsert,
}: {
  dialog: ReturnType<typeof useDialogState>
  allowUpload: boolean
  allowUrl: boolean
  allowedExtensions?: string[]
  resolveUploadUrls: (
    files: { name: string; type: string }[]
  ) => Promise<{ uploadUrl: string; downloadUrl: string }[] | undefined>
  onInsert: (src: string) => void
}) {
  const [mode, setMode] = useState<'upload' | 'url'>(
    allowUpload ? 'upload' : 'url'
  )
  const [files, setFiles] = useState<File[]>([])
  const [currentStep, setCurrentStep] = useState<UploadStep>('default')
  const [urlValue, setUrlValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dialog.visible) {
      setFiles([])
      setCurrentStep('default')
      setUrlValue('')
      setError(null)
      setMode(allowUpload ? 'upload' : 'url')
    }
  }, [allowUpload, dialog.visible])

  const insertUploadedImage = async () => {
    if (files.length === 0) return

    try {
      setError(null)
      setCurrentStep('uploading')
      const urls = await resolveUploadUrls(
        files.map(file => ({ name: file.name, type: file.type }))
      )
      if (!urls?.length) {
        throw new Error('Unable to generate upload URLs.')
      }

      const uploadedUrls = await uploadFiles(files, urls)
      if (!uploadedUrls[0]) {
        throw new Error('Upload completed but no URL was returned.')
      }

      onInsert(uploadedUrls[0])
      setCurrentStep('success')
      dialog.hide()
    } catch (err) {
      setCurrentStep('error')
      setError(err instanceof Error ? err.message : 'Failed to upload image.')
    }
  }

  const insertUrlImage = () => {
    if (!urlValue) return
    onInsert(urlValue)
    dialog.hide()
  }

  return (
    <IVDialog
      dialog={dialog}
      title="Insert image"
      widthClassName="sm:max-w-xl sm:w-full"
    >
      <div className="space-y-3">
        {allowUpload && allowUrl && (
          <div className="flex gap-2">
            <IVButton
              theme={mode === 'upload' ? 'primary' : 'secondary'}
              label="Upload"
              onClick={() => setMode('upload')}
            />
            <IVButton
              theme={mode === 'url' ? 'primary' : 'secondary'}
              label="From URL"
              onClick={() => setMode('url')}
            />
          </div>
        )}

        {mode === 'upload' ? (
          <>
            <FileUploadButton
              id="iv-rte-image-upload"
              currentStep={currentStep}
              showUploadStatus={false}
              value={files}
              onChange={event => {
                setCurrentStep('default')
                setError(null)
                setFiles(Array.from(event.target.files ?? []).slice(0, 1))
              }}
              accept={allowedExtensions?.join(',')}
              onReset={() => {
                setFiles([])
                setCurrentStep('default')
              }}
              description={error ?? undefined}
            />
            <div className="flex justify-end">
              <IVButton
                label="Insert image"
                disabled={files.length === 0}
                loading={currentStep === 'uploading'}
                onClick={insertUploadedImage}
              />
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Image URL
              </span>
              <input
                type="url"
                value={urlValue}
                onChange={event => setUrlValue(event.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="https://example.com/image.jpg"
              />
            </label>
            <div className="flex justify-end">
              <IVButton
                label="Insert image"
                disabled={!urlValue}
                onClick={insertUrlImage}
              />
            </div>
          </>
        )}
      </div>
    </IVDialog>
  )
}

function VideoInsertModal({
  dialog,
  aspectRatioOptions,
  defaultAspectRatio,
  onInsert,
}: {
  dialog: ReturnType<typeof useDialogState>
  aspectRatioOptions?: VideoAspectRatio[]
  defaultAspectRatio?: VideoAspectRatio
  onInsert: (url: string, aspectRatio: VideoAspectRatio) => void
}) {
  const options = aspectRatioOptions?.length
    ? aspectRatioOptions
    : (['horizontal', 'square', 'vertical'] as VideoAspectRatio[])
  const [urlValue, setUrlValue] = useState('')
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(
    defaultAspectRatio ?? 'horizontal'
  )

  useEffect(() => {
    if (!dialog.visible) {
      setUrlValue('')
      setAspectRatio(defaultAspectRatio ?? 'horizontal')
    }
  }, [defaultAspectRatio, dialog.visible])

  return (
    <IVDialog
      dialog={dialog}
      title="Insert video"
      widthClassName="sm:max-w-lg sm:w-full"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">YouTube URL</span>
          <input
            type="url"
            value={urlValue}
            onChange={event => setUrlValue(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            Aspect ratio
          </span>
          <select
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={aspectRatio}
            onChange={event =>
              setAspectRatio(event.target.value as VideoAspectRatio)
            }
          >
            {options.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div
          className="iv-video-frame"
          style={{ aspectRatio: toAspectRatioString(aspectRatio) }}
        >
          <div className="flex items-center justify-center h-full text-xs text-gray-500 bg-gray-100">
            Video preview ({aspectRatio})
          </div>
        </div>
        <div className="flex justify-end">
          <IVButton
            label="Insert video"
            disabled={!urlValue}
            onClick={() => {
              onInsert(urlValue, aspectRatio)
              dialog.hide()
            }}
          />
        </div>
      </div>
    </IVDialog>
  )
}

function GalleryInsertModal({
  dialog,
  layouts,
  itemSources,
  maxItems = 12,
  resolveUploadUrls,
  onInsert,
}: {
  dialog: ReturnType<typeof useDialogState>
  layouts?: GalleryLayout[]
  itemSources?: GalleryItemType[]
  maxItems?: number
  resolveUploadUrls: (
    files: { name: string; type: string }[]
  ) => Promise<{ uploadUrl: string; downloadUrl: string }[] | undefined>
  onInsert: (layout: GalleryLayout, items: GalleryItem[]) => void
}) {
  const enabledLayouts = layouts?.length
    ? layouts
    : (['grid', 'slider'] as GalleryLayout[])
  const enabledItemSources = itemSources?.length
    ? itemSources
    : (['image', 'youtube'] as GalleryItemType[])
  const canInsertImages = enabledItemSources.includes('image')
  const canInsertYoutube = enabledItemSources.includes('youtube')
  const [layout, setLayout] = useState<GalleryLayout>(
    enabledLayouts[0] ?? 'grid'
  )
  const [items, setItems] = useState<GalleryItem[]>([])
  const [newItemType, setNewItemType] = useState<GalleryItemType>(
    enabledItemSources[0] ?? 'image'
  )
  const [newItemUrl, setNewItemUrl] = useState('')
  const [uploadFilesSelection, setUploadFilesSelection] = useState<File[]>([])
  const [uploadStep, setUploadStep] = useState<UploadStep>('default')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dialog.visible) {
      setLayout(enabledLayouts[0] ?? 'grid')
      setItems([])
      setNewItemType(enabledItemSources[0] ?? 'image')
      setNewItemUrl('')
      setUploadFilesSelection([])
      setUploadStep('default')
      setError(null)
    }
  }, [dialog.visible, enabledItemSources, enabledLayouts])

  const addUrlItem = () => {
    if (!newItemUrl || items.length >= maxItems) return
    setItems(prev => [
      ...prev,
      {
        type: newItemType,
        src: newItemUrl,
      },
    ])
    setNewItemUrl('')
  }

  const addUploadedImages = async () => {
    if (!uploadFilesSelection.length || items.length >= maxItems) return

    try {
      setError(null)
      setUploadStep('uploading')
      const urls = await resolveUploadUrls(
        uploadFilesSelection.map(file => ({ name: file.name, type: file.type }))
      )
      if (!urls?.length) {
        throw new Error('Unable to generate upload URLs.')
      }

      const uploadedUrls = await uploadFiles(uploadFilesSelection, urls)
      setItems(prev => [
        ...prev,
        ...uploadedUrls
          .slice(0, Math.max(0, maxItems - prev.length))
          .map(src => ({
            type: 'image' as const,
            src,
          })),
      ])
      setUploadStep('success')
      setUploadFilesSelection([])
    } catch (err) {
      setUploadStep('error')
      setError(err instanceof Error ? err.message : 'Failed to upload images.')
    }
  }

  return (
    <IVDialog
      dialog={dialog}
      title="Insert gallery"
      widthClassName="sm:max-w-3xl sm:w-full"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Layout</span>
            <select
              value={layout}
              onChange={event => setLayout(event.target.value as GalleryLayout)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {enabledLayouts.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Max items</span>
            <input
              type="text"
              readOnly
              value={maxItems}
              className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50"
            />
          </label>
        </div>

        {(canInsertImages || canInsertYoutube) && (
          <div className="border border-gray-200 rounded-md p-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">Add by URL</p>
            <div className="grid grid-cols-[140px_1fr_auto] gap-2">
              <select
                value={newItemType}
                onChange={event =>
                  setNewItemType(event.target.value as GalleryItemType)
                }
                className="border border-gray-300 rounded-md px-2 py-2 text-sm"
              >
                {canInsertImages && <option value="image">Image</option>}
                {canInsertYoutube && <option value="youtube">YouTube</option>}
              </select>
              <input
                type="url"
                value={newItemUrl}
                onChange={event => setNewItemUrl(event.target.value)}
                placeholder="https://..."
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <IVButton
                label="Add"
                disabled={!newItemUrl || items.length >= maxItems}
                onClick={addUrlItem}
              />
            </div>
          </div>
        )}

        {canInsertImages && (
          <div className="border border-gray-200 rounded-md p-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">Upload images</p>
            <FileUploadButton
              id="iv-rte-gallery-upload"
              currentStep={uploadStep}
              showUploadStatus={false}
              value={uploadFilesSelection}
              multiple
              onChange={event => {
                setUploadStep('default')
                setError(null)
                setUploadFilesSelection(Array.from(event.target.files ?? []))
              }}
              onReset={() => {
                setUploadFilesSelection([])
                setUploadStep('default')
              }}
              description={error ?? undefined}
            />
            <div className="flex justify-end">
              <IVButton
                label="Upload and add"
                disabled={
                  !uploadFilesSelection.length || items.length >= maxItems
                }
                loading={uploadStep === 'uploading'}
                onClick={addUploadedImages}
              />
            </div>
          </div>
        )}

        <div className="border border-gray-200 rounded-md p-3">
          <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
          <div
            className={classNames({
              'iv-gallery iv-gallery-grid': layout === 'grid',
              'iv-gallery iv-gallery-slider': layout === 'slider',
            })}
          >
            {items.map((item, index) =>
              item.type === 'youtube' ? (
                <div
                  key={`${item.src}-${index}`}
                  className="iv-gallery-item iv-gallery-item-video"
                >
                  <iframe src={getYoutubeEmbedUrl(item.src)} />
                </div>
              ) : (
                <figure
                  key={`${item.src}-${index}`}
                  className="iv-gallery-item iv-gallery-item-image"
                >
                  <img src={item.src} alt={item.alt ?? ''} />
                </figure>
              )
            )}
          </div>
          {items.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Add items to preview the gallery.
            </p>
          )}
        </div>

        <div className="flex justify-between">
          <IVButton
            theme="secondary"
            label="Clear items"
            disabled={items.length === 0}
            onClick={() => setItems([])}
          />
          <IVButton
            label="Insert gallery"
            disabled={items.length === 0}
            onClick={() => {
              onInsert(layout, items)
              dialog.hide()
            }}
          />
        </div>
      </div>
    </IVDialog>
  )
}

function LinkInsertModal({
  dialog,
  linksConfig,
  fetchPreview,
  onInsert,
}: {
  dialog: ReturnType<typeof useDialogState>
  linksConfig?: {
    modes?: LinkInsertMode[]
    defaultMode?: LinkInsertMode
    preview?: { enabled?: boolean }
    mention?: { enabled?: boolean }
    allowedProtocols?: string[]
  }
  fetchPreview: (url: string) => Promise<LinkPreviewMetadata>
  onInsert: (
    mode: LinkInsertMode,
    url: string,
    label?: string,
    preview?: LinkPreviewMetadata
  ) => Promise<void>
}) {
  const configuredModes = linksConfig?.modes?.length
    ? linksConfig.modes
    : (['text', 'preview', 'mention'] as LinkInsertMode[])
  const isPreviewEnabled = linksConfig?.preview?.enabled !== false
  const isMentionEnabled = linksConfig?.mention?.enabled !== false
  const allowedModes = configuredModes.filter(mode => {
    if (mode === 'preview') return isPreviewEnabled
    if (mode === 'mention') return isMentionEnabled
    return true
  })
  const safeAllowedModes = allowedModes.length
    ? allowedModes
    : (['text'] as LinkInsertMode[])
  const safeAllowedModesKey = safeAllowedModes.join(',')
  const defaultMode = linksConfig?.defaultMode ?? 'text'
  const allowedProtocols = linksConfig?.allowedProtocols ?? ['http', 'https']

  const [mode, setMode] = useState<LinkInsertMode>(
    safeAllowedModes.includes(defaultMode) ? defaultMode : safeAllowedModes[0]
  )
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [preview, setPreview] = useState<LinkPreviewMetadata | null>(null)

  useEffect(() => {
    if (!dialog.visible) {
      setMode(
        safeAllowedModes.includes(defaultMode)
          ? defaultMode
          : safeAllowedModes[0]
      )
      setUrl('')
      setLabel('')
      setWarning(null)
      setPreview(null)
      setLoading(false)
    }
  }, [defaultMode, dialog.visible, safeAllowedModesKey])

  const fetchPreviewIfNeeded = async () => {
    if (mode === 'text' || !url) return undefined
    try {
      const value = await fetchPreview(url)
      setPreview(value)
      setWarning(null)
      return value
    } catch (_err) {
      setPreview(null)
      setWarning(
        'Could not load OpenGraph metadata, falling back to text link.'
      )
      return undefined
    }
  }

  const submit = async () => {
    if (!url) return
    if (!isUrlAllowed(url, allowedProtocols)) {
      setWarning('URL protocol is not allowed.')
      return
    }

    setLoading(true)
    try {
      const fetched = await fetchPreviewIfNeeded()
      const modeToInsert = mode === 'text' || fetched ? mode : 'text'
      await onInsert(modeToInsert, url, label || undefined, fetched)
      dialog.hide()
    } finally {
      setLoading(false)
    }
  }

  return (
    <IVDialog
      dialog={dialog}
      title="Insert link"
      widthClassName="sm:max-w-xl sm:w-full"
    >
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {safeAllowedModes.map(value => (
            <IVButton
              key={value}
              theme={mode === value ? 'primary' : 'secondary'}
              label={value}
              onClick={() => setMode(value)}
            />
          ))}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">URL</span>
          <input
            type="url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="https://example.com"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            Label (optional)
          </span>
          <input
            type="text"
            value={label}
            onChange={event => setLabel(event.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder={
              mode === 'text' ? 'Visible anchor text' : 'Override title'
            }
          />
        </label>

        {(mode === 'preview' || mode === 'mention') && preview && (
          <div className="border border-gray-200 rounded-md p-3 text-sm">
            <p className="font-medium text-gray-800">{preview.title}</p>
            {preview.description && (
              <p className="text-gray-500">{preview.description}</p>
            )}
          </div>
        )}

        {warning && <p className="text-sm text-amber-700">{warning}</p>}

        <div className="flex justify-between">
          {(mode === 'preview' || mode === 'mention') && (
            <IVButton
              theme="secondary"
              label="Refresh preview"
              disabled={!url}
              onClick={() => {
                void fetchPreviewIfNeeded()
              }}
            />
          )}
          <div className="ml-auto">
            <IVButton
              label="Insert link"
              loading={loading}
              disabled={!url}
              onClick={submit}
            />
          </div>
        </div>
      </div>
    </IVDialog>
  )
}
