"""FIX 23: Normalize Romanian diacritics and common text issues.

Unicode has TWO variants of Romanian ș and ț:
- ş (U+015F, cedilla) — incorrect but common
- ș (U+0219, comma below) — correct

Documents mix these randomly. This causes keyword search, quote verification,
and deduplication to fail silently on ~10-20% of texts.
"""

import re
import unicodedata


def normalize_romanian_chars(text: str) -> str:
    """Normalize cedilla variants to comma-below (official Romanian Unicode)."""
    return (
        text
        .replace("\u015F", "\u0219")  # ş → ș
        .replace("\u015E", "\u0218")  # Ş → Ș
        .replace("\u0163", "\u021B")  # ţ → ț
        .replace("\u0162", "\u021A")  # Ţ → Ț
    )


def normalize_whitespace(text: str) -> str:
    """Collapse multiple whitespace to single space, strip edges."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_dashes(text: str) -> str:
    """Normalize various dash characters to standard hyphen-minus."""
    return (
        text
        .replace("\u2013", "-")  # en dash
        .replace("\u2014", "-")  # em dash
        .replace("\u2012", "-")  # figure dash
        .replace("\u2010", "-")  # hyphen
    )


def normalize_quotes(text: str) -> str:
    """Normalize fancy quotes to simple quotes."""
    return (
        text
        .replace("\u201C", '"')  # left double
        .replace("\u201D", '"')  # right double
        .replace("\u201E", '"')  # double low-9
        .replace("\u2018", "'")  # left single
        .replace("\u2019", "'")  # right single
    )


def normalize_text(text: str) -> str:
    """Apply all normalizations. Call after Word parsing, before chunking."""
    text = normalize_romanian_chars(text)
    text = normalize_whitespace(text)
    text = normalize_dashes(text)
    text = normalize_quotes(text)
    return text


def strip_diacritics(text: str) -> str:
    """Remove ALL diacritics. Used for fuzzy matching / quote verification only."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
