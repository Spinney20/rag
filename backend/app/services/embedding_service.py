"""Multi-provider embedding service.

Supports:
- fastembed: ONNX-based, ~50MB, for desktop .exe (default)
- local: sentence-transformers, PyTorch-based, for server (larger but more models)
- openai: text-embedding-3-small, for production (API, best quality)

Provider selected via EMBEDDING_PROVIDER env var.
"""

import os

from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Lazy-loaded clients
_fastembed_model = None
_fastembed_dims: int | None = None
_local_model = None
_openai_client = None


def _get_fastembed_model():
    """Lazy-load fastembed model (ONNX, ~50MB, downloads on first use)."""
    global _fastembed_model
    if _fastembed_model is None:
        from app.core.paths import get_data_dir
        cache_dir = os.path.join(get_data_dir(), "models")
        os.makedirs(cache_dir, exist_ok=True)

        logger.info("Loading fastembed model: %s (first time downloads ~80MB)", settings.EMBEDDING_MODEL_FASTEMBED)
        from fastembed import TextEmbedding
        _fastembed_model = TextEmbedding(
            model_name=settings.EMBEDDING_MODEL_FASTEMBED,
            cache_dir=cache_dir,
        )
        logger.info("Fastembed model ready")
    return _fastembed_model


def _get_local_model():
    """Lazy-load sentence-transformers model (PyTorch, ~500MB)."""
    global _local_model
    if _local_model is None:
        from app.core.paths import get_data_dir
        cache_dir = os.path.join(get_data_dir(), "models")
        os.makedirs(cache_dir, exist_ok=True)

        logger.info("Loading sentence-transformers model: %s", settings.EMBEDDING_MODEL_LOCAL)
        from sentence_transformers import SentenceTransformer
        _local_model = SentenceTransformer(
            settings.EMBEDDING_MODEL_LOCAL,
            cache_folder=cache_dir,
        )
        logger.info("Sentence-transformers model ready (dim=%d)",
                     _local_model.get_sentence_embedding_dimension())
    return _local_model


def _get_openai_client():
    """Lazy-load OpenAI client."""
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        logger.info("OpenAI client initialized")
    return _openai_client


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Provider from settings."""
    if not texts:
        return []

    provider = settings.EMBEDDING_PROVIDER
    if provider == "fastembed":
        return _embed_fastembed(texts)
    elif provider == "local":
        return _embed_local(texts)
    elif provider == "openai":
        return _embed_openai(texts)
    else:
        raise ValueError(f"Unknown EMBEDDING_PROVIDER: {provider}")


def _embed_fastembed(texts: list[str]) -> list[list[float]]:
    """Embed using fastembed (ONNX, lightweight)."""
    model = _get_fastembed_model()
    embeddings = list(model.embed(texts))
    result = [emb.tolist() for emb in embeddings]
    logger.info("Embedded %d texts via fastembed", len(texts))
    return result


def _embed_local(texts: list[str]) -> list[list[float]]:
    """Embed using sentence-transformers (PyTorch)."""
    model = _get_local_model()
    batch_size = 256
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        # normalize_embeddings=True: unit vectors for cosine similarity
        # OpenAI text-embedding-3-* also returns normalized vectors by default
        embeddings = model.encode(batch, show_progress_bar=False, normalize_embeddings=True)
        all_embeddings.extend(embeddings.tolist())
    logger.info("Embedded %d texts via sentence-transformers", len(texts))
    return all_embeddings


def _embed_openai(texts: list[str]) -> list[list[float]]:
    """Embed using OpenAI API."""
    client = _get_openai_client()
    batch_size = 2048
    all_embeddings: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
            dimensions=settings.EMBEDDING_DIMENSIONS,
        )
        all_embeddings.extend([item.embedding for item in response.data])
    logger.info("Embedded %d texts via OpenAI", len(texts))
    return all_embeddings


def get_dimensions() -> int:
    """Get embedding dimensions for current provider. Cached after first call."""
    global _fastembed_dims
    provider = settings.EMBEDDING_PROVIDER
    if provider == "fastembed":
        if _fastembed_dims is not None:
            return _fastembed_dims
        model = _get_fastembed_model()
        test = list(model.embed(["test"]))[0]
        _fastembed_dims = len(test)
        return _fastembed_dims
    elif provider == "local":
        model = _get_local_model()
        return model.get_sentence_embedding_dimension()
    return settings.EMBEDDING_DIMENSIONS
