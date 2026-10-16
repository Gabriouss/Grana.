"""Regressões do sino no DOM nativo; API explicitamente interceptada, sem dados reais."""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'tools/admin-local/web'
OUT = Path('E:/Grana-temporarios/2026-10-16-qa-local-admin/forge')
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for scenario in ('erro', 'indisponivel', 'vazio', 'remota', 'dados-de-teste'):
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        posts = []

        def intercept(route):
            path = urlparse(route.request.url).path
            if not path.startswith('/api/'):
                file = ROOT / path.lstrip('/') if path.startswith('/design-system/') else WEB / (path.lstrip('/') or 'index.html')
                route.fulfill(path=str(file)) if file.is_file() else route.fulfill(status=404, body='')
                return
            status = 200
            dados = {}
            if path == '/api/saude':
                dados = {'painel': 'grana-admin'}
            elif path == '/api/sessao':
                dados = {'etapa': 'ok', 'restanteSeg': 3600, 'csrfToken': 'qa-sem-credencial'}
            elif path == '/api/marketing/notificacoes':
                if scenario == 'erro':
                    status = 503
                elif scenario == 'indisponivel':
                    dados = {'status': 'indisponivel', 'fonte': 'indisponivel', 'naoLidas': None, 'motivo': 'Fonte de QA não configurada.'}
                else:
                    itens = [] if scenario == 'vazio' else [{'id': 'qa-1', 'fonte': 'sistema', 'importancia': 'informacao', 'titulo': 'Ocorrência de QA', 'resumo': 'Teste de interface, sem evento real.', 'criadoEm': '2026-10-01T12:00:00Z', 'lidaEm': None}]
                    dados = {'fonte': 'remota' if scenario == 'remota' else 'dados-de-teste', 'notificacoes': itens, 'naoLidas': len(itens), 'atualizadoEm': '2026-10-16T12:00:00Z'}
            elif path == '/api/marketing/notificacoes/ler':
                posts.append(route.request.post_data_json)
            else:
                status = 503
            route.fulfill(status=status, json={'ok': status == 200, 'dados': dados, 'erro': {'codigo': 'qa-fonte-indisponivel', 'mensagem': 'Sonda de QA'}})

        page.route('**/*', intercept)
        page.goto('http://127.0.0.1:4399/#/marketing/resultados')
        page.wait_for_load_state('networkidle')
        page.locator('.sino-botao').first.click()
        page.wait_for_load_state('networkidle')
        central = page.locator('dialog.central')
        central.wait_for()
        assert not central.evaluate("el => {const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(w.nextNode())if(w.currentNode.textContent.trim()==='null')return true;return false;}")
        if scenario in ('erro', 'indisponivel'):
            assert central.locator('.central-sub').inner_text() == 'Contagem indisponível'
            assert '—' in central.locator('#aba-nao-lidas').inner_text()
            assert '—' in central.locator('#aba-todas').inner_text()
            assert central.get_by_text('Você está em dia.', exact=True).count() == 0
            if scenario == 'erro':
                assert 'HTTP 503' in central.inner_text()
                assert '/api/marketing/notificacoes' in central.inner_text()
                assert 'qa-fonte-indisponivel' in central.inner_text()
        elif scenario == 'vazio':
            assert 'Nenhuma não lida' in central.locator('.central-sub').inner_text()
            assert central.get_by_text('Você está em dia.', exact=True).is_visible()
        else:
            central.get_by_role('button', name='Marcar 1 como lida', exact=True).click()
            page.wait_for_function("document.querySelector('.central-sub').textContent.includes('Nenhuma não lida')")
            assert posts == [{'ids': ['qa-1']}]
            if scenario == 'remota':
                assert central.get_by_role('button', name='Desfazer', exact=True).count() == 0
            else:
                central.get_by_role('button', name='Desfazer', exact=True).click()
                page.wait_for_function("document.querySelector('.central-sub').textContent.includes('1 não lida')")
                assert posts[-1] == {'ids': ['qa-1'], 'desfazer': True}
        page.screenshot(path=str(OUT / f'sino-{scenario}.png'), full_page=True)
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('dialog.central')")
        assert page.evaluate("document.activeElement.classList.contains('sino-botao')"), 'Escape não devolveu foco ao sino'
        page.close()
    browser.close()
print('OK: DOM real, erro HTTP, indisponível, zero observado, remoto sem desfazer, teste reversível e Escape/foco.')
