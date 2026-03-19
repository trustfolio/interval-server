import { Node, mergeAttributes } from '@tiptap/core'

export interface FaqItem {
  question: string
  answer: string
}

export interface FaqOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    faq: {
      setFaq: (items?: FaqItem[]) => ReturnType
      updateFaq: (items: FaqItem[]) => ReturnType
    }
  }
}

export const Faq = Node.create<FaqOptions>({
  name: 'faq',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      items: {
        default: [] as FaqItem[],
        parseHTML: element => {
          const raw = element.getAttribute('data-faq-items')
          if (!raw) return []
          try {
            return JSON.parse(raw) as FaqItem[]
          } catch {
            return []
          }
        },
        renderHTML: attributes => {
          if (!attributes.items?.length) return {}
          return {
            'data-faq-items': JSON.stringify(attributes.items),
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-faq]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const items: FaqItem[] = Array.isArray(node.attrs.items)
      ? node.attrs.items
      : []

    return [
      'div',
      mergeAttributes(
        {
          'data-faq': '',
          'data-faq-items': JSON.stringify(items),
          style:
            'border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; margin: 0.5rem 0; background: #fafafa;',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'div',
        { style: 'font-weight: 600; margin-bottom: 0.75rem; font-size: 1rem;' },
        `FAQ (${items.length} question${items.length !== 1 ? 's' : ''})`,
      ],
      ...items.map((item, i) => [
        'div',
        {
          style:
            'border-top: 1px solid #e5e7eb; padding: 0.5rem 0;',
        },
        [
          'div',
          { style: 'font-weight: 500; color: #1f2937;' },
          `${i + 1}. ${item.question}`,
        ],
        [
          'div',
          { style: 'color: #6b7280; font-size: 0.875rem; margin-top: 0.25rem;' },
          item.answer,
        ],
      ]),
    ]
  },

  addCommands() {
    return {
      setFaq:
        items =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              items: items || [{ question: '', answer: '' }],
            },
          })
        },
      updateFaq:
        items =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { items })
        },
    }
  },
})
