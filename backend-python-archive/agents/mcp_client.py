"""
MCP Filesystem Client
Async HTTP client for communicating with MCP filesystem server
"""

import httpx
import logging
from typing import Dict, Any, Optional, List
from core.config import settings

logger = logging.getLogger(__name__)


class MCPFilesystemClient:
    """
    Async HTTP client for MCP Filesystem Server

    Provides file operations within the workspace directory:
    - read_file: Read file contents
    - write_file: Write content to file
    - list_directory: List directory contents
    - create_directory: Create directory
    - delete_file: Delete file
    - file_exists: Check if file/directory exists
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3
    ):
        """
        Initialize MCP Filesystem Client

        Args:
            base_url: Base URL of MCP filesystem server (default from settings)
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
        """
        self.base_url = base_url or f"http://localhost:{settings.MCP_FILESYSTEM_PORT}"
        self.timeout = timeout
        self.max_retries = max_retries
        self._client: Optional[httpx.AsyncClient] = None

        logger.info(f"Initialized MCPFilesystemClient: {self.base_url}")

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout
            )
        return self._client

    async def close(self):
        """Close HTTP client connection"""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.debug("Closed MCP filesystem client connection")

    async def health_check(self) -> Dict[str, Any]:
        """
        Check MCP filesystem server health

        Returns:
            Health status dict

        Raises:
            Exception if server is not reachable
        """
        try:
            client = await self._get_client()
            response = await client.get("/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"MCP filesystem server health check failed: {e}")
            raise Exception(f"MCP filesystem server not available: {e}")

    async def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get list of available tools from MCP server

        Returns:
            List of tool definitions
        """
        try:
            client = await self._get_client()
            response = await client.get("/tools")
            response.raise_for_status()
            return response.json().get("tools", [])
        except Exception as e:
            logger.error(f"Failed to get MCP tools: {e}")
            return []

    async def read_file(self, path: str) -> Dict[str, Any]:
        """
        Read file contents from workspace

        Args:
            path: File path relative to workspace root

        Returns:
            Dict with success, path, content, and size

        Example:
            result = await client.read_file("backend/api/users.py")
            content = result["content"]
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/read_file",
                json={"path": path}
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Read file: {path} ({result.get('size', 0)} bytes)")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to read file {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error reading file {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def write_file(self, path: str, content: str) -> Dict[str, Any]:
        """
        Write content to file in workspace

        Creates parent directories if they don't exist.

        Args:
            path: File path relative to workspace root
            content: File content to write

        Returns:
            Dict with success, path, and size

        Example:
            result = await client.write_file(
                "backend/api/users.py",
                "# User API endpoint\\nfrom fastapi import APIRouter\\n..."
            )
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/write_file",
                json={"path": path, "content": content}
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Wrote file: {path} ({result.get('size', 0)} bytes)")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to write file {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error writing file {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def list_directory(self, path: str = "") -> Dict[str, Any]:
        """
        List contents of a directory

        Args:
            path: Directory path relative to workspace root (default: root)

        Returns:
            Dict with success, path, and files list
            Each file has: name, type (file/directory), size, modified

        Example:
            result = await client.list_directory("backend/api")
            for file in result["files"]:
                print(f"{file['name']} - {file['type']}")
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/list_directory",
                json={"path": path}
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Listed directory: {path or '/'} ({len(result.get('files', []))} items)")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to list directory {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error listing directory {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def create_directory(self, path: str) -> Dict[str, Any]:
        """
        Create a directory in workspace

        Creates parent directories if they don't exist (recursive).

        Args:
            path: Directory path relative to workspace root

        Returns:
            Dict with success and path

        Example:
            result = await client.create_directory("backend/api/v2")
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/create_directory",
                json={"path": path}
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Created directory: {path}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to create directory {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error creating directory {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def delete_file(self, path: str) -> Dict[str, Any]:
        """
        Delete a file from workspace

        Args:
            path: File path relative to workspace root

        Returns:
            Dict with success and path

        Example:
            result = await client.delete_file("backend/api/old_endpoint.py")
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/delete_file",
                json={"path": path}
            )
            response.raise_for_status()
            result = response.json()
            logger.info(f"Deleted file: {path}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to delete file {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error deleting file {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def file_exists(self, path: str) -> Dict[str, Any]:
        """
        Check if a file or directory exists

        Args:
            path: File/directory path relative to workspace root

        Returns:
            Dict with success, exists (bool), path, and type (if exists)

        Example:
            result = await client.file_exists("backend/api/users.py")
            if result["exists"]:
                print(f"Found {result['type']}: {result['path']}")
        """
        try:
            client = await self._get_client()
            response = await client.post(
                "/tools/file_exists",
                json={"path": path}
            )
            response.raise_for_status()
            result = response.json()
            logger.debug(f"Checked existence: {path} - {result.get('exists', False)}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to check file existence {path}: {e}")
            return {
                "success": False,
                "error": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            logger.error(f"Error checking file existence {path}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def __del__(self):
        """Cleanup on deletion"""
        # Note: Can't call async close() from __del__
        # Clients should explicitly call close() or use as context manager
        if self._client:
            logger.warning("MCPFilesystemClient deleted without calling close()")
