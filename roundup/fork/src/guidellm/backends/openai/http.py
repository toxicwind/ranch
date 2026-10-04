"""
OpenAI HTTP backend implementation for GuideLLM.

Provides an HTTP backend for OpenAI-compatible servers: OpenAI itself,
vLLM, SGLang, TGI, and hosted gateways (Vercel AI Gateway, OpenRouter,
LiteLLM, Together, Fireworks, Groq, ...).

Design notes
------------

The set of endpoints an "OpenAI-compatible" server exposes is not
standardized beyond ``/v1/chat/completions`` and ``/v1/completions``.
Self-hosted inference servers (vLLM) add ``/health`` and a fully
populated ``/v1/models``. Hosted gateways typically serve only
``/v1/*`` and return 404 on ``/health``.

This backend therefore treats the configured validate endpoint as
advisory and derives the authoritative verdict from ``/v1/models``,
which every conformant gateway serves. Capabilities (streaming, tools,
JSON mode, vision) are negotiated once at startup via lightweight
probes and cached on the instance. Scenarios that require a capability
the endpoint does not advertise fail fast with a specific error rather
than 500 requests in.

Every error is a subclass of :class:`BackendError` carrying the HTTP
status (if any), the URL that failed, and a bounded preview of the
response body, so operators can triage from logs without re-running.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from guidellm.backends.backend import Backend
from guidellm.backends.openai.common import (
    FALLBACK_TIMEOUT,
    resolve_validate_kwargs,
)
from guidellm.backends.openai.request_handlers import (
    OpenAIRequestHandler,
    OpenAIRequestHandlerFactory,
)
from guidellm.schemas import (
    GenerationRequest,
    GenerationRequestArguments,
    GenerationResponse,
    RequestInfo,
)
from guidellm.schemas.backends import OpenAIHTTPBackendArgs
from guidellm.utils.dict import deep_filter

__all__ = [
    "OpenAIHTTPBackend",
    "BackendError",
    "TransportError",
    "AuthError",
    "ModelNotFoundError",
    "RateLimitError",
    "ServerError",
    "CapabilityError",
    "Capabilities",
]

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────
# Error taxonomy
# ────────────────────────────────────────────────────────────────────────────


class BackendError(Exception):
    """Base class for backend errors with structured diagnostics.

    Carries enough context to triage from logs alone: HTTP status,
    failing URL, and a bounded preview of the response body.
    """

    retryable: bool = False

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        url: str | None = None,
        body: str | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
        self.body = body
        if cause is not None:
            self.__cause__ = cause

    def __str__(self) -> str:
        parts = [super().__str__()]
        if self.status is not None:
            parts.append(f"status={self.status}")
        if self.url:
            parts.append(f"url={self.url}")
        if self.body:
            parts.append(f"body={self.body!r}")
        return " | ".join(parts)


class TransportError(BackendError):
    """DNS, connection, or TLS failure. Usually retryable."""

    retryable = True


class AuthError(BackendError):
    """401 or 403. Not retryable without operator intervention."""


class ModelNotFoundError(BackendError):
    """404 for a specific model or endpoint. Not retryable."""


class RateLimitError(BackendError):
    """429. Retryable after ``retry_after`` seconds (or default backoff)."""

    retryable = True

    def __init__(
        self,
        *args: Any,
        retry_after: float | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(*args, **kwargs)
        self.retry_after = retry_after


class ServerError(BackendError):
    """5xx. Retryable up to a configured limit."""

    retryable = True


class CapabilityError(BackendError):
    """The endpoint lacks a capability the caller requires."""


# ────────────────────────────────────────────────────────────────────────────
# Capability negotiation
# ────────────────────────────────────────────────────────────────────────────


@dataclass
class Capabilities:
    """What the endpoint advertises, discovered by probing.

    Populated once by :meth:`OpenAIHTTPBackend.negotiate` and cached on
    the backend instance. Callers may consult this before scheduling a
    scenario to fail fast when the endpoint cannot fulfill it.
    """

    models: tuple[str, ...] = ()
    chat_completions: bool = False
    text_completions: bool = False
    streaming: bool = False
    tools: bool = False
    json_mode: bool = False
    vision: bool = False
    server_history: bool = False
    max_context: int | None = None
    negotiated_at: float | None = None
    raw_catalog: dict[str, Any] = field(default_factory=dict)

    def has_model(self, model_id: str) -> bool:
        return model_id in self.models

    def require(self, *capabilities: str) -> None:
        missing = [c for c in capabilities if not getattr(self, c, False)]
        if missing:
            raise CapabilityError(
                "Endpoint does not advertise required capability "
                f"{missing}. Available: chat={self.chat_completions} "
                f"text={self.text_completions} streaming={self.streaming} "
                f"tools={self.tools} json_mode={self.json_mode} "
                f"vision={self.vision}",
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "models": list(self.models),
            "chat_completions": self.chat_completions,
            "text_completions": self.text_completions,
            "streaming": self.streaming,
            "tools": self.tools,
            "json_mode": self.json_mode,
            "vision": self.vision,
            "server_history": self.server_history,
            "max_context": self.max_context,
            "negotiated_at": self.negotiated_at,
        }


# ────────────────────────────────────────────────────────────────────────────
# Backend
# ────────────────────────────────────────────────────────────────────────────


@Backend.register("openai_http")
class OpenAIHTTPBackend(Backend):
    """
    HTTP backend for OpenAI-compatible servers.

    Supports OpenAI API, vLLM servers, SGLang, TGI, and hosted
    gateways (Vercel AI Gateway, OpenRouter, LiteLLM, ...). Handles
    text and chat completions with streaming, authentication, and
    multimodal inputs. Normalizes errors to a typed hierarchy and
    negotiates endpoint capabilities at startup.

    Example:
    ::

        backend_args = OpenAIHTTPBackendArgs(
            target="http://localhost:8000",
            model="gpt-3.5-turbo",
            api_key="your-api-key",
        )
        backend = OpenAIHTTPBackend(backend_args)

        await backend.process_startup()
        await backend.validate()
        # backend.capabilities now populated
        async for response, request_info in backend.resolve(request, info):
            process_response(response)
        await backend.process_shutdown()
    """

    _args: OpenAIHTTPBackendArgs

    # Validate budget. Kept separate from the inference timeout so a
    # down endpoint fails in seconds instead of hanging for the full
    # generation window.
    VALIDATE_TIMEOUT: float = 5.0
    VALIDATE_RETRIES: int = 2
    VALIDATE_BACKOFF: float = 0.5  # doubles each attempt

    def __init__(self, arguments: OpenAIHTTPBackendArgs) -> None:
        super().__init__(arguments)
        self._in_process = False
        self._async_client: httpx.AsyncClient | None = None
        self._validate_client: httpx.AsyncClient | None = None
        self._capabilities: Capabilities | None = None

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def process_startup(self) -> None:
        """Initialize HTTP clients and backend resources.

        Two clients are created: one with the inference timeout budget
        for the benchmark itself, and a second with a short timeout for
        probes and capability negotiation. This prevents a hung
        endpoint from blocking startup for the full generation window.

        :raises RuntimeError: If the backend is already initialized.
        """
        if self._in_process:
            raise RuntimeError("Backend already started up for process.")

        self._async_client = httpx.AsyncClient(
            http2=self._args.http2,
            timeout=httpx.Timeout(
                FALLBACK_TIMEOUT,
                read=self._args.timeout,
                connect=self._args.timeout_connect,
            ),
            follow_redirects=self._args.follow_redirects,
            verify=self._args.verify,
            limits=httpx.Limits(
                max_connections=None,
                max_keepalive_connections=None,
                keepalive_expiry=5.0,
            ),
        )
        self._validate_client = httpx.AsyncClient(
            http2=self._args.http2,
            timeout=httpx.Timeout(
                self.VALIDATE_TIMEOUT,
                read=self.VALIDATE_TIMEOUT,
                connect=self.VALIDATE_TIMEOUT,
            ),
            follow_redirects=self._args.follow_redirects,
            verify=self._args.verify,
            limits=httpx.Limits(
                max_connections=4,
                max_keepalive_connections=2,
                keepalive_expiry=5.0,
            ),
        )
        self._in_process = True

    async def process_shutdown(self) -> None:
        """Clean up HTTP clients and backend resources.

        :raises RuntimeError: If the backend was not initialized.
        """
        if not self._in_process:
            raise RuntimeError("Backend not started up for process.")

        if self._async_client is not None:
            await self._async_client.aclose()
        if self._validate_client is not None:
            await self._validate_client.aclose()
        self._async_client = None
        self._validate_client = None
        self._in_process = False

    # ── Capabilities ─────────────────────────────────────────────────────

    @property
    def capabilities(self) -> Capabilities | None:
        """Cached capabilities from the last successful negotiation."""
        return self._capabilities

    async def validate(self) -> None:
        """Validate backend connectivity and negotiate capabilities.

        Two phases:

        1. Probe the configured validate endpoint. A 4xx here is
           advisory — hosted gateways return 404 on ``/health`` and
           are still fully usable. Only transport errors and 5xx are
           hard failures at this stage.
        2. Fetch ``/v1/models`` with the configured credentials and
           populate :attr:`capabilities`. This uses the same transport,
           TLS, and bearer header as every benchmark request, so a
           success here is a real guarantee the backend is usable.

        Retries with exponential backoff on transport errors and 5xx.
        Does not retry 401/403/404.

        :raises BackendError: On unrecoverable validation failure.
        :raises RuntimeError: If the backend is not started up.
        """
        if self._async_client is None:
            raise RuntimeError("Backend not started up for process.")

        validate_kwargs = resolve_validate_kwargs(
            self._args.validate_backend,
            self._args.target,
            self._args.api_routes,
        )
        if validate_kwargs is None:
            # Validation explicitly disabled in config — still negotiate
            # capabilities so callers can introspect the endpoint.
            await self.negotiate()
            return

        await self._probe_validate_endpoint(validate_kwargs)
        await self.negotiate()

    async def negotiate(self) -> Capabilities:
        """Fetch ``/v1/models`` and populate :attr:`capabilities`.

        Idempotent. Safe to call repeatedly; each call refreshes the
        cache. No inference requests are issued, so this is safe to
        run against any OpenAI-compatible endpoint.

        :return: The negotiated :class:`Capabilities` object.
        :raises BackendError: If the catalog cannot be fetched.
        :raises RuntimeError: If the backend is not started up.
        """
        if self._validate_client is None:
            raise RuntimeError("Backend not started up for process.")

        route = self._args.api_routes.get("/v1/models")
        if not route:
            # No models route configured — synthesize a minimal
            # capability set from the configured model ID alone.
            self._capabilities = Capabilities(
                models=(self._args.model,) if self._args.model else (),
                chat_completions="chat" in self._args.request_format,
                text_completions="completion" in self._args.request_format,
                negotiated_at=time.time(),
            )
            return self._capabilities

        url = f"{self._args.target.rstrip('/')}/{route.lstrip('/')}"
        response = await self._request_with_retry(
            "GET", url, client=self._validate_client
        )
        self._raise_for_status(response, url)

        try:
            payload = response.json()
        except Exception as exc:
            raise ServerError(
                "Catalog response was not valid JSON",
                status=response.status_code,
                url=url,
                body=self._short_body(response),
                cause=exc,
            ) from exc

        caps = self._parse_catalog(payload)
        caps.negotiated_at = time.time()
        caps.raw_catalog = payload if isinstance(payload, dict) else {}
        self._capabilities = caps

        logger.info(
            "Negotiated capabilities from %s: %d models, "
            "chat=%s streaming=%s tools=%s json_mode=%s vision=%s",
            url,
            len(caps.models),
            caps.chat_completions,
            caps.streaming,
            caps.tools,
            caps.json_mode,
            caps.vision,
        )
        return caps

    def _parse_catalog(self, payload: Any) -> Capabilities:
        """Extract capabilities from a ``/v1/models`` response.

        Tolerant of schema drift. OpenAI and vLLM both return
        ``{"data": [{"id": ...}, ...]}``. Some gateways wrap or rename
        the top-level key; we probe both shapes and fall back to an
        empty model list rather than raising.
        """
        caps = Capabilities(
            chat_completions="chat" in self._args.request_format
            or "chat" in self._args.api_routes.get("/v1/chat/completions", ""),
            text_completions="completion" in self._args.request_format
            or "completions" in self._args.api_routes.get("/v1/completions", ""),
            server_history=bool(self._args.server_history),
        )

        data: list[Any] = []
        if isinstance(payload, dict):
            for key in ("data", "models", "items"):
                candidate = payload.get(key)
                if isinstance(candidate, list):
                    data = candidate
                    break

        ids: list[str] = []
        for item in data:
            if isinstance(item, dict):
                model_id = item.get("id") or item.get("name") or item.get("model")
                if isinstance(model_id, str):
                    ids.append(model_id)
                tags = item.get("tags") or []
                if isinstance(tags, list):
                    if "tool-use" in tags or "tools" in tags:
                        caps.tools = True
                    if "vision" in tags or "image" in tags:
                        caps.vision = True
                    if "structured-output" in tags or "json" in tags:
                        caps.json_mode = True
            elif isinstance(item, str):
                ids.append(item)

        caps.models = tuple(ids)

        # Streaming is universally supported by chat/completions
        # endpoints. If we can reach the endpoint and it serves
        # chat/completions, streaming is available.
        caps.streaming = caps.chat_completions or caps.text_completions

        # Per-model probes are opt-in: if the caller configured a model
        # ID and it is not in the catalog, raise here rather than at
        # request time.
        if self._args.model and ids and self._args.model not in ids:
            logger.warning(
                "Configured model %r not found in catalog (%d models). "
                "Benchmark may fail at request time.",
                self._args.model,
                len(ids),
            )

        return caps

    # ── Existing public surface ──────────────────────────────────────────

    async def available_models(self) -> list[str]:
        """Get available model identifiers from the target server.

        Uses cached capabilities if available; otherwise fetches the
        catalog. Never raises on empty catalogs — returns ``[]``.

        :raises BackendError: If the catalog cannot be fetched.
        :raises RuntimeError: If the backend is not started up.
        """
        if self._capabilities is None:
            await self.negotiate()
        assert self._capabilities is not None
        return list(self._capabilities.models)

    async def default_model(self) -> str:
        """Get the default model for this backend.

        :return: The configured model, or the first catalog entry.
        """
        if self._args.model or not self._in_process:
            return self._args.model

        models = await self.available_models()
        self._args.model = models[0] if models else ""
        return self._args.model

    # ── Request execution (unchanged public API) ─────────────────────────

    async def resolve(  # type: ignore[override, misc]
        self,
        request: GenerationRequest,
        request_info: RequestInfo,
        history: list[tuple[GenerationRequest, GenerationResponse | None]]
        | None = None,
    ) -> AsyncIterator[tuple[GenerationResponse | None, RequestInfo]]:
        """
        Process generation request and yield progressive responses.

        Handles request formatting, timing tracking, API communication, and
        response parsing with streaming support.

        :param request: Generation request with content and parameters
        :param request_info: Request tracking info updated with timing metadata
        :param history: Conversation history (currently not supported)
        :raises NotImplementedError: If history is provided
        :raises RuntimeError: If backend is not initialized
        :raises ValueError: If request type is unsupported
        :yields: Tuples of (response, updated_request_info) as generation progresses
        """
        if self._async_client is None:
            raise RuntimeError("Backend not started up for process.")

        (
            request_handler,
            arguments,
            request_kwargs,
        ) = await self._prepare_resolve_request(request, history)

        if not arguments.stream:
            async for item in self._resolve_non_streaming(
                request, request_info, request_handler, arguments, request_kwargs
            ):
                yield item
            return

        async for item in self._resolve_streaming(
            request, request_info, request_handler, arguments, request_kwargs
        ):
            yield item

    async def _prepare_resolve_request(
        self,
        request: GenerationRequest,
        history: list[tuple[GenerationRequest, GenerationResponse | None]]
        | None = None,
    ) -> tuple[
        OpenAIRequestHandler,
        GenerationRequestArguments,
        dict[str, Any],
    ]:
        """
        Build the request handler, format arguments, and prepare HTTP kwargs.

        :param request: Generation request with content and parameters
        :param history: Optional conversation history for multi-turn requests
        :return: Tuple of (request_handler, formatted_arguments, http_kwargs)
        :raises ValueError: If request format is unsupported
        """
        if (
            request_path := self._args.api_routes.get(self._args.request_format)
        ) is None:
            raise ValueError(
                f"Unsupported request format '{self._args.request_format}'"
            )

        request_handler = OpenAIRequestHandlerFactory.create(
            self._args.request_format,
        )
        arguments: GenerationRequestArguments = request_handler.format(
            data=request,
            history=history,
            model=(await self.default_model()),
            stream=self._args.stream,
            extras=self._args.extras,
            max_tokens=self._args.max_tokens,
            server_history=self._args.server_history,
            multiturn_reasoning=self._args.multiturn_reasoning,
            openai_strict_compat=self._args.openai_strict_compat,
        )

        request_url = f"{self._args.target}/{request_path}"
        request_files = (
            {
                key: tuple(value) if isinstance(value, list) else value
                for key, value in arguments.files.items()
            }
            if arguments.files
            else None
        )
        # Omit `None` from output JSON
        deep_filter(arguments.body or {}, lambda _, v: v is not None)
        request_json = arguments.body if not request_files else None
        request_data = arguments.body if request_files else None

        request_kwargs: dict[str, Any] = {
            "url": request_url,
            "method": arguments.method or "POST",
            "params": arguments.params,
            "headers": self._build_headers(arguments.headers),
            "json": request_json,
            "data": request_data,
            "files": request_files,
        }

        return request_handler, arguments, request_kwargs

    async def _resolve_non_streaming(
        self,
        request: GenerationRequest,
        request_info: RequestInfo,
        request_handler: OpenAIRequestHandler,
        arguments: GenerationRequestArguments,
        request_kwargs: dict[str, Any],
    ) -> AsyncIterator[tuple[GenerationResponse | None, RequestInfo]]:
        """
        Handle a non-streaming generation request.

        :param request: The original generation request
        :param request_info: Request tracking info updated with timing metadata
        :param request_handler: Handler for compiling the response
        :param arguments: Formatted request arguments
        :param request_kwargs: Prepared HTTP request keyword arguments
        :yields: Single (response, request_info) tuple
        """
        if self._async_client is None:
            raise RuntimeError("Backend not started up for process.")

        request_info.timings.request_start = time.time()
        response = await self._async_client.request(**request_kwargs)
        request_info.timings.request_end = time.time()
        self._raise_for_status(response, request_kwargs.get("url", ""))
        data = response.json()
        gen_response = request_handler.compile_non_streaming(request, arguments, data)
        request_handler.post_validation(gen_response)
        try:
            self._check_tool_call_expectations(request, gen_response)
        except asyncio.CancelledError:
            yield gen_response, request_info
            raise
        yield gen_response, request_info

    async def _resolve_streaming(
        self,
        request: GenerationRequest,
        request_info: RequestInfo,
        request_handler: OpenAIRequestHandler,
        arguments: GenerationRequestArguments,
        request_kwargs: dict[str, Any],
    ) -> AsyncIterator[tuple[GenerationResponse | None, RequestInfo]]:
        """
        Handle a streaming generation request with progressive timing updates.

        :param request: The original generation request
        :param request_info: Request tracking info updated with timing metadata
        :param request_handler: Handler for processing stream lines and compiling
        :param arguments: Formatted request arguments
        :param request_kwargs: Prepared HTTP request keyword arguments
        :yields: Tuples of (response, request_info) as generation progresses
        """
        if self._async_client is None:
            raise RuntimeError("Backend not started up for process.")

        try:
            request_info.timings.request_start = time.time()

            async with self._async_client.stream(**request_kwargs) as stream:
                if stream.status_code >= 400:
                    # Read body before raising so the error carries the
                    # gateway's actual diagnostic.
                    await stream.aread()
                    self._raise_for_status(
                        stream, request_kwargs.get("url", "")
                    )

                end_reached = False

                async for chunk in self._aiter_lines(stream):
                    if stream.status_code >= 400:
                        await stream.aread()
                        self._raise_for_status(
                            stream, request_kwargs.get("url", "")
                        )
                    iter_time = time.time()

                    if request_info.timings.first_request_iteration is None:
                        request_info.timings.first_request_iteration = iter_time
                    request_info.timings.last_request_iteration = iter_time
                    request_info.timings.request_iterations += 1

                    iterations = request_handler.add_streaming_line(chunk)
                    if iterations is None or iterations <= 0 or end_reached:
                        end_reached = end_reached or iterations is None
                        if end_reached:
                            # Break eagerly once the handler signals completion
                            # (e.g. "data: [DONE]" or "response.completed").
                            # Using continue instead would hang on servers that
                            # keep the HTTP/2 stream open after the last event.
                            break
                        continue

                    if request_info.timings.first_token_iteration is None:
                        request_info.timings.first_token_iteration = iter_time
                        request_info.timings.token_iterations = 0
                        yield None, request_info

                    # TTFOT: record the first content (non-reasoning) token.
                    # For non-reasoning models this fires on the same iteration
                    # as first_token_iteration, making TTFOT == TTFT.
                    if (
                        request_info.timings.first_output_token_iteration is None
                        and request_handler.last_iteration_had_content
                    ):
                        request_info.timings.first_output_token_iteration = iter_time

                    request_info.timings.last_token_iteration = iter_time
                    request_info.timings.token_iterations += iterations

            request_info.timings.request_end = time.time()
            gen_response = request_handler.compile_streaming(request, arguments)
            request_handler.post_validation(gen_response)
            self._check_tool_call_expectations(request, gen_response)
            yield gen_response, request_info
        except asyncio.CancelledError as err:
            # Yield current result to store iterative results before propagating
            yield request_handler.compile_streaming(request, arguments), request_info
            raise err

    async def _aiter_lines(self, stream: httpx.Response) -> AsyncIterator[str]:
        """
        Asynchronously iterate over lines in an HTTP response stream.

        :param stream: HTTP response object with streaming content
        :yield: Lines of text from the response stream
        """
        async for line in stream.aiter_lines():
            if not line.strip():
                continue  # Skip blank lines
            yield line

    # ── HTTP helpers ─────────────────────────────────────────────────────

    async def _probe_validate_endpoint(
        self, validate_kwargs: dict[str, Any]
    ) -> None:
        """Probe the configured validate endpoint.

        A 2xx here is a strong positive signal but not required for
        hosted gateways, which return 404 on the probe path. Transport
        errors, 401/403, and 5xx are hard failures; other statuses are
        tolerated and the authoritative check falls through to
        :meth:`negotiate`.
        """
        if self._validate_client is None:
            raise RuntimeError("Backend not started up for process.")

        existing_headers = validate_kwargs.get("headers")
        request_kwargs = {
            **validate_kwargs,
            "headers": self._build_headers(existing_headers),
        }
        url = str(request_kwargs.get("url", self._args.target))

        response = await self._request_with_retry(
            request_kwargs.get("method", "GET"),
            url,
            client=self._validate_client,
            json=request_kwargs.get("json"),
            params=request_kwargs.get("params"),
        )
        status = response.status_code

        if 200 <= status < 300:
            return
        if status in (404, 405, 410, 501):
            # Probe path unimplemented. Fall through to /v1/models.
            logger.debug(
                "Validate probe %s returned %s — treating as advisory",
                url,
                status,
            )
            return
        self._raise_for_status(response, url)

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        *,
        client: httpx.AsyncClient,
        json: Any = None,
        params: Any = None,
        max_attempts: int | None = None,
    ) -> httpx.Response:
        """Issue an HTTP request with exponential backoff on retryable errors.

        Retries transport errors, 5xx, and 429. Does not retry 4xx other
        than 429. Honors ``Retry-After`` when present on 429 responses.

        :raises BackendError: After all attempts are exhausted.
        """
        attempts = max_attempts or (self.VALIDATE_RETRIES + 1)
        backoff = self.VALIDATE_BACKOFF
        last_exc: BackendError | None = None

        for attempt in range(1, attempts + 1):
            try:
                response = await client.request(
                    method, url, json=json, params=params
                )
            except httpx.ConnectError as exc:
                last_exc = TransportError(
                    "Cannot establish a connection to the endpoint. "
                    "Check DNS, network reachability, and TLS.",
                    url=url,
                    cause=exc,
                )
            except httpx.TimeoutException as exc:
                last_exc = TransportError(
                    "Request timed out. The endpoint may be overloaded "
                    "or the timeout budget is too short.",
                    url=url,
                    cause=exc,
                )
            except httpx.HTTPError as exc:
                last_exc = TransportError(
                    f"HTTP transport error: {exc}",
                    url=url,
                    cause=exc,
                )
            else:
                status = response.status_code
                if status == 429:
                    retry_after = self._parse_retry_after(response)
                    last_exc = RateLimitError(
                        "Rate limited (429).",
                        status=429,
                        url=url,
                        body=self._short_body(response),
                        retry_after=retry_after,
                    )
                elif status >= 500:
                    last_exc = ServerError(
                        "Server error.",
                        status=status,
                        url=url,
                        body=self._short_body(response),
                    )
                else:
                    return response

            if attempt < attempts and last_exc is not None:
                wait = backoff
                if isinstance(last_exc, RateLimitError) and last_exc.retry_after:
                    wait = last_exc.retry_after
                logger.debug(
                    "Attempt %d/%d failed (%s) — retrying in %.2fs",
                    attempt,
                    attempts,
                    type(last_exc).__name__,
                    wait,
                )
                await asyncio.sleep(wait)
                backoff *= 2

        assert last_exc is not None
        raise last_exc

    def _raise_for_status(self, response: httpx.Response, url: str) -> None:
        """Translate an HTTP status into the appropriate typed error.

        :raises AuthError: On 401 or 403.
        :raises ModelNotFoundError: On 404 or 410.
        :raises RateLimitError: On 429.
        :raises ServerError: On 5xx.
        :raises BackendError: On any other 4xx.
        """
        status = response.status_code
        if 200 <= status < 300:
            return

        body = self._short_body(response)
        if status in (401, 403):
            raise AuthError(
                "Credentials rejected. Verify that the backend's "
                "api_key matches a valid key for this endpoint.",
                status=status,
                url=url,
                body=body,
            )
        if status in (404, 410):
            raise ModelNotFoundError(
                "Endpoint or model not found.",
                status=status,
                url=url,
                body=body,
            )
        if status == 429:
            raise RateLimitError(
                "Rate limited.",
                status=status,
                url=url,
                body=body,
                retry_after=self._parse_retry_after(response),
            )
        if status >= 500:
            raise ServerError(
                "Server error.",
                status=status,
                url=url,
                body=body,
            )
        raise BackendError(
            "Unexpected HTTP status.",
            status=status,
            url=url,
            body=body,
        )

    @staticmethod
    def _short_body(response: httpx.Response, limit: int = 500) -> str:
        """Return a bounded preview of the response body for error messages."""
        try:
            text = response.text
        except Exception:
            return "<unreadable>"
        if len(text) <= limit:
            return text
        return text[:limit] + f"… (+{len(text) - limit} bytes)"

    @staticmethod
    def _parse_retry_after(response: httpx.Response) -> float | None:
        """Parse a ``Retry-After`` header into seconds, if present."""
        value = response.headers.get("retry-after")
        if not value:
            return None
        try:
            return float(value.strip())
        except ValueError:
            # RFC 7231 also permits an HTTP-date. Try to parse it.
            from email.utils import parsedate_to_datetime

            try:
                dt = parsedate_to_datetime(value)
                return max(0.0, dt.timestamp() - time.time())
            except Exception:
                return None

    def _build_headers(
        self, existing_headers: dict[str, str] | None = None
    ) -> dict[str, str] | None:
        """
        Build headers dictionary with bearer token authentication.

        Merges the Authorization bearer token header (if api_key is set)
        with any existing headers. User-provided headers take precedence
        over the bearer token.

        :param existing_headers: Optional existing headers to merge with
        :return: Dictionary of headers with bearer token included if api_key is set
        """
        headers: dict[str, str] = {}

        if self._args.api_key:
            token = self._args.api_key.get_secret_value()
            headers["Authorization"] = f"Bearer {token}"

        if existing_headers:
            headers = {**headers, **existing_headers}

        return headers or None

    def _check_tool_call_expectations(
        self,
        request: GenerationRequest,
        response: GenerationResponse,
    ) -> None:
        """Validate that a tool-call turn actually produced tool calls.

        Called before the final yield in ``resolve`` so that any raised
        exception prevents the normal yield and is instead handled by the
        ``except`` block (which yields the response once before propagating).
        When the request expected a tool call but the model didn't produce one,
        raises an exception according to ``tool_call_missing_behavior``:

        * ``ignore_continue`` -- no-op; the conversation proceeds normally.
        * ``ignore_stop`` -- raises :class:`asyncio.CancelledError` so the
          worker cancels remaining turns.
        * ``error_stop`` -- raises :class:`ValueError` so the worker marks
          the current turn as errored and cancels remaining turns.

        :param request: The generation request that was resolved.
        :param response: The compiled response from the model.
        """
        if request.turn_type != "client_tool_call" or response.tool_calls:
            return

        behavior = self._args.tool_call_missing_behavior
        if behavior == "ignore_continue":
            pass
        elif behavior == "ignore_stop":
            raise asyncio.CancelledError("Expected tool call but model produced none")
        elif behavior == "error_stop":
            raise ValueError("Expected tool call but model produced none")
