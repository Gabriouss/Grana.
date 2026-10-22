const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
let checks = 0;
const check = (value, expected, why) => { checks++; assert.deepEqual(value, expected, why); };
const storage = () => { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }; };
function load(file, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, URL, URLSearchParams, Date, Event, console, ...extra });
  return module.exports;
}
const win = new EventTarget(); win.localStorage = storage();
const consent = load('lib/consentimento-marketing.ts', { window: win });
const pixel = load('lib/meta-pixel.ts', { require: () => consent });
const now = Date.now();
check(consent.lerConsentimento(storage(), now), null, 'ausência falha fechado');
for (const value of ['{', '{}', 'null', JSON.stringify({versao:2,marketing:true,data:now}), JSON.stringify({versao:1,marketing:'true',data:now}), JSON.stringify({versao:1,marketing:true,data:now+1}), JSON.stringify({versao:1,marketing:true,data:now-consent.VALIDADE_CONSENTIMENTO_MS})]) {
  const s = storage(); s.setItem(consent.CHAVE_CONSENTIMENTO,value); check(consent.lerConsentimento(s,now),null,'inválido/corrompido/vencido não autoriza');
}
const s = storage();
check(consent.salvarConsentimento(s,true,now),true);
check(consent.lerConsentimento(s,now).marketing,true);
check(consent.salvarConsentimento(s,false,now),true);
check(consent.lerConsentimento(s,now).marketing,false);
const broken = { getItem(){throw Error('fixture');}, setItem(){throw Error('fixture');} };
check(consent.lerConsentimento(broken),null);
check(consent.salvarConsentimento(broken,true),false);
check(consent.consentimentoMarketingAtual(),false);
let notices = 0; const off = consent.ouvirConsentimento(() => notices++);
check(consent.escolherMarketing(true),true); check(consent.consentimentoMarketingAtual(),true); check(notices,1);
win.localStorage = broken;
check(consent.escolherMarketing(false),false); check(consent.consentimentoMarketingAtual(),false);
win.localStorage = storage(); consent.escolherMarketing(false); off();

const campaign = '?utm_source=meta&utm_campaign=outubro_16&fbclid=abcDEF123&gclid=12345678901&utm_term=pessoa%40exemplo.test&utm_content=%7B%22saldo%22%3A1%7D&email=fixture';
check(consent.atribuirCampanha('/sign-up?utm_source=velho',campaign,false),'/sign-up');
check(consent.atribuirCampanha('/sign-up',campaign,true),'/sign-up?utm_source=meta&utm_campaign=outubro_16&fbclid=abcDEF123');
check(consent.atribuirCampanha('https://pay.cakto.com.br/oferta?fbclid=velho',campaign,false),'https://pay.cakto.com.br/oferta');
const clean = { pathname:'/',search:'',hash:'' };
check(pixel.paginaPublicaLimpa(clean,''),true);
for(const pathname of ['/admin','/sign-up','/sign-in','/baixar','/app']) check(pixel.paginaPublicaLimpa({...clean,pathname},''),false);
check(pixel.paginaPublicaLimpa({...clean,search:'?email=fixture'},''),false);
// Clique de anúncio: só parâmetros de campanha válidos passam; um único intruso derruba.
const fbclidLongo = 'IwZXh0bgNhZW0CMTEAAR2' + 'a'.repeat(150) + '_aem_xYz-12';
check(pixel.paginaPublicaLimpa({...clean,search:`?utm_source=meta&utm_campaign=lancamento&fbclid=${fbclidLongo}`},''),true);
check(pixel.paginaPublicaLimpa({...clean,search:'?utm_source=meta&email=fixture'},''),false);
check(pixel.paginaPublicaLimpa({...clean,search:'?utm_term=pessoa%40exemplo.test'},''),false);
check(pixel.paginaPublicaLimpa({...clean,search:'?gclid=12345678901'},''),false);
check(consent.atribuirCampanha('/sign-up',`?fbclid=${fbclidLongo}`,true),`/sign-up?fbclid=${fbclidLongo}`);
check(pixel.paginaPublicaLimpa({...clean,hash:'#token'},''),false);
check(pixel.paginaPublicaLimpa({...clean,hash:'#precos'},''),true,'botão que rola até os preços não desliga o Pixel');
check(pixel.paginaPublicaLimpa({...clean,hash:'#access_token=abc'},''),false);
check(pixel.paginaPublicaLimpa(clean,'https://outro.test/conta?email=fixture'),false);

