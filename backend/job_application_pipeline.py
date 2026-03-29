"""
Job Application Pipeline Orchestrator
Coordinates: scrape -> filter -> customize -> preview -> apply
"""

import json
import os
import asyncio
import functools
import queue
import random
import time
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

from .local_scraper import LocalLinkedInScraper
from .resume_analyzer import analyze_job_fit, is_gemini_configured
from .resume_customizer import customize_and_generate_pdf
from .cover_letter_generator import generate_cover_letter
from .application_automator import ApplicationAutomator
from .anti_detection import random_delay_sync, random_mouse_movement_sync


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

        from playwright.sync_api import sync_playwright
        from playwright_stealth import Stealth

        emit(f"Starting application pipeline for {len(companies)} companies...")

        try:
            with sync_playwright() as p:
                cdp_connected = False
                if self.use_cdp:
                    emit(f"Connecting to Chrome at {LocalLinkedInScraper.CDP_URL}...")
                    try:
                        browser = p.chromium.connect_over_cdp(LocalLinkedInScraper.CDP_URL)
                        contexts = browser.contexts
                        if contexts:
                            context = contexts[0]
                            emit("Connected! Using existing session.")
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
                        time.sleep(2 + 2 * random.random())

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
                        time.sleep(0.5)
                else:
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

                    resume_result = customize_and_generate_pdf(
                        resume_text,
                        job.get("title", ""),
                        job.get("company", ""),
                        job.get("description", ""),
                    )

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

                    emit_event({
                        "type": "preview",
                        **{k: v for k, v in preview.items() if k != "resume_pdf_path"},
                    })

                    time.sleep(0.5)

                emit_event({
                    "type": "preview_done",
                    "total_previews": len(previews),
                })

                if preview_only:
                    emit(f"Preview complete. {len(previews)} jobs ready for review.")
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

                    pdf_path = preview.get("resume_pdf_path")
                    if pdf_path and os.path.exists(pdf_path):
                        try:
                            os.remove(pdf_path)
                        except OSError:
                            pass

                    if j < len(jobs_to_apply) - 1:
                        delay_secs = random.uniform(30, 120)
                        emit(f"Waiting {int(delay_secs)}s before next application...")
                        time.sleep(delay_secs)

                emit(f"Pipeline complete. Applied: {applied_count}, Failed: {failed_count}, Skipped: {skipped_count}")
                emit_event({
                    "type": "done",
                    "total_applied": applied_count,
                    "total_failed": failed_count,
                    "total_skipped": skipped_count,
                })

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

        while not future.done():
            try:
                msg = self._message_queue.get_nowait()
                if status_callback:
                    await status_callback(msg)
            except queue.Empty:
                await asyncio.sleep(0.1)

        while not self._message_queue.empty():
            msg = self._message_queue.get_nowait()
            if status_callback:
                await status_callback(msg)

        executor.shutdown(wait=False)
