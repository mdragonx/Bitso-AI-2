/**
 * Internal endpoint used by the client for synchronous agent calls.
 * Override with NEXT_PUBLIC_AGENT_API_ENDPOINT when needed.
 */
export const INTERNAL_AGENT_ENDPOINT = process.env.NEXT_PUBLIC_AGENT_API_ENDPOINT || '/api/agent'

/**
 * Returns true when a URL targets the configured internal agent endpoint.
 */
export function isInternalAgentEndpoint(url: string): boolean {
  if (!url) return false

  if (url === INTERNAL_AGENT_ENDPOINT) return true
  if (url.startsWith(`${INTERNAL_AGENT_ENDPOINT}?`)) return true

  // Handle absolute URLs (same-origin or fully qualified endpoint overrides)
  try {
    const resolved = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const endpoint = new URL(
      INTERNAL_AGENT_ENDPOINT,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    )

    return resolved.origin === endpoint.origin && resolved.pathname === endpoint.pathname
  } catch {
    return false
  }
}
