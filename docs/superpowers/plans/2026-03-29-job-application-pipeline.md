# Job Application Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated LinkedIn job application pipeline that customizes resumes, generates cover letters, and applies to filtered jobs via Easy Apply.

**Architecture:** Four new backend modules (ResumeCustomizer, CoverLetterGenerator, ApplicationAutomator, AntiDetection) coordinated by a JobApplicationPipeline orchestrator, exposed via a new SSE endpoint, with a new "Apply Wizard" tab in the React frontend.

**Tech Stack:** Python/FastAPI (backend), Playwright (browser automation), Gemini API (AI), reportlab (PDF gen), React (frontend)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `backend/anti_detection.py` | Random delays, mouse movement, user-agent rotation |
| Create | `backend/resume_customizer.py` | Gemini-based resume tailoring + PDF generation |
| Create | `backend/cover_letter_generator.py` | Gemini-based cover letter generation |
| Create | `backend/application_automator.py` | Playwright Easy Apply form filling |
| Create | `backend/job_application_pipeline.py` | Orchestrator: scrape -> filter -> customize -> preview -> apply |
| Modify | `backend/main.py` | Add `/stream-apply` SSE endpoint, store resume bytes |
| Modify | `backend/requirements.txt` | Add `reportlab` |
| Modify | `frontend/src/App.jsx` | Add "Apply Wizard" tab with preview/apply UI |

---

### Task 1: Anti-Detection Module

**Files:**
- Create: `backend/anti_detection.py`

- [ ] **Step 1: Create `backend/anti_detection.py`**

```python
import random
import time
import asyncio
from datetime import datetime


# Pool of realistic Chrome user agents
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]


def get_random_user_agent() -> str:
    """Return a random realistic Chrome user agent."""
    return random.choice(_USER_AGENTS)


def random_delay_sync(min_seconds: float = 2.0, max_seconds: float = 5.0):
    """Synchronous random sleep for use inside Playwright thread."""
    delay = random.uniform(min_seconds, max_seconds)
    time.sleep(delay)


async def random_delay_async(min_minutes: float = 5.0, max_minutes: float = 30.0, business_hours_only: bool = True):
    """
    Async sleep for random duration between applications.
    If business_hours_only, waits until 9 AM if outside 9-18 window.
    """
    if business_hours_only:
        now = datetime.now()
        if now.hour < 9 or now.hour >= 18:
            # Calculate seconds until 9 AM
            if now.hour >= 18:
                # Wait until 9 AM tomorrow
                hours_until_9am = (24 - now.hour) + 9
            else:
                # Wait until 9 AM today
                hours_until_9am = 9 - now.hour
            seconds_to_wait = hours_until_9am * 3600 - now.minute * 60 - now.second
            await asyncio.sleep(seconds_to_wait)

    delay = random.uniform(min_minutes * 60, max_minutes * 60)
    await asyncio.sleep(delay)


def random_mouse_movement_sync(page, duration_ms: int = 1500):
    """
    Move mouse in a random pattern on the page to simulate human behavior.
    Runs synchronously (for Playwright sync API in thread).
    """
    viewport = page.viewport_size
    if not viewport:
        return

    width = viewport.get("width", 1280)
    height = viewport.get("height", 800)

    # 3-5 random movements
    steps = random.randint(3, 5)
    for _ in range(steps):
        x = random.randint(100, width - 100)
        y = random.randint(100, height - 100)
        page.mouse.move(x, y)
        time.sleep(random.uniform(0.1, 0.4))
```

- [ ] **Step 2: Verify file loads without errors**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper && python -c "from backend.anti_detection import get_random_user_agent, random_delay_sync, random_mouse_movement_sync; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/anti_detection.py
git commit -m "feat: add anti-detection module with random delays and mouse movement"
```

---

### Task 2: Resume Customizer

**Files:**
- Create: `backend/resume_customizer.py` (overwrite existing placeholder)
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add `reportlab` to requirements.txt**

Append `reportlab` to `backend/requirements.txt`.

- [ ] **Step 2: Install new dependency**

Run: `pip install reportlab`

- [ ] **Step 3: Create `backend/resume_customizer.py`**

```python
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

    # Truncate inputs
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

        # Basic validation: should be at least half the length of original
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

    # Custom styles
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
        alignment=1,  # Center
    )

    story = []
    lines = resume_text.split("\n")

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 6))
            continue

        # Escape XML special chars for reportlab
        safe_line = stripped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        # First non-empty line is likely the name
        if i == 0 or (i <= 2 and len(stripped) < 60 and not stripped.startswith("-") and not stripped.startswith("*")):
            story.append(Paragraph(safe_line, name_style if i == 0 else body_style))
        # Lines that look like section headers (ALL CAPS or short with no punctuation)
        elif stripped.isupper() and len(stripped) < 50:
            story.append(Paragraph(safe_line, heading_style))
        # Bullet points
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
        # Fallback: generate PDF from original if customized fails
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
```

- [ ] **Step 4: Verify import works**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper && python -c "from backend.resume_customizer import customize_resume, generate_resume_pdf, customize_and_generate_pdf; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/resume_customizer.py backend/requirements.txt
git commit -m "feat: add resume customizer with Gemini AI + PDF generation"
```

---

### Task 3: Cover Letter Generator

**Files:**
- Create: `backend/cover_letter_generator.py`

- [ ] **Step 1: Create `backend/cover_letter_generator.py`**

