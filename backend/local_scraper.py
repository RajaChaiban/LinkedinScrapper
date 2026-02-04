import asyncio
import random
import json
import time
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import urllib.parse
from playwright_stealth import Stealth
from concurrent.futures import ThreadPoolExecutor
import queue

class LocalLinkedInScraper:
    """
    A 'Human-Assisted' local scraper that uses a real Chrome browser instance.
    Designed to mimic natural behavior and use the user's local session.
    Uses sync Playwright API in a thread to avoid Windows asyncio subprocess issues.
    """

    def __init__(self, headless=False):
        self.headless = headless
        self._message_queue = None

    def random_sleep(self, min_seconds=2, max_seconds=5):
        """Sleep for a random amount of time to mimic human hesitation."""
        sleep_time = random.uniform(min_seconds, max_seconds)
        time.sleep(sleep_time)

    def human_type(self, page, selector: str, text: str, emit=None):
        """
        Types text into a field like a human:
        - Random delays between keystrokes.
        - Occasional typos followed by backspaces and corrections.
        """
        page.focus(selector)

        typo_index = -1
        if len(text) > 4 and random.random() < 0.7:
            typo_index = random.randint(2, len(text) - 2)

        chars = list(text)
        current_text = ""

        for i, char in enumerate(chars):
            if i == typo_index:
                wrong_char = chr(ord(char) + 1)
                page.keyboard.type(wrong_char, delay=random.randint(50, 150))
                if emit: emit(f"Typing... {current_text}{wrong_char}")
                time.sleep(random.uniform(0.2, 0.6))

                page.keyboard.press("Backspace")
                if emit: emit(f"Correcting... {current_text}")
                time.sleep(random.uniform(0.2, 0.5))

            page.keyboard.type(char, delay=random.randint(50, 200))
            current_text += char

            if random.random() < 0.1:
                time.sleep(random.uniform(0.5, 1.2))

    def human_scroll(self, page, emit=None):
        """Scroll down the page in random increments/speeds."""
        current_height = 0
        scrolls = 0
        max_scrolls = 15

        while scrolls < max_scrolls:
            scroll_step = random.randint(300, 800)
            current_height += scroll_step
            page.mouse.wheel(0, scroll_step)

            if emit and scrolls % 3 == 0:
                emit("Reading job cards...")

            total_height = page.evaluate("document.body.scrollHeight")
            if current_height >= total_height:
                break

            self.random_sleep(0.5, 1.5)
            scrolls += 1

    def _run_sync(self, company: str, location: str, keywords: str, time_posted_minutes: int = None):
        """
        Synchronous scraper method that runs in a separate thread.
        Puts status messages into the queue for the async wrapper to consume.
        """
        def emit(msg):
            # Handle Windows console encoding issues with emojis
            try:
                print(f"Scraper Status: {msg}")
            except UnicodeEncodeError:
                print(f"Scraper Status: {msg.encode('ascii', 'replace').decode()}")
            if self._message_queue:
                self._message_queue.put(json.dumps({"type": "status", "message": msg}))

        emit(f"Starting Local Scraper for: {company}...")

        try:
            with sync_playwright() as p:
                # Launch browser (Headful = Visible)
                browser = p.chromium.launch(headless=self.headless, slow_mo=50)
                context = browser.new_context(
                    viewport={'width': 1280, 'height': 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                # Apply Stealth
                page = context.new_page()
                stealth = Stealth()
                stealth.apply_stealth_sync(page)

                # 1. Login Phase
                emit("Navigating to LinkedIn Login...")
                page.goto("https://www.linkedin.com/login")

                emit("🛑 ACTION REQUIRED: Please log in manually in the browser window.")
                emit("Waiting for you to reach the feed...")

                try:
                    page.wait_for_url("**/feed/**", timeout=300000)  # 5 minutes
                    emit("✅ Login detected! Proceeding...")
                except:
                    emit("❌ Login timed out.")
                    browser.close()
                    if self._message_queue:
                        self._message_queue.put(json.dumps({"type": "result", "data": []}))
                    return []

                self.random_sleep(2, 4)

                # 2. Navigate via Search Bar (Human Pattern)
                emit("Looking for jobs page...")
                page.goto("https://www.linkedin.com/jobs/")
                self.random_sleep(2, 3)

                try:
                    search_box = page.get_by_role("combobox", name="Search by title, skill, or company")

                    if search_box.count() == 0:
                        search_box = page.locator("input.jobs-search-box__text-input").first

                    emit("Focusing search bar...")
                    search_box.click()
                    self.human_type(page, "input.jobs-search-box__text-input", f"{keywords} {company}", emit=emit)
                    self.random_sleep(1, 2)

                    page.keyboard.press("Enter")
                    emit("Search submitted...")
                    page.wait_for_load_state("networkidle")
                    self.random_sleep(2, 4)

                    if time_posted_minutes:
                        seconds = time_posted_minutes * 60
                        emit(f"Applying strict time filter: Last {time_posted_minutes} mins...")
                        current_url = page.url
                        if "?" in current_url:
                            new_url = f"{current_url}&f_TPR=r{seconds}"
                        else:
                            new_url = f"{current_url}?f_TPR=r{seconds}"

                        page.goto(new_url)
                        self.random_sleep(3, 5)

                except Exception as e:
                    emit(f"⚠️ Search UI navigation failed: {e}. Fallback to direct URL.")
                    base_url = "https://www.linkedin.com/jobs/search/?"
                    params = {"keywords": f"{keywords} {company}", "location": location}
                    if time_posted_minutes:
                        params["f_TPR"] = f"r{time_posted_minutes * 60}"
                    page.goto(base_url + urllib.parse.urlencode(params))

                # 3. Scrape Results
                emit("Scrolling to load jobs...")
                self.human_scroll(page, emit=emit)

                content = page.content()
                soup = BeautifulSoup(content, 'html.parser')

                jobs = []
                job_cards = soup.select(".job-card-container")
                if not job_cards:
                    job_cards = soup.select("li.occludable-update-artdeco-list__item")

                emit(f"Found {len(job_cards)} raw job cards. Parsing...")

                for card in job_cards[:15]:
                    title_elem = card.select_one(".job-card-list__title")
                    company_elem = card.select_one(".job-card-container__company-name")
                    loc_elem = card.select_one(".job-card-container__metadata-item")

                    if title_elem:
                        jobs.append({
                            "title": title_elem.get_text(strip=True),
                            "company": company_elem.get_text(strip=True) if company_elem else company,
                            "location": loc_elem.get_text(strip=True) if loc_elem else location,
                            "url": "https://linkedin.com" + title_elem['href'] if title_elem.has_attr('href') else ""
                        })

                emit(f"✅ Scraped {len(jobs)} valid jobs.")

                # Send final result
                if self._message_queue:
                    self._message_queue.put(json.dumps({"type": "result", "data": jobs}))

                browser.close()
                return jobs

        except Exception as e:
            emit(f"❌ Error: {str(e)}")
            if self._message_queue:
                self._message_queue.put(json.dumps({"type": "error", "message": str(e)}))
            return []

    async def run(self, company: str, location: str, keywords: str, time_posted_minutes: int = None, status_callback=None):
        """
        Async wrapper that runs the sync scraper in a thread pool.
        Bridges the sync queue messages to the async callback.
        """
        self._message_queue = queue.Queue()

        # Run the sync scraper in a thread
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=1)

        # Start the scraper in a thread
        future = loop.run_in_executor(
            executor,
            self._run_sync,
            company, location, keywords, time_posted_minutes
        )

        # Poll the queue and forward messages to the async callback
        while not future.done():
            try:
                # Check for messages with a short timeout
                msg = self._message_queue.get_nowait()
                if status_callback:
                    await status_callback(msg)
            except queue.Empty:
                await asyncio.sleep(0.1)

        # Drain any remaining messages
        while not self._message_queue.empty():
            msg = self._message_queue.get_nowait()
            if status_callback:
                await status_callback(msg)

        # Get the result
        result = await asyncio.wrap_future(future)
        executor.shutdown(wait=False)
        return result


# Test runner (if run directly)
if __name__ == "__main__":
    scraper = LocalLinkedInScraper(headless=False)
    asyncio.run(scraper.run("Google", "New York", "Software Engineer", time_posted_minutes=30))
