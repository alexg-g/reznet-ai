'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chatStore'
import { useWebSocket, sendMessage } from '@/hooks/useWebSocket'
import { API_URL, getAgentColor } from '@/lib/constants'
import { format } from 'date-fns'
import type { Channel, Agent } from '@/lib/types'
import FileBrowser from '@/components/FileBrowser'
import Sidebar from '@/components/Sidebar'
import FileUpload from '@/components/FileUpload'
import HelpModal from '@/components/HelpModal'
import ErrorMessage from '@/components/ErrorMessage'

export default function Home() {
  const router = useRouter()
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
    setChannels,
    setCurrentChannel,
    setMessages,
    setAgents,
  } = useChatStore()

  // Initialize WebSocket connection
  useWebSocket()

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch channels
        const channelsRes = await fetch(`${API_URL}/api/channels`)
        const channelsData: Channel[] = await channelsRes.json()
        setChannels(channelsData)

        // Set first channel as current
        if (channelsData.length > 0 && !currentChannelId) {
          setCurrentChannel(channelsData[0].id)
        }

        // Fetch agents
        const agentsRes = await fetch(`${API_URL}/api/agents`)
        const agentsData: Agent[] = await agentsRes.json()
        setAgents(agentsData)

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching data:', error)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [setChannels, setCurrentChannel, setAgents, currentChannelId])

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

    sendMessage(currentChannelId, input)
    setInput('')
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

  const currentChannel = channels.find(c => c.id === currentChannelId)
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

  return (
    <div className="flex h-screen w-full bg-deep-dark grid-bg-subtle">
      {/* Sidebar */}
      <Sidebar
        channels={channels}
        agents={agents}
        agentStatuses={agentStatuses}
        activeChannelId={currentChannelId}
        onChannelClick={(id) => setCurrentChannel(id)}
        onAgentClick={(id) => router.push(`/dm/${id}`)}
      />

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col h-screen">
        {/* Header */}
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

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto grid-bg-strong p-6 glowing-scrollbar">
          <div className="space-y-6">
            {currentMessages.map((msg, i) => {
              const colors = msg.author_type === 'agent' ? getAgentColor(msg.author_name) : null
              const isError = msg.metadata?.error === true

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

              // Render normal messages
              return (
                <div key={msg.id} className="flex gap-4 message-fade-in">
                  <div className={`size-10 flex-shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center ${
                    colors ? `${colors.bg} ${colors.glow}` : 'from-gray-600 to-gray-800'
                  }`}>
                    <span className="text-white font-bold text-sm">
                      {msg.author_name.charAt(msg.author_name.indexOf('@') + 1).toUpperCase()}
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
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </p>
                    </div>
                    <p className="text-gray-200 text-base font-normal leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
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
        </div>

        {/* Message Input */}
        <div className="px-6 py-4 mt-auto flex-shrink-0 border-t border-electric-purple/30">
          <div className="relative">
            <input
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg py-3 pl-5 pr-36 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all duration-200"
              placeholder={`Message #${currentChannel?.name || 'channel'} (mention @backend, @frontend, etc.)`}
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

      {/* Workspace File Browser */}
      <FileBrowser />

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  )
}
