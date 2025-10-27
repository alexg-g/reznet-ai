'use client'

import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { API_URL } from '@/lib/constants'

interface UploadedFile {
  file: File
  id?: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  workspace_path?: string
}

interface FileUploadProps {
  onFilesUploaded?: (files: any[]) => void
  maxFileSizeMB?: number
  maxFiles?: number
}

export default function FileUpload({
  onFilesUploaded,
  maxFileSizeMB = 10,
  maxFiles = 10
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allowedExtensions = [
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.go', '.rs', '.c', '.cpp',
    '.txt', '.md', '.json', '.yaml', '.yml', '.csv',
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg'
  ]

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxFileSizeMB) {
      return { valid: false, error: `File exceeds ${maxFileSizeMB}MB limit` }
    }

    // Check file extension
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!allowedExtensions.includes(ext)) {
      return { valid: false, error: `File type ${ext} not allowed` }
    }

    return { valid: true }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const newFiles: UploadedFile[] = []
    const currentCount = uploadedFiles.length

    for (let i = 0; i < files.length && currentCount + newFiles.length < maxFiles; i++) {
      const file = files[i]
      const validation = validateFile(file)

      if (validation.valid) {
        newFiles.push({
          file,
          progress: 0,
          status: 'pending'
        })
      } else {
        newFiles.push({
          file,
          progress: 0,
          status: 'error',
          error: validation.error
        })
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles])

    // Auto-upload valid files
    newFiles.forEach((uploadFile, index) => {
      if (uploadFile.status === 'pending') {
        uploadFileToServer(uploadFile, currentCount + index)
      }
    })
  }

  const uploadFileToServer = async (uploadFile: UploadedFile, index: number) => {
    // Update status to uploading
    setUploadedFiles(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], status: 'uploading' }
      return updated
    })

    try {
      const formData = new FormData()
      formData.append('file', uploadFile.file)

      const xhr = new XMLHttpRequest()

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploadedFiles(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], progress }
            return updated
          })
        }
      })

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText)
          setUploadedFiles(prev => {
            const updated = [...prev]
            updated[index] = {
              ...updated[index],
              status: 'success',
              progress: 100,
              id: response.file.id,
              workspace_path: response.workspace_path
            }
            return updated
          })

          // Notify parent component
          if (onFilesUploaded) {
            onFilesUploaded([response.file])
          }
        } else {
          const error = JSON.parse(xhr.responseText)
          setUploadedFiles(prev => {
            const updated = [...prev]
            updated[index] = {
              ...updated[index],
              status: 'error',
              error: error.detail || 'Upload failed'
            }
            return updated
          })
        }
      })

      // Handle errors
      xhr.addEventListener('error', () => {
        setUploadedFiles(prev => {
          const updated = [...prev]
          updated[index] = {
            ...updated[index],
            status: 'error',
            error: 'Network error'
          }
          return updated
        })
      })

      xhr.open('POST', `${API_URL}/api/upload/`)
      xhr.send(formData)

    } catch (error) {
      setUploadedFiles(prev => {
        const updated = [...prev]
        updated[index] = {
          ...updated[index],
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed'
        }
        return updated
      })
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) return 'image'
    if (['.pdf'].includes(ext)) return 'picture_as_pdf'
    if (['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.go', '.rs'].includes(ext)) return 'code'
    if (['.txt', '.md'].includes(ext)) return 'description'
    if (['.json', '.yaml', '.yml'].includes(ext)) return 'data_object'
    return 'insert_drive_file'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const clearCompleted = () => {
    setUploadedFiles(prev => prev.filter(f => f.status !== 'success'))
  }

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
        accept={allowedExtensions.join(',')}
      />

      {/* Upload button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-400 hover:text-neon-cyan transition-colors duration-200"
        title="Upload files"
      >
        <span className="material-symbols-outlined">attach_file</span>
      </button>

      {/* Drag and drop overlay */}
      {isDragging && (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
          <div className="border-4 border-dashed border-neon-cyan rounded-lg p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-neon-cyan mb-4">cloud_upload</span>
            <p className="text-white text-xl font-semibold">Drop files here</p>
            <p className="text-gray-400 mt-2">Up to {maxFiles} files, {maxFileSizeMB}MB each</p>
          </div>
        </div>
      )}

      {/* File list */}
      {uploadedFiles.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-deep-dark/95 backdrop-blur-sm border border-electric-purple/30 rounded-lg max-h-64 overflow-y-auto glowing-scrollbar">
          <div className="flex items-center justify-between p-3 border-b border-electric-purple/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-electric-purple">attach_file</span>
              <span className="text-sm font-semibold text-white">Attachments ({uploadedFiles.length})</span>
            </div>
            {uploadedFiles.some(f => f.status === 'success') && (
              <button
                onClick={clearCompleted}
                className="text-xs text-gray-400 hover:text-neon-cyan transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="p-2 space-y-1">
            {uploadedFiles.map((uploadFile, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 rounded bg-black/30 hover:bg-black/50 transition-colors"
              >
                {/* File icon */}
                <span className={`material-symbols-outlined text-lg ${
                  uploadFile.status === 'success' ? 'text-lime-green' :
                  uploadFile.status === 'error' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {getFileIcon(uploadFile.file.name)}
                </span>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{uploadFile.file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(uploadFile.file.size)}</p>
                  {uploadFile.error && (
                    <p className="text-xs text-red-400 mt-1">{uploadFile.error}</p>
                  )}
                </div>

                {/* Progress/Status */}
                {uploadFile.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-neon-cyan h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadFile.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-10">{uploadFile.progress}%</span>
                  </div>
                )}

                {uploadFile.status === 'success' && (
                  <span className="material-symbols-outlined text-sm text-lime-green">check_circle</span>
                )}

                {uploadFile.status === 'error' && (
                  <span className="material-symbols-outlined text-sm text-red-400">error</span>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-400 transition-colors p-1"
                  title="Remove"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
