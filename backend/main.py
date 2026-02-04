from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from .agent import LinkedInAgent
from .local_scraper import LocalLinkedInScraper
from fastapi.responses import StreamingResponse
import asyncio
import json
import sys

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

class ScrapeRequest(BaseModel):
    company: str
    location: str
    keywords: str
    mode: str = "jobs" # 'jobs' or 'recruiters'
    time_posted_minutes: Optional[int] = None # Added field
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

@app.get("/stream-scrape")
async def stream_scrape(company: str, location: str, keywords: str, time_posted_minutes: int = None):
    """
    SSE Endpoint that runs the local scraper and streams progress updates to the frontend.
    """
    async def event_generator():
        scraper = LocalLinkedInScraper(headless=False)
        
        # We need a queue to bridge the scraper's callback and this generator
        queue = asyncio.Queue()
        
        async def status_callback(msg):
            await queue.put(msg)

        # Run scraper in background task
        task = asyncio.create_task(
            scraper.run(
                company=company, 
                location=location, 
                keywords=keywords, 
                time_posted_minutes=time_posted_minutes, 
                status_callback=status_callback
            )
        )

        # Loop to yield events from the queue
        while not task.done() or not queue.empty():
            try:
                # Wait for next message with timeout to allow checking task status
                message = await asyncio.wait_for(queue.get(), timeout=1.0)
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
                yield f"data: {msg}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
