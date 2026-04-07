"""Centralized, versioned prompt templates.

All LLM prompts live here. Changes are version-tracked via CURRENT_*_VERSION constants.
Prompt templates use {placeholder} syntax — assembled by builder functions, NOT str.format().
"""

CURRENT_EXTRACTION_VERSION = "v1.1"
CURRENT_EVALUATION_VERSION = "v1.2"

# =====================================================================
# EXTRACTION PROMPT — extract atomic requirements from CS/FDA chunks
# =====================================================================

EXTRACTION_PROMPT_BASE = """Esti un analist de licitatii publice de constructii din Romania.

SARCINA: Extrage TOATE cerintele tehnice individuale (atomice) din fragmentul de Caiet de Sarcini de mai jos.

=== REGULI ===

1. O cerinta ATOMICA = o singura obligatie verificabila.
   GRESIT: "Betonul trebuie sa fie C25/30 si armaturile din OB37"
   CORECT: Doua cerinte separate:
   - "Betonul trebuie sa fie clasa C25/30"
   - "Armaturile trebuie sa fie din otel OB37"

2. Pastreaza EXACT textul original pt fiecare cerinta (camp separat).

3. Clasifica fiecare cerinta:
   - Categorie: tehnic | administrativ | calitate | termene | personal | echipamente | materiale
   - Prioritate: obligatoriu (cuvinte: "trebuie", "va fi", "este obligatoriu", "se impune")
                  recomandat (cuvinte: "se recomanda", "este de preferat")
                  optional (cuvinte: "poate", "optional")
                  informativ (informatii de context fara obligatie)

4. Daca o cerinta refera un standard (SR EN, STAS, NP, etc.), extrage-l explicit.

5. Daca o cerinta e compusa ("X SI Y SI Z"), sparge-o in sub-cerinte dar noteaza ca sunt legate (is_compound = true).

6. Ignora textul pur informativ fara obligatii verificabile.

7. Clasifica TIPUL DE VERIFICARE necesar:
   - "match_value": PT trebuie sa contina o valoare specifica (ex: "C25/30", "20cm", "Ø16")
   - "match_reference": PT trebuie doar sa MENTIONEZE un standard/normativ
   - "match_description": PT trebuie sa descrie o abordare/metodologie/proces
   - "unverifiable": cerinta prea vaga ("conform normativelor in vigoare")

8. Daca fragmentul contine referinte la ALTE sectiuni ale CS (ex: "conform pct. 3.2.1", "vezi Anexa 5"), noteaza-le in cross_references.

9. REGULA CRITICA — CERINTE CU VALORI MULTIPLE:
   Daca un paragraf contine MULTIPLE valori numerice, specificatii SAU standarde,
   fiecare valoare/standard = O CERINTA SEPARATA. INTOTDEAUNA.
   Exemplu: "BA16 conform SR EN 13108-1, bitum 50/70, grosime 4cm" → 3+ cerinte separate.

Daca fragmentul nu contine cerinte verificabile, returneaza un obiect cu requirements = [].
"""

FDA_SUFFIX = """

NOTA SPECIALA — FISA DE DATE:
Acest document este o Fisa de Date a Achizitiei, NU un Caiet de Sarcini.
Multe cerinte se refera la CALIFICAREA ofertantului, nu la propunerea tehnica:
- Experienta similara, contracte anterioare → category="administrativ", verification_type="unverifiable"
- Certificari (ISO, OHSAS) → category="administrativ", verification_type="unverifiable"
- Garantii financiare, asigurari → category="administrativ", verification_type="unverifiable"
- Personal cu diplome/atestari specifice → category="personal", verification_type="unverifiable"
Pentru aceste cerinte, adauga in requirement_text prefixul: "[CALIFICARE] "
Doar cerintele care se refera DIRECT la continutul propunerii tehnice primesc verification_type diferit.
"""


def build_extraction_prompt(chunk_hierarchy: str, chunk_text: str, is_fda: bool = False) -> str:
    """Build the extraction prompt for a single CS/FDA chunk."""
    prompt = EXTRACTION_PROMPT_BASE

    if is_fda:
        prompt += FDA_SUFFIX

    prompt += f"""
=== FRAGMENT CAIET DE SARCINI ===
Sectiune: {chunk_hierarchy}
Text:
{chunk_text}
"""
    return prompt


