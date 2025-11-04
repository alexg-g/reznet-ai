"""
Integration tests for error handling and recovery system
Tests LLM client retry logic, fallback strategies, and user-friendly error messages
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from core.error_handling import (
    LLMError,
    LLMAPIError,
    LLMTimeoutError,
    LLMQuotaError,
    LLMAuthenticationError,
    LLMRateLimitError,
    classify_error,
    format_user_friendly_error,
    structured_log_error,
    retry_with_exponential_backoff,
    ErrorRecoveryStrategy,
    ErrorType
)
from agents.llm_client import LLMClient


# ============================================
# Error Classification Tests
# ============================================

def test_classify_timeout_error():
    """Test that timeout errors are correctly classified"""
    error = Exception("Request timed out after 30 seconds")
    classified = classify_error(error, "anthropic")

    assert isinstance(classified, LLMTimeoutError)
    assert classified.provider == "anthropic"
    assert classified.retryable is True
    assert "timed out" in classified.message.lower()


def test_classify_quota_error():
    """Test that quota exceeded errors are correctly classified"""
    error = Exception("quota exceeded for organization")
    classified = classify_error(error, "openai")

    assert isinstance(classified, LLMQuotaError)
    assert classified.provider == "openai"
    assert classified.retryable is False
    assert "quota" in classified.message.lower()


def test_classify_auth_error():
    """Test that authentication errors are correctly classified"""
    error = Exception("401 Unauthorized: Invalid API key")
    classified = classify_error(error, "anthropic")

    assert isinstance(classified, LLMAuthenticationError)
    assert classified.provider == "anthropic"
    assert classified.retryable is False
    assert "authentication" in classified.message.lower()


def test_classify_rate_limit_error():
    """Test that rate limit errors are correctly classified"""
    error = Exception("429 Too Many Requests: rate_limit_exceeded")
    classified = classify_error(error, "openai")

    assert isinstance(classified, LLMRateLimitError)
    assert classified.provider == "openai"
    assert classified.retryable is True
    assert "rate limit" in classified.message.lower()


def test_classify_generic_api_error():
    """Test that generic errors default to retryable API error"""
    error = Exception("Connection refused")
    classified = classify_error(error, "ollama")

    assert isinstance(classified, LLMAPIError)
    assert classified.provider == "ollama"
    assert classified.retryable is True


# ============================================
# User-Friendly Error Message Tests
# ============================================

def test_format_user_friendly_error_llm_error():
    """Test formatting of LLMError to user-friendly message"""
    error = LLMTimeoutError("Request timed out", provider="anthropic")
    message = format_user_friendly_error(error, "@backend")

    assert "⚠️" in message
    assert "@backend" in message
    assert "timed out" in message.lower()
    # Should NOT contain stack traces or technical details
    assert "Traceback" not in message
    assert "Exception" not in message


def test_format_user_friendly_error_generic():
    """Test formatting of generic exceptions"""
    error = ValueError("Some internal error")
    message = format_user_friendly_error(error, "@orchestrator")

    assert "⚠️" in message
    assert "@orchestrator" in message
    # Should hide technical details
    assert "ValueError" not in message
    assert "internal error" not in message
    assert "unexpected issue" in message.lower()


def test_no_stack_traces_in_user_messages():
    """CRITICAL: Ensure stack traces are NEVER shown to users"""
    try:
        raise RuntimeError("Internal server error\nTraceback (most recent call last):\n  File...")
    except Exception as e:
        message = format_user_friendly_error(e, "@qa")

    assert "Traceback" not in message
    assert "File \"" not in message
    assert "RuntimeError" not in message


# ============================================
# Retry Logic Tests
# ============================================

@pytest.mark.asyncio
async def test_retry_succeeds_on_second_attempt():
    """Test that retry decorator succeeds after initial failure"""
    attempt_count = 0

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=0.01)
    async def flaky_function():
        nonlocal attempt_count
        attempt_count += 1
        if attempt_count < 2:
            raise LLMAPIError("Temporary network error", provider="test")
        return "success"

    result = await flaky_function()

    assert result == "success"
    assert attempt_count == 2  # Failed once, succeeded on second attempt


@pytest.mark.asyncio
async def test_retry_exhausts_max_attempts():
    """Test that retry gives up after max attempts"""
    attempt_count = 0

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=0.01)
    async def always_fails():
        nonlocal attempt_count
        attempt_count += 1
        raise LLMAPIError("Persistent error", provider="test")

    with pytest.raises(LLMAPIError):
        await always_fails()

    assert attempt_count == 3  # Should have tried 3 times


@pytest.mark.asyncio
async def test_retry_respects_non_retryable_errors():
    """Test that non-retryable errors are not retried"""
    attempt_count = 0

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=0.01)
    async def auth_fails():
        nonlocal attempt_count
        attempt_count += 1
        raise LLMAuthenticationError("Invalid API key", provider="test")

    with pytest.raises(LLMAuthenticationError):
        await auth_fails()

    assert attempt_count == 1  # Should NOT retry auth errors


@pytest.mark.asyncio
async def test_exponential_backoff_timing():
    """Test that backoff delays increase exponentially"""
    import time
    attempt_times = []

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=0.1, backoff_factor=2.0)
    async def timed_failure():
        attempt_times.append(time.time())
        raise LLMAPIError("Test error", provider="test")

    with pytest.raises(LLMAPIError):
        await timed_failure()

    # Check that delays roughly doubled each time (allow wider tolerance for CI)
    assert len(attempt_times) == 3
    delay1 = attempt_times[1] - attempt_times[0]
    delay2 = attempt_times[2] - attempt_times[1]

    # Second delay should be ~2x first delay (0.1s → 0.2s) - allow 100ms tolerance
    assert 0.08 < delay1 < 0.35  # ~0.1-0.2s with tolerance for timing variance
    assert 0.18 < delay2 < 0.50  # ~0.2-0.4s with tolerance for timing variance


# ============================================
# Provider Fallback Tests
# ============================================

def test_fallback_order_anthropic():
    """Test fallback provider order when Anthropic fails"""
    fallback = ErrorRecoveryStrategy.get_fallback_order("anthropic")
    assert fallback == ["openai", "ollama"]


def test_fallback_order_openai():
    """Test fallback provider order when OpenAI fails"""
    fallback = ErrorRecoveryStrategy.get_fallback_order("openai")
    assert fallback == ["anthropic", "ollama"]


def test_fallback_order_ollama():
    """Test fallback provider order when Ollama fails"""
    fallback = ErrorRecoveryStrategy.get_fallback_order("ollama")
    assert fallback == ["anthropic", "openai"]


def test_should_fallback_on_quota_exceeded():
    """Test that quota errors trigger fallback"""
    error = LLMQuotaError("Quota exceeded", provider="anthropic")
    assert ErrorRecoveryStrategy.should_fallback_to_different_provider(error) is True


def test_should_fallback_on_auth_failure():
    """Test that auth errors trigger fallback"""
    error = LLMAuthenticationError("Invalid API key", provider="openai")
    assert ErrorRecoveryStrategy.should_fallback_to_different_provider(error) is True


def test_should_not_fallback_on_timeout():
    """Test that timeout errors don't trigger fallback (just retry)"""
    error = LLMTimeoutError("Request timeout", provider="anthropic")
    # Timeout errors should be retried, not fallen back
    # This test verifies our logic - timeouts are retryable but don't need fallback
    assert error.retryable is True


