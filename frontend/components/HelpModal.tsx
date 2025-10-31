'use client'

import { useEffect } from 'react'

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-deep-dark/95 border border-electric-purple/40 rounded-xl shadow-2xl shadow-electric-purple/20 m-4">
        {/* Header */}
        <div className="sticky top-0 bg-deep-dark/95 backdrop-blur-sm border-b border-electric-purple/30 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-neon-cyan text-3xl">help</span>
            <h2 className="text-white text-2xl font-bold">How to Use RezNet AI</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-neon-cyan transition-colors duration-200"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 glowing-scrollbar">
          {/* Welcome */}
          <section>
            <h3 className="text-neon-cyan text-lg font-bold mb-2">Welcome to RezNet AI</h3>
            <p className="text-gray-300 leading-relaxed">
              RezNet AI is a collaborative platform where you work with specialized AI agents to get work done.
              A fully integrated team-chat interface, but your teammates are expert AI agents.
            </p>
          </section>

          {/* Agents */}
          <section>
            <h3 className="text-electric-purple text-lg font-bold mb-3">AI Agents</h3>
            <div className="space-y-3">
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-neon-cyan font-bold">@orchestrator</span>
                  <span className="text-gray-500 text-sm">- Team Lead</span>
                </div>
                <p className="text-gray-400 text-sm">Coordinates tasks and delegates to specialist agents</p>
              </div>
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#00F6FF] font-bold">@backend</span>
                  <span className="text-gray-500 text-sm">- Backend Engineer</span>
                </div>
                <p className="text-gray-400 text-sm">Python, FastAPI, databases, and server-side logic</p>
              </div>
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#FF00F7] font-bold">@frontend</span>
                  <span className="text-gray-500 text-sm">- Frontend Developer</span>
                </div>
                <p className="text-gray-400 text-sm">React, Next.js, TypeScript, and modern UI/UX</p>
              </div>
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#39FF14] font-bold">@qa</span>
                  <span className="text-gray-500 text-sm">- QA Specialist</span>
                </div>
                <p className="text-gray-400 text-sm">Testing, quality assurance, and bug detection</p>
              </div>
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#FF6B00] font-bold">@devops</span>
                  <span className="text-gray-500 text-sm">- DevOps Engineer</span>
                </div>
                <p className="text-gray-400 text-sm">Docker, CI/CD, deployment, and infrastructure</p>
              </div>
            </div>
          </section>

          {/* How to Chat */}
          <section>
            <h3 className="text-neon-cyan text-lg font-bold mb-3">How to Chat with Agents</h3>
            <div className="space-y-3 text-gray-300">
              <div>
                <p className="font-semibold text-white mb-1">Direct mention:</p>
                <code className="block bg-deep-dark border border-electric-purple/30 rounded px-3 py-2 text-sm text-neon-cyan">
                  @backend How do I implement JWT authentication in FastAPI?
                </code>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Orchestrated workflow:</p>
                <code className="block bg-deep-dark border border-electric-purple/30 rounded px-3 py-2 text-sm text-neon-cyan">
                  @orchestrator Build a user registration feature with email verification
                </code>
              </div>
              <div>
                <p className="font-semibold text-white mb-1">Direct message:</p>
                <p className="text-gray-400 text-sm">Click on any agent in the sidebar to start a private conversation</p>
              </div>
            </div>
          </section>

          {/* Slash Commands */}
          <section>
            <h3 className="text-electric-purple text-lg font-bold mb-3">Slash Commands</h3>
            <div className="space-y-3">
              <div className="bg-deep-dark/50 border border-electric-purple/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-neon-cyan font-bold">/clear</code>
                  <span className="text-gray-500 text-sm">- Clear context</span>
                </div>
                <p className="text-gray-400 text-sm mb-2">
                  Resets the conversation context for the current channel or agent.
                  Use this when you want to start a fresh conversation without the history of previous messages.
                </p>
                <div className="bg-deep-dark border border-electric-purple/30 rounded px-3 py-2 text-sm">
                  <p className="text-gray-500 mb-1">Example:</p>
                  <code className="text-neon-cyan">/clear</code>
                </div>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-neon-cyan text-lg font-bold mb-3">Tips for Best Results</h3>
            <ul className="space-y-2 text-gray-300 list-disc list-inside">
              <li>Be specific with your requests - provide context and requirements</li>
              <li>Use <span className="text-electric-purple">@orchestrator</span> for complex, multi-step tasks</li>
              <li>Direct message agents for focused, one-on-one conversations</li>
              <li>Use <code className="text-neon-cyan">/clear</code> to reset context when switching topics</li>
              <li>Review agent responses and ask follow-up questions</li>
            </ul>
          </section>

          {/* Footer */}
          <section className="border-t border-electric-purple/30 pt-4">
            <p className="text-gray-400 text-sm text-center">
              Need more help? Check out the{' '}
              <a
                href="https://github.com/alexg-g/reznet-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neon-cyan hover:text-electric-purple transition-colors"
              >
                GitHub repository
              </a>
              {' '}for documentation and examples.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
