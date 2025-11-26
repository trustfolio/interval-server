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
        getAttrs: element => {
          const div = element as HTMLElement
          return {
            backgroundColor: div.getAttribute('data-background-color') || '#f3f4f6',
            textColor: div.getAttribute('data-text-color') || '#1f2937',
            emoji: div.getAttribute('data-emoji') || '💡',
          }
        },
        contentElement: (node) => {
          // Find the content div (the one with flex: 1 style, which is the second div)
          const htmlElement = node as HTMLElement
          const divs = Array.from(htmlElement.querySelectorAll('div'))
          // The content div is the one with flex: 1 in its style
          const contentDiv = divs.find((div: HTMLElement) => {
            const style = div.getAttribute('style') || ''
            return style.includes('flex: 1') || style.includes('flex:1')
          })
          // If not found, return the last div (which should be the content), or the node itself
          return (contentDiv as HTMLElement) || (divs[divs.length - 1] as HTMLElement) || htmlElement
        },
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
