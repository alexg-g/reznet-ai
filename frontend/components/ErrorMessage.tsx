"use client";

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorMessageProps {
  error: {
    message: string;
    retryable: boolean;
    error_type?: string;
    provider?: string;
    model?: string;
  };
  agentName: string;
  agentColor?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

/**
 * ErrorMessage component displays user-friendly error messages with optional retry functionality
 * Follows WCAG 2.1 Level AA accessibility standards
 * Cyberpunk theme with red/orange error styling
 */
export default function ErrorMessage({
  error,
  agentName,
  agentColor = '#FF6B00',
  onRetry,
  isRetrying = false
}: ErrorMessageProps) {
  return (
    <div
      className="bg-gray-900/80 border border-red-500/50 rounded-lg p-4 my-2 shadow-lg relative overflow-hidden"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Animated background glow */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 animate-pulse pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10">
        {/* Error header */}
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-shrink-0 mt-0.5">
            <AlertCircle
              className="w-5 h-5 text-red-400"
              aria-hidden="true"
            />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-bold text-sm"
                style={{ color: agentColor }}
              >
                {agentName}
              </span>
              <span className="text-red-400 text-xs uppercase tracking-wider font-semibold">
                Error
              </span>
            </div>

            {/* Error message */}
            <p className="text-gray-200 text-sm leading-relaxed">
              {error.message}
            </p>

            {/* Technical details (if available) */}
            {(error.provider || error.error_type) && (
              <div className="mt-2 text-xs text-gray-400 font-mono">
                {error.provider && (
                  <span className="mr-3">
                    Provider: <span className="text-gray-300">{error.provider}</span>
                  </span>
                )}
                {error.model && (
                  <span className="mr-3">
                    Model: <span className="text-gray-300">{error.model}</span>
                  </span>
                )}
                {error.error_type && (
                  <span>
                    Type: <span className="text-gray-300">{error.error_type}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Retry button (only show if retryable) */}
        {error.retryable && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-md
                font-semibold text-sm transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900
                ${isRetrying
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg hover:shadow-orange-500/50'
                }
              `}
              aria-label={isRetrying ? "Retrying request..." : "Retry failed request"}
            >
              <RefreshCw
                className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}

        {/* Non-retryable error help text */}
        {!error.retryable && (
          <div className="mt-3 text-xs text-gray-400">
            <p>This error cannot be automatically retried. Please check your configuration or contact support.</p>
          </div>
        )}
      </div>
    </div>
  );
}
