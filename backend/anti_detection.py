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
            if now.hour >= 18:
                hours_until_9am = (24 - now.hour) + 9
            else:
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

    steps = random.randint(3, 5)
    for _ in range(steps):
        x = random.randint(100, width - 100)
        y = random.randint(100, height - 100)
        page.mouse.move(x, y)
        time.sleep(random.uniform(0.1, 0.4))
