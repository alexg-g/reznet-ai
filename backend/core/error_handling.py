"""
Error handling utilities and middleware for RezNet AI
Provides robust error handling, retry logic, and user-friendly error messages
"""

import logging
import time
import functools
from typing import Optional, Dict, Any, Callable
from enum import Enum

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """Error types for categorization and handling"""
    API_ERROR = "api_error"
    TIMEOUT = "timeout"
    QUOTA_EXCEEDED = "quota_exceeded"
    AUTHENTICATION = "authentication"
    RATE_LIMIT = "rate_limit"
    NETWORK = "network"
    VALIDATION = "validation"
    UNKNOWN = "unknown"


class LLMError(Exception):
    """Base exception for LLM-related errors"""
    def __init__(
        self,
        message: str,
        error_type: ErrorType = ErrorType.UNKNOWN,
        retryable: bool = False,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        original_error: Optional[Exception] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.retryable = retryable
        self.provider = provider
        self.model = model
        self.original_error = original_error

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for serialization"""
        return {
            "message": self.message,
            "error_type": self.error_type.value,
            "retryable": self.retryable,
            "provider": self.provider,
            "model": self.model
        }


class LLMAPIError(LLMError):
    """LLM API request failed"""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type=ErrorType.API_ERROR, retryable=True, **kwargs)


class LLMTimeoutError(LLMError):
    """LLM API request timed out"""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type=ErrorType.TIMEOUT, retryable=True, **kwargs)


class LLMQuotaError(LLMError):
    """LLM API quota exceeded"""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type=ErrorType.QUOTA_EXCEEDED, retryable=False, **kwargs)


class LLMAuthenticationError(LLMError):
    """LLM API authentication failed"""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type=ErrorType.AUTHENTICATION, retryable=False, **kwargs)


class LLMRateLimitError(LLMError):
    """LLM API rate limit exceeded"""
    def __init__(self, message: str, **kwargs):
        super().__init__(message, error_type=ErrorType.RATE_LIMIT, retryable=True, **kwargs)


def classify_error(error: Exception, provider: str) -> LLMError:
    """
    Classify a raw exception into a specific LLMError type

    Args:
        error: The original exception
        provider: LLM provider name (anthropic, openai, ollama)

    Returns:
        Classified LLMError with appropriate type and retryability
    """
    error_str = str(error).lower()
    error_type_name = type(error).__name__.lower()

    # Timeout errors
    if "timeout" in error_str or "timed out" in error_str:
        return LLMTimeoutError(
            f"Request timed out. The {provider} service is taking too long to respond.",
            provider=provider,
            original_error=error
        )

    # Quota/billing errors
    if any(keyword in error_str for keyword in ["quota", "billing", "insufficient_quota", "overloaded"]):
        return LLMQuotaError(
            f"Quota exceeded for {provider}. Please check your API usage limits.",
            provider=provider,
            original_error=error
        )

    # Authentication errors
    if any(keyword in error_str for keyword in ["authentication", "api_key", "unauthorized", "401", "403"]):
        return LLMAuthenticationError(
            f"Authentication failed for {provider}. Please check your API key configuration.",
            provider=provider,
            original_error=error
        )

    # Rate limit errors
    if any(keyword in error_str for keyword in ["rate_limit", "too_many_requests", "429"]):
        return LLMRateLimitError(
            f"Rate limit exceeded for {provider}. Please wait a moment and try again.",
            provider=provider,
            original_error=error
        )

    # Network/connection errors
    if any(keyword in error_type_name for keyword in ["connection", "http", "request"]):
        return LLMAPIError(
            f"Network error connecting to {provider}. Please check your internet connection.",
            provider=provider,
            original_error=error
        )

    # Generic API error (retryable)
    return LLMAPIError(
        f"An error occurred with the {provider} service. Retrying...",
        provider=provider,
        original_error=error
    )


def format_user_friendly_error(error: Exception, agent_name: str = "Agent") -> str:
    """
    Convert an exception into a user-friendly error message
    NEVER shows stack traces to end users

    Args:
        error: The exception to format
        agent_name: Name of the agent that encountered the error

    Returns:
        User-friendly error message suitable for displaying in chat
    """
    if isinstance(error, LLMError):
        # Use pre-formatted message from LLMError
        return f"⚠️ {agent_name} encountered an issue: {error.message}"

    # Generic error - hide technical details
    return f"⚠️ {agent_name} encountered an unexpected issue. Our team has been notified. Please try again or rephrase your request."


def structured_log_error(
    error: Exception,
    context: Dict[str, Any],
    level: str = "error"
) -> None:
    """
    Log error with full structured context for debugging

    Args:
        error: The exception to log
        context: Additional context (agent, model, provider, request, etc.)
        level: Log level (error, warning, info)
    """
    log_data = {
        "error_type": type(error).__name__,
        "error_message": str(error),
        **context
    }

    # Add LLMError-specific fields if applicable
    if isinstance(error, LLMError):
        log_data.update({
            "error_category": error.error_type.value,
            "retryable": error.retryable,
            "llm_provider": error.provider,
            "llm_model": error.model
        })

    # Log at appropriate level
    if level == "error":
        logger.error(f"Error occurred: {log_data}")
    elif level == "warning":
        logger.warning(f"Warning: {log_data}")
    else:
        logger.info(f"Info: {log_data}")


def retry_with_exponential_backoff(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    retryable_errors: tuple = (LLMAPIError, LLMTimeoutError, LLMRateLimitError)
):
    """
    Decorator to retry async functions with exponential backoff

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        initial_delay: Initial delay in seconds (default: 1.0)
        backoff_factor: Multiplier for delay after each attempt (default: 2.0)
        retryable_errors: Tuple of exception types that should trigger retry

    Usage:
        @retry_with_exponential_backoff(max_attempts=3, initial_delay=1.0)
        async def my_function():
            # ... code that might fail
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            delay = initial_delay
            last_error = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e

                    # Check if error is retryable
                    is_retryable = isinstance(e, retryable_errors) or (
                        isinstance(e, LLMError) and e.retryable
                    )

                    if not is_retryable or attempt >= max_attempts:
                        # Non-retryable error or max attempts reached
                        logger.error(
                            f"{func.__name__} failed after {attempt} attempt(s): "
                            f"{type(e).__name__}: {str(e)}"
                        )
                        raise

                    # Log retry attempt
                    logger.warning(
                        f"{func.__name__} failed on attempt {attempt}/{max_attempts}, "
                        f"retrying in {delay}s... Error: {type(e).__name__}: {str(e)}"
                    )

                    # Wait before retrying
                    time.sleep(delay)
                    delay *= backoff_factor

            # Should never reach here, but raise last error if we do
            if last_error:
                raise last_error

        return wrapper
    return decorator


class ErrorRecoveryStrategy:
    """
    Defines strategies for recovering from errors
    """

    @staticmethod
    def should_fallback_to_different_provider(error: LLMError) -> bool:
        """
        Determine if we should try a different LLM provider

        Args:
            error: The LLMError that occurred

        Returns:
            True if fallback to different provider should be attempted
        """
        # Fallback on quota, authentication, or persistent API errors
        return error.error_type in [
            ErrorType.QUOTA_EXCEEDED,
            ErrorType.AUTHENTICATION,
            ErrorType.API_ERROR
        ]

    @staticmethod
    def get_fallback_order(current_provider: str) -> list:
        """
        Get the order of providers to try as fallback

        Args:
            current_provider: The provider that failed

        Returns:
            List of provider names to try in order
        """
        # Define fallback order
        fallback_chains = {
            "anthropic": ["openai", "ollama"],
            "openai": ["anthropic", "ollama"],
            "ollama": ["anthropic", "openai"]
        }

        return fallback_chains.get(current_provider, [])

    @staticmethod
    def should_notify_user(error: LLMError) -> bool:
        """
        Determine if user should be notified about error

        Args:
            error: The LLMError that occurred

        Returns:
            True if user should see an error message
        """
        # Always notify user for non-retryable errors
        return not error.retryable or error.error_type in [
            ErrorType.AUTHENTICATION,
            ErrorType.QUOTA_EXCEEDED
        ]
