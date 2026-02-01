from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import LinkedInAgent
import asyncio

app = FastAPI()

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScrapeRequest(BaseModel):
    target_company: str
    location: str
    keywords: str
    scrape_target: str

agent = LinkedInAgent()

@app.post("/launch")
async def launch_agent(request: ScrapeRequest):
    """
    Endpoint to trigger the AI Agent.
    In a production env, this would kick off a background task (Celery/Redis).
    """
    try:
        # Simulate async agent startup
        result = await agent.run(
            company=request.target_company, 
            location=request.location, 
            keywords=request.keywords,
            mode=request.scrape_target
        )
        return {"status": "success", "message": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
