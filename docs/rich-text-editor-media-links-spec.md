# Rich Text Editor Media + Link Spec

This fork extends the server `IVRichTextEditor` used by `INPUT_RICH_TEXT`.

## Insert flows

- Image: modal with upload or URL
- Video: modal with YouTube URL and aspect ratio (`horizontal`, `square`, `vertical`)
- Gallery: modal with layout (`grid`, `slider`) and mixed image/YouTube items
- Link: modal with `text`, `preview`, `mention` modes

## OpenGraph metadata

- Resolved server-side via `trpc` mutation: `linkPreview.fetch`
- Utility: `server/src/server/utils/linkPreview.ts`
- Metadata shape:
  - `url`
  - `finalUrl`
  - `title`
  - `description?`
  - `imageUrl?`
  - `faviconUrl?`
  - `siteName?`

### Security guards

- `http/https` only
- blocks localhost / local domains / private and link-local IPs
- validates redirects hop-by-hop
- timeout and response-size limits for HTML parsing

## HTML + JSON nodes

### Link preview card

- JSON node: `linkPreviewCard`
- HTML marker: `div[data-iv-link-preview]`

### Link mention chip

- JSON node: `linkMentionChip`
- HTML marker: `span[data-iv-link-mention]`

### Responsive video

- JSON node: `ivVideo`
- HTML marker: `div[data-iv-video]`
- legacy `youtube` nodes are migrated to `ivVideo` on update

### Gallery

- JSON node: `ivGallery`
- HTML marker: `div[data-iv-gallery]`
- `data-items` stores serialized gallery items for round-trip parsing

## Rendering guidance for frontend repo

- Prefer JSON as canonical render input.
- Use HTML output only for compatibility/export needs.
- Preserve `data-*` attributes if server-generated HTML is post-processed.
