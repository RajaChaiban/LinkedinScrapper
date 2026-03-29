# Job Application Automation Design Spec

**Date:** 2026-03-29
**Scope:** Automated LinkedIn job application with resume tuning, cover letter generation, and human-like behavior
**Status:** Design Phase

---

## Executive Summary

This design outlines a modular **Job Application Pipeline** that automates LinkedIn job applications by:
1. Scraping jobs based on search criteria (company, location, keywords)
2. Filtering by relevance score using AI
3. Tuning resume and generating cover letters for each job
4. Previewing applications before submission
5. Applying to jobs with human-like behavior and anti-detection measures
6. Logging every action in an audit trail

The system is built on **four independent components** coordinated by a **pipeline orchestrator**, enabling clean separation of concerns, testability, and future extensibility.

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│         Job Application Wizard UI + Preview Screen           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (main.py)                   │
│  New Endpoint: POST /job-application-wizard                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            JobApplicationPipeline (Orchestrator)             │
│  - Coordinates entire workflow                              │
│  - Manages state and error handling                          │
│  - Streams progress to frontend                             │
└──────┬──────────────┬──────────────┬───────────────┬────────┘
       │              │              │               │
       ▼              ▼              ▼               ▼
   ┌────────┐  ┌──────────────┐  ┌──────────────┐ ┌─────────┐
   │ Scraper│  │ResumeCustomer│  │CoverLetter   │ │Applier  │
   │        │  │              │  │Generator     │ │(Playwright)
   │Local   │  │- Extract job │  │- Prompt eng. │ │- Form fill
   │LinkedIn│  │  requirements│  │- Personalize │ │- Submit
   │Scraper │  │- Tune resume │  │  per job     │ │- Detect success
   └────────┘  └──────────────┘  └──────────────┘ └─────────┘
```

---

## Component Design

### 1. JobApplicationPipeline (Orchestrator)

**File:** `backend/job_application_pipeline.py`

**Responsibility:** Coordinates the entire workflow, manages state, streams progress to frontend

**Core Method:**
```python
class JobApplicationPipeline:
    async def run(
        self,
        search_criteria: dict,  # {company, location, keywords}
        resume_text: str,
        preview_only: bool = True,  # True = show preview, False = auto-apply
        relevance_threshold: float = 0.7,
        status_callback: callable  # SSE callback
    ) -> dict
```

**Workflow:**
1. Call `LocalLinkedInScraper.run()` to scrape jobs
2. Filter jobs by relevance score using `analyze_job_fit()` (threshold: 0.7+)
3. For each filtered job:
   - Call `ResumeCustomizer.customize_resume()`
   - Call `CoverLetterGenerator.generate()`
   - Stream preview: `{type: "preview", job_title, relevance_score, tuned_resume, cover_letter}`
   - If `preview_only=True`: Wait for user approval via frontend
   - If approved OR `preview_only=False`: Call `ApplicationAutomator.apply()`
   - Stream result: `{type: "applied", job_title, success, timestamp}`
   - Call `anti_detection.random_delay()` (5-30 min, business hours only)
   - Log to audit trail
4. Return summary: `{total_scraped, filtered, applied, failed, logs}`

**Key Features:**
- Streams all progress via SSE callback (real-time frontend updates)
- Maintains full audit log of every action
- Implements exponential backoff on failures
- Respects LinkedIn rate limits and business hours
- Handles errors gracefully without stopping pipeline

---

### 2. ResumeCustomizer

**File:** `backend/resume_customizer.py`

**Responsibility:** Customize resume to match specific job requirements (medium tuning)

**Core Method:**
```python
class ResumeCustomizer:
    def customize_resume(
        self,
        original_resume: str,
        job_title: str,
        job_description: str,
        company_name: str
    ) -> str  # Customized resume text
