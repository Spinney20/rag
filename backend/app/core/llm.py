"""Multi-provider LLM client with structured output via Pydantic models.

Supports:
- gemini: Google Gemini 2.0 Flash (FREE) — structured via response_schema
- anthropic: Claude Sonnet (paid) — structured via tool_choice
- openai: GPT-4o (paid) — structured via json_schema

Provider selected via LLM_PROVIDER env var. Switch = change .env, zero code changes.
"""

import json
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)

# Lazy-loaded clients
_gemini_models: dict[str, object] = {}
_gemini_configured = False
_anthropic_client = None
_openai_client = None


def _get_gemini_model(model_name: str | None = None):
    global _gemini_configured
    name = model_name or settings.LLM_MODEL
    if name not in _gemini_models:
        import google.generativeai as genai
        if not _gemini_configured:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            _gemini_configured = True
        _gemini_models[name] = genai.GenerativeModel(name)
        logger.info("Gemini model loaded: %s", name)
    return _gemini_models[name]


def _get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        logger.info("Anthropic client initialized")
    return _anthropic_client


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI client initialized")
    return _openai_client


def call_llm_structured(
    prompt: str,
    response_model: type[T],
    model_name: str | None = None,
    max_retries: int = 2,
) -> T:
    """Call LLM and parse response into a Pydantic model.

    Uses provider-specific structured output mechanisms for maximum reliability.
    Falls back to prompt-based JSON with retry on validation failure.

    Args:
        prompt: The prompt text.
        response_model: Pydantic model class to parse into.
        model_name: Override model name (defaults to settings.LLM_MODEL).
        max_retries: Max retries on validation failure.

    Returns:
        Parsed Pydantic model instance.
    """
    provider = settings.LLM_PROVIDER

    if provider == "gemini":
        return _call_gemini(prompt, response_model, model_name)
    elif provider == "anthropic":
        return _call_anthropic(prompt, response_model, model_name, max_retries)
    elif provider == "openai":
        return _call_openai(prompt, response_model, model_name)
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


def call_llm_raw(prompt: str, model_name: str | None = None) -> str:
    """Call LLM and return raw text response (no structured output)."""
    provider = settings.LLM_PROVIDER

    if provider == "gemini":
        model = _get_gemini_model(model_name)
        response = model.generate_content(prompt)
        return response.text
    elif provider == "anthropic":
        client = _get_anthropic_client()
        response = client.messages.create(
            model=model_name or settings.LLM_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    elif provider == "openai":
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=model_name or settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")


# --- Provider implementations ---

def _call_gemini(prompt: str, response_model: type[T], model_name: str | None) -> T:
    """Gemini: structured output via response_schema.

    NOTE: Gemini SDK expects a Pydantic model class or genai type, NOT raw JSON Schema.
    Pydantic's model_json_schema() produces $defs/$ref which Gemini doesn't support.
    We pass the class directly and fall back to prompt-based JSON if it fails.
    """
    import google.generativeai as genai

    model = _get_gemini_model(model_name)
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=response_model,
            ),
        )
        return response_model.model_validate_json(response.text)
    except Exception as e:
        # Fallback: some Pydantic models with nested types may not work with Gemini schema
        logger.warning("Gemini structured output failed, falling back to prompt-based: %s", e)
        return _call_with_retry(prompt, response_model, 2, "gemini", model_name)


def _call_anthropic(
    prompt: str, response_model: type[T], model_name: str | None, max_retries: int
) -> T:
    """Anthropic: structured output via tool_choice."""
    client = _get_anthropic_client()
    schema = response_model.model_json_schema()

    try:
        response = client.messages.create(
            model=model_name or settings.LLM_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            tools=[{
                "name": "structured_output",
                "description": "Return structured data",
                "input_schema": schema,
            }],
            tool_choice={"type": "tool", "name": "structured_output"},
        )
        # Extract tool use result
        for block in response.content:
            if block.type == "tool_use":
                return response_model.model_validate(block.input)
        raise ValueError("No tool_use block in Anthropic response")
    except (ValidationError, ValueError) as e:
        # Fallback: prompt-based JSON with retry
        logger.warning("Anthropic tool_choice failed, falling back to prompt-based: %s", e)
        return _call_with_retry(prompt, response_model, max_retries, "anthropic", model_name)


def _call_openai(prompt: str, response_model: type[T], model_name: str | None) -> T:
    """OpenAI: structured output via json_schema response_format."""
    client = _get_openai_client()
    schema = response_model.model_json_schema()

    try:
        response = client.chat.completions.create(
            model=model_name or settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "result", "strict": True, "schema": schema},
            },
        )
        return response_model.model_validate_json(response.choices[0].message.content)
    except (ValidationError, ValueError) as e:
        logger.warning("OpenAI structured output failed, falling back: %s", e)
        return _call_with_retry(prompt, response_model, 2, "openai", model_name)


def _call_with_retry(
    prompt: str, response_model: type[T], max_retries: int, provider: str, model_name: str | None
) -> T:
    """Fallback: ask for JSON in prompt, retry on validation error."""
    schema_str = json.dumps(response_model.model_json_schema(), indent=2)
    json_prompt = prompt + f"\n\nRespond with valid JSON matching this schema:\n```json\n{schema_str}\n```"

    for attempt in range(max_retries + 1):
        raw = call_llm_raw(json_prompt, model_name)
        # Try to extract JSON from response (might have markdown fencing)
        raw_cleaned = _extract_json(raw)
        try:
            return response_model.model_validate_json(raw_cleaned)
        except ValidationError as e:
            if attempt < max_retries:
                json_prompt = (
                    f"{prompt}\n\nPrevious response was invalid:\n```\n{raw[:800]}\n```\n"
                    f"Error: {str(e)[:300]}\nPlease return valid JSON."
                )
                logger.warning("LLM structured retry %d/%d: %s", attempt + 1, max_retries, e)
            else:
                raise


def _extract_json(text: str) -> str:
    """Extract JSON from text that might have markdown fencing."""
    import re
    text = text.strip()
    # Remove markdown code fencing (handles ```json, ```JSON, ``` with newlines)
    text = re.sub(r"^```(?:json|JSON)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()
