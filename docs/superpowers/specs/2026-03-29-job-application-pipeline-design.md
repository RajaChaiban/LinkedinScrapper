# Job Application Automation Pipeline - Design Spec

**Date:** 2026-03-29
**Status:** Approved

## Summary

Automated LinkedIn job application pipeline that scrapes jobs, filters by AI relevance, customizes resumes (generates new PDF per job), generates cover letters, previews for user approval, and applies via Easy Apply with human-like behavior.

## Architecture

```
Frontend (React) -> FastAPI POST /job-application-wizard (SSE)
                        |
                JobApplicationPipeline (Orchestrator)
                  /        |          \            \
           Scraper   ResumeCustomizer  CoverLetter  ApplicationAutomator
           (existing)  (new)          Generator(new)  (new, Playwright)
```

## Components

### 1. JobApplicationPipeline (`backend/job_application_pipeline.py`)
- Orchestrates entire workflow
- Calls existing `LocalLinkedInScraper.run()` to scrape jobs
- Filters by relevance using existing `analyze_job_fit()` (threshold 0.7 = score 7/10)
- For each filtered job: customize resume -> generate cover letter -> stream preview -> apply
- Streams all events via SSE callback
- Random delay 5-30 min between applications (business hours only)
- Audit log to `backend/audit_log.json`

### 2. ResumeCustomizer (`backend/resume_customizer.py`)
- Input: original resume text + job details
- Uses Gemini to reorder bullets, rewrite summary, emphasize matching skills
- **Generates a new PDF** using `reportlab` from the customized text (for LinkedIn file upload)
- Output: `{text: str, pdf_path: str}` (temp file)

### 3. CoverLetterGenerator (`backend/cover_letter_generator.py`)
- Input: resume text + job details
- Uses Gemini to generate 3-4 paragraph personalized cover letter (~300-400 words)
- Output: cover letter text string

### 4. ApplicationAutomator (`backend/application_automator.py`)
- Reuses existing browser context from LocalLinkedInScraper (CDP connection)
- Clicks "Easy Apply" button
- Fills form fields: phone, email, resume upload, cover letter paste
- Human-like delays (1-3s between fields), slow typing
- Detects "Application sent" confirmation
- Handles: no Easy Apply, form changes, custom questions (skip complex ones)
- Returns `{success: bool, message: str}`

### 5. Anti-Detection (`backend/anti_detection.py`)
- `random_delay(min_min=5, max_min=30, business_hours_only=True)`
- `random_mouse_movement(page)`
- User-agent rotation
- Reuses existing `human_type`, `random_sleep` from LocalLinkedInScraper

## API

**GET `/stream-apply`** (SSE) - follows existing `/stream-scrape` pattern

Query params: `companies`, `location`, `keywords`, `preview_only=true`, `relevance_threshold=7`

Event types: `preview`, `preview_done`, `applying`, `applied`, `done`, `error`

## Resume PDF Generation

- Store original file bytes alongside text in `_stored_resume_bytes` + `_stored_resume_format`
- For DOCX: use `python-docx` to modify in-place (preserves formatting)
- For PDF: generate clean PDF via `reportlab` with customized text
- Temp files cleaned up after each application

## Error Handling

| Scenario | Action |
|----------|--------|
| Gemini fails | Use original resume, log warning, continue |
| Cover letter fails | Skip field, continue |
| Form changed | Log, skip job, next |
| Submit fails | Retry 2x, skip |
| LinkedIn blocks | Alert user, pause |
| Browser crash | Restart, resume from last job |

## New Dependencies
- `reportlab` (PDF generation)

## Testing
- After implementation, test by applying to a real job via Easy Apply
