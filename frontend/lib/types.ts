export interface Channel {
  id: string
  name: string
  topic: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  channel_id: string
  author_id: string | null
  author_type: 'user' | 'agent' | 'system'
  author_name: string
  content: string
  thread_id: string | null
  metadata: Record<string, any>
  created_at: string
}

export interface Agent {
  id: string
  name: string
  agent_type: string
  persona: {
    role: string
    goal: string
    backstory: string
    capabilities?: string[]
  }
  config: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AgentStatus {
  agent_name: string
  status: 'online' | 'thinking' | 'offline' | 'working'
  current_task?: string
}

export interface ViewContext {
  type: 'channel' | 'dm'
  id: string  // channel_id or agent_id
}

export interface AgentSystemPrompt {
  agent_id: string
  agent_name: string
  agent_type: string
  system_prompt: string
  provider: string
  model: string
  tools_enabled: boolean
}