# =====================================================================
# EVALUATION PROMPT — evaluate PT against a single CS requirement
# =====================================================================

EVALUATION_PROMPT_BASE = """Esti un evaluator de conformitate pentru propuneri tehnice de constructii in cadrul licitatiilor publice din Romania.

SARCINA: Evalueaza daca PROPUNEREA TEHNICA (PT) respecta o cerinta specifica din CAIETUL DE SARCINI (CS).

=== REGULI ABSOLUTE (INCALCAREA = EROARE FATALA) ===

REGULA 1: Foloseste EXCLUSIV informatia din FRAGMENTELE PT de mai jos.
NU ai voie sa folosesti cunostinte proprii, informatii din antrenament, sau presupuneri logice.

REGULA 2: Pentru FIECARE afirmatie pe care o faci, TREBUIE sa citezi TEXT EXACT din fragmentele PT. Citeaza intre ghilimele duble.

REGULA 3: Daca informatia NU exista in fragmentele date, verdictul TREBUIE sa fie INSUFFICIENT_DATA. NU ghici, NU deduce, NU presupune.

REGULA 4: Numerele, masuratorile si specificatiile tehnice trebuie sa se potriveasca EXACT. "C25/30" NU este "C20/25". "Ø16" NU este "Ø14".

REGULA 5: Daca PT spune "similar", "echivalent", "sau similar" fara a specifica EXACT, aceasta NU este conformitate deplina → verdict PARTIAL.

REGULA 6: Daca fragmentele PT mentioneaza partial cerinta, verdict = PARTIAL cu specificarea clara a ce lipseste.

REGULA 7: ALTERNATIVE SI ECHIVALENTE
Daca PT propune o alternativa diferita de cerinta CS:
- Si valoarea propusa e CLAR SUPERIOARA → verdict CONFORM + nota "PT depaseste cerinta"
- Si PT declara explicit "echivalent" fara a demonstra → verdict PARTIAL
- Si PT propune altceva FARA justificare → verdict NECONFORM

REGULA 8: SUSPICIUNE ERORI DE CONVERSIE
Daca o valoare din PT e APROAPE identica cu cea din CS dar difera cu exact 1 caracter:
- Noteaza: "POSIBILA EROARE DE CONVERSIE"
- verdict = PARTIAL, confidence_score = max 0.5

REGULA 9: INTERPRETAREA VALORILOR NUMERICE
- "minim X" / "cel putin X" → orice >= X este CONFORM
- "maxim X" / "cel mult X" → orice <= X este CONFORM
- "X" FARA calificativ → AMBIGUU. Daca PT propune valoare diferita: verdict = PARTIAL
"""

MATCH_VALUE_INSTRUCTIONS = """
ATENTIE: Aceasta cerinta necesita o VALOARE SPECIFICA in PT.
Cauta valoarea exacta. "C25/30" NU este "C20/25". "20cm" NU este "15cm".
Daca PT da o valoare mai mare decat minimul cerut, verdict = CONFORM.
Daca PT da o valoare diferita fara relatie de ordine, verdict = NECONFORM.
"""

MATCH_REFERENCE_INSTRUCTIONS = """
ATENTIE: Cerinta e doar sa MENTIONEZE standardul/normativul.
NU cauta continutul standardului in PT — doar verifica daca PT il refera.
Daca PT mentioneaza standardul (chiar cu o formulare diferita), verdict = CONFORM.
"""

MATCH_DESCRIPTION_INSTRUCTIONS = """
Cerinta necesita o DESCRIERE in PT a abordarii/metodologiei/procesului.
Verifica daca PT descrie cum va indeplini cerinta, nu doar ca o mentioneaza.
"""

UNVERIFIABLE_INSTRUCTIONS = """
Aceasta cerinta e prea generala pt verificare automata.
Verdict = INSUFFICIENT_DATA cu nota ca necesita verificare umana.
"""

VERIFICATION_TYPE_MAP = {
    "match_value": MATCH_VALUE_INSTRUCTIONS,
    "match_reference": MATCH_REFERENCE_INSTRUCTIONS,
    "match_description": MATCH_DESCRIPTION_INSTRUCTIONS,
    "unverifiable": UNVERIFIABLE_INSTRUCTIONS,
}