```python
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

        # Basic validation
        if len(cover_letter) < 100:
            return {"text": "", "success": False, "error": "Generated cover letter too short"}

        # Strip any leading "Dear" prefix artifacts or markdown
        if cover_letter.startswith("```"):
            cover_letter = cover_letter.strip("`").strip()

        return {"text": cover_letter, "success": True, "error": None}

    except Exception as e:
        return {"text": "", "success": False, "error": str(e)[:200]}
```

- [ ] **Step 2: Verify import works**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper && python -c "from backend.cover_letter_generator import generate_cover_letter; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/cover_letter_generator.py
git commit -m "feat: add cover letter generator with Gemini AI"
```

---

### Task 4: Application Automator

**Files:**
- Create: `backend/application_automator.py`

- [ ] **Step 1: Create `backend/application_automator.py`**

```python
"""
Application Automator Module
Automates LinkedIn Easy Apply form submission using Playwright (sync API, runs in thread).
"""

import time
import random
import os
import json
from anti_detection import random_delay_sync, random_mouse_movement_sync


class ApplicationAutomator:
    """Fills and submits LinkedIn Easy Apply forms using an existing Playwright page."""

    def __init__(self, page, emit=None):
        """
        Args:
            page: Playwright sync Page object (from LocalLinkedInScraper's browser session)
            emit: Callback function for status messages, signature: emit(str)
        """
        self.page = page
        self.emit = emit or (lambda msg: None)

    def _human_type(self, selector: str, text: str):
        """Type text with human-like delays."""
        self.page.focus(selector)
        for char in text:
            self.page.keyboard.type(char, delay=random.randint(50, 150))
            if random.random() < 0.08:
                time.sleep(random.uniform(0.3, 0.8))

    def _click_with_delay(self, locator):
        """Click an element with random pre-click delay and mouse movement."""
        random_mouse_movement_sync(self.page, duration_ms=800)
        random_delay_sync(0.5, 1.5)
        locator.click()
        random_delay_sync(0.5, 1.0)

    def _find_easy_apply_button(self):
        """Find the Easy Apply button on a job posting page. Returns locator or None."""
        selectors = [
            "button.jobs-apply-button",
            "button[aria-label*='Easy Apply']",
            "button:has-text('Easy Apply')",
        ]
        for sel in selectors:
            try:
                btn = self.page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    return btn
            except Exception:
                continue
        return None

    def _upload_resume(self, pdf_path: str) -> bool:
        """Upload resume PDF to the Easy Apply form. Returns True on success."""
        if not pdf_path or not os.path.exists(pdf_path):
            self.emit("No resume PDF available for upload.")
            return False

        try:
            # LinkedIn Easy Apply typically has a file input for resume
            file_input = self.page.locator("input[type='file']").first
            if file_input.count() > 0:
                file_input.set_input_files(pdf_path)
                self.emit("Resume uploaded.")
                random_delay_sync(1, 2)
                return True

            self.emit("No file upload input found in form.")
            return False
        except Exception as e:
            self.emit(f"Resume upload failed: {str(e)[:80]}")
            return False

    def _fill_cover_letter(self, cover_letter: str) -> bool:
        """Fill cover letter text area if present. Returns True if filled."""
        if not cover_letter:
            return False

        try:
            # Look for cover letter or additional info textarea
            textarea_selectors = [
                "textarea[name*='cover']",
                "textarea[aria-label*='cover letter']",
                "textarea[aria-label*='Cover Letter']",
                "textarea[aria-label*='additional']",
                "label:has-text('Cover letter') + textarea",
                "label:has-text('cover letter') ~ textarea",
            ]

            for sel in textarea_selectors:
                try:
                    textarea = self.page.locator(sel).first
                    if textarea.count() > 0 and textarea.is_visible():
                        textarea.fill("")
                        self._human_type(sel, cover_letter[:3000])
                        self.emit("Cover letter filled.")
                        return True
                except Exception:
                    continue

            # Broader fallback: any visible textarea in the modal
            modal_textareas = self.page.locator("div[role='dialog'] textarea").all()
            for ta in modal_textareas:
                try:
                    if ta.is_visible():
                        ta.fill("")
                        ta.type(cover_letter[:3000], delay=20)
                        self.emit("Cover letter filled (fallback textarea).")
                        return True
                except Exception:
                    continue

            self.emit("No cover letter field found. Skipping.")
            return False
        except Exception as e:
            self.emit(f"Cover letter fill failed: {str(e)[:80]}")
            return False

    def _click_next_or_submit(self) -> str:
        """
        Click Next, Review, or Submit button in the Easy Apply modal.
        Returns: 'next', 'submit', 'review', or 'not_found'
        """
        # Submit button
        for sel in [
            "button[aria-label*='Submit application']",
            "button:has-text('Submit application')",
        ]:
            try:
                btn = self.page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    self._click_with_delay(btn)
                    return "submit"
            except Exception:
                continue

        # Review button
        for sel in [
            "button[aria-label*='Review']",
            "button:has-text('Review')",
        ]:
            try:
                btn = self.page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    self._click_with_delay(btn)
                    return "review"
            except Exception:
                continue

        # Next button
        for sel in [
            "button[aria-label*='Continue']",
            "button[aria-label*='Next']",
            "button:has-text('Next')",
        ]:
            try:
                btn = self.page.locator(sel).first
                if btn.count() > 0 and btn.is_visible():
                    self._click_with_delay(btn)
                    return "next"
            except Exception:
                continue

        return "not_found"

    def _detect_success(self) -> bool:
        """Check if application was submitted successfully."""
        success_indicators = [
            "text='Application sent'",
            "text='Your application was sent'",
            "h2:has-text('Application sent')",
            ".artdeco-toast-item:has-text('Application sent')",
            "div:has-text('Your application was sent to')",
        ]
        for sel in success_indicators:
            try:
                elem = self.page.locator(sel).first
                if elem.count() > 0:
                    return True
            except Exception:
                continue
        return False

    def _dismiss_post_apply_modal(self):
        """Close any post-application modal (e.g., 'Your application was sent')."""
        try:
            dismiss_btn = self.page.locator("button[aria-label='Dismiss']").first
            if dismiss_btn.count() > 0 and dismiss_btn.is_visible():
                dismiss_btn.click()
                random_delay_sync(0.5, 1.0)
        except Exception:
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass

    def apply(self, job_url: str, resume_pdf_path: str, cover_letter: str) -> dict:
        """
        Apply to a job via LinkedIn Easy Apply.

        Args:
            job_url: Full LinkedIn job posting URL
            resume_pdf_path: Path to the customized resume PDF
            cover_letter: Cover letter text to paste

        Returns:
            dict: {success: bool, message: str}
        """
        try:
            # Navigate to job posting
            self.emit(f"Navigating to job: {job_url[:80]}...")
            self.page.goto(job_url, timeout=30000, wait_until="domcontentloaded")
            random_delay_sync(2, 4)

            # CAPTCHA check
            if "checkpoint" in self.page.url:
                return {"success": False, "message": "CAPTCHA detected. Please solve manually."}

            # Find Easy Apply button
            easy_apply_btn = self._find_easy_apply_button()
            if not easy_apply_btn:
                return {"success": False, "message": "No Easy Apply button found. Job may require external application."}

            # Click Easy Apply
            self.emit("Clicking Easy Apply...")
            self._click_with_delay(easy_apply_btn)
            random_delay_sync(1.5, 3)

            # Wait for modal
            try:
                self.page.wait_for_selector("div[role='dialog']", timeout=5000)
            except Exception:
                return {"success": False, "message": "Easy Apply modal did not open."}

            # Process multi-step form (up to 10 steps)
            max_steps = 10
            resume_uploaded = False
            cover_letter_filled = False

            for step in range(max_steps):
                self.emit(f"Processing form step {step + 1}...")
                random_delay_sync(1, 2)

                # Try to upload resume if not done yet
                if not resume_uploaded and resume_pdf_path:
                    resume_uploaded = self._upload_resume(resume_pdf_path)

                # Try to fill cover letter if not done yet
                if not cover_letter_filled and cover_letter:
                    cover_letter_filled = self._fill_cover_letter(cover_letter)

                # Click next/review/submit
                action = self._click_next_or_submit()
                self.emit(f"Form action: {action}")

                if action == "submit":
                    random_delay_sync(2, 4)
                    # Check for success
                    if self._detect_success():
                        self._dismiss_post_apply_modal()
                        return {"success": True, "message": "Application submitted successfully."}
                    else:
                        # Sometimes success takes a moment
                        random_delay_sync(2, 3)
                        if self._detect_success():
                            self._dismiss_post_apply_modal()
                            return {"success": True, "message": "Application submitted successfully."}
                        return {"success": False, "message": "Submit clicked but could not confirm success."}

                elif action == "review":
                    random_delay_sync(1, 2)
                    # After review page, look for submit
                    continue

                elif action == "next":
                    continue

                elif action == "not_found":
                    # Check if we're done (success already shown)
                    if self._detect_success():
                        self._dismiss_post_apply_modal()
                        return {"success": True, "message": "Application submitted successfully."}
                    self.emit(f"No action button found at step {step + 1}. Trying to continue...")
                    random_delay_sync(1, 2)

            return {"success": False, "message": "Exceeded maximum form steps without submitting."}

        except Exception as e:
            return {"success": False, "message": f"Application error: {str(e)[:200]}"}
```

