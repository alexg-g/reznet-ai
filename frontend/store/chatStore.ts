import { create } from 'zustand'
import type { Channel, Message, Agent, AgentStatus, ViewContext, AgentSystemPrompt } from '@/lib/types'

interface ChatState {
  // Data
  channels: Channel[]
  messages: Record<string, Message[]>
  agents: Agent[]
  agentStatuses: Record<string, AgentStatus>
  currentChannelId: string | null

  // DM-specific state
  currentView: ViewContext | null
  dmChannels: Record<string, Channel>  // agent_id -> DM channel
  agentSystemPrompts: Record<string, AgentSystemPrompt>  // agent_id -> system prompt

  // Actions
  setChannels: (channels: Channel[]) => void
  setCurrentChannel: (channelId: string) => void
  addMessage: (message: Message) => void
  setMessages: (channelId: string, messages: Message[]) => void
  clearMessages: (channelId: string) => void
  setAgents: (agents: Agent[]) => void
  updateAgentStatus: (status: AgentStatus) => void

  // DM actions
  setCurrentView: (view: ViewContext | null) => void
  setDMChannel: (agentId: string, channel: Channel) => void
  setAgentSystemPrompt: (agentId: string, prompt: AgentSystemPrompt) => void
}

export const useChatStore = create<ChatState>((set) => ({
  channels: [],
  messages: {},
  agents: [],
  agentStatuses: {},
  currentChannelId: null,
  currentView: null,
  dmChannels: {},
  agentSystemPrompts: {},

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

  clearMessages: (channelId) => set((state) => ({
    messages: {
      ...state.messages,
      [channelId]: []
    }
  })),

  setAgents: (agents) => set({ agents }),

  updateAgentStatus: (status) => set((state) => ({
    agentStatuses: {
      ...state.agentStatuses,
      [status.agent_name]: status
    }
  })),

  // DM actions
  setCurrentView: (view) => set({ currentView: view }),

  setDMChannel: (agentId, channel) => set((state) => ({
    dmChannels: {
      ...state.dmChannels,
      [agentId]: channel
    }
  })),

  setAgentSystemPrompt: (agentId, prompt) => set((state) => ({
    agentSystemPrompts: {
      ...state.agentSystemPrompts,
      [agentId]: prompt
    }
  })),
}))
