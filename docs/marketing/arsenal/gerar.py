import json, os
from playwright.sync_api import sync_playwright
G=json.load(open('../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'))
ICONES=[('voz','mic'),('voz-contorno','mic-outline'),('colar-comprovante','clipboard-outline'),('qr-code-nota','qr-code-outline'),('recibo','receipt-outline'),('importar-extrato','download-outline'),('lembrete','notifications-outline'),('calendario','calendar-outline'),('carteira','wallet-outline'),('cartao','card-outline'),('graficos','stats-chart-outline'),('categorias','pie-chart-outline'),('granabo','sparkles'),('seguranca','shield-checkmark-outline'),('tempo','time-outline'),('salvo','checkmark-circle'),('recorrente','repeat'),('celular','phone-portrait-outline'),('computador','laptop-outline'),('sincronia','sync-outline'),('desafios','trophy-outline'),('sequencia','flame-outline'),('cafe','cafe-outline'),('mercado','cart-outline'),('noite','moon-outline'),('rapido','flash-outline'),('dinheiro','cash-outline'),('transporte','car-outline')]
ESTILOS={
 'menta':('background:#aeffe3','#052229'),
 'petroleo':('background:#0b2d35;border:6px solid #2a5660','#aeffe3'),
 'gradiente':('background:linear-gradient(135deg,#b0f7c9,#22a1c1)','#052229'),
 'contorno':('background:transparent;border:6px solid #aeffe3','#aeffe3'),
}
CSS='''@font-face{font-family:Ion;src:url(Ionicons.ttf)}html,body{margin:0;background:transparent}
.b{width:512px;height:512px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.g{font-family:Ion;font-size:270px;line-height:1}'''
N=[ # (arquivo, titulo, corpo, hora, acao)
 ('gasto-salvo-padaria','Pão na padaria · R$ 3,57','Alimentação · Débito · salvo no Grana.','agora','Desfazer'),
 ('gasto-salvo-almoco','Almoço · R$ 32,00','Alimentação · Pix · salvo no Grana.','agora','Desfazer'),
 ('gasto-salvo-corrida','Corrida de app · R$ 18,90','Transporte · Pix · salvo no Grana.','agora','Desfazer'),
 ('gasto-salvo-mercado','Mercado · R$ 86,40','Alimentação · Débito · salvo no Grana.','agora','Desfazer'),
 ('conta-salva-luz','Conta de luz · R$ 142,30','Conta a pagar · vence 10/10 · salvo no Grana.','agora','Desfazer'),
 ('noite-fechando-o-dia','Fechando o dia?','Teve algum gasto hoje? Se teve, dá pra registrar agora <e>👀</e>','21:30',None),
 ('noite-antes-de-dormir','Antes de dormir','Com o celular na mão, que tal ver se falta algum lançamento de hoje? <e>😉</e>','22:00',None),
 ('noite-minutinho','Um minutinho só','Se ficou algo de hoje pra registrar, o Grana. está aqui <e>🌙</e>','21:30',None),
 ('almoco-pausa','Pausa do meio-dia','Teve algo para registrar? Dá para fazer agora ou depois <e>🍴</e>','12:30',None),
 ('sequencia-viva','Sua sequência segue viva <e>🔥</e>','São 12 dias seguidos. Se tiver algo de hoje, dá pra continuar por aqui.','20:00',None),
 ('sequencia-constancia','Boa constância','12 dias seguidos registrando. Hoje pode ser mais um <e>🔥</e>','20:00',None),
 ('pequenos-cafe','Um café também conta','Se teve um café ou lanche hoje, ele também cabe no Grana. <e>☕</e>','16:00',None),
 ('pequenos-somam','Gastos pequenos somam','Gasto pequeno é o que mais escapa da memória. Bora garantir que ele entrou no controle? <e>💸</e>','18:00',None),
 ('dica-voz','Sabia que dá pra falar?','Dá pra lançar um gasto só falando com o Grana. Experimente a voz <e>🎙️</e>','10:00',None),
 ('dica-nota-fiscal','Nota fiscal em segundos','Escaneie o QR Code da nota fiscal e deixa o Grana. preencher o lançamento sozinho <e>📷</e>','10:00',None),
 ('voltar-simples','Voltar é simples','Quer retomar pelo próximo lançamento? O resto pode esperar <e>👋</e>','19:00',None),
 ('conta-vence-3-dias','Conta vence em 3 dias','Internet vence em 3 dias.','09:00',None),
 ('conta-vence-hoje','Conta vence hoje','Aluguel vence hoje.','09:00',None),
 ('fatura-vence-3-dias','Fatura vence em 3 dias','Fatura do Cartão do dia a dia.','09:00',None),
 ('cartao-limite-80','Cartão do dia a dia chegou a 80% do limite','Fique de olho pra não estourar a fatura deste mês.','agora',None),
 ('voz-salvo-no-aparelho','Lançamento salvo no aparelho','Será sincronizado com sua conta ao abrir o Grana. com conexão.','agora',None),
]
NCSS='''@font-face{font-family:Rb;src:url(roboto-400.woff2);font-weight:100 900}@font-face{font-family:Emo;src:url(emoji.woff2)}
html,body{margin:0;background:transparent}#w{display:inline-block;padding:10px 10px 24px}
.nt{width:392px;background:#2b2d31;border-radius:26px;padding:16px 16px 12px;box-shadow:0 8px 20px rgba(0,0,0,.4);font-family:Rb;box-sizing:border-box}
.row{display:flex;gap:14px}.ico{width:40px;height:40px;border-radius:50%;background:#052229;flex:none;display:flex;align-items:center;justify-content:center}
.ico img{width:34px;height:34px}.col{flex:1;min-width:0}.l1{display:flex;align-items:baseline;gap:8px;color:#e3e3e6}
.app{font-size:13px;color:#a9abb0}.tt{font-weight:500;font-size:16px;color:#e3e3e6;line-height:21px;margin-top:2px}.bb{font-size:14px;color:#c4c6cb;margin-top:2px;line-height:20px}
.ac{display:inline-block;margin:8px 0 0 42px;font-size:14px;font-weight:500;color:#9cd3c9;padding:6px 12px}e{font-family:Emo;font-style:normal}'''
os.makedirs('icones',exist_ok=True); os.makedirs('notificacoes',exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--allow-file-access-from-files'])
    pg=b.new_page(viewport={'width':512,'height':512})
    for nome,glyph in ICONES:
        ch=chr(G[glyph])
        for est,(bg,cor) in ESTILOS.items():
            open('i.html','w').write(f'<html><head><style>{CSS}</style></head><body><div class="b" style="{bg}"><span class="g" style="color:{cor}">{ch}</span></div></body></html>')
            pg.goto('file://'+os.path.abspath('i.html')); pg.evaluate('document.fonts.ready')
            pg.screenshot(path=f'icones/{nome}-{est}.png',omit_background=True)
        open('i.html','w').write(f'<html><head><style>{CSS}</style></head><body><div class="b"><span class="g" style="color:#aeffe3;font-size:420px">{ch}</span></div></body></html>')
        pg.goto('file://'+os.path.abspath('i.html')); pg.evaluate('document.fonts.ready'); pg.screenshot(path=f'icones/{nome}-simbolo-menta.png',omit_background=True)
    pg2=b.new_page(viewport={'width':412,'height':300},device_scale_factor=3)
    for arq,tt,bb,hh,ac in N:
        acao=f'<span class="ac">{ac}</span>' if ac else ''
        open('n.html','w').write(f'''<html><head><style>{NCSS}</style></head><body><div id="w"><div class="nt"><div class="row"><div class="ico"><img src="android-icon-monochrome.png"></div><div class="col"><div class="l1"><span class="app">Grana. · {hh}</span></div><div class="tt">{tt}</div><div class="bb">{bb}</div></div></div>{acao}</div></div></body></html>''')
        pg2.goto('file://'+os.path.abspath('n.html')); pg2.evaluate('document.fonts.ready'); pg2.wait_for_timeout(100)
        pg2.locator('#w').screenshot(path=f'notificacoes/{arq}.png',omit_background=True)
    b.close()
print('ok')
