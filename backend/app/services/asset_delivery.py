from __future__ import annotations

import hashlib
import logging
import time
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from app.core.config import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)


class AssetDeliveryService:
    def _should_use_cdn(self, *, bucket: str) -> bool:
        if not settings.CDN_ENABLED:
            return False
        if storage_service.provider_name != "cos":
            return False
        if not settings.CDN_MEDIA_BASE_URL:
            return False
        return bucket == storage_service.default_bucket

    def _build_cdn_object_url(self, *, key: str) -> str:
        normalized_key = quote(key.strip().lstrip("/"), safe="/._-~")
        return f"{settings.CDN_MEDIA_BASE_URL}/{normalized_key}"

    def _apply_tencent_type_a_signature(self, *, raw_url: str, expires_at: int) -> str:
        secret_key = (settings.CDN_MEDIA_SIGN_KEY or "").strip()
        if not secret_key:
            raise ValueError("CDN_MEDIA_SIGN_KEY is required when anti-hotlink signature is enabled")

        parsed = urlsplit(raw_url)
        tx_time = f"{int(expires_at):X}".upper()
        tx_secret = hashlib.md5(f"{secret_key}{tx_time}{parsed.path}".encode("utf-8")).hexdigest()
        query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query_params["txSecret"] = tx_secret
        query_params["txTime"] = tx_time
        signed_query = urlencode(query_params)
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, signed_query, parsed.fragment))

    def generate_media_get_url(self, *, bucket: str, key: str) -> str:
        if self._should_use_cdn(bucket=bucket):
            media_url = self._build_cdn_object_url(key=key)
            if not settings.CDN_MEDIA_ANTI_HOTLINK_ENABLED:
                return media_url

            try:
                expires_at = int(time.time()) + int(settings.CDN_MEDIA_SIGN_EXPIRE_SECONDS)
                return self._apply_tencent_type_a_signature(raw_url=media_url, expires_at=expires_at)
            except ValueError as exc:
                logger.warning("cdn_signature_fallback_to_cos_presigned error=%s", str(exc))

        return storage_service.provider.generate_presigned_get_url(
            bucket=bucket,
            key=key,
            expires_seconds=storage_service.signed_url_expire_seconds,
        )


asset_delivery_service = AssetDeliveryService()
