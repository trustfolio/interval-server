import { useState, useEffect, useRef } from 'react'
import { Editor } from '@tiptap/react'
import classNames from 'classnames'
import IVButton from '~/components/IVButton'
import IVInputField from '~/components/IVInputField'

const COMMON_EMOJIS = [
  '💡',
  '📝',
  '⚠️',
  '✅',
  '❌',
  '💬',
  '🔔',
  '⭐',
  '🎯',
  '📌',
]

const COLOR_PRESETS = [
  { name: 'Gray', bg: '#f3f4f6', text: '#1f2937' },
  { name: 'Blue', bg: '#dbeafe', text: '#1e40af' },
  { name: 'Green', bg: '#dcfce7', text: '#166534' },
  { name: 'Yellow', bg: '#fef3c7', text: '#92400e' },
  { name: 'Red', bg: '#fee2e2', text: '#991b1b' },
  { name: 'Purple', bg: '#f3e8ff', text: '#6b21a8' },
  { name: 'Pink', bg: '#fce7f3', text: '#831843' },
]

interface CalloutEditorProps {
  editor: Editor
  onClose: () => void
  initialAttrs?: {
    backgroundColor?: string
    textColor?: string
    emoji?: string
  }
}

export default function CalloutEditor({
  editor,
  onClose,
  initialAttrs,
}: CalloutEditorProps) {
  const [backgroundColor, setBackgroundColor] = useState(
    initialAttrs?.backgroundColor || '#f3f4f6'
  )
  const [textColor, setTextColor] = useState(
    initialAttrs?.textColor || '#1f2937'
  )
  const [emoji, setEmoji] = useState(initialAttrs?.emoji || '💡')
  const [customEmoji, setCustomEmoji] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const handleSave = () => {
    if (initialAttrs) {
      // Update existing callout
      editor
        .chain()
        .focus()
        .updateCallout({
          backgroundColor,
          textColor,
          emoji: customEmoji || emoji,
        })
        .run()
    } else {
      // Insert new callout
      editor
        .chain()
        .focus()
        .setCallout({
          backgroundColor,
          textColor,
          emoji: customEmoji || emoji,
        })
        .run()
    }
    onClose()
  }

  return (
    <div
      ref={containerRef}
      className="z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-4 w-80"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Emoji
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {COMMON_EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEmoji(e)
                  setCustomEmoji('')
                }}
                className={classNames(
                  'w-10 h-10 text-xl rounded border-2 transition-all',
                  {
                    'border-indigo-500 bg-indigo-50':
                      emoji === e && !customEmoji,
                    'border-gray-300 hover:border-gray-400':
                      emoji !== e || !!customEmoji,
                  }
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customEmoji}
            onChange={e => {
              setCustomEmoji(e.target.value)
              if (e.target.value) {
                setEmoji(e.target.value)
              }
            }}
            placeholder="Or enter custom emoji"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            maxLength={2}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Color Preset
          </label>
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PRESETS.map(preset => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  setBackgroundColor(preset.bg)
                  setTextColor(preset.text)
                }}
                className={classNames(
                  'h-12 rounded border-2 transition-all relative',
                  {
                    'border-indigo-500 ring-2 ring-indigo-200':
                      backgroundColor === preset.bg &&
                      textColor === preset.text,
                    'border-gray-300 hover:border-gray-400':
                      backgroundColor !== preset.bg ||
                      textColor !== preset.text,
                  }
                )}
                style={{
                  backgroundColor: preset.bg,
                  color: preset.text,
                }}
                title={preset.name}
              >
                <span className="text-xs font-medium">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <IVInputField label="Background Color" id="bg-color">
            <input
              id="bg-color"
              type="color"
              value={backgroundColor}
              onChange={e => setBackgroundColor(e.target.value)}
              className="w-full h-10 border border-gray-300 rounded-md cursor-pointer"
            />
          </IVInputField>
          <IVInputField label="Text Color" id="text-color">
            <input
              id="text-color"
              type="color"
              value={textColor}
              onChange={e => setTextColor(e.target.value)}
              className="w-full h-10 border border-gray-300 rounded-md cursor-pointer"
            />
          </IVInputField>
        </div>

        <div className="flex gap-2 justify-end">
          <IVButton theme="secondary" label="Cancel" onClick={onClose} />
          <IVButton label="Save" onClick={handleSave} />
        </div>
      </div>
    </div>
  )
}
