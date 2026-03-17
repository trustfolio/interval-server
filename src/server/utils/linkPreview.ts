import dns from 'dns/promises'
import net from 'net'
import fetch, { Response } from 'node-fetch'

const MAX_REDIRECTS = 5
const MAX_HTML_BYTES = 1_000_000
const REQUEST_TIMEOUT_MS = 6_000

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

export interface LinkPreviewMetadata {
  url: string
  finalUrl: string
  title: string
  description?: string
  imageUrl?: string
  faviconUrl?: string
  siteName?: string
}

function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, match => ENTITY_MAP[match] ?? match)
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, '').trim())
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(v => parseInt(v, 10))

    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true

    return false
  }

  if (net.isIPv6(address)) {
    const lowered = address.toLowerCase()

    if (lowered === '::1') return true
    if (lowered.startsWith('fc') || lowered.startsWith('fd')) return true
    if (
      lowered.startsWith('fe8') ||
      lowered.startsWith('fe9') ||
      lowered.startsWith('fea') ||
      lowered.startsWith('feb')
    ) {
      return true
    }

    if (lowered.startsWith('::ffff:')) {
      return isPrivateIp(lowered.replace('::ffff:', ''))
    }

    return false
  }

  return true
}

function assertPublicProtocol(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.')
  }
}

async function assertPublicHostname(hostname: string) {
  const lowered = hostname.toLowerCase()
  if (
    lowered === 'localhost' ||
    lowered.endsWith('.localhost') ||
    lowered.endsWith('.local')
  ) {
    throw new Error('Local hostnames are not allowed for link previews.')
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Private IP addresses are not allowed for link previews.')
    }
    return
  }

  const resolved = await dns.lookup(hostname, { all: true, verbatim: true })
  if (!resolved.length) {
    throw new Error('Unable to resolve URL hostname.')
  }

  if (resolved.some(record => isPrivateIp(record.address))) {
    throw new Error('Private network targets are not allowed for link previews.')
  }
}

async function assertSafeUrl(urlString: string) {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch (_err) {
    throw new Error('Invalid URL.')
  }

  assertPublicProtocol(parsed)
  await assertPublicHostname(parsed.hostname)
}

async function readBodyWithLimit(response: Response): Promise<string> {
  if (!response.body) {
    return ''
  }

  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of response.body as any) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const nextTotal = totalBytes + buffer.length

    if (nextTotal > MAX_HTML_BYTES) {
      const remaining = MAX_HTML_BYTES - totalBytes
      if (remaining > 0) {
        chunks.push(buffer.subarray(0, remaining))
      }
      break
    }

    chunks.push(buffer)
    totalBytes = nextTotal
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function fetchHtmlWithRedirects(url: string): Promise<{
  html: string
  finalUrl: string
}> {
  let currentUrl = url

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    await assertSafeUrl(currentUrl)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'IntervalLinkPreview/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      })
    } finally {
      clearTimeout(timeout)
    }

    const isRedirect =
      response.status >= 300 && response.status < 400 && response.headers.has('location')

    if (isRedirect) {
      const location = response.headers.get('location')
      if (!location) break

      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new Error('URL did not return an HTML page.')
    }

    const html = await readBodyWithLimit(response)
    return { html, finalUrl: currentUrl }
  }

  throw new Error('Too many redirects when fetching link preview.')
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([a-zA-Z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g

  for (const match of tag.matchAll(attrRegex)) {
    const [, key, , dquote, squote, bare] = match
    attrs[key.toLowerCase()] = (dquote ?? squote ?? bare ?? '').trim()
  }

  return attrs
}

function getMetaContent(
  html: string,
  matchers: Array<{ key: 'property' | 'name'; value: string }>
): string | undefined {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? []

  for (const tag of metaTags) {
    const attrs = parseAttributes(tag)
    const content = attrs.content
    if (!content) continue

    if (
      matchers.some(
        matcher => attrs[matcher.key]?.toLowerCase() === matcher.value.toLowerCase()
      )
    ) {
      return stripHtml(content)
    }
  }

  return undefined
}

function getTitle(html: string): string | undefined {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!titleMatch?.[1]) return undefined
  return stripHtml(titleMatch[1])
}

function getFaviconUrl(html: string, baseUrl: string): string | undefined {
  const linkTags = html.match(/<link\s+[^>]*>/gi) ?? []
  for (const tag of linkTags) {
    const attrs = parseAttributes(tag)
    const rel = attrs.rel?.toLowerCase() ?? ''
    if (!rel.includes('icon')) continue

    const href = attrs.href
    if (!href) continue

    try {
      return new URL(href, baseUrl).toString()
    } catch (_err) {
      continue
    }
  }

  try {
    return new URL('/favicon.ico', baseUrl).toString()
  } catch (_err) {
    return undefined
  }
}

function toAbsoluteUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) return undefined

  try {
    return new URL(url, baseUrl).toString()
  } catch (_err) {
    return undefined
  }
}

export async function getLinkPreviewMetadata(
  inputUrl: string
): Promise<LinkPreviewMetadata> {
  const normalizedUrl = new URL(inputUrl).toString()
  const { html, finalUrl } = await fetchHtmlWithRedirects(normalizedUrl)

  const ogTitle = getMetaContent(html, [{ key: 'property', value: 'og:title' }])
  const title = ogTitle ?? getTitle(html) ?? new URL(finalUrl).hostname

  const description = getMetaContent(html, [
    { key: 'property', value: 'og:description' },
    { key: 'name', value: 'description' },
  ])
  const imageUrl = toAbsoluteUrl(
    getMetaContent(html, [{ key: 'property', value: 'og:image' }]),
    finalUrl
  )
  const siteName = getMetaContent(html, [
    { key: 'property', value: 'og:site_name' },
  ])
  const faviconUrl = getFaviconUrl(html, finalUrl)

  return {
    url: normalizedUrl,
    finalUrl,
    title,
    description,
    imageUrl,
    faviconUrl,
    siteName,
  }
}
