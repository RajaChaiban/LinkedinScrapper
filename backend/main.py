import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from agent import LinkedInAgent
from local_scraper import LocalLinkedInScraper
from resume_analyzer import (
    extract_resume_text,
    configure_gemini,
    is_gemini_configured,
    analyze_job_fit
)
from fastapi.responses import StreamingResponse
import asyncio
import json
import sys
from job_application_pipeline import JobApplicationPipeline

# Fix for Windows: Playwright requires ProactorEventLoop for subprocess support
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Module-level state for resume
_stored_resume_text: Optional[str] = None
_stored_resume_filename: Optional[str] = None
_stored_resume_bytes: Optional[bytes] = None
_stored_resume_format: Optional[str] = None  # 'pdf' or 'docx'

# Max file size: 10MB
MAX_RESUME_SIZE = 10 * 1024 * 1024


@app.on_event("startup")
async def startup_event():
    """Configure Gemini API on startup."""
    api_key = os.environ.get("GOOGLE_GEMINI_API_KEY", "")
    if api_key:
        configure_gemini(api_key)
    else:
        print("Warning: GOOGLE_GEMINI_API_KEY not set. Resume analysis will be disabled.")


class ScrapeRequest(BaseModel):
    company: str
    location: str
    keywords: str
    mode: str = "jobs"  # 'jobs' or 'recruiters'
    time_posted_minutes: Optional[int] = None
    message_template: Optional[str] = None
    leads: Optional[List[dict]] = None


@app.post("/launch")
async def launch_agent(request: ScrapeRequest):
    agent = LinkedInAgent()
    result = await agent.run(
        company=request.company,
        location=request.location,
        keywords=request.keywords,
        mode=request.mode,
        message=request.message_template,
        leads=request.leads
    )
    return {"status": "started", "message": result}


@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """
    Upload a resume file (.pdf or .docx) for job fit analysis.
    Extracts text and stores it for use during scraping.
    """
    global _stored_resume_text, _stored_resume_filename, _stored_resume_bytes, _stored_resume_format

    # Validate file extension
    filename = file.filename or "resume"
    if not (filename.lower().endswith('.pdf') or filename.lower().endswith('.docx')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .pdf or .docx file."
        )

    # Read file contents
    contents = await file.read()

    # Check file size
    if len(contents) > MAX_RESUME_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_RESUME_SIZE // (1024*1024)}MB."
        )

    # Extract text
    try:
        resume_text = extract_resume_text(contents, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store for later use
    _stored_resume_text = resume_text
    _stored_resume_filename = filename
    _stored_resume_bytes = contents
    _stored_resume_format = 'pdf' if filename.lower().endswith('.pdf') else 'docx'

    # Return summary
    preview = resume_text[:200] + "..." if len(resume_text) > 200 else resume_text

    return {
        "status": "success",
        "filename": filename,
        "text_length": len(resume_text),
        "preview": preview
    }


@app.get("/resume-status")
async def resume_status():
    """Check if a resume has been uploaded."""
    return {
        "uploaded": _stored_resume_text is not None,
        "filename": _stored_resume_filename,
        "text_length": len(_stored_resume_text) if _stored_resume_text else 0
    }


@app.delete("/resume")
async def clear_resume():
    """Clear the uploaded resume."""
    global _stored_resume_text, _stored_resume_filename, _stored_resume_bytes, _stored_resume_format
    _stored_resume_text = None
    _stored_resume_filename = None
    _stored_resume_bytes = None
    _stored_resume_format = None
    return {"status": "cleared"}


@app.get("/stream-scrape")
async def stream_scrape(companies: str, location: str, keywords: str, time_posted_minutes: int = None, mode: str = "jobs", use_cdp: bool = True,
                        university: str = "", auto_connect: bool = False, connection_note: str = "", connection_limit: int = 10):
    """
    SSE Endpoint that runs the local scraper and streams progress updates to the frontend.
    Accepts a comma-separated list of companies and scrapes jobs for each sequentially.
    If a resume is uploaded and Gemini is configured, performs AI job fit analysis.
    use_cdp: If true (default), attach to user's existing Chrome via CDP on port 9222.
    """
    company_list = [c.strip() for c in companies.split(",") if c.strip()]

    async def event_generator():
        scraper = LocalLinkedInScraper(headless=False, use_cdp=use_cdp)

        # We need a queue to bridge the scraper's callback and this generator
        queue = asyncio.Queue()

        async def status_callback(msg):
            await queue.put(msg)

        # Run scraper in background task
        task = asyncio.create_task(
            scraper.run(
                companies=company_list,
                location=location,
                keywords=keywords,
                time_posted_minutes=time_posted_minutes,
                mode=mode,
                university=university,
                auto_connect=auto_connect,
                connection_note=connection_note,
                connection_limit=connection_limit,
                status_callback=status_callback
            )
        )

        # Track if we received a result for analysis
        final_result = None

        # Loop to yield events from the queue
        while not task.done() or not queue.empty():
            try:
                # Wait for next message with timeout to allow checking task status
                message = await asyncio.wait_for(queue.get(), timeout=1.0)

                # Parse message to check if it's the final result
                try:
                    msg_data = json.loads(message)
                    if msg_data.get("type") == "result":
                        final_result = msg_data
                        # Don't yield yet - we'll process analysis first
                        continue
                except json.JSONDecodeError:
                    pass

                yield f"data: {message}\n\n"
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

        # Ensure we catch any final result or error if task finished
        if not queue.empty():
            while not queue.empty():
                msg = await queue.get()
                try:
                    msg_data = json.loads(msg)
                    if msg_data.get("type") == "result":
                        final_result = msg_data
                        continue
                except json.JSONDecodeError:
                    pass
                yield f"data: {msg}\n\n"

        # Run analysis phase if we have a result, resume, and Gemini (jobs mode only)
        if mode == "jobs" and final_result and _stored_resume_text and is_gemini_configured():
            jobs = final_result.get("data", [])

            if jobs:
                # Send analysis start event
                yield f"data: {json.dumps({'type': 'analysis_start', 'total': len(jobs)})}\n\n"

                for i, job in enumerate(jobs):
                    # Send progress event
                    yield f"data: {json.dumps({'type': 'analysis_progress', 'current': i + 1, 'total': len(jobs), 'job_title': job.get('title', 'Unknown')[:50]})}\n\n"

                    # Run analysis in thread to not block
                    analysis = await asyncio.to_thread(
                        analyze_job_fit,
                        _stored_resume_text,
                        job.get('title', ''),
                        job.get('company', ''),
                        job.get('description', '')
                    )

                    job['analysis'] = analysis

                    # Small delay between Gemini calls to avoid rate limits
                    if i < len(jobs) - 1:
                        await asyncio.sleep(0.5)

        # Send final result (with or without analysis)
        if final_result:
            yield f"data: {json.dumps(final_result)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
