import { useCallback, useEffect, useRef } from 'react'
import IVInputField from '~/components/IVInputField'
import { RCTResponderProps } from '~/components/RenderIOCall'
import { IOComponentError } from '~/components/RenderIOCall/ComponentError'
import IVRichTextEditor from '~/components/IVRichTextEditor/lazy'
import useInput from '~/utils/useInput'

export default function InputText(props: RCTResponderProps<'INPUT_RICH_TEXT'>) {
  const { errorMessage } = useInput(props)
  const pendingUploadRequests = useRef(
    new Map<
      string,
      {
        resolve: (
          value:
            | {
                uploadUrl: string
                downloadUrl: string
              }[]
            | undefined
        ) => void
        timeout: NodeJS.Timeout
      }
    >()
  )
  const pendingReviewActionRequests = useRef(
    new Map<
      string,
      {
        resolve: (
          value:
            | {
                comments: any[]
                selectedCommentId?: string | null
              }
            | undefined
        ) => void
        timeout: NodeJS.Timeout
      }
    >()
  )

  useEffect(() => {
    const mediaUploadResponse = (props as any).mediaUploadResponse as
      | {
          requestId: string
          fileUrls: { uploadUrl: string; downloadUrl: string }[]
        }
      | undefined

    if (!mediaUploadResponse) return

    const pending = pendingUploadRequests.current.get(mediaUploadResponse.requestId)
    if (!pending) return

    clearTimeout(pending.timeout)
    pending.resolve(mediaUploadResponse.fileUrls)
    pendingUploadRequests.current.delete(mediaUploadResponse.requestId)
  }, [props])

  useEffect(() => {
    const reviewActionResponse = (props as any).reviewActionResponse as
      | {
          requestId: string
          comments: any[]
          selectedCommentId?: string | null
        }
      | undefined

    if (!reviewActionResponse) return

    const pending = pendingReviewActionRequests.current.get(
      reviewActionResponse.requestId
    )
    if (!pending) return

    clearTimeout(pending.timeout)
    pending.resolve({
      comments: reviewActionResponse.comments,
      selectedCommentId: reviewActionResponse.selectedCommentId,
    })
    pendingReviewActionRequests.current.delete(reviewActionResponse.requestId)
  }, [props])

  useEffect(() => {
    return () => {
      pendingUploadRequests.current.forEach(({ resolve, timeout }) => {
        clearTimeout(timeout)
        resolve(undefined)
      })
      pendingUploadRequests.current.clear()

      pendingReviewActionRequests.current.forEach(({ resolve, timeout }) => {
        clearTimeout(timeout)
        resolve(undefined)
      })
      pendingReviewActionRequests.current.clear()
    }
  }, [])

  const requestCustomUploadUrls = useCallback(
    (files: { name: string; type: string }[]) => {
      const mediaImage = (props as any).media?.image
      if (!mediaImage?.useCustomUploadUrls) {
        return Promise.resolve(undefined)
      }

      const requestId = `${props.id}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`

      return new Promise<
        { uploadUrl: string; downloadUrl: string }[] | undefined
      >(resolve => {
        const timeout = setTimeout(() => {
          pendingUploadRequests.current.delete(requestId)
          resolve(undefined)
        }, 10_000)

        pendingUploadRequests.current.set(requestId, {
          resolve,
          timeout,
        })

        props.onStateChange({
          mediaUploadRequest: {
            requestId,
            files,
          },
        } as any)
      })
    },
    [props]
  )

  const requestReviewAction = useCallback(
    (action: 'resolve' | 'unresolve', commentId: string) => {
      const review = (props as any).review
      if (!review) {
        return Promise.resolve(undefined)
      }

      const requestId = `${props.id}-review-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`

      return new Promise<
        | {
            comments: any[]
            selectedCommentId?: string | null
          }
        | undefined
      >(resolve => {
        const timeout = setTimeout(() => {
          pendingReviewActionRequests.current.delete(requestId)
          resolve(undefined)
        }, 10_000)

        pendingReviewActionRequests.current.set(requestId, {
          resolve,
          timeout,
        })

        props.onStateChange({
          reviewActionRequest: {
            requestId,
            action,
            commentId,
          },
        } as any)
      })
    },
    [props]
  )

  return (
    <IVInputField
      label={props.label}
      id={props.id}
      helpText={props.helpText}
      optional={props.isOptional}
      errorMessage={errorMessage}
    >
      <IVRichTextEditor
        autoFocus={props.autoFocus}
        id={props.id}
        placeholder={props.isCurrentCall ? props.placeholder : undefined}
        defaultValue={
          !(props.value instanceof IOComponentError) ? props.value : undefined
        }
        hasError={!!errorMessage}
        disabled={props.disabled || props.isSubmitting}
        media={(props as any).media}
        links={(props as any).links}
        review={(props as any).review}
        inputGroupKey={props.inputGroupKey}
        transactionId={props.transaction?.id}
        requestCustomUploadUrls={requestCustomUploadUrls}
        requestReviewAction={requestReviewAction}
        onChange={(value, text) => {
          props.onUpdatePendingReturnValue(
            text.length > 0
              ? value
              : props.isOptional
              ? undefined
              : new IOComponentError()
          )
        }}
      />
    </IVInputField>
  )
}
