'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useChatStore } from '@/store/chatStore'
import { useWebSocket, sendMessage } from '@/hooks/useWebSocket'
import { API_URL, getAgentColor } from '@/lib/constants'
import { format } from 'date-fns'
import type { Agent } from '@/lib/types'
import SystemPromptViewer from '@/components/SystemPromptViewer'
import Sidebar from '@/components/Sidebar'
import FileUpload from '@/components/FileUpload'

export default function AgentDM() {
  const params = useParams()
  const router = useRouter()
  const agentId = params.agentId as string

  const [input, setInput] = useState('')
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    channels,
    agents,
    messages,
    agentStatuses,
    dmChannels,
    setCurrentChannel,
    setMessages,
    setDMChannel,
    setCurrentView,
  } = useChatStore()

  // Initialize WebSocket connection
  useWebSocket()

  // Fetch agent and DM channel
  useEffect(() => {
    async function fetchAgentAndChannel() {
      try {
        // Fetch agent details
        const agentRes = await fetch(`${API_URL}/api/agents/${agentId}`)
        if (!agentRes.ok) {
          console.error('Agent not found')
          router.push('/')
          return
        }
        const agentData: Agent = await agentRes.json()
        setAgent(agentData)

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

        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching agent/channel:', error)
        setIsLoading(false)
      }
    }

    if (agentId) {
      fetchAgentAndChannel()
    }
  }, [agentId, setDMChannel, setCurrentChannel, setMessages, setCurrentView, router])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, dmChannels])

  const handleSendMessage = async () => {
    const dmChannel = dmChannels[agentId]
    if (!input.trim() || !dmChannel) return

    sendMessage(dmChannel.id, input)
    setInput('')
  }

  const dmChannel = dmChannels[agentId]
  const currentMessages = dmChannel ? messages[dmChannel.id] || [] : []
  const colors = agent ? getAgentColor(agent.name) : null
  const agentStatus = agent ? agentStatuses[agent.name] : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-deep-dark">
        <div className="text-neon-cyan text-xl animate-pulse">Loading DM...</div>
      </div>
    )
  }

  if (!agent || !dmChannel) {
    return (
      <div className="flex items-center justify-center h-screen bg-deep-dark">
        <div className="text-red-400 text-xl">Agent not found</div>
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
        activeAgentId={agentId}
        onChannelClick={(id) => {
          setCurrentChannel(id)
          router.push('/')
        }}
        onAgentClick={(id) => router.push(`/dm/${id}`)}
      />

      {/* System Prompt Viewer - LEFT side (collapsible) */}
      <SystemPromptViewer agentId={agentId} isOpen={true} />

      {/* Main DM Area */}
      <main className="flex flex-1 flex-col h-screen">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 px-6 py-4 border-b border-electric-purple/30 shadow-glow-purple flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Back button */}
            <button
              onClick={() => router.push('/')}
              className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>

            {/* Agent avatar and info */}
            <div className="relative">
              <div className={`size-10 rounded-full bg-gradient-to-br flex items-center justify-center ${
                colors ? `${colors.bg} ${colors.glow}` : 'from-gray-600 to-gray-800'
              }`}>
                <span className="text-white font-bold text-sm">
                  {agent.name.charAt(agent.name.indexOf('@') + 1).toUpperCase()}
                </span>
              </div>
              {agentStatus?.status === 'online' && (
                <div className="absolute bottom-0 right-0 size-3 bg-neon-cyan rounded-full border-2 border-deep-dark shadow-glow-cyan" />
              )}
            </div>

            <div className="flex min-w-72 flex-col gap-1">
              <p className={`text-xl font-bold leading-tight ${colors ? colors.text : 'text-gray-100'}`}>
                {agent.name}
              </p>
              <p className="text-gray-400 text-sm font-normal leading-normal">
                {agent.persona.role}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200">
              <span className="material-symbols-outlined">search</span>
            </button>
            <button className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200">
              <span className="material-symbols-outlined">info</span>
            </button>
          </div>
        </header>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto grid-bg-strong p-6 glowing-scrollbar">
          <div className="space-y-6 max-w-4xl mx-auto">
            {currentMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-12">
                <div className={`size-20 rounded-full bg-gradient-to-br ${colors?.bg} ${colors?.glow} flex items-center justify-center mb-4`}>
                  <span className="material-symbols-outlined text-4xl text-white">smart_toy</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Start a conversation with {agent.name}</h3>
                <p className="text-gray-400 max-w-md">
                  This is your direct message space with {agent.name}. Messages here are private and focused.
                </p>
              </div>
            ) : (
              currentMessages.map((msg, i) => {
                const isUser = msg.author_type === 'user'

                return (
                  <div key={msg.id} className={`flex gap-4 items-end message-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    {!isUser && (
                      <div className={`size-10 flex-shrink-0 rounded-full bg-gradient-to-br flex items-center justify-center ${
                        colors ? `${colors.bg} ${colors.glow}` : 'from-gray-600 to-gray-800'
                      }`}>
                        <span className="text-white font-bold text-sm">
                          {agent.name.charAt(agent.name.indexOf('@') + 1).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div className={`flex flex-1 flex-col items-stretch gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                      <p className={`text-base font-normal leading-normal max-w-[calc(100%-4rem)] rounded-xl border px-4 py-3 backdrop-blur-sm ${
                        isUser
                          ? 'border-hot-magenta/50 bg-hot-magenta/10 text-gray-200'
                          : `border-${colors?.text.replace('text-', '')}/50 bg-${colors?.text.replace('text-', '')}/10 text-gray-200`
                      }`}>
                        {msg.content}
                      </p>
                      <p className={`text-electric-purple text-xs font-normal leading-normal ${isUser ? 'mr-4' : 'ml-4'}`}>
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                )
              })
            )}

            {/* Typing Indicator */}
            {agentStatus?.status === 'thinking' && (
              <div className="flex items-center gap-2 text-sm">
                <span className={`${colors?.text} font-medium`}>{agent.name} is thinking</span>
                <div className="flex gap-1">
                  <span className={`w-2 h-2 rounded-full ${colors?.bg} typing-dot`} />
                  <span className={`w-2 h-2 rounded-full ${colors?.bg} typing-dot`} />
                  <span className={`w-2 h-2 rounded-full ${colors?.bg} typing-dot`} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Input */}
        <div className="px-6 py-4 mt-auto flex-shrink-0 border-t border-electric-purple/30">
          <div className="relative max-w-4xl mx-auto">
            <input
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg py-3 pl-5 pr-36 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all duration-200"
              placeholder={`Message ${agent.name}...`}
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
    </div>
  )
}
