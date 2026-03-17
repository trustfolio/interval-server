import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { authenticatedMiddleware, createRouter } from './util'
import { getLinkPreviewMetadata } from '../utils/linkPreview'

export const linkPreviewRouter = createRouter()
  .middleware(authenticatedMiddleware)
  .mutation('fetch', {
  input: z.object({
    url: z.string().url(),
  }),
  async resolve({ input }) {
    try {
      return await getLinkPreviewMetadata(input.url)
    } catch (err) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to fetch OpenGraph metadata for this URL.',
      })
    }
  },
})