- [ ] **Step 2: Verify import works**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper && python -c "from backend.application_automator import ApplicationAutomator; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/application_automator.py
git commit -m "feat: add application automator for LinkedIn Easy Apply"
```

---

### Task 5: Job Application Pipeline Orchestrator

**Files:**
- Create: `backend/job_application_pipeline.py`

- [ ] **Step 1: Create `backend/job_application_pipeline.py`**

```python
"""
Job Application Pipeline Orchestrator
Coordinates: scrape -> filter -> customize -> preview -> apply
"""

import json
import os
import asyncio
import functools
import queue
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

from local_scraper import LocalLinkedInScraper
from resume_analyzer import analyze_job_fit, is_gemini_configured
from resume_customizer import customize_and_generate_pdf
from cover_letter_generator import generate_cover_letter
from application_automator import ApplicationAutomator
from anti_detection import random_delay_sync, random_mouse_movement_sync


AUDIT_LOG_PATH = os.path.join(os.path.dirname(__file__), "audit_log.json")


def _load_audit_log() -> list:
    """Load existing audit log or return empty list."""
    if os.path.exists(AUDIT_LOG_PATH):
        try:
            with open(AUDIT_LOG_PATH, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _save_audit_entry(entry: dict):
    """Append an entry to the audit log."""
    log = _load_audit_log()
    log.append(entry)
    try:
        with open(AUDIT_LOG_PATH, "w") as f:
            json.dump(log, f, indent=2, default=str)
    except OSError:
        pass


class JobApplicationPipeline:
    """Orchestrates the full job application workflow."""

    def __init__(self, use_cdp: bool = True):
        self.use_cdp = use_cdp
        self._message_queue = None
        self._session_id = f"sess_{int(time.time())}"

    def _run_sync(
        self,
        companies: list,
        location: str,
        keywords: str,
        resume_text: str,
        relevance_threshold: int,
        preview_only: bool,
        approved_job_ids: list,
        time_posted_minutes: int = None,
    ):
        """
        Synchronous pipeline that runs in a thread.
        Phase 1: Scrape + filter + customize + preview
        Phase 2: Apply to approved jobs (if not preview_only)
        """
        def emit(msg):
            try:
                print(f"Pipeline: {msg}")
            except UnicodeEncodeError:
                print(f"Pipeline: {msg.encode('ascii', 'replace').decode()}")
            if self._message_queue:
                self._message_queue.put(json.dumps({"type": "status", "message": msg}))

        def emit_event(event: dict):
            if self._message_queue:
                self._message_queue.put(json.dumps(event))

        # Import sync playwright components
        from playwright.sync_api import sync_playwright
        from playwright_stealth import Stealth

        emit(f"Starting application pipeline for {len(companies)} companies...")

        try:
            with sync_playwright() as p:
                # Connect to browser (same logic as LocalLinkedInScraper)
                cdp_connected = False
                if self.use_cdp:
                    emit(f"Connecting to Chrome at {LocalLinkedInScraper.CDP_URL}...")
                    try:
                        browser = p.chromium.connect_over_cdp(LocalLinkedInScraper.CDP_URL)
                        contexts = browser.contexts
                        if contexts:
                            context = contexts[0]
                            emit(f"Connected! Using existing session.")
                        else:
                            context = browser.new_context()
                        page = context.new_page()
                        cdp_connected = True
                    except Exception as e:
                        emit(f"CDP connection failed: {str(e)[:80]}. Falling back...")
                        cdp_connected = False

                if not cdp_connected:
                    browser = p.chromium.launch(headless=False, slow_mo=50)
                    context = browser.new_context(
                        viewport={"width": 1280, "height": 800},
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    )
                    page = context.new_page()
                    stealth = Stealth()
                    stealth.apply_stealth_sync(page)

                # Verify LinkedIn login
                emit("Checking LinkedIn session...")
                page.goto("https://www.linkedin.com/feed/", timeout=30000, wait_until="domcontentloaded")
                time.sleep(3)
                if "/login" in page.url or "/authwall" in page.url:
                    emit("Not logged in. Please log into LinkedIn first.")
                    emit_event({"type": "error", "message": "Not logged in to LinkedIn.", "severity": "error"})
                    page.close()
                    return

                emit("LinkedIn session active.")

                # --- PHASE 1: Scrape jobs ---
                scraper = LocalLinkedInScraper(use_cdp=self.use_cdp)
                all_jobs = []

                for i, company in enumerate(companies):
                    emit(f"[{i+1}/{len(companies)}] Scraping jobs for: {company}")
                    company_jobs = scraper._scrape_company(page, company, location, keywords, time_posted_minutes, emit)
                    all_jobs.extend(company_jobs)
                    emit(f"Total jobs so far: {len(all_jobs)}")
                    if i < len(companies) - 1:
                        time.sleep(2 + 2 * __import__("random").random())

                _save_audit_entry({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "session_id": self._session_id,
                    "action": "scraped",
                    "total_jobs": len(all_jobs),
                })

                if not all_jobs:
                    emit("No jobs found.")
                    emit_event({"type": "done", "total_applied": 0, "total_failed": 0, "total_skipped": 0})
                    page.close()
                    if not cdp_connected:
                        browser.close()
                    return

                # --- PHASE 2: Filter by relevance ---
                emit(f"Filtering {len(all_jobs)} jobs by relevance (threshold: {relevance_threshold}/10)...")
                filtered_jobs = []

                if is_gemini_configured() and resume_text:
                    for j, job in enumerate(all_jobs):
                        emit(f"Analyzing job {j+1}/{len(all_jobs)}: {job.get('title', '')[:40]}...")
                        analysis = analyze_job_fit(
                            resume_text,
                            job.get("title", ""),
                            job.get("company", ""),
                            job.get("description", ""),
                        )
                        job["analysis"] = analysis
                        score = analysis.get("score") or 0
                        if score >= relevance_threshold:
                            filtered_jobs.append(job)
                        emit_event({
                            "type": "analysis_progress",
                            "current": j + 1,
                            "total": len(all_jobs),
                            "job_title": job.get("title", "")[:50],
                            "score": score,
                        })
                        time.sleep(0.5)  # Rate limit Gemini
                else:
                    # No Gemini or no resume: pass all jobs through
                    filtered_jobs = all_jobs

                emit(f"Filtered to {len(filtered_jobs)} relevant jobs.")

                _save_audit_entry({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "session_id": self._session_id,
                    "action": "filtered",
                    "total_jobs": len(all_jobs),
                    "filtered_count": len(filtered_jobs),
                    "threshold": relevance_threshold,
                })

                # --- PHASE 3: Customize + Preview ---
                previews = []

                for j, job in enumerate(filtered_jobs):
                    emit(f"Customizing resume for: {job.get('title', '')[:40]} at {job.get('company', '')}...")

                    # Customize resume
                    resume_result = customize_and_generate_pdf(
                        resume_text,
                        job.get("title", ""),
                        job.get("company", ""),
                        job.get("description", ""),
                    )

                    # Generate cover letter
                    cover_result = generate_cover_letter(
                        resume_text,
                        job.get("title", ""),
                        job.get("company", ""),
                        job.get("description", ""),
                    )

                    preview = {
                        "job_id": f"job_{j}",
                        "job_title": job.get("title", ""),
                        "company": job.get("company", ""),
                        "location": job.get("location", ""),
                        "url": job.get("url", ""),
                        "relevance_score": (job.get("analysis", {}).get("score") or 0),
                        "analysis_summary": job.get("analysis", {}).get("summary", ""),
                        "tuned_resume": resume_result["text"],
                        "resume_pdf_path": resume_result.get("pdf_path"),
                        "resume_customized": resume_result["customized"],
                        "cover_letter": cover_result["text"],
                        "cover_letter_generated": cover_result["success"],
                    }
                    previews.append(preview)

                    # Stream preview to frontend
                    emit_event({
                        "type": "preview",
                        **{k: v for k, v in preview.items() if k != "resume_pdf_path"},
                    })

                    time.sleep(0.5)  # Rate limit

                emit_event({
                    "type": "preview_done",
                    "total_previews": len(previews),
                })

                if preview_only:
                    emit(f"Preview complete. {len(previews)} jobs ready for review.")
                    # Wait for approved_job_ids to be set (will be handled by separate apply call)
                    emit_event({"type": "done", "total_applied": 0, "total_failed": 0, "total_skipped": len(previews), "mode": "preview"})
                    page.close()
                    if not cdp_connected:
                        browser.close()
                    return

                # --- PHASE 4: Apply ---
                automator = ApplicationAutomator(page, emit=emit)
                applied_count = 0
                failed_count = 0
                skipped_count = 0

                jobs_to_apply = previews
                if approved_job_ids:
                    jobs_to_apply = [p for p in previews if p["job_id"] in approved_job_ids]
                    skipped_count = len(previews) - len(jobs_to_apply)

                for j, preview in enumerate(jobs_to_apply):
                    job_url = preview.get("url", "")
                    if not job_url:
                        emit(f"No URL for job: {preview['job_title']}. Skipping.")
                        skipped_count += 1
                        continue

                    emit_event({
                        "type": "applying",
                        "job_title": preview["job_title"],
                        "company": preview["company"],
                        "current": j + 1,
                        "total": len(jobs_to_apply),
                    })

                    # Apply with retry
                    result = None
                    for attempt in range(2):
                        result = automator.apply(
                            job_url=job_url,
                            resume_pdf_path=preview.get("resume_pdf_path", ""),
                            cover_letter=preview.get("cover_letter", ""),
                        )
                        if result["success"]:
                            break
                        if attempt == 0:
                            emit(f"Retry attempt for: {preview['job_title']}...")
                            time.sleep(3)

                    if result and result["success"]:
                        applied_count += 1
                        emit(f"Applied to: {preview['job_title']} at {preview['company']}")
                    else:
                        failed_count += 1
                        emit(f"Failed: {preview['job_title']} - {result.get('message', 'Unknown error')}")

                    emit_event({
                        "type": "applied",
                        "job_title": preview["job_title"],
                        "company": preview["company"],
                        "success": result["success"] if result else False,
                        "message": result.get("message", "") if result else "",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                    _save_audit_entry({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "session_id": self._session_id,
                        "action": "applied",
                        "job_title": preview["job_title"],
                        "company": preview["company"],
                        "job_url": job_url,
                        "success": result["success"] if result else False,
                        "details": {
                            "resume_customized": preview.get("resume_customized", False),
                            "cover_letter_generated": preview.get("cover_letter_generated", False),
                            "error": result.get("message") if result and not result["success"] else None,
                        },
                    })

                    # Clean up temp PDF
                    pdf_path = preview.get("resume_pdf_path")
                    if pdf_path and os.path.exists(pdf_path):
                        try:
                            os.remove(pdf_path)
                        except OSError:
                            pass

                    # Anti-detection delay between applications (shorter for testing)
                    if j < len(jobs_to_apply) - 1:
                        delay_secs = __import__("random").uniform(30, 120)
                        emit(f"Waiting {int(delay_secs)}s before next application...")
                        time.sleep(delay_secs)

                emit(f"Pipeline complete. Applied: {applied_count}, Failed: {failed_count}, Skipped: {skipped_count}")
                emit_event({
                    "type": "done",
                    "total_applied": applied_count,
                    "total_failed": failed_count,
                    "total_skipped": skipped_count,
                })

                # Cleanup
                try:
                    page.close()
                except Exception:
                    pass
                if not cdp_connected:
                    browser.close()

        except Exception as e:
            emit(f"Pipeline error: {str(e)}")
            if self._message_queue:
                self._message_queue.put(json.dumps({"type": "error", "message": str(e)[:300], "severity": "error"}))

    async def run(
        self,
        companies: list,
        location: str,
        keywords: str,
        resume_text: str,
        relevance_threshold: int = 7,
        preview_only: bool = True,
        approved_job_ids: list = None,
        time_posted_minutes: int = None,
        status_callback=None,
    ):
        """
        Async wrapper that runs the sync pipeline in a thread pool.
        Bridges sync queue messages to async callback.
        """
        self._message_queue = queue.Queue()

        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=1)

        future = loop.run_in_executor(
            executor,
            functools.partial(
                self._run_sync,
                companies=companies,
                location=location,
                keywords=keywords,
                resume_text=resume_text,
                relevance_threshold=relevance_threshold,
                preview_only=preview_only,
                approved_job_ids=approved_job_ids or [],
                time_posted_minutes=time_posted_minutes,
            ),
        )

        # Poll queue and forward to async callback
        while not future.done():
            try:
                msg = self._message_queue.get_nowait()
                if status_callback:
                    await status_callback(msg)
            except queue.Empty:
                await asyncio.sleep(0.1)

        # Drain remaining messages
        while not self._message_queue.empty():
            msg = self._message_queue.get_nowait()
            if status_callback:
                await status_callback(msg)

        executor.shutdown(wait=False)
```

- [ ] **Step 2: Verify import works**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper && python -c "from backend.job_application_pipeline import JobApplicationPipeline; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/job_application_pipeline.py
git commit -m "feat: add job application pipeline orchestrator"
```

---

### Task 6: Backend API Endpoint

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add import and resume bytes storage to `backend/main.py`**

At the top of `main.py`, add the pipeline import (after existing imports around line 16):

```python
from job_application_pipeline import JobApplicationPipeline
```

Add resume bytes storage alongside existing `_stored_resume_text` (after line 36):

```python
_stored_resume_bytes: Optional[bytes] = None
_stored_resume_format: Optional[str] = None  # 'pdf' or 'docx'
```

- [ ] **Step 2: Update `/upload-resume` to store file bytes**

In the `upload_resume` function, after `contents = await file.read()` (line 93) and before the text extraction, add storage of raw bytes. After line 109 (`_stored_resume_text = resume_text`), add:

```python
    _stored_resume_bytes = contents
    _stored_resume_format = 'pdf' if filename.lower().endswith('.pdf') else 'docx'
```

Also update the `clear_resume` endpoint to clear these:

```python
@app.delete("/resume")
async def clear_resume():
    """Clear the uploaded resume."""
    global _stored_resume_text, _stored_resume_filename, _stored_resume_bytes, _stored_resume_format
    _stored_resume_text = None
    _stored_resume_filename = None
    _stored_resume_bytes = None
    _stored_resume_format = None
    return {"status": "cleared"}
```

- [ ] **Step 3: Add `/stream-apply` SSE endpoint**

Add this new endpoint after the existing `/stream-scrape` endpoint (after line 248):

```python
@app.get("/stream-apply")
async def stream_apply(
    companies: str,
    location: str,
    keywords: str,
    preview_only: bool = True,
    relevance_threshold: int = 7,
    time_posted_minutes: int = None,
    use_cdp: bool = True,
    approved_jobs: str = "",
):
    """
    SSE Endpoint that runs the job application pipeline.
    Streams previews and application results to the frontend.
    """
    company_list = [c.strip() for c in companies.split(",") if c.strip()]
    approved_list = [j.strip() for j in approved_jobs.split(",") if j.strip()] if approved_jobs else []

    async def event_generator():
        pipeline = JobApplicationPipeline(use_cdp=use_cdp)

        q = asyncio.Queue()

        async def status_callback(msg):
            await q.put(msg)

        task = asyncio.create_task(
            pipeline.run(
                companies=company_list,
                location=location,
                keywords=keywords,
                resume_text=_stored_resume_text or "",
                relevance_threshold=relevance_threshold,
                preview_only=preview_only,
                approved_job_ids=approved_list,
                time_posted_minutes=time_posted_minutes,
                status_callback=status_callback,
            )
        )

        while not task.done() or not q.empty():
            try:
                message = await asyncio.wait_for(q.get(), timeout=1.0)
                yield f"data: {message}\n\n"
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

        # Drain any remaining
        while not q.empty():
            msg = await q.get()
            yield f"data: {msg}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

- [ ] **Step 4: Verify server starts**

Run: `cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper/backend && python -c "from main import app; print('FastAPI app OK')"`
Expected: `FastAPI app OK`

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "feat: add /stream-apply SSE endpoint for job application pipeline"
```

---

### Task 7: Frontend - Apply Wizard Tab

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add new state variables for apply wizard**

In the `App()` function, after the existing state declarations (around line 76), add:

```javascript
  // Apply Wizard state
  const [applyMode, setApplyMode] = useState(false) // true = apply wizard active
  const [applyStatus, setApplyStatus] = useState('idle') // idle, scraping, previewing, applying, done
  const [applyPreviews, setApplyPreviews] = useState([]) // preview results from pipeline
  const [applyResults, setApplyResults] = useState([]) // applied results
  const [selectedForApply, setSelectedForApply] = useState(new Set()) // job_ids user approved
  const [applyLogs, setApplyLogs] = useState([])
  const [applySummary, setApplySummary] = useState(null) // {total_applied, total_failed, total_skipped}
  const [relevanceThreshold, setRelevanceThreshold] = useState(7)
  const [expandedPreview, setExpandedPreview] = useState(null) // job_id of expanded preview
```

- [ ] **Step 2: Add the apply wizard launch handler**

After the existing `handleLaunch` function (around line 381), add:

```javascript
  const handleStartApplyWizard = () => {
    if (selectedCompanies.length === 0) return
    if (resumeStatus !== 'uploaded') return

    setApplyMode(true)
    setApplyStatus('scraping')
    setApplyPreviews([])
    setApplyResults([])
    setSelectedForApply(new Set())
    setApplyLogs(['> Starting Application Wizard...'])
    setApplySummary(null)

    const queryParams = new URLSearchParams({
      companies: selectedCompanies.join(','),
      location: selectedLocations.join(','),
      keywords: keywords,
      preview_only: 'true',
      relevance_threshold: relevanceThreshold,
      use_cdp: useCDP,
      ...(timePosted && { time_posted_minutes: timePosted }),
    }).toString()

    const eventSource = new EventSource(`http://localhost:8001/stream-apply?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setApplyLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'analysis_progress') {
          setApplyStatus('scraping')
          setApplyLogs(prev => [...prev, `> Analyzing: ${data.job_title} (${data.current}/${data.total}) - Score: ${data.score}/10`])
        } else if (data.type === 'preview') {
          setApplyStatus('previewing')
          setApplyPreviews(prev => [...prev, data])
          // Auto-select jobs with high relevance
          if (data.relevance_score >= relevanceThreshold) {
            setSelectedForApply(prev => new Set([...prev, data.job_id]))
          }
        } else if (data.type === 'preview_done') {
          setApplyLogs(prev => [...prev, `> ${data.total_previews} jobs ready for review.`])
        } else if (data.type === 'applying') {
          setApplyStatus('applying')
          setApplyLogs(prev => [...prev, `> Applying to: ${data.job_title} at ${data.company} (${data.current}/${data.total})`])
        } else if (data.type === 'applied') {
          setApplyResults(prev => [...prev, data])
          setApplyLogs(prev => [...prev, `> ${data.success ? 'Applied' : 'Failed'}: ${data.job_title} - ${data.message || ''}`])
        } else if (data.type === 'done') {
          setApplyStatus('done')
          setApplySummary(data)
          setApplyLogs(prev => [...prev, `> Complete! Applied: ${data.total_applied}, Failed: ${data.total_failed}, Skipped: ${data.total_skipped}`])
          eventSource.close()
        } else if (data.type === 'error') {
          setApplyLogs(prev => [...prev, `> Error: ${data.message}`])
          if (data.severity === 'error') {
            setApplyStatus('done')
            eventSource.close()
          }
        }
      } catch (e) {
        console.error("Error parsing apply SSE:", e)
      }
    }

    eventSource.onerror = () => {
      setApplyLogs(prev => [...prev, '> Connection lost.'])
      setApplyStatus('done')
      eventSource.close()
    }
  }

  const handleApplyToSelected = () => {
    if (selectedForApply.size === 0) return

    setApplyStatus('applying')
    setApplyResults([])
    setApplyLogs(prev => [...prev, `> Applying to ${selectedForApply.size} selected jobs...`])

    const queryParams = new URLSearchParams({
      companies: selectedCompanies.join(','),
      location: selectedLocations.join(','),
      keywords: keywords,
      preview_only: 'false',
      relevance_threshold: relevanceThreshold,
      use_cdp: useCDP,
      approved_jobs: [...selectedForApply].join(','),
      ...(timePosted && { time_posted_minutes: timePosted }),
    }).toString()

    const eventSource = new EventSource(`http://localhost:8001/stream-apply?${queryParams}`)

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'status') {
          setApplyLogs(prev => [...prev, `> ${data.message}`])
        } else if (data.type === 'applying') {
          setApplyLogs(prev => [...prev, `> Applying: ${data.job_title} at ${data.company} (${data.current}/${data.total})`])
        } else if (data.type === 'applied') {
          setApplyResults(prev => [...prev, data])
          setApplyLogs(prev => [...prev, `> ${data.success ? 'Applied' : 'Failed'}: ${data.job_title}`])
        } else if (data.type === 'done') {
          setApplyStatus('done')
          setApplySummary(data)
          setApplyLogs(prev => [...prev, `> Done! Applied: ${data.total_applied}, Failed: ${data.total_failed}`])
          eventSource.close()
        } else if (data.type === 'error') {
          setApplyLogs(prev => [...prev, `> Error: ${data.message}`])
          if (data.severity === 'error') {
            setApplyStatus('done')
            eventSource.close()
          }
        }
      } catch (e) {
        console.error("SSE parse error:", e)
      }
    }

    eventSource.onerror = () => {
      setApplyLogs(prev => [...prev, '> Connection lost.'])
      setApplyStatus('done')
      eventSource.close()
    }
  }

  const toggleJobApproval = (jobId) => {
    setSelectedForApply(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }
```

- [ ] **Step 3: Add the "Apply Wizard" tab button to the scrape target selector**

Find the existing mode toggle buttons in the JSX (the section with `scrapeTarget` buttons around line 410-430). After the "Recruiters" button, add a third option:

```jsx
              <button
                onClick={() => { setScrapeTarget('apply'); setApplyMode(true); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scrapeTarget === 'apply'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                Apply Wizard
              </button>
```

- [ ] **Step 4: Add the Apply Wizard UI panel**

Before the closing `</div>` of the main content area (before the results section), add the Apply Wizard panel that shows when `scrapeTarget === 'apply'`:

```jsx
        {/* Apply Wizard Panel */}
        {scrapeTarget === 'apply' && (
          <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            {/* Threshold control */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Relevance Threshold</h3>
                <span className="text-sm text-gray-500">{relevanceThreshold}/10 minimum</span>
              </div>
              <input
                type="range" min="1" max="10" value={relevanceThreshold}
                onChange={e => setRelevanceThreshold(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1 (All jobs)</span><span>10 (Perfect match only)</span>
              </div>
            </div>

            {/* Resume requirement */}
            {resumeStatus !== 'uploaded' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-yellow-800">Upload a resume first to enable the Apply Wizard.</p>
              </div>
            )}

            {/* Launch button */}
            <button
              onClick={handleStartApplyWizard}
              disabled={selectedCompanies.length === 0 || resumeStatus !== 'uploaded' || applyStatus === 'scraping' || applyStatus === 'applying'}
              className="w-full py-3 rounded-lg font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {applyStatus === 'scraping' ? 'Scraping & Analyzing...' : applyStatus === 'applying' ? 'Applying...' : 'Start Apply Wizard'}
            </button>

            {/* Previews */}
            {applyPreviews.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Job Previews ({applyPreviews.length})</h3>
                  <span className="text-sm text-gray-500">{selectedForApply.size} selected for apply</span>
                </div>
                {applyPreviews.map(preview => (
                  <div key={preview.job_id} className={`bg-white rounded-lg border p-4 ${selectedForApply.has(preview.job_id) ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedForApply.has(preview.job_id)}
                          onChange={() => toggleJobApproval(preview.job_id)}
                          className="mt-1 w-4 h-4 text-green-600"
                        />
                        <div>
                          <h4 className="font-medium text-gray-900">{preview.job_title}</h4>
                          <p className="text-sm text-gray-600">{preview.company} - {preview.location}</p>
                          {preview.analysis_summary && <p className="text-xs text-gray-500 mt-1">{preview.analysis_summary}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          preview.relevance_score >= 8 ? 'bg-green-100 text-green-700' :
                          preview.relevance_score >= 6 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {preview.relevance_score}/10
                        </span>
                        <button
                          onClick={() => setExpandedPreview(expandedPreview === preview.job_id ? null : preview.job_id)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {expandedPreview === preview.job_id ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>
                    {expandedPreview === preview.job_id && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div>
                          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Customized Resume</h5>
                          <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">{preview.tuned_resume?.slice(0, 1000)}...</pre>
                        </div>
                        {preview.cover_letter && (
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase mb-1">Cover Letter</h5>
                            <pre className="text-xs text-gray-700 bg-gray-50 p-3 rounded max-h-48 overflow-auto whitespace-pre-wrap">{preview.cover_letter}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Apply button */}
                {applyStatus === 'previewing' || (applyStatus === 'done' && applySummary?.mode === 'preview') ? (
                  <button
                    onClick={handleApplyToSelected}
                    disabled={selectedForApply.size === 0}
                    className="w-full py-3 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Apply to {selectedForApply.size} Selected Jobs
                  </button>
                ) : null}
              </div>
            )}

            {/* Apply Results */}
            {applyResults.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Application Results</h3>
                {applyResults.map((result, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <span className="font-medium">{result.job_title} at {result.company}</span>
                    <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                      {result.success ? 'Applied' : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {applySummary && applySummary.mode !== 'preview' && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-700">{applySummary.total_applied}</div>
                    <div className="text-xs text-green-600">Applied</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-red-700">{applySummary.total_failed}</div>
                    <div className="text-xs text-red-600">Failed</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-700">{applySummary.total_skipped}</div>
                    <div className="text-xs text-gray-600">Skipped</div>
                  </div>
                </div>
              </div>
            )}

            {/* Logs */}
            {applyLogs.length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-auto">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400 font-mono">Pipeline Logs</span>
                </div>
                {applyLogs.map((log, i) => (
                  <p key={i} className="text-xs text-green-300 font-mono">{log}</p>
                ))}
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add Apply Wizard tab to frontend with preview and apply UI"
```

---

### Task 8: Integration Test - Apply to a Real Job

**Files:** None (manual testing)

- [ ] **Step 1: Start Chrome with CDP**

```bash
# Close all Chrome windows first, then:
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Log into LinkedIn manually in the browser.

- [ ] **Step 2: Start the backend**

```bash
cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper/backend
python main.py
```

- [ ] **Step 3: Start the frontend**

```bash
cd C:/Users/rajac/OneDrive/Desktop/Python/LinkedinScrapper/frontend
npm run dev
```

- [ ] **Step 4: Upload resume via the UI**

Open `http://localhost:5173` and upload your resume PDF/DOCX.

- [ ] **Step 5: Run the Apply Wizard**

1. Click "Apply Wizard" tab
2. Select 1 company, location, and keywords
3. Set relevance threshold to 5 (to get more results for testing)
4. Click "Start Apply Wizard"
5. Wait for previews to load
6. Review customized resumes and cover letters
7. Select 1 job to apply to
8. Click "Apply to 1 Selected Jobs"
9. Watch the pipeline apply via Easy Apply

- [ ] **Step 6: Verify audit log**

Check `backend/audit_log.json` for complete entries.

- [ ] **Step 7: Commit all working changes**

```bash
git add -A
git commit -m "feat: complete job application pipeline with apply wizard"
```

---

## Self-Review Checklist

- **Spec coverage:** All 5 components covered (anti-detection, resume customizer, cover letter generator, application automator, pipeline orchestrator). API endpoint, frontend UI, audit logging all included.
- **Placeholder scan:** No TBD/TODO found. All code blocks are complete.
- **Type consistency:** `customize_and_generate_pdf` returns `{text, pdf_path, customized, error}` - used consistently in pipeline. `ApplicationAutomator.apply()` returns `{success, message}` - used consistently. SSE event types match between backend emits and frontend handlers.
- **Scope check:** Single implementation plan, appropriate scope.
