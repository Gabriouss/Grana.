"""E5 real no navegador com API interceptada. Não chama serviço ou autenticação real."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'tools/admin-local/web'
OUT = Path('E:/Grana-temporarios/2026-10-16-qa-local-admin/forge')
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'a' * 64
ALVO = {'pecaId': 'b' * 16, 'rede': 'instagram', 'conta': '123', 'formato': 'feed', 'estrategia': 'executor-remoto', 'horario': '2027-01-01T15:00:00.000Z'}
PECA = {'pecaId': ALVO['pecaId'], 'versao': 'c' * 40, 'aprovado': True, 'manifesto': {'legendaSha256': 'd' * 64, 'capaSha256': None, 'midias': [{'tipo': 'imagem', 'sha256': 'e' * 64}]}}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (320, 390, 768, 1440):
        page = browser.new_page(viewport={'width': width, 'height': 960})
        posts = []
        pausas = {'global': False, 'facebook': False, 'instagram': False}
        job = {'modo': 'simulacao', 'chave': KEY, 'alvo': ALVO, 'peca': PECA, 'estado': 'precisa-conferir', 'motivo': 'Resposta incerta de QA', 'remotoId': None}
        indisponivel = False

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
                dados = {'status': 'indisponivel', 'fonte': 'indisponivel', 'naoLidas': None}
            elif path == '/api/marketing/publicacoes-simulacao':
                if indisponivel:
                    status = 503
                elif route.request.method == 'GET':
                    dados = {'modo': 'simulacao', 'registros': [{**job, 'versao': PECA['versao']}], 'limitado': True, 'pausas': dict(pausas)}
                else:
                    body = route.request.post_data_json
                    posts.append(body)
                    assert body['modo'] == 'simulacao' and body['recurso'] == 'publicacoes-simulacao'
                    action = body['acao']
                    assert action != 'confirmar', 'Confirmação enviada sem preview visual'
                    if action in ('pausar', 'retomar'):
                        assert set(body) == {'recurso', 'modo', 'acao', 'rede'} | ({'confirmado'} if action == 'retomar' else set())
                        if action == 'retomar':
                            assert body['confirmado'] is True
                        pausas[body['rede']] = action == 'pausar'
                        dados = {'modo': 'simulacao', 'pausas': dict(pausas), 'cancelamentos': 'Pausa não comprova cancelamento.'}
                    elif action == 'previa':
                        assert set(body['alvo']) == set(ALVO)
                        assert body['alvo']['horario'].endswith('Z')
                        dados = {'modo': 'simulacao', 'chave': KEY, 'estado': 'planejado', 'alvo': body['alvo'], 'peca': PECA}
                    elif action == 'consultar':
                        dados = {'modo': 'simulacao', 'registro': {'revisao': 1, 'dados': dict(job)}}
                    elif action == 'reconciliar':
                        job['estado'] = 'publicado'
                        job['remotoId'] = 'sim-qa'
                        dados = {'modo': 'simulacao', 'registro': dict(job), 'chamadasMetaReais': 0, 'chamadasSimuladas': ['reconciliar']}
                    else:
                        raise AssertionError(f'Ação inesperada: {action}')
            else:
                status = 503
            route.fulfill(status=status, json={'ok': status == 200, 'dados': dados, 'erro': {'codigo': 'qa-indisponivel', 'mensagem': 'Fonte de QA indisponível'}})

        page.route('**/*', intercept)
        page.goto('http://127.0.0.1:4399/#/marketing/publicacoes')
        page.wait_for_load_state('networkidle')
        page.get_by_role('heading', name='Publicação e pausa', exact=True).wait_for()
        assert 'não é o inventário completo' in page.locator('.publicacoes').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Overflow horizontal'
        pause = page.get_by_role('button', name='Pausar Global', exact=True)
        pause.click()
        page.keyboard.press('Escape')
        page.wait_for_function("!document.querySelector('dialog[open]')")
        assert pause.evaluate('el => document.activeElement === el'), 'Escape não devolveu foco'
        assert posts == []
        pause.click()
        page.get_by_role('button', name='Pausar simulação', exact=True).click()
        page.get_by_role('button', name='Retomar Global', exact=True).wait_for()
        page.get_by_role('button', name='Retomar Global', exact=True).click()
        page.get_by_role('button', name='Retomar simulação', exact=True).click()
        page.get_by_role('button', name='Pausar Global', exact=True).wait_for()
        page.get_by_role('button', name='Ver combinação e recibo', exact=True).click()
        page.get_by_role('button', name='Reconciliar simulação', exact=True).wait_for()
        assert page.get_by_role('button', name='Executar simulação', exact=True).count() == 0
        page.get_by_role('button', name='Reconciliar simulação', exact=True).click()
        page.locator('dialog').get_by_role('button', name='Reconciliar simulação', exact=True).click()
        page.wait_for_function("document.querySelector('.publicacoes-detalhe').textContent.includes('sim-qa')")
        assert page.get_by_role('button', name='Executar simulação', exact=True).count() == 0
        page.get_by_role('button', name='Conferir combinação', exact=True).click()
        dlg = page.locator('dialog[open]')
        dlg.get_by_label('ID da peça (16 caracteres hexadecimais)', exact=True).fill(ALVO['pecaId'])
        dlg.get_by_label('ID da conta de destino', exact=True).fill('123')
        dlg.get_by_label('Horário local', exact=True).fill('2027-01-01T12:00')
        dlg.get_by_role('button', name='Consultar manifesto', exact=True).click()
        page.wait_for_function("document.querySelector('.publicacoes-detalhe').textContent.includes('Prévia indisponível')")
        assert page.get_by_role('button', name='Confirmar simulação', exact=True).is_disabled()
        assert not any(post['acao'] == 'confirmar' for post in posts)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Manifesto transbordou'
        page.screenshot(path=str(OUT / f'publicacoes-{width}.png'), full_page=True)
        indisponivel = True
        page.get_by_role('button', name='Atualizar', exact=True).click()
        page.get_by_role('heading', name='Publicações indisponíveis', exact=True).wait_for()
        assert 'HTTP 503' in page.locator('.publicacoes-recibo').inner_text()
        assert page.get_by_role('button', name='Pausar Global', exact=True).count() == 0
        page.close()
    browser.close()
print('OK E5: quatro larguras, pausa/retomada estrita, foco/Escape, reconciliação sem retry cego, preview bloqueado, HTTP503 honesto; zero Meta real.')
