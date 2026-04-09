"""Report service — generate professional PDF compliance report.

Design: Dark elegant business report with cyan accents.
- Page 1: Cover with project name + compliance score
- Page 2: Executive summary with verdict distribution bars
- Page 3+: NECONFORM details with citations and reasoning
- Page N: PARTIAL details
- Last page: Health warnings + disclaimer

Uses ReportLab for PDF generation.
"""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from app.core.logging import get_logger

logger = get_logger(__name__)

# --- Color Palette (matching frontend) ---
DARK_BG = colors.HexColor("#09090b")
DARK_SECONDARY = colors.HexColor("#111114")
DARK_TERTIARY = colors.HexColor("#18181b")
DARK_BORDER = colors.HexColor("#27272a")
CYAN = colors.HexColor("#06b6d4")
CYAN_DIM = colors.HexColor("#083344")
TEXT_PRIMARY = colors.HexColor("#fafafa")
TEXT_SECONDARY = colors.HexColor("#a1a1aa")
TEXT_MUTED = colors.HexColor("#52525b")
CONFORM_COLOR = colors.HexColor("#10b981")
NECONFORM_COLOR = colors.HexColor("#ef4444")
PARTIAL_COLOR = colors.HexColor("#f59e0b")
INSUFFICIENT_COLOR = colors.HexColor("#6b7280")

VERDICT_COLORS = {
    "CONFORM": CONFORM_COLOR,
    "NECONFORM": NECONFORM_COLOR,
    "PARTIAL": PARTIAL_COLOR,
    "INSUFFICIENT_DATA": INSUFFICIENT_COLOR,
}

VERDICT_LABELS = {
    "CONFORM": "Conform",
    "NECONFORM": "Neconform",
    "PARTIAL": "Parțial",
    "INSUFFICIENT_DATA": "Date insuficiente",
}


