'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { WS_URL } from '@/lib/constants'
import { useChatStore } from '@/store/chatStore'
import type { Message, AgentStatus } from '@/lib/types'

// Global singleton socket - persists across page navigations
let socket: Socket | null = null
let isInitialized = false

export function useWebSocket() {
  const { addMessage, updateMessage, updateAgentStatus, clearMessages } = useChatStore()
  const socketRef = useRef<Socket | null>(null)

  // Store the latest callbacks in a ref to prevent stale closures
  const callbacksRef = useRef({ addMessage, updateMessage, updateAgentStatus, clearMessages })

  // Update the ref whenever callbacks change
  useEffect(() => {
    callbacksRef.current = { addMessage, updateMessage, updateAgentStatus, clearMessages }
  }, [addMessage, updateMessage, updateAgentStatus, clearMessages])

  useEffect(() => {
    // Initialize socket connection ONCE globally
    // Do NOT disconnect on unmount - this is a singleton that persists across navigation
    if (!isInitialized) {
      console.log('Initializing global WebSocket connection:', WS_URL)
      socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })

      socketRef.current = socket
      isInitialized = true

      socket.on('connect', () => {
        console.log('✅ WebSocket connected')
      })

      socket.on('connection_established', (data) => {
        console.log('Connection established:', data)
      })

      socket.on('message_new', (data: any) => {
        console.log('New message:', data)

        // Transform optimized field names to full field names
        const message: Message = {
          id: data.id || data.mid,
          content: data.content || data.c || '',
          channel_id: data.channel_id || data.cid,
          author_id: data.author_id || null,
          author_name: data.author_name || data.an,
          author_type: data.author_type || data.at,
          metadata: data.metadata || data.m || {},
          thread_id: data.thread_id || null,
          created_at: data.created_at || data.ca || data.ts || new Date().toISOString()
        }

        callbacksRef.current.addMessage(message)
      })

      socket.on('message_stream', (data: any) => {
        console.log('📨 Message stream chunk:', data)
        // Handle both optimized and full field names
        const messageId = data.mid || data.message_id
        const chunk = data.ch || data.chunk
        const isFinal = data.fin || data.is_final

        // For now, just log to verify events are received
        // Full incremental streaming UI can be added later
      })

      socket.on('message_update', (data: any) => {
        console.log('✅ Message update (final):', data)
        // Handle both optimized and full field names
        const message: Message = {
          id: data.id || data.mid,
          content: data.content || data.c,
          channel_id: data.channel_id || data.cid,
          author_id: data.author_id || null,
          author_name: data.author_name || data.a,
          author_type: data.author_type || data.at,
          metadata: data.metadata || data.m || {},
          thread_id: data.thread_id || null,
          created_at: data.created_at || data.ca || new Date().toISOString()
        }

        // Update the message in the store
        callbacksRef.current.updateMessage(message)
      })

      socket.on('agent_status', (data: AgentStatus) => {
        console.log('Agent status update:', data)
        callbacksRef.current.updateAgentStatus(data)
      })

      socket.on('context_cleared', (data: any) => {
        console.log('Context cleared:', data)

        // Handle both optimized and full field names
        const channelId = data.channel_id || data.cid
        const message = data.message || data.msg || 'Context cleared'

        callbacksRef.current.clearMessages(channelId)

        // Add system message to indicate context was cleared
        callbacksRef.current.addMessage({
          id: `system-${Date.now()}`,
          channel_id: channelId,
          author_id: null,
          author_type: 'system',
          author_name: 'System',
          content: message,
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
    } else {
      // Socket already initialized - just update ref
      socketRef.current = socket
    }

    // IMPORTANT: Do NOT disconnect on unmount
    // This allows the WebSocket to persist across page navigations (/ <-> /dm/[agentId])
    // The connection only closes when the entire app unmounts (browser close/refresh)
    return () => {
      // No-op - socket persists
      // Event listeners remain active since socket is a singleton
    }
  }, []) // Empty deps - WebSocket is a singleton, only initialize once. Callbacks are handled via ref.

  return socketRef.current
}

export function sendMessage(channelId: string, content: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (socket && socket.connected) {
      console.log('Sending message:', { channelId, content })

      // Send the message
      socket.emit('message_send', {
        channel_id: channelId,
        content,
        author_name: 'Developer'
      })

      // Consider it successful if socket emits without error
      resolve(true)
    } else {
      console.error('Socket not connected - attempting to reconnect...')

      // Attempt to reconnect if disconnected
      if (socket && !socket.connected) {
        socket.connect()

        // Wait for connection then send
        socket.once('connect', () => {
          console.log('Reconnected - sending message')
          socket!.emit('message_send', {
            channel_id: channelId,
            content,
            author_name: 'Developer'
          })
          resolve(true)
        })

        // Handle connection failure
        setTimeout(() => {
          reject(new Error('Failed to reconnect to WebSocket'))
        }, 5000) // 5 second timeout
      } else {
        reject(new Error('WebSocket not initialized'))
      }
    }
  })
}

export function isWebSocketConnected(): boolean {
  return socket !== null && socket.connected
}

export function getWebSocketStatus(): 'connected' | 'disconnected' | 'not_initialized' {
  if (!socket) return 'not_initialized'
  if (socket.connected) return 'connected'
  return 'disconnected'
}
