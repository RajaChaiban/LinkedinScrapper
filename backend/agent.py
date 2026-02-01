import asyncio
import os
from apify_client import ApifyClient
from dotenv import load_dotenv

load_dotenv()

class LinkedInAgent:
    """
    AI Agent that orchestrates LinkedIn scraping via Apify.
    """
    
    def __init__(self):
        self.api_token = os.getenv("APIFY_API_TOKEN")
        if self.api_token:
            self.client = ApifyClient(self.api_token)
        else:
            print("Warning: APIFY_API_TOKEN not found. Agent running in simulation mode.")
            self.client = None

    async def run(self, company: str, location: str, keywords: str, mode: str):
        print(f"Agent starting: Target={company}, Location={location}, Mode={mode}")
        
        if not self.client:
            # Simulation mode for testing without costs
            await asyncio.sleep(2)
            return f"SIMULATION: Agent successfully launched for {company} ({mode}). (Add APIFY_API_TOKEN to .env for real scraping)"

        try:
            # Select the appropriate Apify Actor based on mode
            if mode == 'jobs':
                actor_id = "harrison/linkedin-job-scraper"  # Example popular actor
                run_input = {
                    "keywords": keywords,
                    "location": location,
                    "limit": 10,
                }
            else:
                actor_id = "trudax/linkedin-profile-scraper" # Example profile scraper
                run_input = {
                    "searchUrl": f"https://www.linkedin.com/search/results/people/?keywords={keywords} {company}",
                    "limit": 10
                }

            # Start the actor run asynchronously
            # Note: client.actor().call() is synchronous, so we run it in a thread for this async method
            # For production, we'd use the async client or background tasks
            run = await asyncio.to_thread(self.client.actor(actor_id).call, run_input=run_input)
            
            return f"SUCCESS: Apify run {run.get('id')} started. Status: {run.get('status')}."

        except Exception as e:
            return f"ERROR: Failed to start Apify actor. {str(e)}"
