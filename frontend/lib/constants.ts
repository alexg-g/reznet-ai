export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000'

export const AGENT_COLORS = {
  '@orchestrator': {
    hex: '#9D00FF',
    text: 'text-electric-purple',
    glow: 'shadow-glow-purple',
    bg: 'bg-electric-purple/20',
    border: 'border-electric-purple',
    hover: 'hover:bg-electric-purple/10'
  },
  '@backend': {
    hex: '#00F6FF',
    text: 'text-neon-cyan',
    glow: 'shadow-glow-cyan',
    bg: 'bg-neon-cyan/20',
    border: 'border-neon-cyan',
    hover: 'hover:bg-neon-cyan/10'
  },
  '@frontend': {
    hex: '#FF00F7',
    text: 'text-hot-magenta',
    glow: 'shadow-glow-magenta',
    bg: 'bg-hot-magenta/20',
    border: 'border-hot-magenta',
    hover: 'hover:bg-hot-magenta/10'
  },
  '@qa': {
    hex: '#39FF14',
    text: 'text-lime-green',
    glow: 'shadow-glow-lime',
    bg: 'bg-lime-green/20',
    border: 'border-lime-green',
    hover: 'hover:bg-lime-green/10'
  },
  '@devops': {
    hex: '#FF6B00',
    text: 'text-orange-neon',
    glow: 'shadow-glow-orange',
    bg: 'bg-orange-neon/20',
    border: 'border-orange-neon',
    hover: 'hover:bg-orange-neon/10'
  }
} as const

export type AgentName = keyof typeof AGENT_COLORS

export function getAgentColor(agentName: string) {
  return AGENT_COLORS[agentName as AgentName] || {
    hex: '#9CA3AF',
    text: 'text-gray-300',
    glow: '',
    bg: 'bg-gray-800/20',
    border: 'border-gray-600',
    hover: 'hover:bg-gray-800/10'
  }
}