def generate_pdf_report(
    project_name: str,
    project_description: str | None,
    evaluations: list[dict],
    requirements_map: dict[str, dict],
    analytics: dict,
    run_config: dict,
) -> bytes:
    """Generate a professional PDF compliance report.

    Args:
        project_name: Project name.
        project_description: Optional description.
        evaluations: List of evaluation result dicts.
        requirements_map: {requirement_id: {requirement_text, hierarchy_path, ...}}
        analytics: Analytics dict with verdict_distribution, avg_confidence, etc.
        run_config: Evaluation run configuration.

    Returns:
        PDF content as bytes.
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=25 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
    )

    styles = _create_styles()
    story = []

    # === COVER PAGE ===
    story.extend(_build_cover(project_name, project_description, analytics, styles))
    story.append(PageBreak())

    # === EXECUTIVE SUMMARY ===
    story.extend(_build_summary(analytics, run_config, styles))
    story.append(PageBreak())

    # === NECONFORM DETAILS ===
    neconform = [e for e in evaluations if e["verdict"] == "NECONFORM"]
    if neconform:
        story.extend(_build_verdict_section(
            "NECONFORMITĂȚI — ACȚIUNE NECESARĂ",
            neconform, requirements_map, styles, NECONFORM_COLOR
        ))
        story.append(PageBreak())

    # === PARTIAL DETAILS ===
    partial = [e for e in evaluations if e["verdict"] == "PARTIAL"]
    if partial:
        story.extend(_build_verdict_section(
            "CONFORMITATE PARȚIALĂ — DE VERIFICAT",
            partial, requirements_map, styles, PARTIAL_COLOR
        ))
        story.append(PageBreak())

    # === INSUFFICIENT DATA ===
    insufficient = [e for e in evaluations if e["verdict"] == "INSUFFICIENT_DATA"]
    if insufficient:
        story.extend(_build_verdict_section(
            "DATE INSUFICIENTE — POSIBIL OMISIUNI",
            insufficient, requirements_map, styles, INSUFFICIENT_COLOR
        ))
        story.append(PageBreak())

    # === HEALTH WARNINGS + DISCLAIMER ===
    story.extend(_build_footer_page(analytics, styles))

    doc.build(story, onFirstPage=_page_bg, onLaterPages=_page_bg)
    return buffer.getvalue()


# --- Page background ---

def _page_bg(canvas, doc):
    """Draw dark background + header line + footer on every page."""
    canvas.saveState()
    # Dark background
    canvas.setFillColor(DARK_BG)
    canvas.rect(0, 0, A4[0], A4[1], fill=1)

    # Top accent line
    canvas.setStrokeColor(CYAN)
    canvas.setLineWidth(2)
    canvas.line(20 * mm, A4[1] - 15 * mm, A4[0] - 20 * mm, A4[1] - 15 * mm)

    # Footer
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(
        20 * mm, 12 * mm,
        f"RAG Checker — Raport generat automat · {datetime.now().strftime('%d.%m.%Y %H:%M')}"
    )
    canvas.drawRightString(
        A4[0] - 20 * mm, 12 * mm,
        f"Pagina {doc.page}"
    )
    canvas.restoreState()


# --- Styles ---

def _create_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=28, leading=34,
            textColor=TEXT_PRIMARY, alignment=TA_LEFT,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"],
            fontName="Helvetica", fontSize=11, leading=15,
            textColor=TEXT_SECONDARY,
        ),
        "section_header": ParagraphStyle(
            "SectionHeader", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=14, leading=18,
            textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "ReportBody", parent=base["Normal"],
            fontName="Helvetica", fontSize=9, leading=13,
            textColor=TEXT_SECONDARY,
        ),
        "body_small": ParagraphStyle(
            "ReportBodySmall", parent=base["Normal"],
            fontName="Helvetica", fontSize=8, leading=11,
            textColor=TEXT_MUTED,
        ),
        "mono": ParagraphStyle(
            "ReportMono", parent=base["Normal"],
            fontName="Courier", fontSize=8, leading=11,
            textColor=CYAN,
        ),
        "score_big": ParagraphStyle(
            "ScoreBig", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=48, leading=52,
            alignment=TA_CENTER,
        ),
        "verdict_header": ParagraphStyle(
            "VerdictHeader", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=11, leading=14,
            textColor=TEXT_PRIMARY, spaceBefore=6, spaceAfter=4,
        ),
        "quote": ParagraphStyle(
            "Quote", parent=base["Normal"],
            fontName="Helvetica-Oblique", fontSize=8, leading=11,
            textColor=TEXT_SECONDARY, leftIndent=12, borderPadding=4,
        ),
        "warning": ParagraphStyle(
            "Warning", parent=base["Normal"],
            fontName="Helvetica", fontSize=9, leading=12,
            textColor=PARTIAL_COLOR,
        ),
        "disclaimer": ParagraphStyle(
            "Disclaimer", parent=base["Normal"],
            fontName="Helvetica", fontSize=7, leading=10,
            textColor=TEXT_MUTED, alignment=TA_CENTER,
        ),
    }


# --- Cover Page ---

def _build_cover(project_name, description, analytics, styles):
    story = []
    story.append(Spacer(1, 40 * mm))

    # Project name
    story.append(Paragraph(_escape(project_name), styles["title"]))
    story.append(Spacer(1, 4 * mm))

    if description:
        story.append(Paragraph(_escape(description), styles["subtitle"]))

    story.append(Spacer(1, 8 * mm))

    # Accent line
    story.append(HRFlowable(
        width="40%", thickness=2, color=CYAN,
        spaceAfter=8 * mm, spaceBefore=0,
    ))

    story.append(Paragraph("RAPORT VERIFICARE CONFORMITATE", ParagraphStyle(
        "CoverLabel", fontName="Helvetica-Bold", fontSize=10, leading=14,
        textColor=CYAN, spaceAfter=20 * mm,
    )))

    # Big compliance score
    total = analytics.get("total_evaluated", 0)
    conform = analytics.get("verdict_distribution", {}).get("CONFORM", 0)
    rate = (conform / total * 100) if total > 0 else 0

    score_color = CONFORM_COLOR if rate >= 80 else PARTIAL_COLOR if rate >= 50 else NECONFORM_COLOR
    score_style = ParagraphStyle(
        "BigScore", parent=styles["score_big"], textColor=score_color,
    )
    story.append(Paragraph(f"{rate:.0f}%", score_style))
    story.append(Paragraph("Rată Conformitate", ParagraphStyle(
        "ScoreLabel", fontName="Helvetica", fontSize=11,
        textColor=TEXT_SECONDARY, alignment=TA_CENTER, spaceAfter=4 * mm,
    )))

    # Stats line
    stats_text = f"{total} cerințe evaluate · confidență medie {analytics.get('avg_confidence', 0) * 100:.0f}%"
    story.append(Paragraph(stats_text, ParagraphStyle(
        "StatsLine", fontName="Courier", fontSize=9,
        textColor=TEXT_MUTED, alignment=TA_CENTER,
    )))

    story.append(Spacer(1, 20 * mm))

    # Date
    story.append(Paragraph(
        f"Data generare: {datetime.now().strftime('%d %B %Y, %H:%M')}",
        ParagraphStyle("DateLine", fontName="Helvetica", fontSize=9,
                       textColor=TEXT_MUTED, alignment=TA_CENTER),
    ))

    return story


# --- Executive Summary ---

def _build_summary(analytics, run_config, styles):
    story = []
    story.append(Paragraph("SUMAR EXECUTIV", styles["section_header"]))
    story.append(Spacer(1, 4 * mm))

    dist = analytics.get("verdict_distribution", {})
    total = analytics.get("total_evaluated", 1)

    # Verdict distribution table
    table_data = [
        ["Verdict", "Număr", "Procent", ""],
    ]
    for verdict, label in VERDICT_LABELS.items():
        count = dist.get(verdict, 0)
        pct = count / total * 100 if total > 0 else 0
        bar_width = max(int(pct / 2), 1)  # Scale to ~50 chars max
        bar = "█" * bar_width
        table_data.append([label, str(count), f"{pct:.1f}%", bar])

    t = Table(table_data, colWidths=[35 * mm, 20 * mm, 20 * mm, 80 * mm])
    t.setStyle(TableStyle([
        # Header
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), TEXT_MUTED),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, DARK_BORDER),
        # Data rows
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (0, -1), TEXT_PRIMARY),
        ("TEXTCOLOR", (1, 1), (2, -1), TEXT_SECONDARY),
        # Bar colors per row
        ("TEXTCOLOR", (3, 1), (3, 1), CONFORM_COLOR),
        ("TEXTCOLOR", (3, 2), (3, 2), NECONFORM_COLOR),
        ("TEXTCOLOR", (3, 3), (3, 3), PARTIAL_COLOR),
        ("TEXTCOLOR", (3, 4), (3, 4), INSUFFICIENT_COLOR),
        ("FONTNAME", (3, 1), (3, -1), "Courier"),
        ("FONTSIZE", (3, 1), (3, -1), 7),
        # Spacing
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)
    story.append(Spacer(1, 8 * mm))

    # Key metrics
    story.append(Paragraph("METRICI CHEIE", styles["section_header"]))
    story.append(Spacer(1, 2 * mm))

    metrics = [
        ("Verificare citate", f"{analytics.get('quote_verification_rate', 0) * 100:.0f}%"),
        ("Necesită review", str(analytics.get("needs_review_count", 0))),
        ("Erori evaluare", str(analytics.get("error_count", 0))),
    ]
    for label, value in metrics:
        story.append(Paragraph(
            f'<font color="#{CYAN.hexval()[2:]}">{value}</font>  '
            f'<font color="#{TEXT_MUTED.hexval()[2:]}">{label}</font>',
            styles["body"],
        ))

    # Run config
    story.append(Spacer(1, 6 * mm))
    excluded = run_config.get("exclude_categories", [])
    excl_vtypes = run_config.get("exclude_verification_types", [])
    if excluded or excl_vtypes:
        excl_text = f"Categorii excluse: {', '.join(excluded or ['niciuna'])} · Tipuri excluse: {', '.join(excl_vtypes or ['niciunul'])}"
        story.append(Paragraph(_escape(excl_text), styles["body_small"]))

    return story


# --- Verdict Section (NECONFORM / PARTIAL / INSUFFICIENT) ---

def _build_verdict_section(title, evaluations, requirements_map, styles, accent_color):
    story = []

    # Section header with colored accent
    story.append(Paragraph(
        f'<font color="#{accent_color.hexval()[2:]}">●</font>  {title}',
        styles["section_header"],
    ))
    story.append(Spacer(1, 4 * mm))

    for i, ev in enumerate(evaluations):
        req = requirements_map.get(ev.get("requirement_id", ""), {})
        req_text = req.get("requirement_text", "Cerință necunoscută")
        hierarchy = req.get("hierarchy_path", "")
        confidence = ev.get("confidence_score", 0)

        # Requirement header
        story.append(Paragraph(
            f'<font color="#{accent_color.hexval()[2:]}">#{i + 1}</font>  '
            f'<font color="#{TEXT_PRIMARY.hexval()[2:]}">{_escape(req_text)}</font>',
            styles["verdict_header"],
        ))

        # Source info
        if hierarchy:
            story.append(Paragraph(
                f'Secțiune CS: <font color="#{CYAN.hexval()[2:]}">{_escape(hierarchy)}</font>'
                f'  ·  Confidență: {confidence * 100:.0f}%',
                styles["body_small"],
            ))

        # Reasoning
        reasoning = ev.get("reasoning", "")
        if reasoning:
            # Truncate very long reasoning
            display_reasoning = reasoning[:500] + ("..." if len(reasoning) > 500 else "")
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph(_escape(display_reasoning), styles["body"]))

        # Quotes
        quotes = ev.get("proposal_quotes", [])
        if quotes:
            story.append(Spacer(1, 2 * mm))
            for q in quotes[:3]:  # Max 3 quotes per evaluation in PDF
                quote_text = q.get("quote", "")
                if quote_text:
                    story.append(Paragraph(
                        f'„{_escape(quote_text[:200])}"',
                        styles["quote"],
                    ))

        # Missing aspects
        missing = ev.get("missing_aspects", [])
        if missing:
            story.append(Spacer(1, 2 * mm))
            for aspect in missing[:5]:
                story.append(Paragraph(
                    f'<font color="#{NECONFORM_COLOR.hexval()[2:]}">✗</font>  {_escape(aspect)}',
                    styles["body_small"],
                ))

        # Separator
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(
            width="100%", thickness=0.5, color=DARK_BORDER,
            spaceAfter=3 * mm,
        ))

    return story


# --- Footer / Disclaimer ---

def _build_footer_page(analytics, styles):
    story = []

    # Health warnings
    warnings = analytics.get("health_warnings", [])
    if warnings:
        story.append(Paragraph("AVERTISMENTE SISTEM", styles["section_header"]))
        story.append(Spacer(1, 2 * mm))
        for w in warnings:
            story.append(Paragraph(f"⚠  {_escape(w)}", styles["warning"]))
            story.append(Spacer(1, 2 * mm))
        story.append(Spacer(1, 6 * mm))

    # Disclaimer
    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="60%", thickness=0.5, color=DARK_BORDER, spaceAfter=6 * mm))
    story.append(Paragraph(
        "Acest raport a fost generat automat de RAG Checker.",
        styles["disclaimer"],
    ))
    story.append(Paragraph(
        "Verdictele sunt orientative și trebuie validate de personal calificat.",
        styles["disclaimer"],
    ))
    story.append(Paragraph(
        "Nu constituie o evaluare oficială în cadrul procedurilor de achiziție publică.",
        styles["disclaimer"],
    ))

    return story


def _escape(text: str) -> str:
    """Escape HTML special characters for ReportLab Paragraph."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))
