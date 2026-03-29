"""
Resume Customizer Module
Customizes resume text for a specific job using Gemini, then generates a PDF.
"""

import os
import json
import re
import tempfile
from typing import Optional

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


# Reuse the Gemini model from resume_analyzer
from resume_analyzer import _gemini_model, is_gemini_configured


def customize_resume(
    original_resume: str,
    job_title: str,
    company_name: str,
    job_description: str,
) -> dict:
    """
    Customize resume text for a specific job using Gemini.

    Returns:
        dict with keys:
            - text: str (customized resume text)
            - success: bool
            - error: str | None
    """
    if not is_gemini_configured() or not _gemini_model:
        return {"text": original_resume, "success": False, "error": "Gemini not configured"}

    resume_truncated = original_resume[:8000]
    desc_truncated = job_description[:5000] if job_description else ""

    prompt = f"""You are a professional resume writer. Customize this resume for a specific job.

ORIGINAL RESUME:
{resume_truncated}

TARGET JOB:
Title: {job_title}
Company: {company_name}
Description: {desc_truncated}

CUSTOMIZATION RULES:
1. Reorder bullet points to highlight most relevant experience FIRST
2. Rewrite bullets to include job keywords and required skills
3. Regenerate the professional summary (2-3 sentences) to match this role
4. Keep all sections and formatting unchanged - only modify content
5. Make it clear this resume is tailored to THIS specific job
6. Do NOT make up or fabricate experience - only rephrase existing experience

Return ONLY the customized resume text, no commentary or labels."""

    try:
        response = _gemini_model.generate_content(prompt)
        customized_text = response.text.strip()

        if len(customized_text) < len(original_resume) * 0.3:
            return {"text": original_resume, "success": False, "error": "Customized resume too short, using original"}

        return {"text": customized_text, "success": True, "error": None}

    except Exception as e:
        return {"text": original_resume, "success": False, "error": str(e)[:200]}


def generate_resume_pdf(resume_text: str, output_dir: Optional[str] = None) -> str:
    """
    Generate a clean PDF from resume text.

    Args:
        resume_text: The resume content as plain text
        output_dir: Directory for the PDF. If None, uses system temp dir.

    Returns:
        Path to the generated PDF file.
    """
    if output_dir is None:
        output_dir = tempfile.gettempdir()

    pdf_path = os.path.join(output_dir, f"resume_{os.getpid()}_{id(resume_text) % 10000}.pdf")

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()

    heading_style = ParagraphStyle(
        "ResumeHeading",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=6,
        spaceBefore=12,
    )
    body_style = ParagraphStyle(
        "ResumeBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=4,
    )
    name_style = ParagraphStyle(
        "ResumeName",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=8,
        alignment=1,
    )

    story = []
    lines = resume_text.split("\n")

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 6))
            continue

        safe_line = stripped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        if i == 0 or (i <= 2 and len(stripped) < 60 and not stripped.startswith("-") and not stripped.startswith("*")):
            story.append(Paragraph(safe_line, name_style if i == 0 else body_style))
        elif stripped.isupper() and len(stripped) < 50:
            story.append(Paragraph(safe_line, heading_style))
        elif stripped.startswith("-") or stripped.startswith("*") or stripped.startswith("\u2022"):
            bullet_text = stripped.lstrip("-*\u2022 ")
            safe_bullet = bullet_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(f"\u2022 {safe_bullet}", body_style))
        else:
            story.append(Paragraph(safe_line, body_style))

    doc.build(story)
    return pdf_path


def customize_and_generate_pdf(
    original_resume: str,
    job_title: str,
    company_name: str,
    job_description: str,
) -> dict:
    """
    Full pipeline: customize resume text then generate PDF.

    Returns:
        dict with keys:
            - text: str (customized resume text)
            - pdf_path: str (path to generated PDF)
            - customized: bool (True if AI customization succeeded)
            - error: str | None
    """
    result = customize_resume(original_resume, job_title, company_name, job_description)

    try:
        pdf_path = generate_resume_pdf(result["text"])
    except Exception as e:
        try:
            pdf_path = generate_resume_pdf(original_resume)
        except Exception:
            return {
                "text": result["text"],
                "pdf_path": None,
                "customized": result["success"],
                "error": f"PDF generation failed: {str(e)[:200]}",
            }

    return {
        "text": result["text"],
        "pdf_path": pdf_path,
        "customized": result["success"],
        "error": result.get("error"),
    }
