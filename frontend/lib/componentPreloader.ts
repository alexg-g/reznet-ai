/**
 * Component Preloader - Optimistic loading strategy
 *
 * Preloads heavy components based on user behavior patterns:
 * - Preload on page idle time
 * - Preload on hover over trigger elements
 * - Preload on first markdown detection
 */

// Track which components have been preloaded
const preloadedComponents = new Set<string>()

/**
 * Preload the MarkdownRenderer component
 *
 * Call this during idle time or when user hovers over markdown-rich content
 */
export function preloadMarkdownRenderer() {
  if (preloadedComponents.has('markdown')) return

  // Dynamic import to trigger webpack preloading
  import('../components/MarkdownRenderer')
    .then(() => {
      preloadedComponents.add('markdown')
      console.log('[Preload] MarkdownRenderer loaded')
    })
    .catch((err) => {
      console.error('[Preload] Failed to load MarkdownRenderer:', err)
    })
}

/**
 * Preload on requestIdleCallback
 *
 * Loads heavy components during browser idle time (60% idle threshold)
 */
export function preloadOnIdle() {
  if (typeof window === 'undefined') return

  // Use requestIdleCallback if available, otherwise setTimeout fallback
  const schedulePreload = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(callback, { timeout: 2000 })
    } else {
      setTimeout(callback, 1000)
    }
  }

  schedulePreload(() => {
    preloadMarkdownRenderer()
  })
}

/**
 * Preload on interaction hint
 *
 * Detects when user might need markdown rendering soon:
 * - Typing code fence (```)
 * - Pasting formatted content
 * - Hovering over code/markdown elements
 */
export function setupInteractionPreload() {
  if (typeof window === 'undefined') return

  // Debounce helper
  let timeout: NodeJS.Timeout
  const debounce = (fn: () => void, delay: number) => {
    clearTimeout(timeout)
    timeout = setTimeout(fn, delay)
  }

  // Listen for typing code blocks
  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    if (target.value.includes('```')) {
      debounce(preloadMarkdownRenderer, 200)
    }
  }

  // Listen for paste events (might contain markdown)
  const handlePaste = () => {
    debounce(preloadMarkdownRenderer, 100)
  }

  // Add global listeners
  document.addEventListener('input', handleInput, { passive: true })
  document.addEventListener('paste', handlePaste, { passive: true })

  // Cleanup function
  return () => {
    document.removeEventListener('input', handleInput)
    document.removeEventListener('paste', handlePaste)
  }
}

/**
 * Preload on first markdown message
 *
 * Call this when first markdown message is detected in chat
 */
export function preloadOnFirstMarkdown() {
  if (!preloadedComponents.has('markdown')) {
    console.log('[Preload] First markdown detected, preloading renderer')
    preloadMarkdownRenderer()
  }
}

/**
 * Check if component is preloaded
 */
export function isPreloaded(component: string): boolean {
  return preloadedComponents.has(component)
}
