'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  componentName?: string
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * ErrorBoundary - Catches errors in lazy-loaded components
 *
 * Prevents entire app from crashing if a lazy-loaded component fails.
 * Shows user-friendly error message with cyberpunk styling.
 *
 * Usage:
 * <ErrorBoundary componentName="MarkdownRenderer">
 *   <LazyComponent />
 * </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default cyberpunk-themed error UI
      return (
        <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg my-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-red-400">error</span>
            <p className="text-red-400 font-semibold">
              Failed to load {this.props.componentName || 'component'}
            </p>
          </div>
          <p className="text-gray-400 text-sm">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 text-sm transition-colors duration-200"
          >
            Reload page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * LazyLoadError - Inline error for failed lazy loads
 *
 * Smaller, inline error component for individual failed components
 */
export function LazyLoadError({ componentName }: { componentName?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400">
      <span className="material-symbols-outlined text-base">warning</span>
      <span>Failed to load {componentName || 'content'}</span>
    </div>
  )
}
