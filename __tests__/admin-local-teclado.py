"""DOM real da casca local; APIs interceptadas, sem sessão/credencial real.

Executar: python __tests__/admin-local-teclado.py --evidencias <pasta-local>
Requer o Playwright Python já instalado no ambiente de QA.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "tools/admin-local/web"
parser = argparse.ArgumentParser()
parser.add_argument("--evidencias", required=True)
args = parser.parse_args()
out = Path(args.evidencias)
out.mkdir(parents=True, exist_ok=True)


def interceptar(route, autorizado):
    path = urlparse(route.request.url).path
    if path.startswith("/api/"):
        status = 200
        if path == "/api/saude":
            dados = {"painel": "grana-admin"}
        elif path == "/api/sessao":
            dados = {"etapa": "ok" if autorizado else "nao-pareado", "restanteSeg": 3600}
        elif path == "/api/marketing/notificacoes":
            dados = {"status": "indisponivel", "fonte": "indisponivel", "naoLidas": None}
        else:
            status = 503
            dados = None
        route.fulfill(status=status, json={"ok": status == 200, "dados": dados,
                                          "erro": {"codigo": "qa-indisponivel", "mensagem": "Sonda de QA sem dados reais."}})
        return
    file = (ROOT / path.lstrip("/")) if path.startswith("/design-system/") else WEB / (path.lstrip("/") or "index.html")
    if not file.resolve().is_relative_to(ROOT.resolve()) or not file.is_file():
        route.fulfill(status=404, body="")
        return
    route.fulfill(path=str(file))


resultados = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (320, 390, 768, 1440):
        page = browser.new_page(viewport={"width": width, "height": 900})
        page.route("**/*", lambda route: interceptar(route, False))
        page.goto("http://127.0.0.1:4399/")
        page.wait_for_load_state("networkidle")
        page.locator(".bloqueio").wait_for()
        assert page.locator(".casca").evaluate("el => el.hidden && el.inert")
        assert page.locator(".pular-para-conteudo").is_hidden()
        for _ in range(8):
            page.keyboard.press("Tab")
            assert not page.evaluate("document.activeElement.closest('.casca') !== null"), "Tab entrou no painel bloqueado"
        page.keyboard.press("Enter")
        assert page.evaluate("location.hash") != "#conteudo"
        page.screenshot(path=str(out / f"gate-corrigido-{width}.png"), full_page=True)
        page.close()

        page = browser.new_page(viewport={"width": width, "height": 900})
        page.route("**/*", lambda route: interceptar(route, True))
        page.goto("http://127.0.0.1:4399/#/marketing/resultados")
        page.wait_for_load_state("networkidle")
        assert page.locator(".casca").is_visible()
        page.locator(".pular-para-conteudo").focus()
        assert page.locator(".pular-para-conteudo").evaluate("el => {const r=el.getBoundingClientRect(); return r.top >= 0 && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === el;}")
        page.keyboard.press("Enter")
        assert page.evaluate("document.activeElement.id") == "conteudo"
        menu = page.get_by_role("button", name="Menu", exact=True)
        if menu.is_visible():
            menu.click()
            page.wait_for_function("document.querySelector('.lateral').getBoundingClientRect().left >= 0")
        links = page.locator(".nav-link").evaluate_all("els => els.map(el => {const r = new Range(); r.selectNodeContents(el); return {texto:el.textContent.trim(),linhas:new Set([...r.getClientRects()].filter(r=>r.width).map(r=>Math.round(r.top))).size};})")
        assert all(x["linhas"] == 1 for x in links), links
        assert page.locator('.nav-link').evaluate_all("els => els.every(el => { const r=new Range(); r.selectNodeContents(el); const t=r.getBoundingClientRect(), a=el.getBoundingClientRect(); return t.left>=a.left && t.right<=a.right && t.left>=0 && t.right<=innerWidth; })"), "Texto cortado na navegação"
        assert page.locator('a[href="#/marketing/aprendizado"]').inner_text() == "Relatórios"
        page.screenshot(path=str(out / f"nav-corrigida-{width}.png"), full_page=True)
        resultados.append({"largura": width, "bloqueio": "Tab não entra na casca", "painel": "skiplink visível e Enter foca main", "itens": links})
        page.close()
    browser.close()
(out / "teclado.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")
print("OK: bloqueio, skiplink e navegação em 320/390/768/1440; APIs de QA interceptadas.")
