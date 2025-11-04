'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Highlight, themes } from 'prism-react-renderer'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * MarkdownRenderer - Heavy component with markdown and syntax highlighting
 *
 * Dependencies:
 * - react-markdown (~20KB)
 * - remark-gfm (~15KB)
 * - prism-react-renderer (~30KB)
 *
 * Total: ~65KB - Good candidate for lazy loading
 *
 * Features:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - Syntax highlighting for code blocks
 * - Cyberpunk-themed code blocks
 */
export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with syntax highlighting
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const codeString = String(children).replace(/\n$/, '')

            // Check if it's a code block (has language) vs inline code
            const isCodeBlock = !!language

            return isCodeBlock ? (
              <Highlight
                theme={themes.vsDark}
                code={codeString}
                language={language as any}
              >
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre
                    className={`${className} my-4 overflow-x-auto rounded-lg border border-electric-purple/30 shadow-lg shadow-neon-cyan/10`}
                    style={{
                      ...style,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      padding: '1rem',
                    }}
                  >
                    <code className="text-sm font-mono">
                      {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })}>
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token })} />
                          ))}
                        </div>
                      ))}
                    </code>
                  </pre>
                )}
              </Highlight>
            ) : (
              <code
                className="bg-black/50 border border-electric-purple/30 rounded px-2 py-1 text-neon-cyan text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },
          // Headings with cyberpunk styling
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-white mb-4 mt-6 border-b border-electric-purple/30 pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold text-white mb-3 mt-5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-neon-cyan mb-2 mt-4">
              {children}
            </h3>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 text-gray-300 my-2">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 text-gray-300 my-2">
              {children}
            </ol>
          ),
          // Links with neon effect
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon-cyan hover:text-electric-purple transition-colors duration-200 underline"
            >
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-electric-purple/50 pl-4 py-2 my-3 bg-deep-dark/30 text-gray-300 italic">
              {children}
            </blockquote>
          ),
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-electric-purple/20 border-b border-electric-purple/50">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-electric-purple/20">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-electric-purple/10 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-sm font-bold text-neon-cyan">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-gray-300">
              {children}
            </td>
          ),
          // Horizontal rule
          hr: () => (
            <hr className="my-6 border-t border-electric-purple/30" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
