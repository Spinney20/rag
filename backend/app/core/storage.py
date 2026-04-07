import hashlib
from pathlib import Path, PurePosixPath

from app.config import settings


def get_upload_dir(project_id: str) -> Path:
    path = Path(settings.UPLOAD_DIR) / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def compute_file_hash(file_content: bytes) -> str:
    return hashlib.sha256(file_content).hexdigest()


def save_upload(project_id: str, filename: str, content: bytes) -> str:
    upload_dir = get_upload_dir(project_id)
    # Path traversal protection: strip all path components, keep only filename
    safe_name = PurePosixPath(filename).name
    if not safe_name or safe_name.startswith("."):
        raise ValueError(f"Invalid filename: {filename}")
    file_path = upload_dir / safe_name
    # Double-check resolved path is inside upload_dir
    if not file_path.resolve().is_relative_to(upload_dir.resolve()):
        raise ValueError(f"Path traversal detected: {filename}")
    file_path.write_bytes(content)
    return str(file_path)
