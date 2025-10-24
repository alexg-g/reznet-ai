import { create } from 'zustand'
import type { Channel, Message, Agent, AgentStatus } from '@/lib/types'

interface ChatState {
  // Data
  channels: Channel[]
  messages: Record<string, Message[]>
  agents: Agent[]
  agentStatuses: Record<string, AgentStatus>
  currentChannelId: string | null

  // Actions
  setChannels: (channels: Channel[]) => void
  setCurrentChannel: (channelId: string) => void
  addMessage: (message: Message) => void
  setMessages: (channelId: string, messages: Message[]) => void
  setAgents: (agents: Agent[]) => void
  updateAgentStatus: (status: AgentStatus) => void
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  messages: {},
  agents: [],
  agentStatuses: {},
  currentChannelId: null,

  setChannels: (channels) => set({ channels }),

  setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),

  addMessage: (message) => set((state) => ({
    messages: {
      ...state.messages,
      [message.channel_id]: [
        ...(state.messages[message.channel_id] || []),
        message
      ]
    }
  })),

  setMessages: (channelId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: messages
    }
  })),

  setAgents: (agents) => set({ agents }),

  updateAgentStatus: (status) => set((state) => ({
    agentStatuses: {
      ...state.agentStatuses,
      [status.agent_name]: status
    }
  })),
}))
