"""Multi-provider embedding service.

Supports:
- local: sentence-transformers (free, CPU, 384 dim) — for testing
- openai: text-embedding-3-small (paid, 1536 dim) — for production

Provider is selected via EMBEDDING_PROVIDER env var.
Switch is transparent — same interface regardless of provider.
"""

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Lazy-loaded clients (avoids heavy init on import)
_local_model = None
_openai_client = None


def _get_local_model():
    """Lazy-load sentence-transformers model."""
    global _local_model
    if _local_model is None:
        logger.info("Loading local embedding model: %s", settings.EMBEDDING_MODEL_LOCAL)
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer(settings.EMBEDDING_MODEL_LOCAL)
        logger.info(
            "Local embedding model loaded: dim=%d",
            _local_model.get_sentence_embedding_dimension(),
        )
    return _local_model


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts into vectors.

    Args:
        texts: List of text strings to embed.

    Returns:
        List of embedding vectors (each a list of floats).
    """
    if not texts:
        return []

    if settings.EMBEDDING_PROVIDER == "local":
        return _embed_local(texts)
    elif settings.EMBEDDING_PROVIDER == "openai":
        return _embed_openai(texts)
    else:
        raise ValueError(f"Unknown EMBEDDING_PROVIDER: {settings.EMBEDDING_PROVIDER}")


def _embed_local(texts: list[str]) -> list[list[float]]:
    """Embed using local sentence-transformers model."""
    model = _get_local_model()
    # Process in batches of 256 (sentence-transformers default)
    batch_size = 256
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        # normalize_embeddings=True: unit vectors for cosine similarity
        # OpenAI text-embedding-3-* also returns normalized vectors by default
        embeddings = model.encode(batch, show_progress_bar=False, normalize_embeddings=True)
        all_embeddings.extend(embeddings.tolist())

    logger.info("Embedded %d texts locally (dim=%d)", len(texts), settings.EMBEDDING_DIMENSIONS)
    return all_embeddings


def _get_openai_client():
    """Lazy-load OpenAI client (reuse connection pool across calls)."""
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI client initialized")
    return _openai_client


def _embed_openai(texts: list[str]) -> list[list[float]]:
    """Embed using OpenAI API."""
    client = _get_openai_client()

    # OpenAI supports up to 2048 texts per request
    batch_size = 2048
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
            dimensions=settings.EMBEDDING_DIMENSIONS,
        )
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    logger.info("Embedded %d texts via OpenAI (model=%s)", len(texts), settings.EMBEDDING_MODEL)
    return all_embeddings


def get_dimensions() -> int:
    """Get the embedding dimensions for the current provider."""
    if settings.EMBEDDING_PROVIDER == "local":
        model = _get_local_model()
        return model.get_sentence_embedding_dimension()
    return settings.EMBEDDING_DIMENSIONS
