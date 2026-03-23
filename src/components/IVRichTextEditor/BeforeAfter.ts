import { Node, mergeAttributes } from '@tiptap/core'

export interface BeforeAfterOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>
}

export interface BeforeAfterAttrs {
  leftTitle?: string
  rightTitle?: string
  leftItems?: string[]
  rightItems?: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    beforeAfter: {
      setBeforeAfter: (options?: BeforeAfterAttrs) => ReturnType
      updateBeforeAfter: (options: BeforeAfterAttrs) => ReturnType
    }
  }
}

const normalizeItems = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if (typeof obj.text === 'string') return obj.text.trim()
        if (typeof obj.value === 'string') return obj.value.trim()
        if (typeof obj.label === 'string') return obj.label.trim()
      }
      return ''
    })
    .filter(Boolean)
}

const parseItems = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return normalizeItems(parsed)
  } catch {
    return []
  }
}

export const BeforeAfter = Node.create<BeforeAfterOptions>({
  name: 'beforeAfter',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      leftTitle: {
        default: 'Before',
        parseHTML: element => element.getAttribute('data-before-after-left-title') || 'Before',
      },
      rightTitle: {
        default: 'After',
        parseHTML: element => element.getAttribute('data-before-after-right-title') || 'After',
      },
      leftItems: {
        default: [] as string[],
        parseHTML: element =>
          parseItems(element.getAttribute('data-before-after-left-items')),
      },
      rightItems: {
        default: [] as string[],
        parseHTML: element =>
          parseItems(element.getAttribute('data-before-after-right-items')),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-before-after]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const leftItems: string[] = normalizeItems(node.attrs.leftItems)
    const rightItems: string[] = normalizeItems(node.attrs.rightItems)

    return [
      'div',
      mergeAttributes(
        {
          'data-before-after': '',
          'data-before-after-left-title': node.attrs.leftTitle || 'Before',
          'data-before-after-right-title': node.attrs.rightTitle || 'After',
          'data-before-after-left-items': JSON.stringify(leftItems),
          'data-before-after-right-items': JSON.stringify(rightItems),
          class: 'iv-before-after',
          style:
            'display: grid; grid-template-columns: 1fr; gap: 1rem; margin: 0.75rem 0;',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'div',
        {
          style:
            'border: 1px solid rgba(239,68,68,0.22); border-radius: 0.75rem; background: rgba(254,242,242,0.52); padding: 1rem;',
        },
        [
          'div',
          {
            style:
              'font-weight: 700; margin-bottom: 0.625rem; color: rgb(185 28 28);',
          },
          node.attrs.leftTitle || 'Before',
        ],
        ...leftItems.map(item => [
          'div',
          { style: 'margin-top: 0.45rem; color: rgb(107 114 128);' },
          `✕ ${item}`,
        ]),
      ],
      [
        'div',
        {
          style:
            'border: 1px solid rgba(34,197,94,0.22); border-radius: 0.75rem; background: rgba(240,253,244,0.65); padding: 1rem;',
        },
        [
          'div',
          {
            style:
              'font-weight: 700; margin-bottom: 0.625rem; color: rgb(21 128 61);',
          },
          node.attrs.rightTitle || 'After',
        ],
        ...rightItems.map(item => [
          'div',
          { style: 'margin-top: 0.45rem; color: rgb(31 41 55);' },
          `✓ ${item}`,
        ]),
      ],
    ]
  },

  addCommands() {
    return {
      setBeforeAfter:
        options =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              leftTitle: options?.leftTitle || 'Before',
              rightTitle: options?.rightTitle || 'After',
              leftItems: normalizeItems(options?.leftItems || []),
              rightItems: normalizeItems(options?.rightItems || []),
            },
          })
        },
      updateBeforeAfter:
        options =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, {
            ...options,
            leftItems: normalizeItems(options.leftItems || []),
            rightItems: normalizeItems(options.rightItems || []),
          })
        },
    }
  },
})
