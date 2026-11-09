// CSV e filtro reais; dados inteiramente sintéticos, sem rede/aparelho.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function real(nome){const f=path.resolve(root,nome);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports:api,require(id){if(!id.startsWith('.'))throw Error('fronteira inesperada '+id);return real(path.relative(root,path.resolve(path.dirname(f),id+'.ts')));}}, {filename:nome});return api;}
let ok=0,erros=0;function caso(nome,fn){try{fn();console.log('OK '+nome);ok++;}catch(e){erros++;console.error('FALHA '+nome+': '+e.message);}}
const wallets=[{id:'outra',user_id:'a',name:'Viagem',is_default:false},{id:'padrao',user_id:'a',name:'Casa',is_default:true,created_at:'2026-01-01'}];
const cards=[{id:'cartao',user_id:'a',name:'Cartão modelo',wallet_id:'outra'}];
const tx=(id,extra={})=>({id,user_id:'a',occurred_on:'2026-11-08',description:'Café, pão; "ação"',category:'Alimentação',type:'out',amount:12.5,payment_method:'pix',wallet_id:'padrao',...extra});
const base=()=>({userId:'a',lancamentos:[tx('1')],carteiras:wallets,cartoes:cards,carteiraId:'total',periodo:'2026-11'});
const montar=(op={})=>real('lib/exportar-lancamentos-csv.ts').montarCsvLancamentos({...base(),...op});
function linhas(csv){const rows=[];let row=[],s='',q=false;for(let i=1;i<csv.length;i++){const c=csv[i];if(c==='"'){if(q&&csv[i+1]==='"'){s+='"';i++;}else q=!q;}else if(!q&&c===';'){row.push(s);s='';}else if(!q&&c==='\n'){row.push(s.replace(/\r$/,''));rows.push(row);row=[];s='';}else s+=c;}if(s||row.length){row.push(s);rows.push(row);}return rows;}
caso('helper compartilhado escapa ponto e vírgula sem mudar padrão administrativo',()=>{
  const h=real('lib/admin-relatorio-csv.ts');assert.equal(h.escaparCelulaCsv('a;b',';'),'"a;b"');assert.equal(h.escaparCelulaCsv('a,b'),'"a,b"');
});
caso('BOM UTF-8, colunas portuguesas, acentos, decimal e delimitadores',()=>{
  const r=montar(),l=linhas(r.conteudo);assert.equal(r.conteudo.charCodeAt(0),0xfeff);assert.equal(Buffer.from(r.conteudo).subarray(0,3).toString('hex'),'efbbbf');
  assert.deepEqual(l[0],['Data','Descrição','Categoria','Tipo','Valor','Forma de pagamento','Carteira','Cartão']);
  assert.deepEqual(l[1],['08/11/2026','Café, pão; "ação"','Alimentação','Saída','12,50','Pix','Casa','']);assert.equal(r.quantidade,1);assert.match(r.nomeArquivo,/\.csv$/);
});
caso('todas as células protegem fórmulas, incluindo nomes e valores negativos',()=>{
  for(const prefixo of ['=','+','-','@','\t=','  +']){const r=montar({lancamentos:[tx('1',{description:prefixo+'f',category:prefixo+'c',amount:-12})],carteiras:[{...wallets[1],name:prefixo+'w'}]});
    const row=linhas(r.conteudo)[1];assert.equal(row[1],"'"+prefixo+'f');assert.equal(row[2],"'"+prefixo+'c');assert.equal(row[4],"'-12,00");assert.equal(row[6],"'"+prefixo+'w');}
});
caso('mês vazio só tem cabeçalho; tudo preserva meses e entrada',()=>{
  assert.equal(montar({periodo:'2025-02'}).quantidade,0);assert.equal(linhas(montar({periodo:'2025-02'}).conteudo).length,1);
  const r=montar({periodo:'tudo',lancamentos:[tx('1'),tx('2',{occurred_on:'2026-10-31',type:'in'})]});assert.equal(r.quantidade,2);assert.ok(linhas(r.conteudo).some(l=>l[3]==='Entrada'));
});
caso('Principal canônica recebe legado e próprios; outras não; Total cada linha uma vez',()=>{
  const lancamentos=[tx('1'),tx('2',{wallet_id:null}),tx('3',{wallet_id:'outra'})];
  assert.equal(montar({lancamentos,carteiraId:'padrao'}).quantidade,2);assert.equal(montar({lancamentos,carteiraId:'outra'}).quantidade,1);assert.equal(montar({lancamentos}).quantidade,3);
  assert.throws(()=>montar({lancamentos,carteiras:wallets.map(w=>({...w,is_default:false}))}),/Principal|padrão/);
});
caso('crédito usa carteira do cartão, inclui compra e protege nome do cartão',()=>{
  const lancamentos=[tx('1',{card_id:'cartao',payment_method:'credit'})];
  assert.equal(montar({lancamentos,carteiraId:'padrao'}).quantidade,0);
  const r=montar({lancamentos,carteiraId:'outra',cartoes:[{...cards[0],name:'=cartão; modelo'}]});const l=linhas(r.conteudo)[1];
  assert.equal(r.quantidade,1);assert.equal(l[5],'Crédito');assert.equal(l[6],'Viagem');assert.equal(l[7],"'=cartão; modelo");
});
caso('não exporta outro dono nem escolhe padrão estrangeira; sem mutar entrada',()=>{
  assert.throws(()=>montar({lancamentos:[tx('1',{user_id:'b'})]}),/conta/);
  assert.equal(montar({lancamentos:[tx('1',{wallet_id:null})],carteiraId:'padrao',carteiras:[{...wallets[1],user_id:'b',id:'estrangeira'},...wallets]}).quantidade,1);
  const input=base(),antes=JSON.stringify(input);montar(input);assert.equal(JSON.stringify(input),antes);
  assert.throws(()=>montar({carteiraId:'inexistente'}),/carteira/i);
});
caso('dados inválidos não viram planilha financeira inventada',()=>{
  for(const t of [tx('1',{amount:NaN}),tx('1',{amount:null}),tx('1',{amount:''}),tx('1',{occurred_on:'2026-02-31'}),tx('1',{type:'erro'})])assert.throws(()=>montar({lancamentos:[t]}),/inválid/);
  assert.throws(()=>montar({periodo:'2026-13'}));
});
console.log(`CSV: ${ok} OK, ${erros} falhas`);process.exitCode=erros?1:0;
