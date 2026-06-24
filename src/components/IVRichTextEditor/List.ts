import { Node, mergeAttributes } from '@tiptap/core'

export type MarketingListLayout =
  | 'cards'
  | 'rows'
  | 'compact'
  | 'table'
  | 'editorial'
export type MarketingListMentionVariant = 'inline' | 'pill' | 'mega-pill'

export interface MarketingListItemMention {
  id: string
  type: string
  label: string
  url?: string | null
  displayLabel?: string | null
  variant?: MarketingListMentionVariant
}

export interface MarketingListItem {
  title: string
  description?: string
  href?: string
  overtext?: string
  icon?: string
  meta?: string
  obfuscated?: boolean
  mention?: MarketingListItemMention
}

export interface MarketingListAttrs {
  title?: string
  description?: string
  ordered?: boolean
  layout?: MarketingListLayout
  items?: MarketingListItem[]
}

export interface MarketingListOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    marketingList: {
      setMarketingList: (options?: MarketingListAttrs) => ReturnType
      updateMarketingList: (options: MarketingListAttrs) => ReturnType
    }
  }
}

const isLayout = (value: unknown): value is MarketingListLayout =>
  value === 'cards' ||
  value === 'rows' ||
  value === 'compact' ||
  value === 'table' ||
  value === 'editorial'

const isMentionVariant = (
  value: unknown
): value is MarketingListMentionVariant =>
  value === 'inline' || value === 'pill' || value === 'mega-pill'

const normalizeMarketingListMention = (
  value: unknown,
  fallbackLabel?: string,
  fallbackUrl?: string
): MarketingListItemMention | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const type = typeof raw.type === 'string' ? raw.type.trim() : ''
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : fallbackLabel?.trim() || ''
  if (!id || !type || !label) return undefined

  return {
    id,
    type,
    label,
    ...(typeof raw.url === 'string' && raw.url.trim()
      ? { url: raw.url.trim() }
      : fallbackUrl
      ? { url: fallbackUrl }
      : {}),
    ...(typeof raw.displayLabel === 'string' && raw.displayLabel.trim()
      ? { displayLabel: raw.displayLabel.trim() }
      : {}),
    ...(isMentionVariant(raw.variant) ? { variant: raw.variant } : {}),
  }
}

export const normalizeMarketingListItems = (
  value: unknown
): MarketingListItem[] => {
  if (!Array.isArray(value)) return []

  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : ''
      const rawHref = typeof raw.href === 'string' ? raw.href.trim() : ''
      const mention = normalizeMarketingListMention(
        raw.mention,
        rawTitle,
        rawHref
      )
      const title = rawTitle || mention?.displayLabel || mention?.label || ''
      if (!title) return null

      const normalized: MarketingListItem = { title }
      if (typeof raw.description === 'string' && raw.description.trim()) {
        normalized.description = raw.description.trim()
      }
      if (rawHref) {
        normalized.href = rawHref
      }
      if (typeof raw.overtext === 'string' && raw.overtext.trim()) {
        normalized.overtext = raw.overtext.trim()
      }
      if (typeof raw.icon === 'string' && raw.icon.trim()) {
        normalized.icon = raw.icon.trim()
      }
      if (typeof raw.meta === 'string' && raw.meta.trim()) {
        normalized.meta = raw.meta.trim()
      }
      if (raw.obfuscated === true) {
        normalized.obfuscated = true
      }
      if (mention) {
        normalized.mention = mention
      }
      return normalized
    })
    .filter((item): item is MarketingListItem => Boolean(item))
}

const parseItems = (raw: string | null): MarketingListItem[] => {
  if (!raw) return []
  try {
    return normalizeMarketingListItems(JSON.parse(raw))
  } catch {
    return []
  }
}

const defaultItems = (): MarketingListItem[] => [
  {
    title: 'Nouvel élément',
    description: '',
    href: '',
  },
]

const mentionNodeAttrs = (item: MarketingListItem) => {
  if (!item.mention) return null
  const variant = item.mention.variant || 'inline'
  return {
    ...(variant === 'pill' ? { 'data-mention-pill': '' } : {}),
    ...(variant === 'mega-pill' ? { 'data-mention-mega-pill': '' } : {}),
    'data-mention-id': item.mention.id,
    'data-mention-type': item.mention.type,
    'data-mention-label': item.mention.label,
    ...(item.mention.url ? { 'data-mention-url': item.mention.url } : {}),
    ...(item.mention.displayLabel
      ? { 'data-mention-display-label': item.mention.displayLabel }
      : {}),
    'data-mention-variant': variant,
    class:
      variant === 'mega-pill'
        ? `mention-mega-pill mention-${item.mention.type}`
        : variant === 'pill'
        ? `mention-pill mention-${item.mention.type}`
        : `mention mention-${item.mention.type}`,
  }
}