```

**What It Does:**
1. Extract key requirements and skills from job description using Gemini
2. Reorder resume sections to prioritize relevant experience
3. Rewrite bullet points to emphasize skills matching the job
4. Regenerate professional summary (2-3 sentences) to align with role
5. Keep original formatting intact, only customize content
6. Preserve all sections (education, certifications, etc.)

**Gemini Prompt:**
```
You are a professional resume writer. Customize this resume for a specific job:

ORIGINAL RESUME:
[resume_text]

TARGET JOB:
Title: {job_title}
Company: {company_name}
Description: {job_description}

CUSTOMIZATION RULES:
1. Reorder bullet points to highlight most relevant experience FIRST
2. Rewrite bullets to include job keywords and required skills
3. Regenerate the professional summary (2-3 sentences) to match this role
4. Keep all sections and formatting unchanged - only modify content
5. Make it clear this resume is tailored to THIS specific job
6. Do NOT make up or fabricate experience

CUSTOMIZED RESUME:
[return customized resume]
```

**Output:** Modified resume text ready for LinkedIn application

---

### 3. CoverLetterGenerator

**File:** `backend/cover_letter_generator.py`

**Responsibility:** Generate personalized, job-specific cover letters

**Core Method:**
```python
class CoverLetterGenerator:
    def generate(
        self,
        resume_text: str,
        job_title: str,
        company_name: str,
        job_description: str
    ) -> str  # Cover letter text (3-4 paragraphs)
```

**What It Does:**
1. Extract key achievements and skills from resume
2. Identify must-have requirements from job posting
3. Generate personalized cover letter that:
   - Opens with genuine enthusiasm for the role
   - References 2-3 relevant achievements from resume
   - Demonstrates understanding of company and role requirements
   - Closes with call to action
4. Keep professional but approachable tone
5. 3-4 paragraphs, ~300-400 words

**Gemini Prompt:**
```
Generate a personalized cover letter for a LinkedIn job application.

CANDIDATE RESUME:
[resume_text]

TARGET JOB:
Title: {job_title}
Company: {company_name}
Description: {job_description}

COVER LETTER REQUIREMENTS:
1. Opening paragraph: Express genuine interest in this specific role at this company
2. Middle paragraphs: Highlight 2-3 relevant achievements from the resume
3. Show specific understanding of the job requirements and company
4. Closing paragraph: Professional call to action
5. Keep tone professional but personable (not robotic)
6. Length: 3-4 paragraphs (~300-400 words)
7. Make it clear this is customized for THIS job (no generic templates)

FORMAT: Return only the cover letter text, no headers or labels.

COVER LETTER:
[return cover letter]
```

**Output:** Cover letter ready to paste into LinkedIn application

---

### 4. ApplicationAutomator

**File:** `backend/application_automator.py`

**Responsibility:** Automate LinkedIn job application form submission using Playwright

**Core Method:**
```python
class ApplicationAutomator:
    async def apply(
        self,
        job_url: str,
        resume_text: str,
        cover_letter: str,
        browser_context  # Reuse from LocalLinkedInScraper
    ) -> dict  # {success: bool, message: str, error?: str}
```

**Application Flow:**
1. Navigate to job posting URL using Playwright
2. Wait for page to load, detect "Easy Apply" button
3. Click "Easy Apply" button
4. Detect and fill form fields in sequence:
   - **Phone Number:** Auto-fill from user profile
   - **Email:** Auto-fill from user profile
   - **Resume:**
     - Check if file upload or paste required
     - If upload: Create temporary file with customized resume, upload
     - If paste: Paste customized resume text
   - **Cover Letter:**
     - Detect if field exists
     - If yes: Paste generated cover letter
     - If no: Skip (some jobs don't have cover letter field)
   - **Custom Questions:**
     - Detect any additional questions
     - For yes/no questions: Use simple heuristics to answer
     - For text questions: Skip if complex (user can do manually)
5. Apply human-like behavior:
   - Random delays between field fills (1-3 seconds)
   - Random mouse movements before clicking
   - Slow typing simulation (already in LocalLinkedInScraper)
6. Submit application
7. Detect success:
   - Look for "Application sent" confirmation message
   - Check URL change or success toast notification
   - Return success status

**Anti-Detection Features:**
```python
# Random delays between actions
await random_delay(min_sec=1, max_sec=3)

