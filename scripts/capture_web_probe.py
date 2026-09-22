from playwright.sync_api import sync_playwright


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    page.goto("http://127.0.0.1:8082/", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(5000)
    print(f"url={page.url}")
    print(f"title={page.title()}")
    print(page.locator("body").inner_text()[:3000])
    page.screenshot(path="E:/Grana-temporarios/prints/web-probe.png", full_page=True)
    browser.close()
