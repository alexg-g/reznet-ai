"""
File Upload API Router
Handles file uploads to workspace for agent access
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
import uuid
import os
from datetime import datetime
from pathlib import Path
import mimetypes
import logging

from core.database import get_db
from core.config import settings
from models.database import UploadedFile, Message
from models.schemas import UploadedFileResponse, FileUploadResponse

router = APIRouter(prefix="/api/upload", tags=["uploads"])
logger = logging.getLogger(__name__)

# Configuration
MAX_FILE_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024  # Convert to bytes
MAX_TOTAL_SIZE_MB = int(os.getenv("MAX_TOTAL_UPLOAD_MB", "50"))
MAX_TOTAL_SIZE = MAX_TOTAL_SIZE_MB * 1024 * 1024

# Allowed file extensions (whitelist approach for security)
ALLOWED_EXTENSIONS = {
    # Code files
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
    # Text files
    ".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".xml",
    # Documents
    ".pdf",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"
}

# Workspace root (from .env or default)
WORKSPACE_ROOT = Path(os.getenv("MCP_FILESYSTEM_WORKSPACE", "./data/workspaces"))
UPLOAD_DIR = "uploads"  # Subdirectory within workspace


def validate_filename(filename: str) -> tuple[bool, str]:
    """
    Validate filename for security and allowed types

    Returns:
        (is_valid, error_message)
    """
    if not filename:
        return False, "Filename is empty"

    # Check for path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        return False, "Invalid filename: path traversal detected"

    # Get file extension
    ext = Path(filename).suffix.lower()
    if not ext:
        return False, "File must have an extension"

    # Check if extension is allowed
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type '{ext}' not allowed. Allowed types: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    return True, ""


def validate_file_size(file_size: int) -> tuple[bool, str]:
    """
    Validate file size against limits

    Returns:
        (is_valid, error_message)
    """
    if file_size > MAX_FILE_SIZE:
        return False, f"File size exceeds maximum of {MAX_FILE_SIZE_MB}MB"

    if file_size == 0:
        return False, "File is empty"

    return True, ""


def generate_unique_filename(original_filename: str) -> str:
    """
    Generate unique filename using UUID + original extension

    Args:
        original_filename: Original filename from user

    Returns:
        Unique filename with format: uuid.ext
    """
    ext = Path(original_filename).suffix.lower()
    unique_name = f"{uuid.uuid4()}{ext}"
    return unique_name


def get_upload_path() -> Path:
    """
    Get upload directory path for today, create if doesn't exist

    Returns:
        Path to today's upload directory: workspace/uploads/YYYY-MM-DD/
    """
    today = datetime.now().strftime("%Y-%m-%d")
    upload_path = WORKSPACE_ROOT / UPLOAD_DIR / today
    upload_path.mkdir(parents=True, exist_ok=True)
    return upload_path


@router.post("/", response_model=FileUploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    message_id: UUID | None = None,
    db: Session = Depends(get_db)
):
    """
    Upload a file to the workspace

    Args:
        file: File to upload
        message_id: Optional message ID to attach file to

    Returns:
        File upload response with metadata and workspace path
    """
    try:
        # Validate filename
        is_valid, error_msg = validate_filename(file.filename)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        # Read file content
        file_content = await file.read()
        file_size = len(file_content)

        # Validate file size
        is_valid, error_msg = validate_file_size(file_size)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        # Generate unique filename
        stored_filename = generate_unique_filename(file.filename)

        # Get upload directory and create if needed
        upload_dir = get_upload_path()

        # Full file path
        file_path = upload_dir / stored_filename

        # Write file to disk
        with open(file_path, "wb") as f:
            f.write(file_content)

        # Get relative workspace path (for MCP access)
        relative_path = file_path.relative_to(WORKSPACE_ROOT)
        workspace_path = str(relative_path).replace("\\", "/")  # Unix-style paths

        # Detect MIME type
        mime_type, _ = mimetypes.guess_type(file.filename)

        # Verify message exists if message_id provided
        if message_id:
            message = db.query(Message).filter(Message.id == message_id).first()
            if not message:
                # Clean up uploaded file
                file_path.unlink(missing_ok=True)
                raise HTTPException(status_code=404, detail="Message not found")

        # Create database record
        uploaded_file = UploadedFile(
            original_filename=file.filename,
            stored_filename=stored_filename,
            workspace_path=workspace_path,
            file_size=file_size,
            mime_type=mime_type,
            message_id=message_id,
            uploaded_by="local-user"
        )

        db.add(uploaded_file)
        db.commit()
        db.refresh(uploaded_file)

        logger.info(f"File uploaded successfully: {file.filename} -> {workspace_path}")

        return FileUploadResponse(
            success=True,
            file=UploadedFileResponse.model_validate(uploaded_file),
            workspace_path=workspace_path,
            message=f"File '{file.filename}' uploaded successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@router.get("/{file_id}", response_model=UploadedFileResponse)
async def get_file_metadata(file_id: UUID, db: Session = Depends(get_db)):
    """
    Get metadata for an uploaded file

    Args:
        file_id: UUID of the uploaded file

    Returns:
        File metadata
    """
    uploaded_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    return UploadedFileResponse.model_validate(uploaded_file)


@router.delete("/{file_id}")
async def delete_file(file_id: UUID, db: Session = Depends(get_db)):
    """
    Delete an uploaded file

    Args:
        file_id: UUID of the file to delete

    Returns:
        Success message
    """
    uploaded_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not uploaded_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete physical file
    file_path = WORKSPACE_ROOT / uploaded_file.workspace_path
    try:
        file_path.unlink(missing_ok=True)
        logger.info(f"Deleted file: {uploaded_file.workspace_path}")
    except Exception as e:
        logger.warning(f"Could not delete physical file {file_path}: {e}")

    # Delete database record
    db.delete(uploaded_file)
    db.commit()

    return {
        "success": True,
        "message": f"File '{uploaded_file.original_filename}' deleted successfully"
    }


@router.get("/", response_model=List[UploadedFileResponse])
async def list_uploaded_files(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    List uploaded files

    Args:
        limit: Maximum number of files to return
        offset: Number of files to skip

    Returns:
        List of uploaded files
    """
    files = db.query(UploadedFile)\
        .order_by(UploadedFile.created_at.desc())\
        .limit(limit)\
        .offset(offset)\
        .all()

    return [UploadedFileResponse.model_validate(f) for f in files]


@router.get("/message/{message_id}", response_model=List[UploadedFileResponse])
async def get_message_attachments(message_id: UUID, db: Session = Depends(get_db)):
    """
    Get all files attached to a message

    Args:
        message_id: UUID of the message

    Returns:
        List of attached files
    """
    files = db.query(UploadedFile)\
        .filter(UploadedFile.message_id == message_id)\
        .order_by(UploadedFile.created_at)\
        .all()

    return [UploadedFileResponse.model_validate(f) for f in files]
