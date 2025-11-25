import { useState, useEffect, useCallback } from 'react'
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

import IVSelect from '~/components/IVSelect'

import QuoteLeftIcon from '~/icons/compiled/QuoteLeft'
import BulletedListIcon from '~/icons/compiled/BulletedList'
import NumberedListIcon from '~/icons/compiled/NumberedList'
import LinkIcon from '~/icons/compiled/Link'
import RedoIcon from '~/icons/compiled/Redo'
import UndoIcon from '~/icons/compiled/Undo'
import ClearFormattingIcon from '~/icons/compiled/ClearFormatting'
import ImageIcon from '~/icons/compiled/Image'
import VideoIcon from '~/icons/compiled/Play'
import { ShortcutMap, getShortcuts } from '~/utils/usePlatform'
import { mentionSuggestionOptions } from './Mention/mentionSuggestionOptions'
import { Callout } from './Callout'
import CalloutEditor from './CalloutEditor'
const CustomLink = Link.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-K': ({ editor }) => linkButtonHandler(editor),
      'Mod-O': ({ editor }) => imageButtonHandler(editor),
      'Mod-C': ({ editor }) => clearFormattingButtonHandler(editor),
      // Swallow Cmd+Enter
      'Mod-Enter': () => true,
    }
  },
})

function linkButtonHandler(editor: CoreEditor) {
  const existing = editor.getAttributes('link').href

  // TODO: Use a better dialog
  const href = window.prompt('Link destination', existing ?? undefined)

  if (href === '') {
    editor.chain().focus().unsetLink().run()
    return false
  }

  if (!href) return false

  return editor.chain().focus().setLink({ href }).run()
}

function imageButtonHandler(editor: CoreEditor) {
  const existing = editor.getAttributes('image').src

  // TODO: Use a better dialog
  // TODO: Handle image uploads
  const src = window.prompt('Image URL', existing ?? undefined)

  if (!src) return false

  return editor.chain().focus().setImage({ src }).run()
}

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

function getAllNodesAttributesByType(doc: any, nodeType: string): Array<any> {
  // console.log('getAllNodesAttributesByType')
  const result: Array<any> = []

  doc.descendants(node => {
    if (node.type.name === nodeType) {
      result.push(node.attrs)
    }
  })

  return result
}

export interface IVRichTextEditorProps {
  id?: string
  defaultValue?: { html: string; json?: any; mentions?: any[] }
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
      Mention.extend({
        addAttributes() {
          return {
            type: {
              default: '',
            },
            url: {
              default: '',
            },
            label: {
              default: '',
            },
            id: {
              default: '',
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
            },
            url: {
              default: '',
            },
            label: {
              default: '',
            },
            id: {
              default: '',
            },
            variant: {
              default: 'pill',
            },
          }
        },
        parseHTML() {
          return [
            {
              tag: 'div[data-mention-pill]',
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
            },
            url: {
              default: '',
            },
            label: {
              default: '',
            },
            id: {
              default: '',
            },
            variant: {
              default: 'mega-pill',
            },
          }
        },
        parseHTML() {
          return [
            {
              tag: 'div[data-mention-mega-pill]',
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
    ],
    onUpdate({ editor }) {
      // This might be wastefully expensive to do both always but it's a nice
      // way for the parent to ensure that text is entered and not just empty
      // blocks.

      onChange(
        {
          html: editor.getHTML(),
          json: editor.getJSON(),
          mentions: getAllNodesAttributesByType(editor.state.doc, 'mention'),
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
      <MenuBar editor={editor} disabled={!!disabled} />
      <EditorContent
        editor={editor}
        className="prose max-w-none p-2 pt-4"
        disabled={disabled}
        id={id}
      />
      <CalloutClickHandler editor={editor} />
      <MentionClickHandler editor={editor} />
    </div>
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
}: {
  editor: Editor | null
  disabled: boolean
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

  const addYoutubeVideo = () => {
    const url = prompt('Enter YouTube URL')
    const [width, height] = prompt(
      'Enter width and height: (e.g. 640x480)'
    )?.split('x') || ['640', '480']

    if (url) {
      editor.commands.setYoutubeVideo({
        src: url,
        width: Math.max(320, parseInt(width, 10)) || 640,
        height: Math.max(180, parseInt(height, 10)) || 480,
      })
    }
  }

  return (
    <div
      className="border-b border-solid border-gray-300 flex items-start gap-x-2"
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
              title: 'Add link...',
              label: <LinkIcon className="w-4 h-4" />,
              disabled: disabled || !editor.can().setLink({ href: '' }),
              onClick: () => linkButtonHandler(editor),
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
              disabled: disabled || !editor.can().setImage({ src: '' }),
              onClick: () => imageButtonHandler(editor),
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
              disabled: disabled,
              onClick: () => addYoutubeVideo(),
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
