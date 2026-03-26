function parseFlag(value: string | undefined): boolean {
  if (value === undefined) return true
  return value.toLowerCase() !== 'false'
}

export const clientFeatureFlags = {
  rag: parseFlag(process.env.NEXT_PUBLIC_ENABLE_RAG),
  upload: parseFlag(process.env.NEXT_PUBLIC_ENABLE_UPLOAD),
  scheduler: parseFlag(process.env.NEXT_PUBLIC_ENABLE_SCHEDULER),
}

export function getFeatureDisabledMessage(feature: 'rag' | 'upload' | 'scheduler') {
  if (feature === 'rag') {
    return 'RAG is disabled by configuration. Set NEXT_PUBLIC_ENABLE_RAG=true (and ENABLE_RAG=true on server) to enable it.'
  }
  if (feature === 'upload') {
    return 'File upload is disabled by configuration. Set NEXT_PUBLIC_ENABLE_UPLOAD=true (and ENABLE_UPLOAD=true on server) to enable it.'
  }
  return 'Scheduler is disabled by configuration. Set NEXT_PUBLIC_ENABLE_SCHEDULER=true (and ENABLE_SCHEDULER=true on server) to enable it.'
}
