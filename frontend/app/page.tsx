'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useChatStore } from '@/store/chatStore'
import { useWebSocket, sendMessage } from '@/hooks/useWebSocket'
import { API_URL, getAgentColor } from '@/lib/constants'
import { format } from 'date-fns'
import { preloadOnIdle, setupInteractionPreload } from '@/lib/componentPreloader'
import type { Channel, Agent } from '@/lib/types'

// Safe date formatter to prevent "Invalid time value" errors
const formatMessageTime = (timestamp: string | number | undefined): string => {
  if (!timestamp) return 'Just now'

  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Just now'
    return format(date, 'h:mm a')
  } catch {
    return 'Just now'
  }
}

// Extract avatar letter from agent name
const getAvatarLetter = (name: string | undefined): string => {
  if (!name) return '?'

  // Remove @ prefix if present
  const cleanName = name.startsWith('@') ? name.substring(1) : name

  // Return first letter uppercased
  return cleanName.charAt(0).toUpperCase() || '?'
}

// Dynamic imports for code splitting (Issue #47 - Performance Optimization)
// These components are loaded on-demand to reduce initial bundle size
// Sidebar is always visible, so keep it synchronous for better UX
import Sidebar from '@/components/Sidebar'
// ErrorMessage: Synchronous import for error handling (Issue #46)
import ErrorMessage from '@/components/ErrorMessage'

// MessageContent: Heavy component with markdown rendering (~65KB)
// Lazy loaded on-demand when messages contain markdown/code
// Plain text messages bypass this entirely (0KB overhead)
const MessageContent = dynamic(() => import('@/components/MessageContent'), {
  loading: () => (
    <div className="text-gray-200 text-base font-normal leading-relaxed animate-pulse">
      Loading message...
    </div>
  ),
  ssr: false,
})

// FileBrowser: Lazy load since it's only visible when toggled open
// Reduces initial JS by ~8KB (gzipped)
const FileBrowser = dynamic(() => import('@/components/FileBrowser'), {
  loading: () => null, // No loading state needed since it has a toggle button
  ssr: false, // Client-side only component
})

// FileUpload: Small component but rarely used, safe to lazy load
// Reduces initial JS by ~3KB (gzipped)
const FileUpload = dynamic(() => import('@/components/FileUpload'), {
  loading: () => (
    <button className="p-2 text-gray-400">
      <span className="material-symbols-outlined">attach_file</span>
    </button>
  ),
  ssr: false,
})

// HelpModal: Only loaded when user clicks help button
// Reduces initial JS by ~4KB (gzipped)
const HelpModal = dynamic(() => import('@/components/HelpModal'), {
  loading: () => null,
  ssr: false,
})

// SystemPromptViewer: Lazy load for DM mode
const SystemPromptViewer = dynamic(() => import('@/components/SystemPromptViewer'), {
  loading: () => null,
  ssr: false,
})

