'use client'

import { useEffect, useState, useRef } from 'react'
import { useChatStore } from '@/store/chatStore'
import { useWebSocket, sendMessage } from '@/hooks/useWebSocket'
import { API_URL, getAgentColor } from '@/lib/constants'
import { format } from 'date-fns'
import type { Channel, Agent } from '@/lib/types'

export default function Home() {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
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

  const handleSendMessage = () => {
    if (!input.trim() || !currentChannelId) return

    sendMessage(currentChannelId, input)
    setInput('')
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
      <aside className="flex h-full w-64 flex-shrink-0 flex-col bg-deep-dark/80 backdrop-blur-sm border-r border-electric-purple/30">
        <div className="flex h-full flex-col p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6 p-2">
            <div className="bg-gradient-to-br from-neon-cyan to-electric-purple rounded-lg size-10 shadow-glow-cyan flex items-center justify-center">
              <span className="text-white font-bold text-xl">R</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-white text-base font-bold leading-normal">RezNet AI</h1>
              <p className="text-neon-cyan/80 text-sm font-normal leading-normal">Online</p>
            </div>
          </div>

          {/* Channels */}
          <div className="flex-grow flex flex-col gap-1 overflow-y-auto glowing-scrollbar">
            <p className="text-electric-purple text-xs font-bold uppercase tracking-widest px-3 py-2">
              Channels
            </p>
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setCurrentChannel(channel.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded transition-colors duration-200 relative ${
                  currentChannelId === channel.id
                    ? 'bg-electric-purple/20 text-white'
                    : 'text-gray-300 hover:bg-electric-purple/10 hover:text-white'
                }`}
              >
                {currentChannelId === channel.id && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-neon-cyan rounded-r-full shadow-glow-cyan" />
                )}
                <span className={`material-symbols-outlined ${
                  currentChannelId === channel.id ? 'text-neon-cyan' : 'text-electric-purple'
                }`}>
                  tag
                </span>
                <span className="text-sm font-medium">{channel.name}</span>
              </button>
            ))}

            {/* Agents Section */}
            <p className="text-electric-purple text-xs font-bold uppercase tracking-widest px-3 pt-6 pb-2">
              AI Agents
            </p>
            {agents.map((agent) => {
              const colors = getAgentColor(agent.name)
              const status = agentStatuses[agent.name]
              return (
                <div
                  key={agent.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-gray-300`}
                >
                  <span className={`material-symbols-outlined ${colors.text}`}>
                    smart_toy
                  </span>
                  <span className="text-sm font-medium">{agent.name}</span>
                  {status?.status === 'thinking' && (
                    <span className={`ml-auto w-2 h-2 rounded-full ${colors.bg} animate-pulse`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* User Profile */}
          <div className="flex-shrink-0 mt-auto border-t border-electric-purple/30 pt-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="size-10 rounded-full bg-gradient-to-br from-hot-magenta to-neon-cyan shadow-glow-cyan flex items-center justify-center">
                  <span className="text-white font-bold">D</span>
                </div>
                <div className="absolute bottom-0 right-0 size-3 bg-neon-cyan rounded-full border-2 border-deep-dark shadow-glow-cyan" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-white text-base font-medium leading-normal">Developer</h1>
                <p className="text-neon-cyan/80 text-sm font-normal leading-normal">Online</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

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
            <button className="p-2 text-gray-300 hover:text-neon-cyan transition-colors duration-200">
              <span className="material-symbols-outlined">info</span>
            </button>
          </div>
        </header>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto grid-bg-strong p-6 glowing-scrollbar">
          <div className="space-y-6">
            {currentMessages.map((msg, i) => {
              const colors = msg.author_type === 'agent' ? getAgentColor(msg.author_name) : null

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
              <button className="p-2 text-gray-400 hover:text-neon-cyan transition-colors duration-200">
                <span className="material-symbols-outlined">add_circle</span>
              </button>
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
