'use client'

import { useState, useEffect } from 'react'
import { API_URL } from '@/lib/constants'
import type { AgentSystemPrompt } from '@/lib/types'

interface SystemPromptViewerProps {
  agentId: string
  isOpen: boolean
}

export default function SystemPromptViewer({ agentId, isOpen }: SystemPromptViewerProps) {
  const [systemPrompt, setSystemPrompt] = useState<AgentSystemPrompt | null>(null)
  const [loading, setLoading] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(!isOpen)

  // Fetch system prompt when component mounts or agentId changes
  useEffect(() => {
    if (!agentId) return

    const fetchSystemPrompt = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/agents/${agentId}/system-prompt`)
        if (response.ok) {
          const data = await response.json()
          setSystemPrompt(data)
        }
      } catch (error) {
        console.error('Error fetching system prompt:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSystemPrompt()
  }, [agentId])

  // Sync isCollapsed with isOpen prop
  useEffect(() => {
    setIsCollapsed(!isOpen)
  }, [isOpen])

  return (
    <>
      {/* Toggle Button - RIGHT edge of screen */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-electric-purple/20 backdrop-blur-sm border-l border-t border-b border-electric-purple/30 rounded-l-lg px-2 py-4 text-neon-cyan hover:bg-electric-purple/30 transition-colors"
        title={isCollapsed ? 'Show system prompt' : 'Hide system prompt'}
      >
        <span className="material-symbols-outlined text-sm">
          {isCollapsed ? 'chevron_left' : 'chevron_right'}
        </span>
      </button>

      {/* System Prompt Panel - RIGHT side */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-deep-dark/95 backdrop-blur-sm border-l border-electric-purple/30 transform transition-transform duration-300 ease-in-out z-30 ${
          isCollapsed ? 'translate-x-full' : 'translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-electric-purple/30">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-electric-purple">code</span>
            <h2 className="text-white font-semibold">System Prompt</h2>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-electric-purple hover:text-neon-cyan transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* System Prompt Content */}
        <div className="overflow-y-auto h-[calc(100%-4rem)] glowing-scrollbar">
          {loading && !systemPrompt ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm">Loading system prompt...</p>
              </div>
            </div>
          ) : systemPrompt ? (
            <div className="p-4">
              {/* Agent Info */}
              <div className="mb-4 pb-4 border-b border-electric-purple/20">
                <h3 className="text-neon-cyan font-semibold mb-2">{systemPrompt.agent_name}</h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p><span className="text-electric-purple">Type:</span> {systemPrompt.agent_type}</p>
                  <p><span className="text-electric-purple">Provider:</span> {systemPrompt.provider}</p>
                  <p><span className="text-electric-purple">Model:</span> {systemPrompt.model}</p>
                  <p><span className="text-electric-purple">Tools:</span> {systemPrompt.tools_enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>

              {/* Full System Prompt */}
              <div>
                <h4 className="text-sm text-electric-purple font-semibold mb-2 uppercase tracking-wider">
                  Full System Prompt
                </h4>
                <div className="bg-black/30 border border-electric-purple/20 rounded-lg p-4 font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap break-words">
                  {systemPrompt.system_prompt}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">info</span>
                <p className="text-sm">No system prompt available</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {systemPrompt && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-deep-dark/50 backdrop-blur-sm border-t border-electric-purple/30">
            <p className="text-xs text-gray-500">
              Read-only view of agent system prompt
            </p>
          </div>
        )}
      </div>
    </>
  )
}
