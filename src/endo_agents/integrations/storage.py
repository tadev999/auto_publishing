from __future__ import annotations

from pathlib import Path

from ..config import Settings


def _client(settings: Settings):
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.secret('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.secret("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=settings.secret("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def upload(settings: Settings, path: Path, key: str) -> str:
    _client(settings).upload_file(str(path), settings.secret("R2_BUCKET"), key, ExtraArgs={"ContentType": "video/mp4"})
    return key


def presigned_url(settings: Settings, key: str, expires: int = 6 * 3600) -> str:
    """Short-lived private link; the bucket itself stays private."""
    return _client(settings).generate_presigned_url(
        "get_object", Params={"Bucket": settings.secret("R2_BUCKET"), "Key": key}, ExpiresIn=expires
    )
