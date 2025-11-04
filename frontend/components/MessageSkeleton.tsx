'use client'

/**
 * MessageSkeleton - Loading placeholder for lazy-loaded message content
 *
 * Provides visual feedback while heavy components (markdown, code highlighting)
 * are loading. Matches the message layout structure.
 */
export default function MessageSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      {/* Avatar skeleton */}
      <div className="size-10 flex-shrink-0 rounded-full bg-gray-700/50" />

      {/* Content skeleton */}
      <div className="flex flex-1 flex-col gap-2">
        {/* Author name skeleton */}
        <div className="h-5 w-32 bg-gray-700/50 rounded" />

        {/* Message content skeleton */}
        <div className="space-y-2">
          <div className="h-4 w-full bg-gray-700/50 rounded" />
          <div className="h-4 w-5/6 bg-gray-700/50 rounded" />
          <div className="h-4 w-4/6 bg-gray-700/50 rounded" />
        </div>
      </div>
    </div>
  )
}

/**
 * CodeBlockSkeleton - Loading placeholder for syntax-highlighted code
 *
 * Displays while Prism syntax highlighter loads
 */
export function CodeBlockSkeleton() {
  return (
    <div className="animate-pulse my-4">
      <div className="bg-gray-800/50 border border-electric-purple/30 rounded-lg p-4 space-y-2">
        <div className="h-4 w-3/4 bg-gray-700/50 rounded" />
        <div className="h-4 w-5/6 bg-gray-700/50 rounded" />
        <div className="h-4 w-2/3 bg-gray-700/50 rounded" />
        <div className="h-4 w-4/5 bg-gray-700/50 rounded" />
      </div>
    </div>
  )
}

/**
 * WorkflowSkeleton - Loading placeholder for workflow visualization
 *
 * Used when workflow progress components are lazy-loaded
 */
export function WorkflowSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4 bg-deep-dark/50 border border-electric-purple/30 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 bg-gray-700/50 rounded" />
        <div className="h-5 w-48 bg-gray-700/50 rounded" />
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-700/50 rounded-full overflow-hidden">
        <div className="h-full w-1/3 bg-neon-cyan/30 rounded-full" />
      </div>

      {/* Task items */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-4 h-4 bg-gray-700/50 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-gray-700/50 rounded" />
              <div className="h-3 w-1/2 bg-gray-700/50 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
