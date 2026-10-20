'use strict';
// Reutiliza só bootstrap/rotas sintéticas da suíte DOM; não executa o QA geral.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const filename = path.join(__dirname, 'admin-publicacoes-reais-dom.cjs');
const original = fs.readFileSync(filename, 'utf8');
const marker = "    await page.goto('http://127.0.0.1:4399/#/marketing/publicacoes?mes=2026-10');";
if (!original.includes(marker)) throw Error('Bootstrap focal não localizado');
let source = original.slice(0, original.indexOf(marker))
  .replace('[390, 768, 1024, 1280, 1440]', '[390, 1440]')
  .replace('process.exit(0)', 'process.exit(2)'); // Playwright ausente não equivale a QA aprovado.
const tail = String.raw`
    const assert = require('node:assert/strict');
    const carregar = async () => {
      await page.goto('http://127.0.0.1:4399/#/marketing/calendario?mes=2026-10&visao=lista');
      await page.reload();
      await page.getByRole('heading', {name:'Calendário',exact:true}).waitFor();
    };
    const trigger = () => page.locator('.pub-real-job').filter({hasText:'Preparo interrompido antes da publicação'}).first()
      .getByRole('button',{name:'Reagendar Instagram',exact:true});
    const abrir = async () => {
      await trigger().focus(); await page.keyboard.press('Enter');
      await page.locator('dialog[open] input[type="datetime-local"]').fill('2026-12-01T10:30');
      await page.getByRole('button',{name:'Gerar nova prévia',exact:true}).focus(); await page.keyboard.press('Enter');
      await page.getByRole('button',{name:'Confirmar reagendamento',exact:true}).waitFor();
    };
    const estabilizar = async () => {
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const foco = async etapa => {
      await estabilizar();
      const f = await page.evaluate(() => {
        const el=document.activeElement,r=el.getBoundingClientRect();
        return {tag:el.tagName,texto:el.textContent,classe:el.className,dialogo:!!el.closest('dialog[open]'),
          abertos:document.querySelectorAll('dialog[open]').length,hash:location.hash,
          visivel:r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};
      });
      console.log('FOCO',width,etapa,JSON.stringify(f));
      await page.screenshot({path:path.join(OUT,'reagendamento-foco-'+etapa+'-'+width+'.png')});
      return f;
    };
    const confirmar = async () => {
      await page.getByRole('button',{name:'Confirmar reagendamento',exact:true}).focus(); await page.keyboard.press('Enter');
    };
    await carregar(); await abrir();
    const antesCancelar=posts.length;
    await page.getByRole('button',{name:'Fechar painel',exact:true}).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('.cal-unico-painel[open]'));
    const cancelado=await foco('cancelado');
    assert.equal(cancelado.texto,'Reagendar Instagram'); assert.equal(cancelado.tag,'BUTTON');
    assert.equal(cancelado.visivel,true); assert.equal(posts.length,antesCancelar,'cancelar não envia ação');
    await carregar(); await abrir(); await confirmar();
    await page.waitForFunction(()=>location.hash.includes('mes=2026-12')&&!document.querySelector('.cal-unico-painel[open]'));
    const sucesso=await foco('sucesso-navegacao');
    assert.notEqual(sucesso.tag,'BODY'); assert.equal(sucesso.abertos,0); assert.equal(sucesso.visivel,true);
    assert.match(sucesso.texto,/Reagendado: Instagram/); assert.match(sucesso.classe,/aviso/);
    await page.waitForTimeout(6500);
    const expirado=await foco('sucesso-aviso-expirado');
    assert.notEqual(expirado.tag,'BODY','foco permanece visível após expirar o aviso');
    assert.equal(expirado.visivel,true); assert.equal(expirado.texto,'Calendário');
    perderReagendamento=true;
    await carregar(); await abrir(); await confirmar();
    await page.locator('.pub-real-consulta-pendente').waitFor();
    const incerto=await foco('incerto');
    assert.equal(incerto.tag,'BUTTON'); assert.equal(incerto.texto,'Consultar resultado pendente');
    assert.equal(incerto.dialogo,true); assert.equal(incerto.abertos,1); assert.equal(incerto.visivel,true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>[...document.querySelectorAll('.publicacoes-recibo-painel')].some(p=>p.textContent.includes('ainda não tem recibo')));
    const vazio=await foco('consulta-vazia');
    assert.equal(vazio.tag,'BUTTON'); assert.equal(vazio.texto,'Consultar resultado pendente'); assert.equal(vazio.dialogo,true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('.cal-unico-painel[open]'));
    const resolvido=await foco('resolvido');
    assert.notEqual(resolvido.tag,'BODY'); assert.equal(resolvido.abertos,0); assert.equal(resolvido.visivel,true);
    assert.match(resolvido.texto,/Resultado conferido/); assert.match(resolvido.classe,/aviso/);
    // Sair e voltar ao aviso também deve preservar o destino após fechar.
    await page.getByRole('button',{name:'Atualizar estado real',exact:true}).focus();
    await page.locator('.avisos .aviso').filter({hasText:'Resultado conferido'}).getByRole('button',{name:'Fechar aviso',exact:true}).focus();
    await page.keyboard.press('Enter');
    const fechado=await foco('consulta-aviso-fechado');
    assert.notEqual(fechado.tag,'BODY'); assert.equal(fechado.visivel,true); assert.equal(fechado.texto,'Calendário');
    perderReagendamento=false;
    await carregar(); await abrir(); await confirmar();
    await page.waitForFunction(()=>location.hash.includes('mes=2026-12')&&!document.querySelector('.cal-unico-painel[open]'));
    await estabilizar();
    const outroAlvo=page.getByRole('button',{name:'Atualizar estado real',exact:true});
    await outroAlvo.focus();
    await page.waitForTimeout(6500);
    const movido=await foco('aviso-expirado-foco-movido');
    assert.equal(movido.tag,'BUTTON'); assert.equal(movido.texto,'Atualizar estado real'); assert.equal(movido.visivel,true);
    assert.equal(posts.filter(p=>p.acao==='reagendar').length,3,'somente três intenções distintas; resposta incerta não reenvia');
    assert.equal(posts.filter(p=>p.acao==='confirmar').length,0,'nenhuma confirmação genérica');
    await page.close();
  }
  await browser.close();
  console.log('admin-reagendamento-foco: 390/1440, cancelamento/sucesso/incerto/vazio/resolução, expiração/fechamento sem roubar foco; zero HTTP externo');
})().catch(e=>{console.error(e);process.exit(1)});
`;
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(source + tail, filename);
