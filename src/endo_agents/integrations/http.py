from __future__ import annotations

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential


class ApiError(RuntimeError):
    pass


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


http_retry = retry(
    retry=retry_if_exception(_retryable),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, max=30),
    reraise=True,
)


def raise_for_status(resp: httpx.Response) -> httpx.Response:
    """Like httpx's raise_for_status, but keeps the API's error body in the message."""
    if resp.is_error:
        raise httpx.HTTPStatusError(
            f"{resp.request.method} {resp.request.url.copy_with(query=None)} -> {resp.status_code}: {resp.text[:500]}",
            request=resp.request,
            response=resp,
        )
    return resp
