# Frontend Build Guide - RezNet AI

## ✅ What's Already Complete

### Configuration Files (All Done)
- ✅ `package.json` - All dependencies configured
- ✅ `tailwind.config.ts` - Cyberpunk theme with neon colors
- ✅ `tsconfig.json` - TypeScript configuration
- ✅ `next.config.js` - Next.js configuration
- ✅ `postcss.config.js` - PostCSS for Tailwind
- ✅ `app/globals.css` - Global styles with grid backgrounds, glows, animations

### Theme System
**Colors Configured**:
- Neon Cyan: `#00F6FF` (for @backend agent)
- Hot Magenta: `#FF00F7` (for @frontend agent)
- Electric Purple: `#9D00FF` (for @orchestrator agent)
- Lime Green: `#00FF00` (for @qa agent)
- Orange Neon: `#FF8C00` (for @devops agent)

**Effects Ready**:
- Glow shadows for all colors
- Grid backgrounds (subtle/normal/strong variants)
- Typing animations
- Fade-in animations
- Custom neon scrollbar

## 🚀 Next Steps to Complete

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Create Required Files

I'll provide the essential code for each file below. Create these in order:

---

## Required Files & Code

### `lib/constants.ts`
```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

export const AGENT_COLORS = {
  '@orchestrator': {
    text: 'text-electric-purple',
    glow: 'shadow-glow-purple',
    bg: 'bg-electric-purple/20',
    border: 'border-electric-purple',
    hover: 'hover:bg-electric-purple/10'
  },
  '@backend': {
    text: 'text-neon-cyan',
    glow: 'shadow-glow-cyan',
    bg: 'bg-neon-cyan/20',
    border: 'border-neon-cyan',
    hover: 'hover:bg-neon-cyan/10'
  },
  '@frontend': {
    text: 'text-hot-magenta',
    glow: 'shadow-glow-magenta',
    bg: 'bg-hot-magenta/20',
    border: 'border-hot-magenta',
    hover: 'hover:bg-hot-magenta/10'
  },
  '@qa': {
    text: 'text-lime-green',
    glow: 'shadow-glow-lime',
    bg: 'bg-lime-green/20',
    border: 'border-lime-green',
    hover: 'hover:bg-lime-green/10'
  },
  '@devops': {
    text: 'text-orange-neon',
    glow: 'shadow-glow-orange',
    bg: 'bg-orange-neon/20',
    border: 'border-orange-neon',
    hover: 'hover:bg-orange-neon/10'
  }
} as const

export type AgentName = keyof typeof AGENT_COLORS
```

---

### `lib/types.ts`
```typescript
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
  author_type: 'user' | 'agent'
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
  status: 'online' | 'thinking' | 'offline'
  current_task?: string
}
```

---

### `store/chatStore.ts` (Zustand State Management)
```typescript
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
```

---

### `hooks/useWebSocket.ts`
```typescript
'use client'

import { useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/lib/constants'
import { useChatStore } from '@/store/chatStore'
import type { Message, AgentStatus } from '@/lib/types'

let socket: Socket | null = null

export function useWebSocket() {
  const { addMessage, updateAgentStatus } = useChatStore()

  useEffect(() => {
    // Initialize socket connection
    socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
    })

    socket.on('connect', () => {
      console.log('✅ WebSocket connected')
    })

    socket.on('connection_established', (data) => {
      console.log('Connection established:', data)
    })

    socket.on('message_new', (data: Message) => {
      console.log('New message:', data)
      addMessage(data)
    })

    socket.on('agent_status', (data: AgentStatus) => {
      console.log('Agent status update:', data)
      updateAgentStatus(data)
    })

    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected')
    })

    socket.on('error', (error) => {
      console.error('WebSocket error:', error)
    })

    return () => {
      if (socket) {
        socket.disconnect()
        socket = null
      }
    }
  }, [addMessage, updateAgentStatus])

  return socket
}

export function sendMessage(channelId: string, content: string) {
  if (socket && socket.connected) {
    socket.emit('message_send', {
      channel_id: channelId,
      content,
      author_name: 'Developer'
    })
  } else {
    console.error('Socket not connected')
  }
}
```

---

## Quick Component Stubs

For the main chat interface, you can use the simple version from NEXT_STEPS.md and enhance it with:

1. **Agent color coding** - Use AGENT_COLORS from constants
2. **Typing indicators** - Show when agentStatuses[name].status === 'thinking'
3. **Markdown rendering** - Use react-markdown component
4. **Code highlighting** - Use prism-react-renderer for code blocks

---

## 🎨 Styling Quick Reference

### Grid Backgrounds
```tsx
<div className="grid-bg">         {/* Normal grid */}
<div className="grid-bg-subtle">  {/* Very subtle */}
<div className="grid-bg-strong">  {/* Message area */}
```

### Agent Colors
```tsx
import { AGENT_COLORS } from '@/lib/constants'

<span className={AGENT_COLORS['@backend'].text}>
  @backend
</span>
```

### Glowing Effects
```tsx
<div className="shadow-glow-cyan">      {/* Cyan glow */}
<div className="shadow-glow-magenta">   {/* Magenta glow */}
<div className="shadow-glow-purple">    {/* Purple glow */}
```

### Typing Indicator
```tsx
<div className="flex items-center gap-2">
  <span className="text-neon-cyan">@backend is thinking</span>
  <div className="flex gap-1">
    <span className="w-2 h-2 rounded-full bg-neon-cyan typing-dot" />
    <span className="w-2 h-2 rounded-full bg-neon-cyan typing-dot" />
    <span className="w-2 h-2 rounded-full bg-neon-cyan typing-dot" />
  </div>
</div>
```

---

## 🏃 Running the Frontend

```bash
# In /frontend directory
npm run dev

# Open browser
http://localhost:3000
```

---

## 🔗 Integration with Backend

The WebSocket hook (`useWebSocket`) automatically connects to your backend.

**Make sure backend is running**:
```bash
./scripts/start.sh
```

Then messages will flow:
1. User types in frontend
2. Message sent via Socket.IO
3. Backend processes with agents
4. Agent responses come back via WebSocket
5. Frontend displays with proper colors/styling

---

## 💡 Tips

1. **Start Simple**: Get basic chat working first, then add markdown/code highlighting
2. **Test WebSocket**: Open browser console to see connection logs
3. **Agent Colors**: Each agent automatically gets their color from AGENT_COLORS
4. **Typing Indicators**: Show/hide based on agent_status events
5. **Grid Background**: Use `grid-bg-subtle` on sidebar, `grid-bg-strong` on messages

---

## ✨ Optional Enhancements

Once basic chat works:
- Add agent mention autocomplete (show dropdown on @)
- Implement message threads
- Add file upload for context
- Create agent status panel showing all agents
- Add keyboard shortcuts
- Implement message search

---

## 🆘 Need Help?

1. **WebSocket not connecting**: Check backend is running on port 8000
2. **Colors not showing**: Make sure Tailwind config is loaded
3. **Grid not visible**: Check opacity levels in globals.css
4. **Fonts not loading**: Verify Google Fonts link in globals.css

The foundation is solid - just build the components and connect to the backend!