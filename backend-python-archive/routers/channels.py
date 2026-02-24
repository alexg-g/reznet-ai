"""
Channel endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from core.database import get_db
from core.cache import cache, CacheTTL
from models.database import Channel, Message
from models.schemas import ChannelCreate, ChannelResponse, MessageResponse

router = APIRouter()


@router.get("/channels", response_model=List[ChannelResponse])
async def list_channels(db: Session = Depends(get_db)):
    """
    Get all channels (cached)

    Cache: 10 minute TTL (moderate change rate)
    """
    # Try cache first
    cache_key = "list:active"
    cached_channels = cache.get("channels", cache_key)
    if cached_channels is not None:
        return cached_channels

    # Cache miss - query database
    channels = db.query(Channel).filter(Channel.is_archived == False).order_by(Channel.created_at).all()

    # Serialize and cache
    channels_data = [
        {c.name: getattr(channel, c.name) for c in channel.__table__.columns}
        for channel in channels
    ]
    cache.set("channels", cache_key, channels_data, CacheTTL.CHANNEL_METADATA)

    return channels


@router.post("/channels", response_model=ChannelResponse)
async def create_channel(channel: ChannelCreate, db: Session = Depends(get_db)):
    """
    Create a new channel

    Cache invalidation: Clears channel list cache
    """
    db_channel = Channel(**channel.dict())
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)

    # Invalidate channel list cache
    cache.delete_pattern("channels", "list:*")

    return db_channel


@router.get("/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(channel_id: UUID, db: Session = Depends(get_db)):
    """
    Get channel by ID (cached)

    Cache: 10 minute TTL
    """
    # Try cache first
    cached_channel = cache.get("channels", str(channel_id))
    if cached_channel is not None:
        return cached_channel

    # Cache miss - query database
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Serialize and cache
    channel_data = {c.name: getattr(channel, c.name) for c in channel.__table__.columns}
    cache.set("channels", str(channel_id), channel_data, CacheTTL.CHANNEL_METADATA)

    return channel


@router.get("/channels/{channel_id}/messages", response_model=List[MessageResponse])
async def get_channel_messages(
    channel_id: UUID,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Get messages for a channel (respects context_cleared_at)"""
    # Get channel to check context_cleared_at
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Build message query
    message_query = db.query(Message).filter(Message.channel_id == channel_id)

    # If context was cleared, only get messages after that timestamp
    if channel.context_cleared_at:
        message_query = message_query.filter(Message.created_at > channel.context_cleared_at)

    messages = (
        message_query
        .order_by(Message.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    # Reverse to get chronological order
    return list(reversed(messages))


@router.delete("/channels/{channel_id}")
async def archive_channel(channel_id: UUID, db: Session = Depends(get_db)):
    """
    Archive a channel

    Cache invalidation: Clears channel cache
    """
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    channel.is_archived = True
    db.commit()

    # Invalidate cache for this channel
    cache.delete("channels", str(channel_id))
    # Invalidate channel list cache
    cache.delete_pattern("channels", "list:*")

    return {"message": "Channel archived successfully"}


@router.post("/channels/{channel_id}/clear")
async def clear_channel_context(channel_id: UUID, db: Session = Depends(get_db)):
    """
    Clear channel context - messages before this timestamp will be hidden from agents.
    This implements the /clear slash command functionality.

    Cache invalidation: Updates channel cache with new context_cleared_at
    """
    from datetime import datetime, timezone
    from websocket.manager import manager

    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Set context_cleared_at to now
    cleared_at = datetime.now(timezone.utc)
    channel.context_cleared_at = cleared_at
    db.commit()
    db.refresh(channel)

    # Invalidate cache for this channel (context changed)
    cache.delete("channels", str(channel_id))

    # Broadcast context_cleared event via WebSocket
    await manager.broadcast('context_cleared', {
        'channel_id': str(channel_id),
        'cleared_at': cleared_at.isoformat(),
        'message': '🔄 Context cleared - starting fresh'
    })

    return {
        "message": "Channel context cleared successfully",
        "channel_id": str(channel_id),
        "cleared_at": cleared_at.isoformat()
    }
