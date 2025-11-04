"""
Multi-provider LLM client
Supports Anthropic Claude, OpenAI, and Ollama
"""

from typing import Optional, Dict, Any, List, Tuple
import logging
from core.config import settings
from core.error_handling import (
    LLMError,
    LLMAPIError,
    LLMTimeoutError,
    LLMQuotaError,
    LLMAuthenticationError,
    classify_error,
    retry_with_exponential_backoff,
    structured_log_error,
    ErrorRecoveryStrategy
)

logger = logging.getLogger(__name__)


class LLMClient:
    """
    Unified LLM client that supports multiple providers
    """

    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.provider = provider or settings.DEFAULT_LLM_PROVIDER
        self.model = model or self._get_default_model()

        # Initialize the appropriate client
        if self.provider == "anthropic":
            self._init_anthropic()
        elif self.provider == "openai":
            self._init_openai()
        elif self.provider == "ollama":
            self._init_ollama()
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _get_default_model(self) -> str:
        """Get default model for the provider"""
        if self.provider == "anthropic":
            return settings.ANTHROPIC_DEFAULT_MODEL
        elif self.provider == "openai":
            return settings.OPENAI_DEFAULT_MODEL
        elif self.provider == "ollama":
            return settings.OLLAMA_DEFAULT_MODEL
        return "claude-3-5-sonnet-20241022"

    def _init_anthropic(self):
        """Initialize Anthropic Claude client"""
        try:
            from anthropic import Anthropic

            if not settings.ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY not set in environment")

            self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            logger.info(f"Initialized Anthropic client with model: {self.model}")
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

    def _init_openai(self):
        """Initialize OpenAI client"""
        try:
            from openai import OpenAI

            if not settings.OPENAI_API_KEY:
                raise ValueError("OPENAI_API_KEY not set in environment")

            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
            logger.info(f"Initialized OpenAI client with model: {self.model}")
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")

    def _init_ollama(self):
        """Initialize Ollama client"""
        try:
            import httpx
            self.client = httpx.AsyncClient(
                base_url=settings.OLLAMA_HOST,
                timeout=httpx.Timeout(60.0)  # 60 second timeout for local models
            )
            logger.info(f"Initialized Ollama client with model: {self.model}")
        except ImportError:
            raise ImportError("httpx package not installed. Run: pip install httpx")

    def has_native_tool_calling(self) -> bool:
        """
        Check if this provider supports native tool/function calling

        Returns:
            True if provider has native tool calling support (Anthropic, OpenAI)
            False for providers that need text-based tool invocation (Ollama)
        """
        return self.provider in ["anthropic", "openai"]

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """
        Generate text using the configured LLM provider with automatic fallback

        Args:
            prompt: The user prompt
            system: System message/instructions
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            tools: Tool/function schemas for native tool calling (if supported)
            **kwargs: Additional provider-specific parameters

        Returns:
            Tuple of (generated_text, tool_calls)
            - generated_text: The text response from the LLM
            - tool_calls: List of tool calls if LLM requested any, None otherwise
        """
        try:
            if self.provider == "anthropic":
                return await self._generate_anthropic(prompt, system, temperature, max_tokens, tools, **kwargs)
            elif self.provider == "openai":
                return await self._generate_openai(prompt, system, temperature, max_tokens, tools, **kwargs)
            elif self.provider == "ollama":
                return await self._generate_ollama(prompt, system, temperature, max_tokens, tools, **kwargs)
        except LLMError as e:
            # Check if we should try fallback providers
            if ErrorRecoveryStrategy.should_fallback_to_different_provider(e):
                logger.warning(f"Primary provider {self.provider} failed, attempting fallback...")
                return await self._try_fallback_providers(prompt, system, temperature, max_tokens, tools, **kwargs)
            raise

    async def _try_fallback_providers(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]],
        **kwargs
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """
        Try alternative providers when primary provider fails

        Args:
            Same as generate()

        Returns:
            Response from successful fallback provider

        Raises:
            LLMError if all fallback providers fail
        """
        fallback_providers = ErrorRecoveryStrategy.get_fallback_order(self.provider)
        original_provider = self.provider
        original_model = self.model

        for fallback_provider in fallback_providers:
            try:
                logger.info(f"Trying fallback provider: {fallback_provider}")

                # Temporarily switch to fallback provider
                self.provider = fallback_provider
                self.model = self._get_default_model()

                # Re-initialize client for fallback provider
                if fallback_provider == "anthropic":
                    self._init_anthropic()
                    result = await self._generate_anthropic(prompt, system, temperature, max_tokens, tools, **kwargs)
                elif fallback_provider == "openai":
                    self._init_openai()
                    result = await self._generate_openai(prompt, system, temperature, max_tokens, tools, **kwargs)
                elif fallback_provider == "ollama":
                    self._init_ollama()
                    result = await self._generate_ollama(prompt, system, temperature, max_tokens, tools, **kwargs)

                logger.info(f"Successfully used fallback provider: {fallback_provider}")
                return result

            except Exception as e:
                logger.warning(f"Fallback provider {fallback_provider} also failed: {e}")
                continue

        # All fallback providers failed - restore original and raise
        self.provider = original_provider
        self.model = original_model
        raise LLMAPIError(
            f"All LLM providers failed. Original: {original_provider}, Tried: {', '.join(fallback_providers)}",
            provider=original_provider,
            model=original_model
        )

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=1.0)
    async def _generate_anthropic(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """Generate using Anthropic Claude with retry logic"""
        try:
            messages = [{"role": "user", "content": prompt}]

            # Build request parameters
            params = {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system if system else "You are a helpful AI assistant.",
                "messages": messages
            }

            # Add tools if provided
            if tools:
                params["tools"] = tools

            response = self.client.messages.create(**params)

            # Extract text content
            text_content = ""
            tool_calls = []

            for block in response.content:
                if block.type == "text":
                    text_content += block.text
                elif block.type == "tool_use":
                    # Convert Anthropic tool use to standard format
                    tool_calls.append({
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    })

            return text_content, tool_calls if tool_calls else None

        except Exception as e:
            # Classify and convert to LLMError
            llm_error = classify_error(e, "anthropic")
            llm_error.model = self.model

            # Log with structured context
            structured_log_error(e, {
                "provider": "anthropic",
                "model": self.model,
                "prompt_length": len(prompt),
                "has_tools": tools is not None
            })

            raise llm_error

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=1.0)
    async def _generate_openai(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """Generate using OpenAI with retry logic"""
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            # Build request parameters
            params = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }

            # Add tools if provided
            if tools:
                params["tools"] = tools
                params["tool_choice"] = "auto"

            response = self.client.chat.completions.create(**params)

            message = response.choices[0].message
            text_content = message.content or ""

            # Extract tool calls if present
            tool_calls = None
            if hasattr(message, 'tool_calls') and message.tool_calls:
                tool_calls = []
                for tc in message.tool_calls:
                    import json
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "input": json.loads(tc.function.arguments)
                    })

            return text_content, tool_calls

        except Exception as e:
            # Classify and convert to LLMError
            llm_error = classify_error(e, "openai")
            llm_error.model = self.model

            # Log with structured context
            structured_log_error(e, {
                "provider": "openai",
                "model": self.model,
                "prompt_length": len(prompt),
                "has_tools": tools is not None
            })

            raise llm_error

    @retry_with_exponential_backoff(max_attempts=3, initial_delay=1.0)
    async def _generate_ollama(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Tuple[str, Optional[List[Dict[str, Any]]]]:
        """
        Generate using Ollama (local models) with retry logic

        Note: Ollama doesn't support native tool calling.
        Tools are ignored here; tool extraction happens via XML parsing in BaseAgent.
        """
        import json

        logger.info("OLLAMA _generate_ollama called")
        logger.info(f"Prompt length: {len(prompt)}, Model: {self.model}")

        try:
            # Check if client exists and is properly initialized
            if not hasattr(self, 'client'):
                raise LLMAPIError(
                    "Ollama client not initialized",
                    provider="ollama",
                    model=self.model
                )

            if self.client.is_closed:
                raise LLMAPIError(
                    "Ollama client connection is closed",
                    provider="ollama",
                    model=self.model
                )

            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            }

            if system:
                payload["system"] = system

            # Build and send request
            request = self.client.build_request("POST", "/api/generate", json=payload)
            response = await self.client.send(request)

            response.raise_for_status()

            # Parse response
            data = response.json()
            result = data.get("response", "")
            logger.info(f"Ollama response received, length: {len(result)}")

            # Ollama doesn't support native tool calling, return text only
            return result, None

        except Exception as e:
            # Classify and convert to LLMError
            llm_error = classify_error(e, "ollama")
            llm_error.model = self.model

            # Log with structured context
            structured_log_error(e, {
                "provider": "ollama",
                "model": self.model,
                "prompt_length": len(prompt),
                "has_tools": tools is not None,
                "ollama_host": settings.OLLAMA_HOST
            })

            raise llm_error

    async def generate_streaming(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        tools: Optional[List[Dict[str, Any]]] = None
    ):
        """
        Generate text with streaming (for future real-time responses)
        Currently returns the full response, but can be extended for true streaming
        """
        # For now, just call the regular generate method
        # In the future, this can be implemented for true streaming
        response, tool_calls = await self.generate(prompt, system, temperature, max_tokens, tools)
        yield response, tool_calls

    async def aclose(self):
        """
        Close the LLM client and cleanup resources.
        This is important for the Ollama provider which uses httpx.AsyncClient.
        """
        if self.provider == "ollama" and hasattr(self, 'client'):
            try:
                await self.client.aclose()
                logger.debug(f"Closed {self.provider} client")
            except Exception as e:
                logger.warning(f"Error closing {self.provider} client: {e}")

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.aclose()
