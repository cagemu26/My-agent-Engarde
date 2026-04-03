from __future__ import annotations

import io
import mimetypes
import shutil
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from app.core.config import settings


class StorageProvider(ABC):
    @abstractmethod
    def put_object(
        self,
        *,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def put_file(
        self,
        *,
        bucket: str,
        key: str,
        file_path: str,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def download_to_temp(
        self,
        *,
        bucket: str,
        key: str,
        temp_dir: str,
        filename: Optional[str] = None,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_presigned_get_url(self, *, bucket: str, key: str, expires_seconds: int) -> str:
        raise NotImplementedError

    @abstractmethod
    def generate_presigned_put_url(
        self,
        *,
        bucket: str,
        key: str,
        expires_seconds: int,
        content_type: Optional[str] = None,
    ) -> str:
        raise NotImplementedError

    @abstractmethod
    def head_object(self, *, bucket: str, key: str) -> dict:
        raise NotImplementedError

    @abstractmethod
    def delete_object(self, *, bucket: str, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def object_exists(self, *, bucket: str, key: str) -> bool:
        raise NotImplementedError


class LocalStorageProvider(StorageProvider):
    def __init__(self, root_dir: str) -> None:
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, bucket: str, key: str) -> Path:
        safe_key = key.lstrip("/").replace("..", "")
        return self.root_dir / bucket / safe_key

    def put_object(
        self,
        *,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        del content_type, cache_control
        path = self._resolve_path(bucket, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)

    def put_file(
        self,
        *,
        bucket: str,
        key: str,
        file_path: str,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        del content_type, cache_control
        src = Path(file_path)
        dst = self._resolve_path(bucket, key)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    def download_to_temp(
        self,
        *,
        bucket: str,
        key: str,
        temp_dir: str,
        filename: Optional[str] = None,
    ) -> str:
        src = self._resolve_path(bucket, key)
        if not src.exists():
            raise FileNotFoundError(f"Object not found: {bucket}/{key}")
        target_name = filename or src.name
        dst = Path(temp_dir) / target_name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return str(dst)

    def generate_presigned_get_url(self, *, bucket: str, key: str, expires_seconds: int) -> str:
        del expires_seconds
        path = self._resolve_path(bucket, key)
        return f"file://{path}"

    def generate_presigned_put_url(
        self,
        *,
        bucket: str,
        key: str,
        expires_seconds: int,
        content_type: Optional[str] = None,
    ) -> str:
        del expires_seconds, content_type
        path = self._resolve_path(bucket, key)
        return f"file://{path}"

    def head_object(self, *, bucket: str, key: str) -> dict:
        path = self._resolve_path(bucket, key)
        if not path.exists():
            raise FileNotFoundError(f"Object not found: {bucket}/{key}")
        size = path.stat().st_size
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return {
            "Content-Length": str(size),
            "Content-Type": content_type,
        }

    def delete_object(self, *, bucket: str, key: str) -> None:
        path = self._resolve_path(bucket, key)
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass

    def object_exists(self, *, bucket: str, key: str) -> bool:
        path = self._resolve_path(bucket, key)
        return path.exists()


class CosStorageProvider(StorageProvider):
    def __init__(self) -> None:
        try:
            from qcloud_cos import CosConfig, CosS3Client
        except Exception as exc:  # pragma: no cover - import dependency guard
            raise RuntimeError(
                "COS SDK not installed. Install cos-python-sdk-v5 to use STORAGE_PROVIDER=cos."
            ) from exc

        if not settings.COS_BUCKET or not settings.COS_REGION or not settings.COS_SECRET_ID or not settings.COS_SECRET_KEY:
            raise RuntimeError("COS config is incomplete. Check COS_BUCKET/COS_REGION/COS_SECRET_ID/COS_SECRET_KEY.")

        config = CosConfig(
            Region=settings.COS_REGION,
            SecretId=settings.COS_SECRET_ID,
            SecretKey=settings.COS_SECRET_KEY,
            Token=None,
            Scheme="https",
        )
        self.client = CosS3Client(config)

    def put_object(
        self,
        *,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        kwargs = {
            "Bucket": bucket,
            "Key": key,
            "Body": io.BytesIO(data),
        }
        if content_type:
            kwargs["ContentType"] = content_type
        if cache_control:
            kwargs["CacheControl"] = cache_control
        self.client.put_object(**kwargs)

    def put_file(
        self,
        *,
        bucket: str,
        key: str,
        file_path: str,
        content_type: Optional[str] = None,
        cache_control: Optional[str] = None,
    ) -> None:
        kwargs = {
            "Bucket": bucket,
            "Key": key,
            "LocalFilePath": file_path,
        }
        if content_type:
            kwargs["ContentType"] = content_type
        if cache_control:
            kwargs["CacheControl"] = cache_control
        self.client.upload_file(**kwargs)

    def download_to_temp(
        self,
        *,
        bucket: str,
        key: str,
        temp_dir: str,
        filename: Optional[str] = None,
    ) -> str:
        target_name = filename or Path(key).name
        dst = Path(temp_dir) / target_name
        dst.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(Bucket=bucket, Key=key, DestFilePath=str(dst))
        return str(dst)

    def generate_presigned_get_url(self, *, bucket: str, key: str, expires_seconds: int) -> str:
        return self.client.get_presigned_url(
            Method="GET",
            Bucket=bucket,
            Key=key,
            Expired=expires_seconds,
        )

    def generate_presigned_put_url(
        self,
        *,
        bucket: str,
        key: str,
        expires_seconds: int,
        content_type: Optional[str] = None,
    ) -> str:
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        kwargs = {
            "Method": "PUT",
            "Bucket": bucket,
            "Key": key,
            "Expired": expires_seconds,
        }
        if headers:
            kwargs["Headers"] = headers
        return self.client.get_presigned_url(
            **kwargs,
        )

    def head_object(self, *, bucket: str, key: str) -> dict:
        return self.client.head_object(Bucket=bucket, Key=key)

    def delete_object(self, *, bucket: str, key: str) -> None:
        self.client.delete_object(Bucket=bucket, Key=key)

    def object_exists(self, *, bucket: str, key: str) -> bool:
        try:
            self.client.head_object(Bucket=bucket, Key=key)
            return True
        except Exception:
            return False


class StorageService:
    def __init__(self) -> None:
        self.provider_name = (settings.STORAGE_PROVIDER or "local").strip().lower()
        if self.provider_name == "cos":
            self.provider: StorageProvider = CosStorageProvider()
        else:
            local_root = settings.LOCAL_STORAGE_ROOT or settings.VIDEO_UPLOAD_DIR
            self.provider = LocalStorageProvider(local_root)

    @property
    def default_bucket(self) -> str:
        if self.provider_name == "cos":
            return settings.COS_BUCKET
        return settings.LOCAL_STORAGE_BUCKET

    @property
    def signed_url_expire_seconds(self) -> int:
        return settings.COS_SIGNED_URL_EXPIRE_SECONDS

    @property
    def upload_url_expire_seconds(self) -> int:
        return settings.COS_STS_EXPIRE_SECONDS

    @property
    def key_prefix(self) -> str:
        return settings.COS_KEY_PREFIX.strip().strip("/")

    @property
    def local_temp_dir(self) -> str:
        return settings.LOCAL_TEMP_DIR

    def make_temp_dir(self, prefix: str) -> str:
        root = Path(self.local_temp_dir)
        root.mkdir(parents=True, exist_ok=True)
        temp_path = tempfile.mkdtemp(prefix=f"{prefix}-", dir=str(root))
        return temp_path

    def cleanup_temp_dir(self, path: str) -> None:
        if not path:
            return
        shutil.rmtree(path, ignore_errors=True)

    def normalize_key(self, key: str) -> str:
        normalized = key.strip().lstrip("/")
        prefix = self.key_prefix
        if prefix:
            return f"{prefix}/{normalized}"
        return normalized

    def safe_filename(self, filename: str) -> str:
        name = Path(filename or "").name.strip() or "video.mp4"
        return quote(name, safe="._-")


storage_service = StorageService()
