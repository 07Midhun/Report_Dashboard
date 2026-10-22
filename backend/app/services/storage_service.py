import os
import uuid
import shutil
from pathlib import Path
from typing import Tuple
from fastapi import UploadFile, HTTPException, status
from ..config import settings

ALLOWED_EXTENSIONS = {".xlsx", ".xls"}

def get_storage_path(region_id: int, ward_id: int, unique_id: str) -> Path:
    """Returns the directory path for storing a report."""
    base = Path(settings.STORAGE_ROOT) / "reports" / f"region_{region_id}" / f"ward_{ward_id}" / unique_id
    base.mkdir(parents=True, exist_ok=True)
    return base

def validate_uploaded_file(file: UploadFile) -> Tuple[str, str]:
    """
    Validates file extension and size.
    Returns (cleaned_original_filename, extension).
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a filename"
        )
    
    # Strip any directory path injected by browser
    original_filename = os.path.basename(file.filename.strip())
    _, ext = os.path.splitext(original_filename)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Only Excel files (.xlsx, .xls) are permitted."
        )

    return original_filename, ext

def save_uploaded_file(
    file: UploadFile,
    region_id: int,
    ward_id: int
) -> Tuple[str, str, int, str]:
    """
    Saves an uploaded file to the secure local filesystem.
    Returns (storage_key, extension, file_size, unique_id).
    """
    original_filename, ext = validate_uploaded_file(file)
    unique_id = uuid.uuid4().hex
    target_dir = get_storage_path(region_id, ward_id, unique_id)
    
    # Internal filename uses safe UUID to avoid arbitrary path traversal or special chars
    internal_filename = f"report_{unique_id}{ext}"
    physical_file_path = target_dir / internal_filename

    # Read and enforce max size limit
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    bytes_read = 0

    with open(physical_file_path, "wb") as buffer:
        while True:
            chunk = file.file.read(1024 * 1024)  # 1MB chunks
            if not chunk:
                break
            bytes_read += len(chunk)
            if bytes_read > max_bytes:
                # Cleanup partial file
                buffer.close()
                if physical_file_path.exists():
                    os.remove(physical_file_path)
                shutil.rmtree(target_dir, ignore_errors=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB"
                )
            buffer.write(chunk)

    if bytes_read == 0:
        if physical_file_path.exists():
            os.remove(physical_file_path)
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty"
        )

    # Relative storage key stored in database
    storage_key = str(physical_file_path.resolve())
    return storage_key, ext, bytes_read, unique_id

def resolve_physical_file(storage_key: str) -> Path:
    """Safely resolves and verifies the existence of a physical file."""
    path = Path(storage_key)
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested file was not found on the server filesystem"
        )
    return path

def delete_physical_file(storage_key: str):
    """Deletes physical file and its parent unique folder."""
    try:
        path = Path(storage_key)
        if path.is_file():
            parent_dir = path.parent
            os.remove(path)
            # Remove empty unique folder
            if parent_dir.exists() and not os.listdir(parent_dir):
                shutil.rmtree(parent_dir, ignore_errors=True)
    except Exception as e:
        # Log error but don't fail transaction if already committed
        print(f"Warning: Failed to delete physical file {storage_key}: {e}")
