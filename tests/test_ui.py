import re
from playwright.sync_api import Page, expect

def test_ui_launch_agent(page: Page):
    # this assumes the frontend is running on localhost:5173
    page.goto("http://localhost:5173")

    # Expect title
    expect(page).to_have_title(re.compile("LinkedIn AI Scraper"))

    # Fill form using name attributes
    page.locator('input[name="company"]').fill("Anthropic")
    page.locator('input[name="location"]').fill("San Francisco")
    page.locator('input[name="keywords"]').fill("Prompt Engineer")

    # Select 'Recruiters' mode
    # The button text is "Recruiters"
    page.get_by_role("button", name="Recruiters").click()

    # Click Launch
    # The button text is "Launch AI Agent"
    launch_btn = page.get_by_role("button", name="Launch AI Agent")
    launch_btn.click()

    # Expect loading state
    # The button text changes to "Agent Active..."
    expect(page.get_by_text("Agent Active...")).to_be_visible()

    # In a real E2E test, we would wait for the success message in the logs
    # expect(page.locator("text=Data extraction complete.")).to_be_visible()