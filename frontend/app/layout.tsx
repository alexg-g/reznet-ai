import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RezNet AI - Agent Collaboration Platform',
  description: 'Collaborate with AI agents to build software',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-deep-dark text-gray-200 font-display antialiased">
        {children}
      </body>
    </html>
  )
}