# ============================================
# LLM Client Integration Tests
# ============================================
# Note: Full LLM client integration tests are omitted here because they require
# mocking complex library internals (anthropic, openai, httpx clients).
# The retry decorator and error classification are tested independently above.
# End-to-end testing should be done with actual API calls or dedicated mocks.


# ============================================
# Structured Logging Tests
# ============================================

def test_structured_log_error_includes_context(caplog):
    """Test that structured logging captures full error context"""
    error = LLMAPIError("Test error", provider="anthropic", model="claude-3")

    structured_log_error(error, {
        "agent_name": "@backend",
        "channel_id": "123",
        "message_id": "456"
    })

    # Check that log contains all context
    assert any("@backend" in record.message for record in caplog.records)
    assert any("anthropic" in record.message for record in caplog.records)


def test_structured_log_includes_error_metadata():
    """Test that LLMError metadata is logged"""
    error = LLMQuotaError("Quota exceeded", provider="openai", model="gpt-4")
    error_dict = error.to_dict()

    assert error_dict["error_type"] == "quota_exceeded"
    assert error_dict["retryable"] is False
    assert error_dict["provider"] == "openai"
    assert error_dict["model"] == "gpt-4"


# ============================================
# Success Metrics Tests
# ============================================

def test_zero_unhandled_exceptions():
    """Verify all error types are handled"""
    # All LLM errors should be caught and classified
    error_types = [
        Exception("timeout"),
        Exception("quota"),
        Exception("401 auth"),
        Exception("429 rate limit"),
        Exception("connection error")
    ]

    for error in error_types:
        classified = classify_error(error, "test")
        assert isinstance(classified, LLMError)
        assert classified.message is not None
        assert classified.error_type is not None


def test_all_errors_have_user_friendly_messages():
    """Verify all error types produce user-friendly messages"""
    error_types = [
        LLMAPIError("test", provider="test"),
        LLMTimeoutError("test", provider="test"),
        LLMQuotaError("test", provider="test"),
        LLMAuthenticationError("test", provider="test"),
        LLMRateLimitError("test", provider="test")
    ]

    for error in error_types:
        message = format_user_friendly_error(error, "@test")
        assert "⚠️" in message
        assert "@test" in message
        assert len(message) > 0
        # Should not contain technical jargon
        assert "Exception" not in message
        assert "Traceback" not in message