# Random mouse movement before clicking
await random_mouse_movement(page, duration_ms=2000)

# Slow human-like typing (from LocalLinkedInScraper.human_type)
page.human_type(selector, text, emit=callback)

# User-agent rotation (optional)
user_agent = get_random_user_agent()
```

**Error Handling:**
- If "Easy Apply" not found → Fallback to manual apply link
- If form changed (LinkedIn updates) → Log error, skip job, continue
- If Playwright can't interact with element → Retry 2x with delays, then skip
- If network timeout → Retry with exponential backoff
- All errors logged to audit trail, pipeline continues

---

### 5. Anti-Detection & Rate Limiting

**File:** `backend/anti_detection.py`

**Functions:**

```python
def random_delay(min_minutes=5, max_minutes=30, business_hours_only=True):
    """
    Sleep for random duration to avoid detection.
    - Range: 5-30 minutes between applications
    - If business_hours_only=True: Wait until 9 AM if current time is 6 PM+
    - Uses os.urandom for true randomness
    - Never sleeps exact intervals
    """
    current_hour = datetime.now().hour
    if business_hours_only and (current_hour < 9 or current_hour >= 18):
        # Sleep until 9 AM
        next_9am = ...
        time.sleep((next_9am - datetime.now()).total_seconds())

    # Sleep random duration
    delay = random.uniform(min_minutes * 60, max_minutes * 60)
    time.sleep(delay)

def get_random_user_agent() -> str:
    """Return random user agent from realistic pool"""
    agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
        # ... more agents
    ]
    return random.choice(agents)

async def random_mouse_movement(page, duration_ms=2000):
    """Move mouse in random pattern to simulate human before clicking"""
    # Simulate natural mouse movement pattern
    await page.evaluate(f"""
        async () => {{
            // Random mouse movement code
        }}
    """)
```

---

## Data Flow

```
User Input (Search Criteria)
    ↓
┌─────────────────────────────────────────┐
│ LocalLinkedInScraper.run()              │
│ Scrape jobs by company/location/keywords│
└──────────────┬──────────────────────────┘
               ↓
         [Raw Job Listings] (50-100 jobs)
               ↓
┌─────────────────────────────────────────┐
│ Filter by Relevance                     │
│ analyze_job_fit(resume, job_desc) >= 70%
└──────────────┬──────────────────────────┘
               ↓
         [Filtered Jobs] (10-30 jobs)
               ↓
      ┌────────┴────────┐
      │ For each job:   │
      └────────┬────────┘
               ↓
    ┌──────────────────────┐
    │ ResumeCustomizer     │
    │ tune resume          │
    └──────────┬───────────┘
               ↓
    ┌──────────────────────┐
    │ CoverLetterGenerator │
    │ generate letter      │
    └──────────┬───────────┘
               ↓
    ┌─────────────────────────────────────┐
    │ STREAM PREVIEW to Frontend          │
    │ {type: "preview",                   │
    │  job_title, relevance_score,        │
    │  tuned_resume, cover_letter}        │
    └──────────┬────────────────────────┘
               ↓
    ┌─────────────────────────────────────┐
    │ User Reviews and Approves           │
    │ (if preview_only=True)              │
    └──────────┬────────────────────────┘
               ↓
    ┌──────────────────────┐
    │ ApplicationAutomator │
    │ .apply(job_url...)   │
    └──────────┬───────────┘
               ↓
    ┌─────────────────────────────────────┐
    │ STREAM RESULT to Frontend           │
    │ {type: "applied",                   │
    │  job_title, success, timestamp}     │
    └──────────┬────────────────────────┘
               ↓
    ┌─────────────────────────────────────┐
    │ Log to Audit Trail                  │
    │ {timestamp, action, status, error?} │
    └──────────┬────────────────────────┘
               ↓
    ┌─────────────────────────────────────┐
    │ random_delay(5-30 min)              │
    │ (Business hours only, no detection) │
    └──────────┬────────────────────────┘
               ↓
         [Next Job]
