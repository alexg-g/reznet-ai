'use client'

import { lazy, Suspense } from 'react'
import MessageSkeleton from './MessageSkeleton'
import ErrorBoundary from './ErrorBoundary'

// Lazy load the heavy markdown renderer
// This reduces initial bundle by ~65KB (react-markdown + prism)
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'))

interface MessageContentProps {
  content: string
  hasCodeBlocks?: boolean
  hasMarkdown?: boolean
}

/**
 * MessageContent - Smart message renderer with lazy loading
 *
 * Detects if message contains markdown/code and lazy-loads renderer.
 * Falls back to plain text for simple messages (no bundle overhead).
 *
 * Performance benefits:
 * - Plain text messages: 0KB overhead (no lazy load)
 * - Markdown messages: ~65KB loaded on-demand
 * - First markdown triggers load, subsequent uses from cache
 */
export default function MessageContent({
  content,
  hasCodeBlocks,
  hasMarkdown,
}: MessageContentProps) {
  // Detect markdown/code patterns if not explicitly provided
  const needsMarkdown =
    hasMarkdown ||
    hasCodeBlocks ||
    content.includes('```') || // Code blocks
    content.includes('**') || // Bold
    content.includes('##') || // Headers
    content.includes('[') || // Links
    content.includes('|') // Tables

  // Plain text rendering (no lazy load overhead)
  if (!needsMarkdown) {
    return (
      <p className="text-gray-200 text-base font-normal leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    )
  }

  // Markdown rendering with lazy loading
  return (
    <ErrorBoundary componentName="message renderer">
      <Suspense fallback={<MessageSkeleton />}>
        <MarkdownRenderer content={content} />
      </Suspense>
    </ErrorBoundary>
  )
}

/**
 * detectMarkdownFeatures - Helper to analyze message content
 *
 * Used for optimization decisions (e.g., preloading on first code block)
 */
export function detectMarkdownFeatures(content: string) {
  return {
    hasCodeBlocks: content.includes('```'),
    hasInlineCode: content.includes('`'),
    hasBold: content.includes('**') || content.includes('__'),
    hasHeaders: /^#{1,6}\s/m.test(content),
    hasLinks: /\[.*?\]\(.*?\)/.test(content),
    hasTables: content.includes('|'),
    hasList: /^[\*\-\+]\s/m.test(content) || /^\d+\.\s/m.test(content),
  }
}