let accepted=false, publicPage=true, ready=true, calls=[];
const transport = { iniciar: id=>calls.push(['start',id]), pronto:()=>ready, enviar:(id,event,data,eid)=>calls.push(['send',id,event,data,eid]), parar:()=>calls.push(['stop']) };
const create=(config={id:'123456789',liberado:true})=>pixel.criarPixel(config,()=>accepted,()=>publicPage,transport,()=>`evento-${calls.length}`);
for(const config of [{liberado:true},{id:'placeholder',liberado:true},{id:'123456789',liberado:false}]) {
  accepted=true;calls=[];const p=create(config);p.sincronizar();p.evento('PageView');check(calls.length,0);check(p.estado(),'Não configurado');
}
accepted=false;calls=[];const p=create();
p.sincronizar(); check(p.evento('PageView'),false);check(calls.length,0,'sem consentimento: zero start/envio');
accepted=true;ready=false;p.sincronizar();check(calls.length,1);check(p.evento('ViewContent'),false,'não guarda evento enquanto carrega');
ready=true;check(calls.length,1,'pronto não reenvia evento perdido');
check(p.evento('PageView'),true);check(p.evento('PageView'),false,'uma visita por entrada');
check(p.evento('ViewContent'),true);check(p.evento('ViewContent'),false,'preços só uma vez');
check(p.evento('Purchase'),false,'Purchase bloqueado em runtime');
check(p.evento('InitiateCheckout','email@fixture'),false,'plano livre bloqueado');
check(p.evento('InitiateCheckout','mensal'),true);check(p.evento('InitiateCheckout','anual'),true);
const sent = calls.filter(c=>c[0]==='send');
check(JSON.parse(JSON.stringify(sent[0][3])),{});
check(JSON.parse(JSON.stringify(sent[1][3])),{content_type:'product',content_ids:['grana-assinatura']});
check(JSON.parse(JSON.stringify(sent[2][3])),{content_type:'product',content_ids:['grana-mensal']});
check(new Set(sent.map(c=>c[4])).size,sent.length,'event_id por ocorrência');
accepted=false; const before = sent.length;p.sincronizar();check(p.evento('InitiateCheckout','mensal'),false);
check(calls.filter(c=>c[0]==='send').length,before,'revogação interrompe envio');
accepted=true;publicPage=false;check(p.evento('PageView'),false,'rota privada interrompe envio');

// Adaptador DOM REAL: SDK não é baixado neste teste. Todas as chamadas são dublês.
const browser={location:{hostname:'www.fixture.test'}}, cookies=[], scripts=[], sdkCalls=[];
const doc={querySelector:()=>null, createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)},set cookie(v){cookies.push(v);}};
const adapter=pixel.transportePixelWeb(browser,doc);
check(scripts.length,0);adapter.iniciar('123456789');check(scripts.length,1);check(adapter.pronto(),false);
browser.fbq.callMethod=(...args)=>sdkCalls.push(args);scripts[0].onload();check(adapter.pronto(),true);
adapter.enviar('123456789','ViewContent',{content_type:'product',content_ids:['grana-assinatura']},'event-fixture');
check(sdkCalls[0][0],'trackSingle');
adapter.parar();check(adapter.pronto(),false);check(browser.fbq,undefined);check(scripts[0].removed,true);check(scripts[0].onload,null);check(sdkCalls[1][1],'revoke');check(cookies.length>0,true);
for(const cookie of cookies)check(/^_fb[pc]=; Max-Age=0;/.test(cookie),true,'limpa só IDs de marketing');

console.log(`consentimento-marketing: ${checks} verificações; módulos reais, zero rede/Meta.`);