```

---

## Frontend Integration

### New API Endpoint

**POST `/job-application-wizard`**

**Request:**
```json
{
  "company": "Google,Meta,Amazon",  // comma-separated
  "location": "San Francisco, CA",
  "keywords": "Python,Backend,Engineer",
  "preview_only": true,  // true = preview first, false = auto-apply
  "relevance_threshold": 0.7
}
```

**Response:** Server-Sent Events (SSE) stream

**Event Types:**
```json
// Job preview (before applying)
{
  "type": "preview",
  "job_id": "linkedin_123",
  "job_title": "Senior Backend Engineer",
  "company": "Google",
  "relevance_score": 0.85,
  "tuned_resume": "...",
  "cover_letter": "...",
  "location": "San Francisco, CA"
}

// User preview complete
{
  "type": "preview_done",
  "total_previews": 15,
  "awaiting_approval": 15
}

// Application in progress
{
  "type": "applying",
  "job_title": "Senior Backend Engineer",
  "company": "Google"
}

// Application result
{
  "type": "applied",
  "job_title": "Senior Backend Engineer",
  "company": "Google",
  "success": true,
  "timestamp": "2026-03-29T14:32:45Z"
}

// Application failed
{
  "type": "applied",
  "job_title": "Staff Engineer",
  "company": "Amazon",
  "success": false,
  "error": "Form structure changed, could not detect submit button",
  "timestamp": "2026-03-29T15:02:50Z"
}

// All applications done
{
  "type": "done",
  "total_applied": 12,
  "total_failed": 2,
  "total_skipped": 1
}

