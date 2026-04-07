"""Chunking service — the MOST CRITICAL anti-hallucination component.

Splits Markdown (from Word parser) into chunks with:
- Hierarchical context (breadcrumbs from headings)
- Dual storage: content_with_context (for embedding) + content_raw (for citation)
- Sentence boundary respect (never cut mid-sentence)
- Table atomicity (tables = single chunk)
- 2-sentence overlap between consecutive chunks
- Standard reference detection (SR EN, STAS, NP, etc.)

Based on PLAN.md Section 5: Chunking Algorithm in 5 phases.
"""

import re
from dataclasses import dataclass, field

from app.core.logging import get_logger

logger = get_logger(__name__)

# --- Constants ---

MAX_CHUNK_TOKENS = 1024
OVERLAP_SENTENCES = 2

# Romanian abbreviations that should NOT be treated as sentence endings
ABBREVIATIONS = {
    "art", "nr", "pct", "lit", "alin", "cap", "sect", "fig", "tab",
    "ing", "arh", "dr", "prof", "conf", "sr", "en", "vol", "ed",
    "tel", "fax", "str", "mun", "jud", "loc", "com", "sat",
}

# Standard reference patterns
STANDARD_PATTERNS = [
    re.compile(r"SR\s*EN\s*[\d:–\-/]+", re.IGNORECASE),
    re.compile(r"STAS\s*[\d/–\-]+", re.IGNORECASE),
    re.compile(r"NP\s*\d+[-–/]\d+", re.IGNORECASE),
    re.compile(r"EN\s*\d+[-–:]?\d*"),
    re.compile(r"ISO\s*\d+[-–:]?\d*"),
    re.compile(r"P\s*\d+[-–/]\d+"),
    re.compile(r"C\s*\d+[-–/]\d+"),
    re.compile(r"GP\s*\d+[-–/]\d+"),
    re.compile(r"NE\s*\d+[-–/]\d+"),
]

# Regex fallback for headings (when Word styles are missing)
HEADING_FALLBACK_PATTERNS = {
    1: [
        re.compile(r"^(?:CAPITOLUL|CAPITOL|Cap\.?)\s*(\d+|[IVXLC]+)[\s.:–\-]*(.*)", re.IGNORECASE),
        re.compile(r"^(\d+)\.\s*(?:CAPITOLUL|CAPITOL)\s*(.*)", re.IGNORECASE),
    ],
    2: [
        re.compile(r"^(?:Art(?:icolul)?\.?|Sect(?:iunea)?\.?)\s*(\d+\.\d+)[\s.:–\-]*(.*)", re.IGNORECASE),
        re.compile(r"^(\d+\.\d+)\.?\s+([A-ZĂÎȘȚÂ].{2,})"),
    ],
    3: [
        re.compile(r"^(\d+\.\d+\.\d+)\.?\s+(.+)"),
    ],
    4: [
        re.compile(r"^(\d+\.\d+\.\d+\.\d+)\.?\s+(.+)"),
        # NOTE: a)/b)/1)/2) patterns disabled as fallback — too aggressive on normal list items.
        # They match any "1) text" which creates false headings. In DOCX-only mode,
        # real headings come from Word styles (# Markdown). These would only help
        # on docs with no Word styles at all, where the false positive cost is too high.
    ],
}

TABLE_LINE_RE = re.compile(r"^\|.*\|")


# --- Data structures ---

@dataclass
class IndexedLine:
    """A line of text with its original line index in the markdown."""
    text: str
    line_index: int


@dataclass
class HierarchyNode:
    level: int
    section_id: str | None
    title: str
    breadcrumb: str = ""
    lines: list[IndexedLine] = field(default_factory=list)
    children: list["HierarchyNode"] = field(default_factory=list)
    start_para: int = 0
    end_para: int = 0


@dataclass
class ChunkData:
    """Data for a single chunk, ready to be inserted into DB."""
    chunk_index: int
    hierarchy_path: str
    section_id: str | None
    section_title: str | None
    hierarchy_level: int
    content_with_context: str
    content_raw: str
    start_paragraph: int
    end_paragraph: int
    chunk_type: str  # text | table | mixed
    token_count: int
    detected_standards: list[str]
    table_quality_score: float | None = None
    needs_review: bool = False


