"""
Multi-provider LLM client
Supports Anthropic Claude, OpenAI, and Ollama
"""

from typing import Optional, Dict, Any, List
import logging
from core.config import settings

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

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000,
        **kwargs
    ) -> str:
        """
        Generate text using the configured LLM provider

        Args:
            prompt: The user prompt
            system: System message/instructions
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional provider-specific parameters

        Returns:
            Generated text response
        """
        if self.provider == "anthropic":
            return await self._generate_anthropic(prompt, system, temperature, max_tokens, **kwargs)
        elif self.provider == "openai":
            return await self._generate_openai(prompt, system, temperature, max_tokens, **kwargs)
        elif self.provider == "ollama":
            return await self._generate_ollama(prompt, system, temperature, max_tokens, **kwargs)

    async def _generate_anthropic(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """Generate using Anthropic Claude"""
        try:
            messages = [{"role": "user", "content": prompt}]

            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system if system else "You are a helpful AI assistant.",
                messages=messages
            )

            return response.content[0].text

        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise

    async def _generate_openai(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """Generate using OpenAI"""
        try:
            messages = []
            if system:
                messages.append({"role": "system", "content": system})
            messages.append({"role": "user", "content": prompt})

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )

            return response.choices[0].message.content

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise

    async def _generate_ollama(
        self,
        prompt: str,
        system: Optional[str],
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> str:
        """Generate using Ollama (local models)"""
        import json
        import traceback

        logger.info("="*60)
        logger.info("OLLAMA _generate_ollama called")
        logger.info(f"Prompt length: {len(prompt)}")
        logger.info(f"Model: {self.model}")
        logger.info(f"Settings OLLAMA_HOST: {settings.OLLAMA_HOST}")

        try:
            # Check if client exists and is properly initialized
            if not hasattr(self, 'client'):
                raise AttributeError("httpx client not initialized!")

            logger.info(f"Client exists: {hasattr(self, 'client')}")
            logger.info(f"Client type: {type(self.client)}")
            logger.info(f"Client base_url: {self.client.base_url}")
            logger.info(f"Client is_closed: {self.client.is_closed}")

            # DIAGNOSTIC: Test client connectivity first
            try:
                logger.info("DIAGNOSTIC: Testing basic connectivity...")
                test_response = await self.client.get("/api/tags")
                logger.info(f"DIAGNOSTIC: GET /api/tags returned {test_response.status_code}")
                logger.info(f"DIAGNOSTIC: Full URL was: {test_response.url}")
            except Exception as diag_error:
                logger.error(f"DIAGNOSTIC: Connectivity test failed: {diag_error}")

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

            logger.info(f"Payload prepared for model: {payload['model']}")
            logger.info(f"Payload keys: {list(payload.keys())}")

            # Build request - try multiple approaches
            logger.info("APPROACH 1: Using build_request + send")
            request = self.client.build_request("POST", "/api/generate", json=payload)
            logger.info(f"Request URL: {request.url}")
            logger.info(f"Request method: {request.method}")
            logger.info(f"Request headers: {dict(request.headers)}")

            # Also try logging the absolute URL
            logger.info(f"Absolute URL: {str(request.url)}")

            # Send request
            logger.info("Sending request...")
            response = await self.client.send(request)
            logger.info(f"Response received - Status: {response.status_code}")
            logger.info(f"Response headers: {dict(response.headers)}")

            # Log response body even on error
            try:
                response_text = response.text
                logger.info(f"Response body (first 500 chars): {response_text[:500]}")
            except:
                pass

            response.raise_for_status()

            # Parse response
            data = response.json()
            result = data.get("response", "")
            logger.info(f"Result length: {len(result)}")
            logger.info("="*60)
            return result

        except Exception as e:
            logger.error("="*60)
            logger.error(f"OLLAMA ERROR: {type(e).__name__}: {e}")
            logger.error(f"Traceback:\n{traceback.format_exc()}")
            logger.error("="*60)
            raise

    async def generate_streaming(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ):
        """
        Generate text with streaming (for future real-time responses)
        Currently returns the full response, but can be extended for true streaming
        """
        # For now, just call the regular generate method
        # In the future, this can be implemented for true streaming
        response = await self.generate(prompt, system, temperature, max_tokens)
        yield response

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