const itemTitleNode = (
  item: MarketingListItem,
  attrs: Record<string, string | number | boolean | undefined>
) => {
  const mentionAttrs = mentionNodeAttrs(item)
  if (mentionAttrs) {
    const tag = item.mention?.url ? 'a' : 'span'
    return [
      tag,
      {
        ...(item.mention?.url ? { href: item.mention.url } : {}),
        ...mentionAttrs,
        ...attrs,
      },
      // Member items show the member name, never the internal free-text title.
      item.mention?.displayLabel || item.mention?.label || item.title,
    ]
  }

  return [
    item.href ? 'a' : 'span',
    item.href
      ? {
          href: item.href,
          ...(item.obfuscated
            ? {
                'data-obfuscated-link': 'true',
                'data-iv-link-obfuscated': 'true',
              }
            : {}),
          ...attrs,
        }
      : attrs,
    item.title,
  ]
}

export const MarketingList = Node.create<MarketingListOptions>({
  name: 'marketingList',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block',
  atom: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: element =>
          element.getAttribute('data-marketing-list-title') || '',
      },
      description: {
        default: '',
        parseHTML: element =>
          element.getAttribute('data-marketing-list-description') || '',
      },
      ordered: {
        default: false,
        parseHTML: element =>
          element.getAttribute('data-marketing-list-ordered') === 'true',
      },
      layout: {
        default: 'cards' as MarketingListLayout,
        parseHTML: element => {
          const value = element.getAttribute('data-marketing-list-layout')
          return isLayout(value) ? value : 'cards'
        },
      },
      items: {
        default: [] as MarketingListItem[],
        parseHTML: element =>
          parseItems(element.getAttribute('data-marketing-list-items')),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'section[data-marketing-list]',
      },
      {
        tag: 'div[data-marketing-list]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = String(node.attrs.title || '')
    const description = String(node.attrs.description || '')
    const ordered = node.attrs.ordered === true
    const layout = isLayout(node.attrs.layout) ? node.attrs.layout : 'cards'
    const items = normalizeMarketingListItems(node.attrs.items)
    const listTag = ordered ? 'ol' : 'ul'

    return [
      'section',
      mergeAttributes(
        {
          'data-marketing-list': '',
          'data-marketing-list-title': title,
          'data-marketing-list-description': description,
          'data-marketing-list-ordered': String(ordered),
          'data-marketing-list-layout': layout,
          'data-marketing-list-items': JSON.stringify(items),
          class: `iv-marketing-list iv-marketing-list--${layout}`,
          style:
            'border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; margin: 0.75rem 0; background: #fff;',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      ...(title
        ? [
            [
              'h3',
              {
                style:
                  'font-size: 1rem; font-weight: 700; color: #111827; margin: 0 0 0.25rem;',
              },
              title,
            ],
          ]
        : []),
      ...(description
        ? [
            [
              'p',
              {
                style:
                  'font-size: 0.875rem; color: #6b7280; margin: 0 0 0.75rem;',
              },
              description,
            ],
          ]
        : []),
      [
        listTag,
        {
          style: ordered
            ? 'padding-left: 1.25rem; margin: 0;'
            : 'padding-left: 1rem; margin: 0;',
        },
        ...items.map(item => [
          'li',
          {
            'data-marketing-list-item': '',
            ...(item.href ? { 'data-href': item.href } : {}),
            ...(item.obfuscated ? { 'data-obfuscated-link': 'true' } : {}),
            style: 'margin: 0.5rem 0;',
          },
          itemTitleNode(item, { style: 'font-weight: 600; color: #111827;' }),
          ...(item.description
            ? [
                [
                  'p',
                  {
                    style:
                      'font-size: 0.875rem; color: #6b7280; margin: 0.125rem 0 0;',
                  },
                  item.description,
                ],
              ]
            : []),
        ]),
      ],
    ]
  },

  addCommands() {
    return {
      setMarketingList:
        options =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              title: options?.title || '',
              description: options?.description || '',
              ordered: options?.ordered === true,
              layout: isLayout(options?.layout) ? options?.layout : 'cards',
              items: normalizeMarketingListItems(options?.items).length
                ? normalizeMarketingListItems(options?.items)
                : defaultItems(),
            },
          })
        },
      updateMarketingList:
        options =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, {
            title: options.title || '',
            description: options.description || '',
            ordered: options.ordered === true,
            layout: isLayout(options.layout) ? options.layout : 'cards',
            items: normalizeMarketingListItems(options.items),
          })
        },
    }
  },
})