# --- Main entry point ---

def chunk_document(
    markdown: str,
    heading_levels: list | None = None,
) -> list[ChunkData]:
    """Split markdown into chunks with hierarchical context.

    Args:
        markdown: Full markdown text from Word parser (with # headings).
        heading_levels: Unused (kept for API compatibility). Headings are detected
                       from Markdown # syntax, not from paragraph indices.

    Returns:
        List of ChunkData objects ready for DB insertion.
    """
    lines = markdown.split("\n")

    # PHASE 1: Classify lines
    # NOTE: Word headings are already converted to Markdown # prefixes by word_parser_service.
    # We DON'T use heading_map by paragraph_index (indices drift due to blank lines).
    # Instead, we detect headings from Markdown syntax + regex fallback.
    classified = _classify_lines(lines)

    # PHASE 2: Build hierarchy tree
    root = _build_hierarchy_tree(classified)

    # PHASE 3: Generate breadcrumbs
    _generate_breadcrumbs(root, "")

    # PHASE 4+5: Chunk with rules
    chunks: list[ChunkData] = []
    _process_node(root, chunks)

    # Assign sequential indices
    for i, chunk in enumerate(chunks):
        chunk.chunk_index = i

    logger.info("Chunked document: %d chunks generated", len(chunks))
    return chunks


# --- Phase 1: Line Classification ---

@dataclass
class ClassifiedLine:
    text: str
    line_index: int
    heading_level: int  # 0 = not a heading
    section_id: str | None
    title: str | None
    is_table_line: bool
    standards: list[str]


def _classify_lines(lines: list[str]) -> list[ClassifiedLine]:
    """Classify each line as heading, table, or text.

    Headings are detected from Markdown # syntax (set by word_parser_service)
    and regex fallback patterns (for docs converted from PDF without Word styles).
    """
    result = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue

        standards = _extract_standards(stripped)

        if stripped.startswith("#"):
            # Markdown heading (from Word parser)
            level = len(stripped) - len(stripped.lstrip("#"))
            title = stripped.lstrip("# ").strip()
            section_id = _extract_section_id(title)
            result.append(ClassifiedLine(
                text=title,
                line_index=i,
                heading_level=min(level, 4),
                section_id=section_id,
                title=title,
                is_table_line=False,
                standards=standards,
            ))
        elif TABLE_LINE_RE.match(stripped):
            result.append(ClassifiedLine(
                text=stripped,
                line_index=i,
                heading_level=0,
                section_id=None,
                title=None,
                is_table_line=True,
                standards=standards,
            ))
        else:
            # Try regex fallback for headings in docs without Word styles
            fb_level, fb_sid, fb_title = _try_fallback_heading(stripped)
            result.append(ClassifiedLine(
                text=stripped,
                line_index=i,
                heading_level=fb_level,
                section_id=fb_sid or None,
                title=fb_title or None,
                is_table_line=False,
                standards=standards,
            ))

    return result


def _extract_section_id(text: str) -> str | None:
    """Extract section ID like '3.2.1' from heading text."""
    match = re.match(r"^(\d+(?:\.\d+)*)", text.strip())
    return match.group(1) if match else None


def _extract_standards(text: str) -> list[str]:
    """Extract all standard references (SR EN, STAS, etc.) from text."""
    standards = set()
    for pattern in STANDARD_PATTERNS:
        for match in pattern.finditer(text):
            standards.add(match.group().strip())
    return sorted(standards)


def _try_fallback_heading(text: str) -> tuple[int, str | None, str | None]:
    """Try regex fallback patterns for heading detection."""
    for level, patterns in HEADING_FALLBACK_PATTERNS.items():
        for pattern in patterns:
            match = pattern.match(text)
            if match:
                groups = match.groups()
                section_id = groups[0] if groups else None
                title = groups[1].strip() if len(groups) > 1 else text
                return level, section_id, title
    return 0, None, None


