'use client'

import { getAgentColor } from '@/lib/constants'
import type { Channel, Agent, AgentStatus } from '@/lib/types'

interface SidebarProps {
  channels: Channel[]
  agents: Agent[]
  agentStatuses: Record<string, AgentStatus>
  activeChannelId?: string | null
  activeAgentId?: string | null
  onChannelClick: (channelId: string) => void
  onAgentClick: (agentId: string) => void
}

export default function Sidebar({
  channels,
  agents,
  agentStatuses,
  activeChannelId,
  activeAgentId,
  onChannelClick,
  onAgentClick,
}: SidebarProps) {
  // Filter out DM channels (they're just database storage, not UI elements)
  const regularChannels = channels.filter(ch => !ch.name.startsWith('dm-'))

  return (
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

        {/* Channels & Agents */}
        <div className="flex-grow flex flex-col gap-1 overflow-y-auto glowing-scrollbar">
          {/* Channels Section */}
          <p className="text-electric-purple text-xs font-bold uppercase tracking-widest px-3 py-2">
            Channels
          </p>
          {regularChannels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onChannelClick(channel.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded transition-colors duration-200 relative ${
                activeChannelId === channel.id
                  ? 'bg-electric-purple/20 text-white'
                  : 'text-gray-300 hover:bg-electric-purple/10 hover:text-white'
              }`}
            >
              {activeChannelId === channel.id && (
                <div className="absolute left-0 top-0 h-full w-1 bg-neon-cyan rounded-r-full shadow-glow-cyan" />
              )}
              <span className={`material-symbols-outlined ${
                activeChannelId === channel.id ? 'text-neon-cyan' : 'text-electric-purple'
              }`}>
                tag
              </span>
              <span className="text-sm font-medium">{channel.name}</span>
            </button>
          ))}

          {/* AI Agents Section */}
          <p className="text-electric-purple text-xs font-bold uppercase tracking-widest px-3 pt-6 pb-2">
            AI Agents
          </p>
          {agents.map((agent) => {
            const colors = getAgentColor(agent.name)
            const status = agentStatuses[agent.name]
            const isActive = activeAgentId === agent.id

            return (
              <button
                key={agent.id}
                onClick={() => onAgentClick(agent.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded transition-colors duration-200 cursor-pointer w-full relative ${
                  isActive
                    ? 'bg-electric-purple/20 text-white'
                    : 'text-gray-300 hover:bg-electric-purple/10 hover:text-white'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 h-full w-1 bg-neon-cyan rounded-r-full shadow-glow-cyan" />
                )}
                <span className={`material-symbols-outlined ${colors.text}`}>
                  smart_toy
                </span>
                <span className="text-sm font-medium">{agent.name}</span>
                {status?.status === 'thinking' && (
                  <span className={`ml-auto w-2 h-2 rounded-full ${colors.bg} animate-pulse`} />
                )}
              </button>
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
  )
}
