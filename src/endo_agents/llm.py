from __future__ import annotations

import base64
import json
from functools import cached_property
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .config import Settings

T = TypeVar("T", bound=BaseModel)

_retry_on_bad_output = retry(
    retry=retry_if_exception_type((ValidationError, json.JSONDecodeError, StopIteration)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, max=10),
    reraise=True,
)


def inline_schema(model: type[BaseModel]) -> dict:
    """Pydantic schema with $refs resolved, so every provider accepts it."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {k: resolve(v) for k, v in node.items()}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


class LLM:
    def __init__(self, settings: Settings):
        self.settings = settings

    @cached_property
    def anthropic(self):
        import anthropic

        return anthropic.Anthropic(api_key=self.settings.secret("ANTHROPIC_API_KEY"), max_retries=4)

    @cached_property
    def openai(self):
        import openai

        return openai.OpenAI(api_key=self.settings.secret("OPENAI_API_KEY"), max_retries=4)

    @_retry_on_bad_output
    def claude(
        self,
        model: str,
        system: list[str],
        user: str,
        schema: type[T],
        max_tokens: int = 4000,
        temperature: float = 0.8,
    ) -> T:
        """Structured output via forced tool use. The last system block is prompt-cached."""
        blocks = [{"type": "text", "text": s} for s in system]
        if blocks:
            blocks[-1]["cache_control"] = {"type": "ephemeral"}
        tool = {
            "name": "submit",
            "description": "Submit the final structured result.",
            "input_schema": inline_schema(schema),
        }
        resp = self.anthropic.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=blocks,
            tools=[tool],
            tool_choice={"type": "tool", "name": "submit"},
            messages=[{"role": "user", "content": user}],
        )
        block = next(b for b in resp.content if b.type == "tool_use")
        return schema.model_validate(block.input)

    @_retry_on_bad_output
    def gpt(
        self,
        model: str,
        system: str,
        user: str,
        schema: type[T],
        images: list[bytes] | None = None,
        temperature: float = 0.2,
    ) -> T:
        system = (
            f"{system}\n\nRespond ONLY with a JSON object that matches this JSON schema:\n"
            f"{json.dumps(inline_schema(schema), ensure_ascii=False)}"
        )
        content: list[dict] | str = user
        if images:
            content = [{"type": "text", "text": user}] + [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64.b64encode(img).decode()}"},
                }
                for img in images
            ]
        resp = self.openai.chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
        )
        return schema.model_validate_json(resp.choices[0].message.content or "")