# --- Phase 2: Build Hierarchy Tree ---

def _build_hierarchy_tree(classified: list[ClassifiedLine]) -> HierarchyNode:
    """Build a tree from classified lines using a stack-based approach."""
    root = HierarchyNode(level=0, section_id=None, title="Document")
    stack = [root]

    current_table_lines: list[tuple[str, int]] = []  # (text, line_index)

    for cl in classified:
        # Flush accumulated table lines
        if not cl.is_table_line and current_table_lines:
            table_text = "\n".join(t for t, _ in current_table_lines)
            first_idx = current_table_lines[0][1]
            last_idx = current_table_lines[-1][1]
            stack[-1].lines.append(IndexedLine(text=table_text, line_index=first_idx))
            stack[-1].end_para = last_idx
            current_table_lines = []

        if cl.heading_level > 0:
            node = HierarchyNode(
                level=cl.heading_level,
                section_id=cl.section_id,
                title=cl.title or cl.text,
                start_para=cl.line_index,
            )
            # Pop stack until we find a parent with lower level
            while len(stack) > 1 and stack[-1].level >= cl.heading_level:
                stack.pop()
            stack[-1].children.append(node)
            stack.append(node)
        elif cl.is_table_line:
            current_table_lines.append((cl.text, cl.line_index))
        else:
            stack[-1].lines.append(IndexedLine(text=cl.text, line_index=cl.line_index))
            stack[-1].end_para = cl.line_index

    # Flush remaining table lines
    if current_table_lines:
        table_text = "\n".join(t for t, _ in current_table_lines)
        first_idx = current_table_lines[0][1]
        last_idx = current_table_lines[-1][1]
        stack[-1].lines.append(IndexedLine(text=table_text, line_index=first_idx))
        stack[-1].end_para = last_idx

    return root


# --- Phase 3: Breadcrumb Generation ---

def _generate_breadcrumbs(node: HierarchyNode, parent_path: str) -> None:
    """Recursively generate breadcrumb paths for all nodes."""
    if node.section_id and node.title:
        my_path = f"{parent_path} > {node.section_id}: {node.title}" if parent_path else f"{node.section_id}: {node.title}"
    elif node.title and node.title != "Document":
        my_path = f"{parent_path} > {node.title}" if parent_path else node.title
    else:
        my_path = parent_path

    node.breadcrumb = my_path.strip()

    for child in node.children:
        _generate_breadcrumbs(child, my_path)


# --- Phase 4+5: Chunking ---

def _process_node(node: HierarchyNode, chunks: list[ChunkData]) -> None:
    """Recursively process a hierarchy node into chunks."""
    indexed_lines = [(il.text, il.line_index) for il in node.lines if il.text.strip()]

    if node.children:
        # Node with children: chunk own text, then recurse
        if indexed_lines:
            _chunk_text(indexed_lines, node, chunks)
        for child in node.children:
            _process_node(child, chunks)
    else:
        # Leaf node: chunk all text
        if indexed_lines:
            _chunk_text(indexed_lines, node, chunks)


def _chunk_text(indexed_lines: list[tuple[str, int]], node: HierarchyNode, chunks: list[ChunkData]) -> None:
    """Split text into chunks following the 6 rules, with precise paragraph tracking."""
    breadcrumb = node.breadcrumb or "Document"
    text = "\n\n".join(t for t, _ in indexed_lines)
    all_indices = [idx for _, idx in indexed_lines]

    # Separate tables from text
    parts = _split_tables_and_text(text)

    for part_text, is_table in parts:
        if not part_text.strip():
            continue

        if is_table:
            # RULE 3: Tables are atomic — UNLESS >2048 tokens (split keeping header)
            table_tokens = _estimate_tokens(part_text)
            quality = _score_table_quality(part_text)

            if table_tokens <= 2048:
                # Small/medium table → one chunk
                standards = _extract_standards(part_text)
                chunks.append(ChunkData(
                    chunk_index=0,
                    hierarchy_path=breadcrumb,
                    section_id=node.section_id,
                    section_title=node.title,
                    hierarchy_level=node.level,
                    content_with_context=f"{breadcrumb}\n\n{part_text}",
                    content_raw=part_text,
                    start_paragraph=min(all_indices) if all_indices else node.start_para,
                    end_paragraph=max(all_indices) if all_indices else node.end_para,
                    chunk_type="table",
                    token_count=table_tokens,
                    detected_standards=standards,
                    table_quality_score=quality,
                    needs_review=quality < 0.7 if quality is not None else False,
                ))
            else:
                # Large table → split by rows, keeping header on each chunk
                _chunk_large_table(part_text, breadcrumb, node, quality, chunks, all_indices)
        else:
            # Text chunking with rules — pass indices for per-chunk tracking
            _chunk_text_content(part_text, breadcrumb, node, chunks, all_indices)


