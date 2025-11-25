import { Node, mergeAttributes } from '@tiptap/core'

export interface CalloutOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /**
       * Insert a callout
       */
      setCallout: (options?: {
        backgroundColor?: string
        textColor?: string
        emoji?: string
      }) => ReturnType
      /**
       * Update callout attributes
       */
      updateCallout: (options: {
        backgroundColor?: string
        textColor?: string
        emoji?: string
      }) => ReturnType
    }
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block',

  content: 'block+',

  addAttributes() {
    return {
      backgroundColor: {
        default: '#f3f4f6',
        parseHTML: element => element.getAttribute('data-background-color'),
        renderHTML: attributes => {
          if (!attributes.backgroundColor) {
            return {}
          }
          return {
            'data-background-color': attributes.backgroundColor,
          }
        },
      },
      textColor: {
        default: '#1f2937',
        parseHTML: element => element.getAttribute('data-text-color'),
        renderHTML: attributes => {
          if (!attributes.textColor) {
            return {}
          }
          return {
            'data-text-color': attributes.textColor,
          }
        },
      },
      emoji: {
        default: '💡',
        parseHTML: element => element.getAttribute('data-emoji'),
        renderHTML: attributes => {
          if (!attributes.emoji) {
            return {}
          }
          return {
            'data-emoji': attributes.emoji,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-callout]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-callout': '',
          style: `background-color: ${node.attrs.backgroundColor}; color: ${node.attrs.textColor}; padding: 1rem; border-radius: 0.5rem; margin: 0.5rem 0; display: flex; gap: 0.75rem; align-items: flex-start;`,
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'div',
        {
          style: 'font-size: 1.5rem; line-height: 1.5; flex-shrink: 0;',
        },
        node.attrs.emoji || '💡',
      ],
      ['div', { style: 'flex: 1;' }, 0],
    ]
  },

  addCommands() {
    return {
      setCallout:
        options =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              backgroundColor: options?.backgroundColor || '#f3f4f6',
              textColor: options?.textColor || '#1f2937',
              emoji: options?.emoji || '💡',
            },
            content: [
              {
                type: 'paragraph',
              },
            ],
          })
        },
      updateCallout:
        options =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, options)
        },
    }
  },

  // Note: Keyboard shortcut removed to avoid conflict with Clear Formatting
  // Users can use the menu button to insert callouts
})
