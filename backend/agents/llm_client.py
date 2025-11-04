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
                timeout=httpx.Timeout(180.0)  # 3 minute timeout for local models (can be slow with concurrent requests)
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

    async def stream(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ):
        """
        Generate text with streaming support for real-time responses.
        Yields text chunks as they arrive from the LLM.

        Args:
            prompt: The user prompt
            system: System message/instructions
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            tools: Tool/function schemas (NOTE: streaming may not support tools for all providers)
            **kwargs: Additional provider-specific parameters

        Yields:
            Tuple of (text_chunk, is_final, tool_calls)
            - text_chunk: Incremental text chunk
            - is_final: True if this is the final chunk
            - tool_calls: List of tool calls (only present in final chunk if applicable)
        """
        if self.provider == "anthropic":
            async for chunk in self._stream_anthropic(prompt, system, temperature, max_tokens, tools, **kwargs):
                yield chunk
        elif self.provider == "openai":
            async for chunk in self._stream_openai(prompt, system, temperature, max_tokens, tools, **kwargs):
                yield chunk
        elif self.provider == "ollama":
            async for chunk in self._stream_ollama(prompt, system, temperature, max_tokens, tools, **kwargs):
                yield chunk

    async def _stream_anthropic(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ):
        """Stream using Anthropic Claude with messages.stream()"""
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

            # Use streaming API
            accumulated_text = ""
            tool_calls = []

            async with self.client.messages.stream(**params) as stream:
                async for event in stream:
                    # Handle different event types
                    if hasattr(event, 'type'):
                        if event.type == 'content_block_start':
                            # New content block starting
                            continue
                        elif event.type == 'content_block_delta':
                            # Incremental content
                            if hasattr(event, 'delta'):
                                if hasattr(event.delta, 'text'):
                                    text_chunk = event.delta.text
                                    accumulated_text += text_chunk
                                    yield (text_chunk, False, None)
                                elif hasattr(event.delta, 'partial_json'):
                                    # Tool use delta (accumulating JSON)
                                    continue
                        elif event.type == 'content_block_stop':
                            # Content block finished
                            continue
                        elif event.type == 'message_delta':
                            # Message-level delta (e.g., stop_reason)
                            continue
                        elif event.type == 'message_stop':
                            # Message complete
                            break

            # Get final message to extract tool calls
            final_message = await stream.get_final_message()

            # Extract tool calls from final message
            for block in final_message.content:
                if block.type == "tool_use":
                    tool_calls.append({
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    })

            # Yield final chunk with tool calls if any
            yield ("", True, tool_calls if tool_calls else None)

        except Exception as e:
            logger.error(f"Anthropic streaming error: {e}")
            raise

    async def _stream_openai(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ):
        """Stream using OpenAI with stream=True"""
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
                "max_tokens": max_tokens,
                "stream": True
            }

            # Add tools if provided
            if tools:
                params["tools"] = tools
                params["tool_choice"] = "auto"

            # Stream response
            accumulated_text = ""
            tool_calls_accumulator = {}

            stream = self.client.chat.completions.create(**params)

            for chunk in stream:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta

                # Handle text content
                if hasattr(delta, 'content') and delta.content:
                    text_chunk = delta.content
                    accumulated_text += text_chunk
                    yield (text_chunk, False, None)

                # Handle tool calls
                if hasattr(delta, 'tool_calls') and delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_calls_accumulator:
                            tool_calls_accumulator[idx] = {
                                "id": "",
                                "name": "",
                                "arguments": ""
                            }

                        if tc_delta.id:
                            tool_calls_accumulator[idx]["id"] = tc_delta.id
                        if hasattr(tc_delta, 'function'):
                            if tc_delta.function.name:
                                tool_calls_accumulator[idx]["name"] = tc_delta.function.name
                            if tc_delta.function.arguments:
                                tool_calls_accumulator[idx]["arguments"] += tc_delta.function.arguments

                # Check if done
                if chunk.choices[0].finish_reason:
                    break

            # Convert accumulated tool calls to standard format
            tool_calls = None
            if tool_calls_accumulator:
                import json
                tool_calls = []
                for tc in tool_calls_accumulator.values():
                    tool_calls.append({
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": json.loads(tc["arguments"]) if tc["arguments"] else {}
                    })

            # Yield final chunk
            yield ("", True, tool_calls)

        except Exception as e:
            logger.error(f"OpenAI streaming error: {e}")
            raise

    async def _stream_ollama(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        tools: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ):
        """Stream using Ollama with stream=True"""
        import json

        try:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            }

            if system:
                payload["system"] = system

            # Send streaming request
            request = self.client.build_request("POST", "/api/generate", json=payload)

            accumulated_text = ""

            async with self.client.stream("POST", "/api/generate", json=payload) as response:
                response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        data = json.loads(line)

                        # Extract response chunk
                        if "response" in data:
                            text_chunk = data["response"]
                            accumulated_text += text_chunk

                            # Check if done
                            is_done = data.get("done", False)

                            if text_chunk:  # Only yield if there's content
                                yield (text_chunk, is_done, None)

                            if is_done:
                                break

                    except json.JSONDecodeError as e:
                        logger.warning(f"Failed to parse Ollama stream line: {line}")
                        continue

            # Ollama doesn't support native tool calling, return None for tool_calls
            # Tool extraction happens via XML parsing in BaseAgent
            yield ("", True, None)

        except Exception as e:
            logger.error(f"Ollama streaming error: {e}")
            raise

    async def generate_streaming(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        tools: Optional[List[Dict[str, Any]]] = None
    ):
        """
        DEPRECATED: Use stream() instead.
        Generate text with streaming (for backward compatibility).
        """
        logger.warning("generate_streaming() is deprecated, use stream() instead")
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