def _chunk_text_content(
    text: str,
    breadcrumb: str,
    node: HierarchyNode,
    chunks: list[ChunkData],
    line_indices: list[int] | None = None,
) -> None:
    """Chunk text content following rules 1,2,5,6 with per-chunk paragraph tracking."""
    token_count = _estimate_tokens(text)
    idx_min = min(line_indices) if line_indices else node.start_para
    idx_max = max(line_indices) if line_indices else node.end_para

    # RULE 6: Small sections stay as one chunk
    if token_count <= MAX_CHUNK_TOKENS:
        standards = _extract_standards(text)
        chunks.append(ChunkData(
            chunk_index=0,
            hierarchy_path=breadcrumb,
            section_id=node.section_id,
            section_title=node.title,
            hierarchy_level=node.level,
            content_with_context=f"{breadcrumb}\n\n{text}",
            content_raw=text,
            start_paragraph=idx_min,
            end_paragraph=idx_max,
            chunk_type="text",
            token_count=token_count,
            detected_standards=standards,
        ))
        return

    # Large section: split on sentence boundaries (RULE 2)
    # Track paragraph indices proportionally across chunks
    sentences = _split_sentences(text)
    total_sentences = len(sentences)
    idx_range = idx_max - idx_min if idx_max > idx_min else 1

    current_sentences: list[str] = []
    current_tokens = 0
    emitted_sentence_count = 0  # how many sentences emitted so far

    def _emit_chunk(sents: list[str], sent_offset: int) -> None:
        """Create a chunk with proportionally assigned paragraph indices."""
        chunk_text = "\n".join(sents)
        standards = _extract_standards(chunk_text)
        # Proportional mapping: sentence position → line index
        frac_start = sent_offset / max(total_sentences, 1)
        frac_end = (sent_offset + len(sents)) / max(total_sentences, 1)
        c_start = idx_min + int(frac_start * idx_range)
        c_end = idx_min + int(frac_end * idx_range)
        chunks.append(ChunkData(
            chunk_index=0,
            hierarchy_path=breadcrumb,
            section_id=node.section_id,
            section_title=node.title,
            hierarchy_level=node.level,
            content_with_context=f"{breadcrumb}\n\n{chunk_text}",
            content_raw=chunk_text,
            start_paragraph=c_start,
            end_paragraph=min(c_end, idx_max),
            chunk_type="text",
            token_count=_estimate_tokens(chunk_text),
            detected_standards=standards,
        ))

    for sentence in sentences:
        sent_tokens = _estimate_tokens(sentence)

        if current_tokens + sent_tokens > MAX_CHUNK_TOKENS and current_sentences:
            _emit_chunk(current_sentences, emitted_sentence_count)
            emitted_sentence_count += len(current_sentences)

            # RULE 5: Overlap — start new chunk with last 2 sentences
            # Skip overlap if the chunk was a single oversized sentence
            if len(current_sentences) == 1 and _estimate_tokens(current_sentences[0]) > MAX_CHUNK_TOKENS:
                current_sentences = []
                current_tokens = 0
            else:
                overlap = current_sentences[-OVERLAP_SENTENCES:] if len(current_sentences) >= OVERLAP_SENTENCES else current_sentences[-1:]
                # Adjust emitted count back for overlapping sentences
                emitted_sentence_count -= len(overlap)
                current_sentences = list(overlap)
                current_tokens = sum(_estimate_tokens(s) for s in current_sentences)

        current_sentences.append(sentence)
        current_tokens += sent_tokens

    # Emit final chunk
    if current_sentences:
        _emit_chunk(current_sentences, emitted_sentence_count)


