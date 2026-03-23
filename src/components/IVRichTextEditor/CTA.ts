import { Node, mergeAttributes } from '@tiptap/core'

export interface CtaOptions {
  HTMLAttributes: Record<string, string | number | boolean | undefined>
}

export interface CtaAttrs {
  title?: string
  description?: string
  buttonText?: string
  buttonLink?: string
  buttonObfuscated?: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cta: {
      setCta: (options?: CtaAttrs) => ReturnType
      updateCta: (options: CtaAttrs) => ReturnType
    }
  }
}

const toBooleanAttr = (value: string | null, fallback = false) => {
  if (value == null) return fallback
  return value === 'true' || value === '1'
}

export const CTA = Node.create<CtaOptions>({
  name: 'cta',

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
        default: 'Ready to take action?',
        parseHTML: element =>
          element.getAttribute('data-cta-title') || 'Ready to take action?',
      },
      description: {
        default: '',
        parseHTML: element => element.getAttribute('data-cta-description') || '',
      },
      buttonText: {
        default: 'Learn more',
        parseHTML: element =>
          element.getAttribute('data-cta-button-text') || 'Learn more',
      },
      buttonLink: {
        default: '',
        parseHTML: element => element.getAttribute('data-cta-button-link') || '',
      },
      buttonObfuscated: {
        default: false,
        parseHTML: element =>
          toBooleanAttr(element.getAttribute('data-cta-button-obfuscated')),
        renderHTML: attributes =>
          attributes.buttonObfuscated
            ? { 'data-cta-button-obfuscated': 'true' }
            : { 'data-cta-button-obfuscated': 'false' },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-cta]',
      },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const buttonLink = node.attrs.buttonLink || ''
    const buttonText = node.attrs.buttonText || 'Learn more'

    return [
      'div',
      mergeAttributes(
        {
          'data-cta': '',
          'data-cta-title': node.attrs.title || '',
          'data-cta-description': node.attrs.description || '',
          'data-cta-button-text': buttonText,
          'data-cta-button-link': buttonLink,
          'data-cta-button-obfuscated': node.attrs.buttonObfuscated
            ? 'true'
            : 'false',
          style:
            'border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; margin: 0.75rem 0; background: #f9fafb;',
          class: 'iv-cta-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      ['div', { style: 'font-weight: 600; color: #111827; margin-bottom: 0.375rem;' }, node.attrs.title || ''],
      ...(node.attrs.description
        ? [
            [
              'div',
              { style: 'color: #4b5563; margin-bottom: 0.75rem; font-size: 0.9375rem;' },
              node.attrs.description,
            ],
          ]
        : []),
      [
        'a',
        {
          href: buttonLink || '#',
          style:
            'display: inline-block; border-radius: 0.5rem; padding: 0.5rem 0.875rem; background: #111827; color: #ffffff; text-decoration: none; font-size: 0.875rem; font-weight: 600;',
        },
        buttonText,
      ],
    ]
  },

  addCommands() {
    return {
      setCta:
        options =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              title: options?.title || 'Ready to take action?',
              description: options?.description || '',
              buttonText: options?.buttonText || 'Learn more',
              buttonLink: options?.buttonLink || '',
              buttonObfuscated: options?.buttonObfuscated ?? false,
            },
          })
        },
      updateCta:
        options =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, options)
        },
    }
  },
})
