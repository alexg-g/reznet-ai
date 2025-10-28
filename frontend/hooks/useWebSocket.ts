'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/lib/constants'
import { useChatStore } from '@/store/chatStore'
import type { Message, AgentStatus } from '@/lib/types'

let socket: Socket | null = null

export function useWebSocket() {
  const { addMessage, updateAgentStatus, clearMessages } = useChatStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    // Initialize socket connection
    if (!socketRef.current) {
      console.log('Connecting to WebSocket:', WS_URL)
      socketRef.current = io(WS_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      socket = socketRef.current

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

      socket.on('context_cleared', (data: { channel_id: string; message: string }) => {
        console.log('Context cleared:', data)
        clearMessages(data.channel_id)

        // Add system message to indicate context was cleared
        addMessage({
          id: `system-${Date.now()}`,
          channel_id: data.channel_id,
          author_id: null,
          author_type: 'system',
          author_name: 'System',
          content: data.message,
          thread_id: null,
          created_at: new Date().toISOString(),
          metadata: {}
        })
      })

      socket.on('disconnect', () => {
        console.log('❌ WebSocket disconnected')
      })

      socket.on('error', (error) => {
        console.error('WebSocket error:', error)
      })
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        socket = null
      }
    }
  }, [addMessage, updateAgentStatus, clearMessages])

  return socketRef.current
}

export function sendMessage(channelId: string, content: string) {
  if (socket && socket.connected) {
    console.log('Sending message:', { channelId, content })
    socket.emit('message_send', {
      channel_id: channelId,
      content,
      author_name: 'Developer'
    })
  } else {
    console.error('Socket not connected')
  }
}