// Error
{
  "type": "error",
  "message": "LinkedIn blocked automated requests. Try again later.",
  "severity": "warning"  // or "error"
}
```

### Frontend User Flow

1. **Search Screen:**
   - Input: Company, Location, Keywords
   - Option: Select Preview Mode or Auto-Apply Mode
   - Click "Start Wizard"

2. **Preview Screen** (if preview_only=True):
   - Display each job with:
     - Job title, company, location
     - Relevance score (85%)
     - Snippet of tuned resume
     - Generated cover letter
     - Action buttons: "Apply Now" / "Skip" / "Review Details"
   - User reviews and approves each job before applying

3. **Applying Screen:**
   - Real-time progress:
     - "Applying to Job 3 of 15..."
     - Timestamps of each application
     - Success/failure indicators
   - Red banner for failures with error details

4. **Summary Screen:**
   - "Applied to 12 jobs successfully"
   - "2 jobs failed (see log)"
   - "1 job skipped"
   - Expandable audit log showing:
     - Timestamp, job title, company, status, notes

---

## Audit Trail & Logging

**File:** `backend/audit_log.json` (or database)

**Log Entry Schema:**
```json
{
  "timestamp": "2026-03-29T14:32:15Z",
  "session_id": "sess_abc123",
  "action": "scraped|preview|approved|applied|failed|skipped",
  "job_title": "Senior Backend Engineer",
  "company": "Google",
  "job_url": "https://...",
  "relevance_score": 0.85,
  "success": true,
  "details": {
    "resume_customized": true,
    "cover_letter_generated": true,
    "form_fields_filled": ["phone", "email", "resume", "cover_letter"],
    "error": null
  }
}
```

**Example Log:**
```json
[
  {
    "timestamp": "2026-03-29T14:32:15Z",
    "action": "scraped",
    "total_jobs": 47,
    "filtered_by_relevance": 15
  },
  {
    "timestamp": "2026-03-29T14:32:45Z",
    "action": "preview",
    "job_title": "Senior Backend Engineer",
    "company": "Google",
    "relevance_score": 0.85,
    "status": "shown_to_user"
  },
  {
    "timestamp": "2026-03-29T14:33:20Z",
    "action": "approved",
    "job_title": "Senior Backend Engineer",
    "company": "Google"
  },
  {
    "timestamp": "2026-03-29T14:33:45Z",
    "action": "applied",
    "job_title": "Senior Backend Engineer",
    "company": "Google",
    "success": true,
    "details": {
      "resume_customized": true,
      "cover_letter_generated": true,
      "form_fields_filled": ["phone", "email", "resume", "cover_letter"]
    }
  },
  {
    "timestamp": "2026-03-29T15:02:50Z",
    "action": "applied",
    "job_title": "Staff Engineer",
    "company": "Amazon",
    "success": false,
    "details": {
      "error": "LinkedIn form structure changed, could not detect submit button"
    }
  }
]
```

---

## Error Handling Strategy

### Graceful Degradation

| Scenario | Handling |
|----------|----------|
| Gemini API fails | Use original resume, log warning, continue |
| Cover letter generation fails | Skip cover letter field, log note, continue |
| LinkedIn form changed | Log error, skip job, move to next |
| Application submit fails | Retry 2x, then skip, log error |
| Network timeout | Exponential backoff (1s → 2s → 4s) |
| LinkedIn blocks requests | Alert user, pause, suggest try again later |
| Browser crash | Restart browser, resume from last successful job |

### User Notifications

- **Real-time streaming:** All events pushed to frontend immediately
- **Failed jobs:** Clearly marked in UI with error reason
- **Final summary:** Shows success count, failure count, reasons
- **Audit log:** Full detail available for debugging

---

## Testing Strategy

### Unit Tests

```python
# test_resume_customizer.py
test_customize_resume_includes_job_keywords()
test_customize_resume_preserves_formatting()
test_customize_resume_handles_short_resume()

# test_cover_letter_generator.py
test_generate_cover_letter_structure()
test_generate_cover_letter_personalization()
test_generate_cover_letter_length()

# test_anti_detection.py
test_random_delay_respects_business_hours()
test_random_delay_varies_duration()
test_random_user_agent_rotation()
```

### Integration Tests

```python
# test_application_automator.py
test_apply_to_job_with_cover_letter()  # Real LinkedIn staging account
test_apply_to_job_without_cover_letter()
test_detect_already_applied()
test_handle_form_changes()