# Material equivalences STAS <-> SR EN (FIX 4)
EQUIVALENCES = {
    "OB37": ["BST500S", "S500"],
    "PC52": ["BST500S"],
    "B200": ["C16/20"], "B250": ["C16/20"], "B300": ["C20/25"],
    "B350": ["C25/30"], "B400": ["C30/37"], "B500": ["C35/45"],
    "OL37": ["S235JR", "S235"], "OL44": ["S275JR", "S275"], "OL52": ["S355JR", "S355"],
}


def build_evaluation_prompt(
    requirement_text: str,
    requirement_original: str,
    requirement_hierarchy: str,
    requirement_standards: list[str] | None,
    verification_type: str,
    chunks: list[dict],
) -> str:
    """Build the evaluation prompt for a single requirement against PT chunks.

    Args:
        requirement_text: Reformulated requirement text.
        requirement_original: Original CS text.
        requirement_hierarchy: Breadcrumb path in CS.
        requirement_standards: Referenced standards.
        verification_type: match_value | match_reference | match_description | unverifiable.
        chunks: List of dicts with keys: hierarchy_path, start_paragraph, end_paragraph, content_raw.
    """
    prompt = EVALUATION_PROMPT_BASE

    # Verification type instructions
    vtype_instr = VERIFICATION_TYPE_MAP.get(verification_type, "")
    if vtype_instr:
        prompt += f"\n=== INSTRUCTIUNI SPECIFICE ===\n{vtype_instr}\n"

    # Equivalences (if any standards match)
    relevant_equivs = _find_relevant_equivalences(requirement_standards)
    if relevant_equivs:
        prompt += "\n=== ECHIVALENTE TERMINOLOGICE (STAS ↔ SR EN) ===\n"
        for old, news in relevant_equivs.items():
            prompt += f"- {old} = {', '.join(news)}\n"
        prompt += "Daca CS cere una si PT ofera echivalentul, verdict CONFORM.\n"

    # Requirement details
    prompt += f"""
=== CERINTA DIN CAIETUL DE SARCINI ===
Sectiune: {requirement_hierarchy}
Cerinta: {requirement_text}
Text original CS: "{requirement_original}"
Standarde referentiate: {requirement_standards or []}
Tip verificare: {verification_type}
"""

    # PT chunks
    prompt += "\n=== FRAGMENTE DIN PROPUNEREA TEHNICA (PT) ===\n"
    for i, chunk in enumerate(chunks):
        prompt += f"--- FRAGMENT PT #{i+1} ---\n"
        prompt += f"Sursa: {chunk['hierarchy_path']}\n"
        prompt += f"Paragraf: {chunk['start_paragraph']}-{chunk['end_paragraph']}\n"
        prompt += f"Text:\n{chunk['content_raw']}\n"
        prompt += f"--- / FRAGMENT PT #{i+1} ---\n\n"

    return prompt


def _find_relevant_equivalences(standards: list[str] | None) -> dict[str, list[str]]:
    """Find material equivalences relevant to the given standards."""
    if not standards:
        return {}
    relevant = {}
    standards_lower = {s.lower().replace(" ", "") for s in standards}
    for old, news in EQUIVALENCES.items():
        old_lower = old.lower().replace(" ", "")
        if old_lower in standards_lower:
            relevant[old] = news
        for new in news:
            if new.lower().replace(" ", "") in standards_lower:
                relevant[old] = news
                break
    return relevant


# =====================================================================
# QUERY REWRITING PROMPT — multi-query for retrieval
# =====================================================================

def build_query_rewrite_prompt(requirement_text: str) -> str:
    """Build the query rewriting prompt for multi-query retrieval."""
    return f"""Esti un specialist in cautare semantica in documente tehnice de constructii.

SARCINA: Genereaza 3 interogari de cautare DIFERITE care ar putea gasi informatia relevanta pentru cerinta data, intr-o propunere tehnica de constructii.

Cerinta din Caietul de Sarcini: {requirement_text}

Gandeste-te la:
1. O reformulare directa cu sinonime tehnice din constructii
2. O cautare focusata pe cuvinte-cheie tehnice (coduri, standarde, masuratori)
3. O cautare focusata pe sectiunea din PT unde aceasta informatie ar aparea de obicei (memoriu tehnic, specificatii materiale, organizare santier)

Raspunde cu un obiect JSON cu un camp "queries" care contine o lista de 3 stringuri.
"""