def _chunk_large_table(
    table_text: str,
    breadcrumb: str,
    node: HierarchyNode,
    quality: float,
    chunks: list[ChunkData],
    line_indices: list[int] | None = None,
) -> None:
    """Split a large table (>2048 tokens) into chunks, keeping the header row on each."""
    rows = table_text.strip().split("\n")
    if len(rows) < 3:
        # Can't meaningfully split a table with <3 rows
        standards = _extract_standards(table_text)
        chunks.append(ChunkData(
            chunk_index=0, hierarchy_path=breadcrumb, section_id=node.section_id,
            section_title=node.title, hierarchy_level=node.level,
            content_with_context=f"{breadcrumb}\n\n{table_text}", content_raw=table_text,
            start_paragraph=min(line_indices) if line_indices else node.start_para, end_paragraph=max(line_indices) if line_indices else node.end_para,
            chunk_type="table", token_count=_estimate_tokens(table_text),
            detected_standards=standards, table_quality_score=quality,
            needs_review=quality < 0.7 if quality is not None else False,
        ))
        return

    # Extract header (first row + separator)
    header_lines = []
    data_start = 0
    for j, row in enumerate(rows):
        header_lines.append(row)
        if all(c in "|-: " for c in row.strip()):
            data_start = j + 1
            break
    if data_start == 0:
        # No separator found — treat first row as header
        header_lines = [rows[0]]
        data_start = 1

    header_text = "\n".join(header_lines)
    header_tokens = _estimate_tokens(header_text)
    max_data_tokens = MAX_CHUNK_TOKENS - header_tokens

    # Split data rows into chunks
    current_rows: list[str] = []
    current_tokens = 0

    for row in rows[data_start:]:
        row_tokens = _estimate_tokens(row)
        if current_tokens + row_tokens > max_data_tokens and current_rows:
            chunk_text = header_text + "\n" + "\n".join(current_rows)
            standards = _extract_standards(chunk_text)
            chunks.append(ChunkData(
                chunk_index=0, hierarchy_path=breadcrumb, section_id=node.section_id,
                section_title=node.title, hierarchy_level=node.level,
                content_with_context=f"{breadcrumb}\n\n{chunk_text}", content_raw=chunk_text,
                start_paragraph=min(line_indices) if line_indices else node.start_para, end_paragraph=max(line_indices) if line_indices else node.end_para,
                chunk_type="table", token_count=_estimate_tokens(chunk_text),
                detected_standards=standards, table_quality_score=quality,
                needs_review=quality < 0.7 if quality is not None else False,
            ))
            current_rows = []
            current_tokens = 0

        current_rows.append(row)
        current_tokens += row_tokens

    # Emit final chunk
    if current_rows:
        chunk_text = header_text + "\n" + "\n".join(current_rows)
        standards = _extract_standards(chunk_text)
        chunks.append(ChunkData(
            chunk_index=0, hierarchy_path=breadcrumb, section_id=node.section_id,
            section_title=node.title, hierarchy_level=node.level,
            content_with_context=f"{breadcrumb}\n\n{chunk_text}", content_raw=chunk_text,
            start_paragraph=min(line_indices) if line_indices else node.start_para, end_paragraph=max(line_indices) if line_indices else node.end_para,
            chunk_type="table", token_count=_estimate_tokens(chunk_text),
            detected_standards=standards, table_quality_score=quality,
            needs_review=quality < 0.7 if quality is not None else False,
        ))


# --- Utilities ---

