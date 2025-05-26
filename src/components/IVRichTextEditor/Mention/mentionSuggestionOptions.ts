import type { MentionOptions } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import SuggestionList, { type SuggestionListRef } from './SuggestionList'
import fetch from 'cross-fetch'

export type MentionSuggestion = {
  id: string
  label: string
  url: string | null
  type:
    | 'member'
    | 'review'
    | 'group'
    | 'collection'
    | 'user'
    | 'reward'
    | 'asset'
    | 'quality'
    | 'tag'
    | 'article'
    | 'leaderboard'
    | 'buyer'
}

/**
 * Workaround for the current typing incompatibility between Tippy.js and Tiptap
 * Suggestion utility.
 *
 * @see https://github.com/ueberdosis/tiptap/issues/2795#issuecomment-1160623792
 *
 * Adopted from
 * https://github.com/Doist/typist/blob/a1726a6be089e3e1452def641dfcfc622ac3e942/stories/typist-editor/constants/suggestions.ts#L169-L186
 */
const DOM_RECT_FALLBACK: DOMRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON() {
    return {}
  },
}

export const mentionSuggestionOptions: MentionOptions['suggestion'] = {
  // Replace this `items` code with a call to your API that returns suggestions
  // of whatever sort you like (including potentially additional data beyond
  // just an ID and a label). It need not be async but is written that way for
  // the sake of example.
  items: async ({ query }): Promise<MentionSuggestion[]> => {
    if (!query || query.length < 3) {
      return []
    }

    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_HASURA_API_URL
        }/api/rest/mentions/search?search=${query}`,
        {
          method: 'GET',
          headers: {},
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch mentions')
      }

      const data = await response.json()

      // Transform the nested response into a flat array
      const flattenedResults = [
        ...(data.search_members || []).map(
          (item: { name: string; public_id: string; slug: string }) => ({
            label: item.name,
            id: item.public_id,
            type: 'member',
            url: `${import.meta.env.VITE_MARKETPLACE_URL}/profil/${item.slug}`,
          })
        ),
        ...(data.search_tags || []).map(
          (item: {
            label: { FR_FR: string }
            public_id: string
            slug: string
            parent: {
              slug: string
            }
          }) => ({
            label: item.label.FR_FR || Object.values(item.label)[0],
            id: item.public_id,
            type: 'tag',
            url: item.parent
              ? `${import.meta.env.VITE_MARKETPLACE_URL}/membres/${
                  item.parent.slug
                }/${item.slug}`
              : `${import.meta.env.VITE_MARKETPLACE_URL}/membres/services/${
                  item.slug
                }`,
          })
        ),
        ...(data.search_organization_groups || []).map(
          (item: { parent: { name: string }; public_id: string }) => ({
            label: item.parent.name,
            id: item.public_id,
            type: 'buyer',
            url: `${import.meta.env.VITE_MARKETPLACE_URL}/membres/clients/${
              item.public_id
            }`,
          })
        ),
        ...(data.search_endorsements || []).map(
          (item: {
            contact: {
              full_name: string
              account: { name: string } | null
            } | null
            public_id: string
            owner: { name: string; slug: string }
            public_account: { name: string } | null
          }) => ({
            label: `[${item.owner.name}] ${item.contact?.full_name || '***'} @${
              item.contact?.account?.name || item.public_account?.name || '***'
            }`,
            id: item.public_id,
            type: 'review',
            url: `${import.meta.env.VITE_MARKETPLACE_URL}/profil/${
              item.owner.slug
            }/reference/${item.public_id}`,
          })
        ),
      ]

      return flattenedResults
    } catch (error) {
      console.error('Error fetching mentions:', error)
      return []
    }
  },

  render: () => {
    let component: ReactRenderer<SuggestionListRef> | undefined
    let popup: TippyInstance | undefined

    return {
      onStart: props => {
        component = new ReactRenderer(SuggestionList, {
          props,
          editor: props.editor,
        })

        popup = tippy('body', {
          getReferenceClientRect: () =>
            props.clientRect?.() ?? DOM_RECT_FALLBACK,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })[0]
      },

      onUpdate(props) {
        component?.updateProps(props)

        popup?.setProps({
          getReferenceClientRect: () =>
            props.clientRect?.() ?? DOM_RECT_FALLBACK,
        })
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup?.hide()
          return true
        }

        if (!component?.ref) {
          return false
        }

        return component.ref.onKeyDown(props)
      },

      onExit() {
        popup?.destroy()
        component?.destroy()

        // Remove references to the old popup and component upon destruction/exit.
        // (This should prevent redundant calls to `popup.destroy()`, which Tippy
        // warns in the console is a sign of a memory leak, as the `suggestion`
        // plugin seems to call `onExit` both when a suggestion menu is closed after
        // a user chooses an option, *and* when the editor itself is destroyed.)
        popup = undefined
        component = undefined
      },
    }
  },
}
