import type { MentionOptions } from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import SuggestionList, { type SuggestionListRef } from './SuggestionList'
import fetch from 'cross-fetch'

const HASURA_API_URL =
  import.meta.env.VITE_HASURA_API_URL ||
  'https://local.hasura.local.nhost.run:444'
const MARKETPLACE_URL =
  import.meta.env.VITE_MARKETPLACE_URL || 'https://trustfolio.dev'

export type MentionSuggestion = {
  id: string
  label: string
  url: string | null
  type:
    | 'member'
    | 'review'
    | 'membership'
    | 'collection'
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

const parseTrustfolioUrl = async (
  url: string
): Promise<MentionSuggestion | null> => {
  try {
    const urlObj = new URL(url)
    if (!urlObj.hostname.includes('trustfolio.co')) {
      return null
    }

    console.log('urlObj', urlObj)

    const pathParts = urlObj.pathname.split('/').filter(Boolean)

    //Article
    if (pathParts[0] === 'articles' && pathParts[1]) {
      const slug = pathParts[1]

      if (!slug) {
        return null
      }

      const response = await fetch(
        `${HASURA_API_URL}/api/rest/mentions/article?slug=${slug}`,
        {
          method: 'GET',
          headers: {},
        }
      )

      if (!response.ok) {
        return null
      }

      const articleData = await response.json()

      const article = articleData.marketplace_pages?.[0]

      if (!article) {
        return null
      }

      return {
        label: article.title,
        id: article.public_id,
        type: 'article',
        url: url,
      }
    }

    // Member profile
    if (pathParts[0] === 'profil' && pathParts[1]) {
      const slug = pathParts[1]

      if (!slug) {
        return null
      }

      const response = await fetch(
        `${HASURA_API_URL}/api/rest/mentions/member?slug=${slug}`,
        {
          method: 'GET',
          headers: {},
        }
      )

      if (!response.ok) {
        return null
      }

      const memberData = await response.json()

      const member = memberData.members?.[0]

      if (!member) {
        return null
      }

      return {
        label: member.name,
        id: member.public_id,
        type: 'member',
        url: url,
      }
    }

    // Tags
    if (pathParts[0] === 'membres') {
      const slug = pathParts[2]

      if (!slug) {
        return null
      }

      const response = await fetch(
        `${HASURA_API_URL}/api/rest/mentions/tag?slug=${slug}`,
        {
          method: 'GET',
          headers: {},
        }
      )

      if (!response.ok) {
        return null
      }

      const tagData = await response.json()

      const tag = tagData.tags?.[0]

      if (!tag) {
        return null
      }

      return {
        label: tag.label,
        id: tag.public_id,
        type: 'tag',
        url: url,
      }
    }

    // Buyers
    // if (
    //   pathParts[0] === 'membres' &&
    //   pathParts[1] === 'clients' &&
    //   pathParts[2]
    // ) {
    //   return {
    //     label: pathParts[2], // We'll need to fetch the actual name later
    //     id: pathParts[2],
    //     type: 'buyer',
    //     url: url,
    //   }
    // }

    // Reviews
    if (
      pathParts[0] === 'profil' &&
      pathParts[1] &&
      pathParts[2] === 'reference' &&
      pathParts[3]
    ) {
      const id = pathParts[3]

      if (!id) {
        return null
      }

      const response = await fetch(
        `${HASURA_API_URL}/api/rest/mentions/review?id=${id}`,
        {
          method: 'GET',
          headers: {},
        }
      )

      if (!response.ok) {
        return null
      }

      const reviewData = await response.json()

      const review = reviewData.endorsements?.[0]

      if (!review) {
        return null
      }

      const label = `[${review.owner.name}] ${
        review.contact?.full_name || '***'
      } @${
        review.contact?.account?.name || review.public_account?.name || '***'
      }`

      return {
        label: label,
        id: review.public_id,
        type: 'review',
        url: url,
      }
    }

    return null
  } catch (error) {
    console.error('Error parsing URL:', error)
    return null
  }
}

export const mentionSuggestionOptions: MentionOptions['suggestion'] = {
  items: async ({ query }): Promise<MentionSuggestion[]> => {
    if (!query) {
      return []
    }

    // If not a URL or parsing failed, proceed with API search
    if (query.length < 3) {
      return []
    }

    if (query.startsWith('https://')) {
      // Try to parse as URL first
      const urlMention = await parseTrustfolioUrl(query)
      if (urlMention) {
        return [urlMention]
      }
      return []
    } else {
      try {
        const response = await fetch(
          `${HASURA_API_URL}/api/rest/mentions/search?search=${query}`,
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
              url: `${MARKETPLACE_URL}/profil/${item.slug}`,
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
                ? `${MARKETPLACE_URL}/membres/${item.parent.slug}/${item.slug}`
                : `${MARKETPLACE_URL}/membres/services/${item.slug}`,
            })
          ),
          ...(data.search_organization_groups || []).map(
            (item: { parent: { name: string }; public_id: string }) => ({
              label: item.parent.name,
              id: item.public_id,
              type: 'buyer',
              url: `${MARKETPLACE_URL}/membres/clients/${item.public_id}`,
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
              label: `[${item.owner.name}] ${
                item.contact?.full_name || '***'
              } @${
                item.contact?.account?.name ||
                item.public_account?.name ||
                '***'
              }`,
              id: item.public_id,
              type: 'review',
              url: `${MARKETPLACE_URL}/profil/${item.owner.slug}/reference/${item.public_id}`,
            })
          ),
          ...(data.search_marketplace_pages || []).map(
            (item: {
              kind: 'LEADERBOARD' | 'ARTICLE'
              public_id: string
              slug: string
              localized_metadata: {
                title: string
              }[]
            }) => ({
              label: item.localized_metadata?.[0]?.title || item.slug,
              id: item.public_id,
              type: item.kind.toLowerCase(),
              url:
                item.kind === 'ARTICLE'
                  ? `${MARKETPLACE_URL}/articles/${item.slug}`
                  : `${MARKETPLACE_URL}/membres/leaderboards/${item.slug}`,
            })
          ),
          ...(data.search_members_collections || []).map(
            (item: {
              title: { FR_FR: string }
              public_id: string
              owner: { name: string; slug: string }
            }) => ({
              label: `[${item.owner.name}] ${
                item.title.FR_FR || Object.values(item.title)?.[0]
              }`,
              id: item.public_id,
              type: 'collection',
              url: `${MARKETPLACE_URL}/profil/${item.owner.slug}/collection/${item.public_id}`,
            })
          ),
          ...(data.search_memberships || []).map(
            (item: {
              first_name: string
              last_name: string
              public_id: string
              owner: { name: string; slug: string }
            }) => ({
              label: `[${item.owner.name}] ${item.first_name} ${item.last_name}`,
              id: item.public_id,
              type: 'membership',
              url: `${MARKETPLACE_URL}/profil/${item.owner.slug}/culture#${item.public_id}`,
            })
          ),
        ]

        return flattenedResults
      } catch (error) {
        console.error('Error fetching mentions:', error)
        return []
      }
    }

    return []
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