def _split_tables_and_text(text: str) -> list[tuple[str, bool]]:
    """Split text into alternating (text, False) and (table, True) segments."""
    parts: list[tuple[str, bool]] = []
    current_lines: list[str] = []
    in_table = False

    for line in text.split("\n"):
        stripped = line.strip()
        is_pipe_line = bool(TABLE_LINE_RE.match(stripped))
        is_separator = stripped.startswith("|---")
        is_continuation = (is_pipe_line or is_separator or stripped == "") and in_table

        if is_pipe_line:
            if not in_table and current_lines:
                parts.append(("\n".join(current_lines), False))
                current_lines = []
            in_table = True
            current_lines.append(line)
        elif in_table and (stripped.startswith("|") or is_separator):
            current_lines.append(line)
        elif in_table and stripped == "":
            # Single empty line inside table — could be within table or end of table.
            # Peek ahead: if next non-empty line starts with |, keep it.
            # Otherwise, end the table. For simplicity, end table on empty line.
            if current_lines:
                parts.append(("\n".join(current_lines), True))
                current_lines = []
                in_table = False
        else:
            if in_table and current_lines:
                parts.append(("\n".join(current_lines), True))
                current_lines = []
                in_table = False
            current_lines.append(line)

    if current_lines:
        parts.append(("\n".join(current_lines), in_table))

    return parts


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences, respecting Romanian abbreviations.

    RULE 2: Never split mid-sentence. Handles abbreviations like Art., Nr., pct., etc.
    Preserves paragraph breaks by splitting on them first.
    """
    # First split on paragraph breaks to preserve structure
    paragraphs = re.split(r"\n\n+", text)
    all_sentences: list[str] = []
    for para in paragraphs:
        if not para.strip():
            continue
        para_sentences = _split_paragraph_sentences(para.strip())
        all_sentences.extend(para_sentences)
    return all_sentences if all_sentences else [text]


def _split_paragraph_sentences(text: str) -> list[str]:
    """Split a single paragraph into sentences."""
    raw_parts = re.split(r"(?<=[.!?])\s+", text)

    sentences: list[str] = []
    buffer = ""

    for part in raw_parts:
        if buffer:
            buffer += " " + part
        else:
            buffer = part

        # Check if this ends with a real sentence boundary (not an abbreviation)
        if buffer.rstrip().endswith((".", "!", "?")):
            last_word = _get_last_word_before_period(buffer)
            if last_word.lower().rstrip(".") not in ABBREVIATIONS:
                sentences.append(buffer.strip())
                buffer = ""

    if buffer.strip():
        sentences.append(buffer.strip())

    return sentences if sentences else [text.strip()]


def _get_last_word_before_period(text: str) -> str:
    """Get the last word before a period in text."""
    stripped = text.rstrip(". !?")
    words = stripped.split()
    return words[-1] if words else ""


_tiktoken_enc = None


def _estimate_tokens(text: str) -> int:
    """Token count using tiktoken (cl100k_base, used by OpenAI models).
    Falls back to len//4 if tiktoken not available."""
    global _tiktoken_enc
    try:
        if _tiktoken_enc is None:
            import tiktoken
            _tiktoken_enc = tiktoken.get_encoding("cl100k_base")
        return len(_tiktoken_enc.encode(text))
    except Exception:
        return max(len(text) // 4, 1)


def _score_table_quality(markdown_table: str) -> float:
    """Score table quality 0-1. Low quality → needs_review=True. (FIX 29)"""
    rows = [r.strip() for r in markdown_table.strip().split("\n")
            if r.strip().startswith("|") and not all(c in "|-: " for c in r.strip())]
    if len(rows) < 2:
        return 0.5

    # Column count consistency (60% weight)
    col_counts = [r.count("|") - 1 for r in rows]
    if not col_counts:
        return 0.5
    mode_count = max(set(col_counts), key=col_counts.count)
    consistency = col_counts.count(mode_count) / len(col_counts)

    # Fill rate (40% weight)
    cells = [c.strip() for r in rows for c in r.split("|")[1:-1]]
    fill_rate = sum(1 for c in cells if c) / max(len(cells), 1)

    return consistency * 0.6 + fill_rate * 0.4
