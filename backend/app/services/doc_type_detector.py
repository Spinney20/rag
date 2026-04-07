"""FIX 34: Detect if a document was uploaded in the wrong slot.

Scans the first ~3000 characters for keywords typical of CS vs PT documents.
Returns a warning string if mismatch detected, None otherwise.
"""

CS_KEYWORDS = [
    "caiet de sarcini",
    "specificatii tehnice",
    "conditii tehnice",
    "cerinte tehnice",
    "se va executa",
    "trebuie sa respecte",
    "este obligatoriu",
    "se impune",
    "conform normativ",
    "beneficiarul",
    "autoritatea contractanta",
]

PT_KEYWORDS = [
    "propunere tehnica",
    "oferta tehnica",
    "propunem",
    "vom executa",
    "experienta similara",
    "organizare de santier",
    "grafic de executie",
    "memoriu tehnic",
    "personal propus",
    "utilaje propuse",
    "ofertantul",
]


def detect_doc_type_mismatch(text_first_3000: str, declared_type: str) -> str | None:
    """Check if document content matches its declared type.

    Args:
        text_first_3000: First ~3000 chars of the document's markdown content.
        declared_type: One of 'caiet_de_sarcini', 'fisa_de_date', 'propunere_tehnica'.

    Returns:
        Warning message if mismatch detected, None if OK or inconclusive.
    """
    text = text_first_3000.lower()
    cs_hits = sum(1 for kw in CS_KEYWORDS if kw in text)
    pt_hits = sum(1 for kw in PT_KEYWORDS if kw in text)

    if declared_type in ("caiet_de_sarcini", "fisa_de_date") and pt_hits > cs_hits + 2:
        return (
            f"Documentul pare sa fie o Propunere Tehnica, nu un {declared_type.replace('_', ' ').title()}. "
            f"(detectat: {pt_hits} cuvinte-cheie PT vs {cs_hits} cuvinte-cheie CS). "
            "Verificati ca ati ales tipul corect."
        )

    if declared_type == "propunere_tehnica" and cs_hits > pt_hits + 2:
        return (
            f"Documentul pare sa fie un Caiet de Sarcini, nu o Propunere Tehnica. "
            f"(detectat: {cs_hits} cuvinte-cheie CS vs {pt_hits} cuvinte-cheie PT). "
            "Verificati ca ati ales tipul corect."
        )

    return None
