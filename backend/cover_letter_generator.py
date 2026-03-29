"""
Cover Letter Generator Module
Generates personalized cover letters for job applications using Gemini.
"""

from resume_analyzer import _gemini_model, is_gemini_configured


def generate_cover_letter(
    resume_text: str,
    job_title: str,
    company_name: str,
    job_description: str,
) -> dict:
    """
    Generate a personalized cover letter using Gemini.

    Returns:
        dict with keys:
            - text: str (cover letter text, or empty string on failure)
            - success: bool
            - error: str | None
    """
    if not is_gemini_configured() or not _gemini_model:
        return {"text": "", "success": False, "error": "Gemini not configured"}

    resume_truncated = resume_text[:8000]
    desc_truncated = job_description[:5000] if job_description else ""

    prompt = f"""Generate a personalized cover letter for a LinkedIn job application.

CANDIDATE RESUME:
{resume_truncated}

TARGET JOB:
Title: {job_title}
Company: {company_name}
Description: {desc_truncated}

COVER LETTER REQUIREMENTS:
1. Opening paragraph: Express genuine interest in this specific role at this company
2. Middle paragraphs: Highlight 2-3 relevant achievements from the resume
3. Show specific understanding of the job requirements and company
4. Closing paragraph: Professional call to action
5. Keep tone professional but personable (not robotic)
6. Length: 3-4 paragraphs (~300-400 words)
7. Make it clear this is customized for THIS job (no generic templates)

FORMAT: Return only the cover letter text. No headers, labels, or subject lines."""

    try:
        response = _gemini_model.generate_content(prompt)
        cover_letter = response.text.strip()

        if len(cover_letter) < 100:
            return {"text": "", "success": False, "error": "Generated cover letter too short"}

        if cover_letter.startswith("```"):
            cover_letter = cover_letter.strip("`").strip()

        return {"text": cover_letter, "success": True, "error": None}

    except Exception as e:
        return {"text": "", "success": False, "error": str(e)[:200]}
