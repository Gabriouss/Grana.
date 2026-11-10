const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:api,Date,console,require:id=>{if(!id.startsWith('.'))throw Error(id);return real(path.resolve(path.dirname(f),id+'.ts'));}},{filename:f});return api;}
const api=real('lib/conciliacao-pix.ts');
const linha=(id,extra={})=>({id,fitid:'conc:v1:fixture:'+id,idBanco:id,data:'2026-10-05',centavos:3742,direcao:'out',descricao:'Pix enviado',categoria:'',cor:'',natureza:'movimento',...extra});
const tx=(id,extra={})=>({id,user_id:'a',wallet_id:'p',type:'out',amount:37.42,occurred_on:'2026-10-05',description:'Almoço',category:'Alimentação',payment_method:'pix',card_id:null,...extra});
const match=(rows,txs)=>api.conciliarPix({userId:'a',carteiraId:'p',principalId:'p',linhas:rows,lancamentos:txs});
assert.equal(match([linha('1')],[tx('t')])[0].status,'conciliado','descrição diferente não impede correspondência');
assert.equal(match([linha('1')],[tx('t',{occurred_on:'2026-10-06'})])[0].status,'data');
assert.equal(match([linha('1')],[tx('t'),tx('u')])[0].status,'revisar');
assert.equal(match([linha('1')],[tx('t',{occurred_on:'2026-10-09'})])[0].status,'falta');
assert.equal(match([linha('1')],[tx('t',{user_id:'b'})])[0].status,'falta');
assert.equal(match([linha('1')],[tx('t',{wallet_id:'o'})])[0].status,'falta');
// Compra no crédito não é candidata de caixa, mas o mesmo valor em ±3 dias pede revisão em vez de "Falta lançar" (Keel, 09/11).
assert.equal(match([linha('1')],[tx('t',{payment_method:'credit',card_id:'card'})])[0].status,'revisar');
assert.equal(match([linha('1')],[tx('t',{wallet_id:null})])[0].status,'conciliado');
assert.ok(match([linha('1'),linha('2')],[tx('t')]).every(r=>r.status==='revisar'),'um lançamento não atende duas linhas');
assert.ok(match([linha('1'),linha('1')],[]).every(r=>r.status==='revisar'),'linhas indistinguíveis não se colapsam');
assert.equal(match([linha('1')],[tx('t',{fitid:'conc:v1:fixture:1',amount:2})])[0].status,'revisar','ID conflitante não vira conciliado');
const porId=match([linha('1'),linha('2')],[tx('t',{fitid:'conc:v1:fixture:1'}),tx('u')]);assert.equal(porId[0].status,'conciliado');assert.equal(porId[1].status,'revisar','ID comprovado tem prioridade sem escolher candidato incerto');
for(const natureza of ['cofrinho','estorno','fatura','transferencia'])assert.notEqual(match([linha('1',{natureza})],[])[0].status,'falta');
const original=linha('a'),estorno=linha('b',{direcao:'in',natureza:'estorno',idOriginal:'a'});
assert.ok(match([original,estorno],[]).every(r=>r.status==='ignorar'),'par integral com vínculo e sem lançamento fica neutro');
assert.ok(match([original,estorno],[tx('t')]).every(r=>r.status==='revisar'),'original já lançado exige ajuste');
assert.equal(match([original,{...estorno,centavos:1000}],[])[1].status,'revisar','parcial não some');
assert.ok(match([linha('x',{idBanco:null,idOriginal:null}),linha('y',{idBanco:null,idOriginal:null,natureza:'estorno',direcao:'in'})],[]).every(r=>r.status!=='ignorar'),'opostos sem vínculo não são um par');
assert.ok(match([original,estorno,{...estorno,id:'c',fitid:'conc:v1:fixture:c'}],[]).every(r=>r.status==='revisar'),'dois estornos não anulam uma origem');
const csv='Data;Descrição;Valor;ID\n05/10/2026;Pix enviado;-37,42;b1\n06/10/2026;Pix recebido;10,00;b2';
const parsed=api.lerExtratoConciliacao(csv);assert.equal(parsed.length,2);assert.equal(parsed[0].centavos,3742);assert.equal(parsed[1].direcao,'in');assert.equal(parsed[0].data,'2026-10-05');
assert.equal(api.lerExtratoConciliacao('Data;Descrição;Valor\n05/10/2026;Dinheiro reservado;-2,00')[0].natureza,'cofrinho');
for(const bad of ['Data;Descrição;Valor\n31/02/2026;Pix enviado;-2,00','Data;Descrição;Valor\n10/05/26;Pix enviado;-2,00','Data;Descrição;Valor\n05/10/2026;Operação;2,00','Data;Descrição;Valor\n05/10/2026;Pix enviado;banana','Data;Descrição;Valor;Moeda\n05/10/2026;Pix enviado;-2,00;USD'])assert.throws(()=>api.lerExtratoConciliacao(bad));
const ofx='<OFX><CURDEF>BRL<BANKMSGSRSV1><STMTTRN><DTPOSTED>20261005120000[-3:BRT]<TRNAMT>-37.42<FITID>bank-a<MEMO>Pix enviado</STMTTRN></BANKMSGSRSV1></OFX>';
assert.equal(api.lerExtratoConciliacao(ofx)[0].data,'2026-10-05');assert.equal(api.lerExtratoConciliacao(ofx)[0].idBanco,'bank-a');
assert.throws(()=>api.lerExtratoConciliacao(ofx.replace('BRL','USD')));assert.throws(()=>api.lerExtratoConciliacao(ofx.replace('BANKMSGSRSV1','CREDITCARDMSGSRSV1')));
console.log('Pix núcleo real: CSV/OFX estritos, centavos/dias civis, candidato único/ambiguidade/1:1, banco/conta, cofrinho/estorno/fatura e reimportação OK');
