"""
Workspace API Router
Endpoints for browsing and accessing workspace files
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
import logging
from pathlib import Path

from agents.mcp_client import MCPFilesystemClient

router = APIRouter(prefix="/api/workspace", tags=["workspace"])
logger = logging.getLogger(__name__)

# Global MCP client for workspace operations
mcp_client = MCPFilesystemClient()


@router.get("/health")
async def workspace_health():
    """
    Check if MCP Filesystem Server is healthy
    """
    try:
        health = await mcp_client.health_check()
        return {
            "status": "healthy",
            "mcp_server": health,
            "workspace_enabled": True
        }
    except Exception as e:
        logger.error(f"Workspace health check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"MCP Filesystem Server unavailable: {str(e)}"
        )


@router.get("/files")
async def list_workspace_files(path: str = ""):
    """
    List files in workspace directory

    Args:
        path: Relative path within workspace (default: root)

    Returns:
        List of files and directories with metadata
    """
    try:
        result = await mcp_client.list_directory(path)

        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to list directory")
            )

        return {
            "path": result.get("path", "/"),
            "files": result.get("files", []),
            "count": len(result.get("files", []))
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing workspace files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file")
async def get_file_contents(path: str):
    """
    Get contents of a specific file

    Args:
        path: Relative path to file within workspace

    Returns:
        File contents and metadata
    """
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter required")

    try:
        result = await mcp_client.read_file(path)

        if not result.get("success"):
            raise HTTPException(
                status_code=404,
                detail=result.get("error", "File not found")
            )

        return {
            "path": result.get("path"),
            "content": result.get("content"),
            "size": result.get("size")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading file {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tree")
async def get_workspace_tree(max_depth: int = 3):
    """
    Get workspace directory tree structure

    Args:
        max_depth: Maximum depth to traverse (default: 3)

    Returns:
        Tree structure of workspace
    """
    try:
        tree = await _build_tree("", current_depth=0, max_depth=max_depth)
        return {
            "tree": tree,
            "max_depth": max_depth
        }
    except Exception as e:
        logger.error(f"Error building workspace tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _build_tree(path: str, current_depth: int, max_depth: int) -> Dict[str, Any]:
    """
    Recursively build directory tree

    Args:
        path: Current path
        current_depth: Current recursion depth
        max_depth: Maximum depth to traverse

    Returns:
        Tree node with children
    """
    if current_depth >= max_depth:
        return {
            "path": path or "/",
            "type": "directory",
            "children": [],
            "truncated": True
        }

    result = await mcp_client.list_directory(path)

    if not result.get("success"):
        return {
            "path": path or "/",
            "type": "directory",
            "error": result.get("error"),
            "children": []
        }

    files = result.get("files", [])
    children = []

    for file in files:
        file_path = f"{path}/{file['name']}" if path else file['name']

        if file['type'] == 'directory':
            # Recursively build subtree
            subtree = await _build_tree(file_path, current_depth + 1, max_depth)
            children.append({
                "name": file['name'],
                "path": file_path,
                "type": "directory",
                "size": file.get('size', 0),
                "modified": file.get('modified'),
                "children": subtree.get("children", [])
            })
        else:
            children.append({
                "name": file['name'],
                "path": file_path,
                "type": "file",
                "size": file.get('size', 0),
                "modified": file.get('modified')
            })

    return {
        "path": path or "/",
        "type": "directory",
        "children": children
    }


@router.get("/exists")
async def check_file_exists(path: str):
    """
    Check if a file or directory exists

    Args:
        path: Relative path to check

    Returns:
        Existence status and type
    """
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter required")

    try:
        result = await mcp_client.file_exists(path)

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to check file")
            )

        return {
            "path": path,
            "exists": result.get("exists", False),
            "type": result.get("type") if result.get("exists") else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking file existence {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.on_event("shutdown")
async def shutdown_workspace_client():
    """Clean up MCP client on shutdown"""
    await mcp_client.close()
    logger.info("Workspace MCP client closed")
