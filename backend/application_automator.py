"""
Application Automator Module
Automates LinkedIn Easy Apply form submission using Playwright (sync API, runs in thread).
"""

import time
import random
import os
import json
from .anti_detection import random_delay_sync, random_mouse_movement_sync


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
            self.emit(f"Navigating to job: {job_url[:80]}...")
            self.page.goto(job_url, timeout=30000, wait_until="domcontentloaded")
            random_delay_sync(2, 4)

            if "checkpoint" in self.page.url:
                return {"success": False, "message": "CAPTCHA detected. Please solve manually."}

            easy_apply_btn = self._find_easy_apply_button()
            if not easy_apply_btn:
                return {"success": False, "message": "No Easy Apply button found. Job may require external application."}

            self.emit("Clicking Easy Apply...")
            self._click_with_delay(easy_apply_btn)
            random_delay_sync(1.5, 3)

            try:
                self.page.wait_for_selector("div[role='dialog']", timeout=5000)
            except Exception:
                return {"success": False, "message": "Easy Apply modal did not open."}

            max_steps = 10
            resume_uploaded = False
            cover_letter_filled = False

            for step in range(max_steps):
                self.emit(f"Processing form step {step + 1}...")
                random_delay_sync(1, 2)

                if not resume_uploaded and resume_pdf_path:
                    resume_uploaded = self._upload_resume(resume_pdf_path)

                if not cover_letter_filled and cover_letter:
                    cover_letter_filled = self._fill_cover_letter(cover_letter)

                action = self._click_next_or_submit()
                self.emit(f"Form action: {action}")

                if action == "submit":
                    random_delay_sync(2, 4)
                    if self._detect_success():
                        self._dismiss_post_apply_modal()
                        return {"success": True, "message": "Application submitted successfully."}
                    else:
                        random_delay_sync(2, 3)
                        if self._detect_success():
                            self._dismiss_post_apply_modal()
                            return {"success": True, "message": "Application submitted successfully."}
                        return {"success": False, "message": "Submit clicked but could not confirm success."}

                elif action == "review":
                    random_delay_sync(1, 2)
                    continue

                elif action == "next":
                    continue

                elif action == "not_found":
                    if self._detect_success():
                        self._dismiss_post_apply_modal()
                        return {"success": True, "message": "Application submitted successfully."}
                    self.emit(f"No action button found at step {step + 1}. Trying to continue...")
                    random_delay_sync(1, 2)

            return {"success": False, "message": "Exceeded maximum form steps without submitting."}

        except Exception as e:
            return {"success": False, "message": f"Application error: {str(e)[:200]}"}
