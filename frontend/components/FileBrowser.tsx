'use client'

import { useState, useEffect } from 'react'
import { API_URL } from '@/lib/constants'

interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
}

export default function FileBrowser() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState<string>('')

  // Fetch files from workspace
  const fetchFiles = async (path: string = '') => {
    setLoading(true)
    try {
      const url = path
        ? `${API_URL}/api/workspace/files?path=${encodeURIComponent(path)}`
        : `${API_URL}/api/workspace/files`

      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    } finally {
      setLoading(false)
    }
  }

  // Navigate to a directory
  const navigateToDirectory = (dirPath: string) => {
    setCurrentPath(dirPath)
  }

  // Navigate up one level
  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    setCurrentPath(parentPath)
  }

  // Get breadcrumb parts
  const getBreadcrumbs = () => {
    if (!currentPath) return []
    return currentPath.split('/').filter(Boolean)
  }

  // Load files on mount and set up polling
  useEffect(() => {
    fetchFiles(currentPath)
    const interval = setInterval(() => fetchFiles(currentPath), 3000) // Refresh every 3 seconds
    return () => clearInterval(interval)
  }, [currentPath])

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-electric-purple/20 backdrop-blur-sm border-l border-t border-b border-electric-purple/30 rounded-l-lg px-2 py-4 text-neon-cyan hover:bg-electric-purple/30 transition-colors"
        title={isOpen ? 'Close workspace' : 'Open workspace'}
      >
        <span className="material-symbols-outlined text-sm">
          {isOpen ? 'chevron_right' : 'folder_open'}
        </span>
      </button>

      {/* File Browser Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-72 bg-deep-dark/95 backdrop-blur-sm border-l border-electric-purple/30 transform transition-transform duration-300 ease-in-out z-30 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-b border-electric-purple/30">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-neon-cyan">folder</span>
              <h2 className="text-white font-semibold">Workspace</h2>
            </div>
            <button
              onClick={() => fetchFiles(currentPath)}
              disabled={loading}
              className="text-electric-purple hover:text-neon-cyan transition-colors"
              title="Refresh"
            >
              <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
          </div>

          {/* Breadcrumb Navigation */}
          <div className="px-4 pb-3 flex items-center gap-1 text-sm overflow-x-auto">
            <button
              onClick={() => setCurrentPath('')}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                !currentPath ? 'text-neon-cyan bg-neon-cyan/10' : 'text-gray-400 hover:text-white hover:bg-electric-purple/10'
              }`}
            >
              <span className="material-symbols-outlined text-xs">home</span>
              <span>root</span>
            </button>

            {getBreadcrumbs().map((part, index) => {
              const pathToHere = getBreadcrumbs().slice(0, index + 1).join('/')
              const isLast = index === getBreadcrumbs().length - 1
              return (
                <div key={index} className="flex items-center gap-1">
                  <span className="text-gray-600">/</span>
                  <button
                    onClick={() => setCurrentPath(pathToHere)}
                    className={`px-2 py-1 rounded transition-colors ${
                      isLast ? 'text-neon-cyan bg-neon-cyan/10' : 'text-gray-400 hover:text-white hover:bg-electric-purple/10'
                    }`}
                  >
                    {part}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* File List */}
        <div className="overflow-y-auto h-[calc(100%-8rem)] glowing-scrollbar">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm">Loading...</p>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">folder_off</span>
                <p className="text-sm">No files yet</p>
                <p className="text-xs mt-1">Ask an agent to create files</p>
              </div>
            </div>
          ) : (
            <div className="p-2">
              {files.map((file) => (
                <div
                  key={file.path}
                  onClick={() => {
                    if (file.type === 'directory') {
                      navigateToDirectory(file.path)
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded transition-colors group ${
                    file.type === 'directory'
                      ? 'hover:bg-electric-purple/20 cursor-pointer'
                      : 'hover:bg-electric-purple/10'
                  }`}
                >
                  <span className={`material-symbols-outlined text-sm ${
                    file.type === 'directory' ? 'text-electric-purple' : 'text-neon-cyan'
                  }`}>
                    {file.type === 'directory' ? 'folder' : 'description'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate font-mono transition-colors ${
                      file.type === 'directory'
                        ? 'text-electric-purple group-hover:text-hot-magenta font-semibold'
                        : 'text-gray-300 group-hover:text-white'
                    }`}>
                      {file.name}
                    </p>
                    {file.type === 'file' && file.size > 0 && (
                      <p className="text-xs text-gray-600">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    )}
                  </div>
                  {file.type === 'directory' && (
                    <span className="material-symbols-outlined text-xs text-gray-600 group-hover:text-electric-purple transition-colors">
                      chevron_right
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {files.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-deep-dark/50 backdrop-blur-sm border-t border-electric-purple/30">
            <p className="text-xs text-gray-500">
              {files.filter(f => f.type === 'file').length} files, {files.filter(f => f.type === 'directory').length} folders
            </p>
          </div>
        )}
      </div>
    </>
  )
}