export default function Home() {
  const searchParams = useSearchParams()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [retryingMessages, setRetryingMessages] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    channels,
    messages,
    agents,
    agentStatuses,
    currentChannelId,
    currentView,
    dmChannels,
    setChannels,
    setCurrentChannel,
    setMessages,
    setAgents,
    setCurrentView,
    setDMChannel,
  } = useChatStore()

  // Initialize WebSocket connection
  useWebSocket()

  // Performance optimization: Preload heavy components during idle time
  // (Issue #47 - Performance Optimization)
  useEffect(() => {
    // Preload markdown renderer on idle time (after initial render)
    preloadOnIdle()

    // Setup interaction-based preloading (typing code blocks, etc.)
    const cleanup = setupInteractionPreload()

    return cleanup
  }, [])

  // Load agent DM channel and messages
  const loadAgentDM = async (agentId: string) => {
    try {
      // Fetch or create DM channel
      const dmChannelRes = await fetch(`${API_URL}/api/agents/${agentId}/dm-channel`)
      const dmChannelData = await dmChannelRes.json()

      // Store DM channel
      setDMChannel(agentId, dmChannelData)
      setCurrentChannel(dmChannelData.id)
      setCurrentView({ type: 'dm', id: agentId })

      // Fetch messages for this DM channel
      const messagesRes = await fetch(`${API_URL}/api/channels/${dmChannelData.id}/messages`)
      const messagesData = await messagesRes.json()
      setMessages(dmChannelData.id, messagesData)
    } catch (error) {
      console.error('Error loading agent DM:', error)
    }
  }

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch channels
        const channelsRes = await fetch(`${API_URL}/api/channels`)
        const channelsData: Channel[] = await channelsRes.json()
        setChannels(channelsData)

        // Fetch agents
        const agentsRes = await fetch(`${API_URL}/api/agents`)
        const agentsData: Agent[] = await agentsRes.json()
        setAgents(agentsData)

        // Initialize view from URL params or default to first channel
        const viewType = searchParams.get('view')
        const viewId = searchParams.get('id')

        if (viewType === 'dm' && viewId) {
          // Load DM view from URL
          const agent = agentsData.find(a => a.id === viewId)
          if (agent) {
            // Fetch or create DM channel
            const dmChannelRes = await fetch(`${API_URL}/api/agents/${viewId}/dm-channel`)
            const dmChannelData = await dmChannelRes.json()

            // Store DM channel
            setDMChannel(viewId, dmChannelData)
            setCurrentChannel(dmChannelData.id)
            setCurrentView({ type: 'dm', id: viewId })

            // Fetch messages for this DM channel
            const messagesRes = await fetch(`${API_URL}/api/channels/${dmChannelData.id}/messages`)
            const messagesData = await messagesRes.json()
            setMessages(dmChannelData.id, messagesData)
          } else {
            // Fallback to first channel
            if (channelsData.length > 0) {
              setCurrentChannel(channelsData[0].id)
              setCurrentView({ type: 'channel', id: channelsData[0].id })
            }
          }
        } else {
          // Default to first channel
          if (channelsData.length > 0 && !currentChannelId) {
            setCurrentChannel(channelsData[0].id)
            setCurrentView({ type: 'channel', id: channelsData[0].id })
          }
        }

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setIsLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Fetch messages when channel changes
  useEffect(() => {
    async function fetchMessages() {
      if (!currentChannelId) return

      try {
        const res = await fetch(`${API_URL}/api/channels/${currentChannelId}/messages`)
        const data = await res.json()
        setMessages(currentChannelId, data)
      } catch (error) {
        console.error('Error fetching messages:', error)
      }
    }

    fetchMessages()
  }, [currentChannelId, setMessages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentChannelId])

  // Handle channel click (from sidebar)
  const handleChannelClick = (channelId: string) => {
    setCurrentChannel(channelId)
    setCurrentView({ type: 'channel', id: channelId })

    // Update URL (optional, for bookmarking)
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'channel')
    url.searchParams.set('id', channelId)
    window.history.replaceState({}, '', url.toString())
  }

  // Handle agent click (from sidebar) - loads DM in same interface
  const handleAgentClick = async (agentId: string) => {
    await loadAgentDM(agentId)

    // Update URL (optional, for bookmarking)
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'dm')
    url.searchParams.set('id', agentId)
    window.history.replaceState({}, '', url.toString())
  }

  const handleSendMessage = async () => {
    if (!input.trim() || !currentChannelId) return

    // Check for /clear slash command
    if (input.trim() === '/clear') {
      try {
        const response = await fetch(`${API_URL}/api/channels/${currentChannelId}/clear`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          console.error('Failed to clear channel context')
        }
        // Context will be cleared via WebSocket event
      } catch (error) {
        console.error('Error clearing channel context:', error)
      }
      setInput('')
      return
    }

    const messageContent = input.trim()
    setInput('') // Clear input immediately for better UX

    try {
      await sendMessage(currentChannelId, messageContent)
      console.log('Message sent successfully')
    } catch (error) {
      console.error('Failed to send message:', error)
      // Restore input on failure
      setInput(messageContent)
      // TODO: Show error toast notification to user
      alert('Failed to send message. Please check your connection and try again.')
    }
  }

  // Retry failed agent response
  const handleRetryMessage = async (errorMessageId: string) => {
    if (!currentChannelId) return

    // Find the error message
    const errorMsg = currentMessages.find(m => m.id === errorMessageId)
    if (!errorMsg || !errorMsg.metadata?.in_reply_to) return

    // Find the original user message
    const originalMsg = currentMessages.find(m => m.id === errorMsg.metadata.in_reply_to)
    if (!originalMsg) return

    // Mark as retrying
    setRetryingMessages(prev => new Set(prev).add(errorMessageId))

    try {
      // Re-send the original user message
      sendMessage(currentChannelId, originalMsg.content)
    } catch (error) {
      console.error('Error retrying message:', error)
    } finally {
      // Remove from retrying set after a delay (allow for agent response)
      setTimeout(() => {
        setRetryingMessages(prev => {
          const newSet = new Set(prev)
          newSet.delete(errorMessageId)
          return newSet
        })
      }, 2000)
    }
  }

  // Determine current context (channel or DM)
  const isChannelView = currentView?.type === 'channel'
  const isDMView = currentView?.type === 'dm'

  const currentChannel = isChannelView
    ? channels.find(c => c.id === currentChannelId)
    : isDMView && currentView.id
      ? dmChannels[currentView.id]
      : null

  const currentAgent = isDMView && currentView.id
    ? agents.find(a => a.id === currentView.id)
    : null

  const currentMessages = currentChannelId ? messages[currentChannelId] || [] : []

  // Get thinking agents
  const thinkingAgents = Object.entries(agentStatuses)
    .filter(([_, status]) => status.status === 'thinking')
    .map(([name, _]) => name)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-deep-dark">
        <div className="text-neon-cyan text-xl animate-pulse">Loading RezNet AI...</div>
      </div>
    )
  }

  // Agent colors for DM view
  const agentColors = currentAgent ? getAgentColor(currentAgent.name) : null
  const agentStatus = currentAgent ? agentStatuses[currentAgent.name] : null

  return (
    <div className="flex h-screen w-full bg-deep-dark grid-bg-subtle">
      {/* Sidebar */}
      <Sidebar
        channels={channels}
        agents={agents}
        agentStatuses={agentStatuses}
        activeChannelId={isChannelView ? currentChannelId : null}
        activeAgentId={isDMView ? currentView?.id : null}
        onChannelClick={handleChannelClick}
        onAgentClick={handleAgentClick}
      />

      {/* System Prompt Viewer - Only visible in DM mode */}
      {isDMView && currentAgent && (
        <SystemPromptViewer agentId={currentAgent.id} isOpen={false} />
      )}

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col h-screen">
        {/* Header - Different for channel vs DM */}
        {isChannelView ? (
          // Channel Header
          <header className="flex items-center justify-between gap-2 px-6 py-3 border-b border-electric-purple/30 shadow-glow-purple flex-shrink-0">
            <div className="flex min-w-72 flex-col gap-1">
              <p className="text-white tracking-wide text-2xl font-bold leading-tight flex items-center gap-2">
                <span className="text-neon-cyan">#</span>
                {currentChannel?.name || 'Select a channel'}
              </p>
              {currentChannel?.topic && (
                <p className="text-gray-400 text-sm font-normal leading-normal">
                  {currentChannel.topic}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200">
                <span className="material-symbols-outlined">search</span>
              </button>
              <button
                onClick={() => setIsHelpOpen(true)}
                className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200"
                title="Help & Usage Guide"
              >
                <span className="material-symbols-outlined">info</span>
              </button>
            </div>
          </header>
        ) : isDMView && currentAgent ? (
          // DM Header
          <header className="flex items-center justify-between gap-2 px-6 py-4 border-b border-electric-purple/30 shadow-glow-purple flex-shrink-0">
            <div className="flex items-center gap-4">
              {/* Agent avatar and info */}
              <div className="relative">
                <div className={`size-10 rounded-full bg-gradient-to-br flex items-center justify-center ${
                  agentColors ? `${agentColors.bg} ${agentColors.glow}` : 'from-gray-600 to-gray-800'
                }`}>
                  <span className="text-white font-bold text-sm">
                    {getAvatarLetter(currentAgent.name)}
                  </span>
                </div>
                {agentStatus?.status === 'online' && (
                  <div className="absolute bottom-0 right-0 size-3 bg-neon-cyan rounded-full border-2 border-deep-dark shadow-glow-cyan" />
                )}
              </div>

              <div className="flex min-w-72 flex-col gap-1">
                <p className={`text-xl font-bold leading-tight ${agentColors ? agentColors.text : 'text-gray-100'}`}>
                  {currentAgent.name}
                </p>
                <p className="text-gray-400 text-sm font-normal leading-normal">
                  {currentAgent.persona.role}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200">
                <span className="material-symbols-outlined">search</span>
              </button>
              <button
                onClick={() => setIsHelpOpen(true)}
                className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200"
                title="Help & Usage Guide"
              >
                <span className="material-symbols-outlined">info</span>
              </button>
            </div>
          </header>
        ) : null}

        {/* Message Feed - Different rendering for channel vs DM */}
        <div className="flex-1 overflow-y-auto grid-bg-strong p-6 glowing-scrollbar">
          {isDMView && currentMessages.length === 0 && currentAgent ? (
            // Empty DM state
            <div className="flex flex-col items-center justify-center h-full text-center p-12 max-w-4xl mx-auto">
              <div className={`size-20 rounded-full bg-gradient-to-br ${agentColors?.bg} ${agentColors?.glow} flex items-center justify-center mb-4`}>
                <span className="material-symbols-outlined text-4xl text-white">smart_toy</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Start a conversation with {currentAgent.name}</h3>
              <p className="text-gray-400 max-w-md">
                This is your direct message space with {currentAgent.name}. Messages here are private and focused.
              </p>
            </div>
          ) : (
            // Messages (channel or DM)
            <div className={`space-y-6 ${isDMView ? 'max-w-4xl mx-auto' : ''}`}>
              {currentMessages.map((msg, i) => {
                const colors = msg.author_type === 'agent' ? getAgentColor(msg.author_name) : null
                const isError = msg.metadata?.error === true
                const isUser = msg.author_type === 'user'

                // Render error messages with ErrorMessage component
                if (isError) {
                  return (
                    <ErrorMessage
                      key={msg.id}
                      error={{
                        message: msg.content,
                        retryable: msg.metadata?.retryable || false,
                        error_type: msg.metadata?.error_type,
                        provider: msg.metadata?.provider,
                        model: msg.metadata?.model
                      }}
                      agentName={msg.author_name}
                      agentColor={colors?.hex || '#FF6B00'}
                      onRetry={() => handleRetryMessage(msg.id)}
                      isRetrying={retryingMessages.has(msg.id)}
                    />
                  )
                }

                // DM-style messages (bubble layout)
                if (isDMView) {
                  return (
                    <div key={msg.id} className={`flex gap-4 items-end message-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
                      {/* Avatar (only for agent messages) */}
                      {!isUser && (
                        <div className={`size-10 flex-shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center ${
                          colors ? `${colors.bg} ${colors.glow}` : 'from-gray-600 to-gray-800'
                        }`}>
                          <span className="text-white font-bold text-sm">
                            {getAvatarLetter(msg.author_name)}
                          </span>
                        </div>
                      )}

                      {/* Message bubble */}
                      <div className={`flex flex-1 flex-col items-stretch gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[calc(100%-4rem)] rounded-xl border px-4 py-3 backdrop-blur-sm ${
                          isUser
                            ? 'border-hot-magenta/50 bg-hot-magenta/10 text-gray-200'
                            : `border-${colors?.text.replace('text-', '')}/50 bg-${colors?.text.replace('text-', '')}/10 text-gray-200`
                        }`}>
                          {msg.content === '' && msg.metadata?.streaming ? (
                            <div className="flex gap-1 items-center py-1">
                              <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                              <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                              <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                            </div>
                          ) : (
                            <MessageContent content={msg.content} />
                          )}
                        </div>
                        <p className={`text-electric-purple text-xs font-normal leading-normal ${isUser ? 'mr-4' : 'ml-4'}`}>
                          {formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                }

                // Channel-style messages (standard layout)
                return (
                  <div key={msg.id} className="flex gap-4 message-fade-in">
                    <div className={`size-10 flex-shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center ${
                      colors ? `${colors.bg} ${colors.glow}` : 'from-gray-600 to-gray-800'
                    }`}>
                      <span className="text-white font-bold text-sm">
                        {getAvatarLetter(msg.author_name)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col items-stretch gap-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className={`text-base font-bold leading-tight ${
                          colors ? colors.text : 'text-gray-100'
                        }`}>
                          {msg.author_name}
                        </p>
                        <p className="text-gray-500 text-xs font-normal leading-normal">
                          {formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                      {/* Smart message rendering with lazy-loaded markdown support */}
                      {msg.content === '' && msg.metadata?.streaming ? (
                        <div className="flex gap-1 items-center py-1">
                          <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                          <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                          <span className="typing-dot w-2 h-2 bg-current rounded-full"></span>
                        </div>
                      ) : (
                        <MessageContent content={msg.content} />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Typing Indicators */}
              {thinkingAgents.map((agentName) => {
                const colors = getAgentColor(agentName)
                return (
                  <div key={agentName} className="flex items-center gap-2 text-sm">
                    <span className={`${colors.text} font-medium`}>{agentName} is thinking</span>
                    <div className="flex gap-1">
                      <span className={`w-2 h-2 rounded-full ${colors.bg} typing-dot`} />
                      <span className={`w-2 h-2 rounded-full ${colors.bg} typing-dot`} />
                      <span className={`w-2 h-2 rounded-full ${colors.bg} typing-dot`} />
                    </div>
                  </div>
                )
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="px-6 py-4 mt-auto flex-shrink-0 border-t border-electric-purple/30">
          <div className={`relative ${isDMView ? 'max-w-4xl mx-auto' : ''}`}>
            <input
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg py-3 pl-5 pr-36 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all duration-200"
              placeholder={
                isDMView && currentAgent
                  ? `Message ${currentAgent.name}...`
                  : `Message #${currentChannel?.name || 'channel'} (mention @backend, @frontend, etc.)`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-1">
              <FileUpload />
              <button className="p-2 text-gray-400 hover:text-neon-cyan transition-colors duration-200">
                <span className="material-symbols-outlined">sentiment_satisfied</span>
              </button>
              <button
                onClick={handleSendMessage}
                className="p-2 px-3 bg-neon-cyan text-black rounded-md hover:bg-white transition-colors duration-200 shadow-glow-cyan font-bold"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Workspace File Browser - Only in channel view */}
      {isChannelView && <FileBrowser />}

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  )
}
