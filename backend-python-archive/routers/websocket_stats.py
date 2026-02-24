"""
WebSocket Statistics Router (Issue #47)

Provides monitoring endpoints for WebSocket performance metrics.
"""

from fastapi import APIRouter, Response
from typing import Dict, Any
import logging

from websocket.manager import manager

router = APIRouter(prefix="/api/websocket", tags=["websocket"])
logger = logging.getLogger(__name__)


@router.get("/stats", response_model=Dict[str, Any])
async def get_websocket_stats():
    """
    Get WebSocket performance statistics.

    Returns:
        - total_messages: Number of messages sent
        - total_bytes_original: Original payload size (bytes)
        - total_bytes_optimized: Optimized payload size (bytes)
        - reduction_percentage: Percentage reduction (%)
        - compressed_messages: Number of gzip-compressed messages
        - avg_message_size: Average optimized message size (bytes)
        - active_connections: Number of active WebSocket connections

    Example Response:
    ```json
    {
      "total_messages": 1543,
      "total_bytes_original": 876543,
      "total_bytes_optimized": 438271,
      "reduction_percentage": 50.0,
      "compressed_messages": 23,
      "avg_message_size": 284,
      "active_connections": 5
    }
    ```

    NFR Target: Payload size reduction > 40%
    """
    stats = manager.get_stats()

    # Add active connection count
    stats['active_connections'] = len(manager.active_connections)

    logger.info(f"WebSocket stats requested: {stats['reduction_percentage']}% reduction")

    return stats


@router.post("/stats/reset")
async def reset_websocket_stats():
    """
    Reset WebSocket statistics (for testing/debugging).

    Returns:
        message: Confirmation message
    """
    manager.stats = {
        'total_messages': 0,
        'total_bytes_original': 0,
        'total_bytes_optimized': 0,
        'compressed_messages': 0
    }

    logger.info("WebSocket stats reset")

    return {
        "message": "WebSocket statistics reset successfully",
        "stats": manager.get_stats()
    }


@router.get("/health")
async def websocket_health():
    """
    Check WebSocket service health.

    Returns:
        - status: "healthy" if service operational
        - active_connections: Number of active connections
        - features: Enabled optimization features
    """
    stats = manager.get_stats()

    return {
        "status": "healthy",
        "active_connections": len(manager.active_connections),
        "features": {
            "payload_optimization": True,
            "message_batching": True,
            "gzip_compression": True,
            "socketio_compression": True
        },
        "performance": {
            "total_messages": stats['total_messages'],
            "reduction_percentage": stats['reduction_percentage']
        }
    }