# test_pipeline_end_to_end.py
test_pipeline_scrape_filter_customize_preview()
test_pipeline_preview_mode()
test_pipeline_auto_apply_mode()
test_pipeline_error_recovery()
```

### Manual Testing

- Test with 5-10 real LinkedIn job postings
- Verify resume tuning quality
- Verify cover letter personalization
- Verify anti-detection (no blocks after 20+ applications)
- Verify audit log completeness

---

## Implementation Phases

### Phase 1: Core Pipeline (Week 1)
- [ ] Implement `ResumeCustomizer` with Gemini
- [ ] Implement `CoverLetterGenerator` with Gemini
- [ ] Implement `JobApplicationPipeline` orchestrator
- [ ] Implement preview streaming to frontend
- [ ] Unit tests for all components

### Phase 2: LinkedIn Automation (Week 2)
- [ ] Implement `ApplicationAutomator` with Playwright
- [ ] Implement anti-detection measures
- [ ] Implement audit logging
- [ ] Integration tests with staging LinkedIn account
- [ ] Error handling and recovery

### Phase 3: Frontend Integration (Week 3)
- [ ] Add `/job-application-wizard` endpoint to FastAPI
- [ ] Build preview UI (display tuned resume, cover letter)
- [ ] Build applying UI (real-time progress)
- [ ] Build summary/audit log UI
- [ ] End-to-end testing

### Phase 4: Polish & Hardening (Week 4)
- [ ] Rate limiting refinement
- [ ] LinkedIn detection evasion testing
- [ ] Performance optimization
- [ ] User documentation
- [ ] Production readiness

---

## Success Criteria

✅ **Functional:**
- Successfully scrape 50+ LinkedIn jobs per search
- Filter to 10-20 relevant jobs (70%+ match)
- Generate customized resumes for each job
- Generate personalized cover letters
- Preview before applying
- Apply to jobs automatically via LinkedIn Easy Apply
- Log every action to audit trail

✅ **Anti-Detection:**
- No LinkedIn blocks after 50+ applications in one session
- Random delays between applications (5-30 min)
- Human-like typing and mouse movement
- User-agent rotation

✅ **User Experience:**
- Real-time progress streaming
- Clear preview before applying
- Failed jobs clearly marked with reasons
- Full audit log accessible
- Easy to re-run with different criteria

✅ **Quality:**
- 100% unit test coverage for core components
- Integration tests with real LinkedIn
- No crashed applications
- Graceful error handling
- All errors logged

---

## Future Enhancements

1. **Recruiter Outreach:** Message/connect with recruiters (separate pipeline)
2. **Email Follow-ups:** Send follow-up emails after applying
3. **Dashboard:** Historical view of applications, success rates
4. **Job Alerts:** Notify when new matching jobs appear
5. **Resume Versioning:** Maintain different resume versions per role type
6. **A/B Testing:** Test different cover letter styles, resume formats
7. **Integration with ATS:** Track application status across platforms

---

## Technical Debt & Considerations

- **LinkedIn API vs Web Scraping:** Currently using web scraping via Playwright. Consider LinkedIn API if they expose Easy Apply programmatically in future
- **Resume Storage:** Currently in-memory. Move to database for persistence
- **Audit Log Storage:** Currently JSON file. Move to database for scalability
- **Rate Limiting:** Currently hard-coded (5-30 min). Make configurable
- **Multi-user Support:** Currently single-user. Add user authentication for multi-user scenarios

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LinkedIn blocks automation | Medium | High | Random delays, user-agent rotation, monitoring blocks |
| Form structure changes | Medium | Medium | Robust selectors, error logging, manual fallback |
| Gemini API rate limits | Low | Medium | Retry logic, batch processing, graceful degradation |
| Resume tuning quality | Medium | Medium | User preview, manual override option |
| Browser crashes | Low | Medium | Restart browser, resume from last successful job |

---

## Appendix: Example Outputs

### Example Customized Resume

```
ORIGINAL:
- Led development of payment processing system serving 1M+ users
- Optimized database queries, reduced latency by 40%

CUSTOMIZED FOR: "Senior Backend Engineer - Google"
- Led development of scalable payment processing system serving 1M+ users using Python/FastAPI
- Optimized database queries and implemented caching strategies, reducing latency by 40% and improving user experience
- Implemented monitoring and alerting for system reliability and uptime
```

### Example Generated Cover Letter

```
Dear Hiring Manager,

I am excited to apply for the Senior Backend Engineer position at Google. With 8+ years of experience building scalable systems and a proven track record of delivering high-impact solutions, I am confident I can contribute significantly to your team.

In my current role at [Company], I led the development of a payment processing system that serves over 1 million users. This experience directly aligns with Google's infrastructure needs. Additionally, I optimized critical database queries, reducing latency by 40%, which improved system reliability and user experience—key priorities for Google's scale.

I am particularly drawn to Google's commitment to innovation and technical excellence. My expertise in Python, distributed systems, and database optimization positions me well to tackle Google's complex backend challenges.

I look forward to discussing how my experience can contribute to Google's mission.

Best regards,
[User Name]
```

---

**Document Version:** 1.0
**Last Updated:** 2026-03-29
**Author:** Design Phase - Job Application Automation Pipeline
