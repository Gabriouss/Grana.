const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('components/GranaboFlutuante.web.tsx', 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
let hooks=[],cursor=0,effects=[],writes=[],opens=0,storageFails=false,stored=null;
let listeners={},cleanup=[],warnings=0;
const windowMock={innerWidth:1024,innerHeight:768,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k],localStorage:{getItem(){if(storageFails)throw Error('blocked');return stored;},setItem(k,v){if(storageFails)throw Error('blocked');writes.push([k,v]);}}};
const exportsMock={};
class Observer{observe(){}disconnect(){cleanup.push(true);}}
vm.runInNewContext(js, {exports:exportsMock,window:windowMock,document:{body:{},querySelectorAll:()=>[]},MutationObserver:Observer,ResizeObserver:Observer,requestAnimationFrame:f=>{f();return 1;},cancelAnimationFrame:()=>{},console:{warn:()=>warnings++},require(id){
 if(id==='react')return {useState(init){const n=cursor++;if(!(n in hooks))hooks[n]=init;return [hooks[n],v=>hooks[n]=typeof v==='function'?v(hooks[n]):v];},useRef(init){const n=cursor++;return hooks[n]??(hooks[n]={current:init});},useEffect(f){effects.push(f);}};
 if(id==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(id==='./Granabo3D')return {default:'Granabo3D'};
 if(id==='@/lib/theme')return {theme:{accent2:'mint'}};
 throw Error(id);
}});
function render(){cursor=0;effects=[];return exportsMock.default({ativo:false,onPress:()=>opens++}).props;}
let props=render();const dispose=effects[0]();props=render();
assert.equal(props.style.width,104,'tamanho pedido na web');
assert.equal(props.style.height,104,'área de interação acompanha tamanho');
assert.equal(props.children.props.children.props.tamanho,104,'mascote acompanha tamanho');
assert.equal(props['aria-label'],'Abrir Granabô');
assert.equal(props.type,'button');
function evt(x,y,id=1){return {isPrimary:true,button:0,pointerId:id,clientX:x,clientY:y,currentTarget:{setPointerCapture(){}}};}
props.onPointerDown(evt(970,700));props.onPointerMove(evt(400,300));props.onPointerUp(evt(400,300));props.onClick({detail:1});
assert.equal(opens,0,'arrasto não abre');assert.equal(writes.length,1,'só arrasto escreve posição');
props=render();assert.ok(props.style.left<500,'posição muda durante gesto');
props.onClick({detail:0});assert.equal(opens,1,'teclado funciona após arrasto');
props.onPointerDown(evt(400,300));props.onPointerMove(evt(403,301));props.onPointerUp(evt(403,301));props.onClick({detail:1});assert.equal(opens,2,'tremor abaixo do limiar continua clique');
props.onPointerDown(evt(400,300));props.onPointerCancel(evt(400,300));props.onClick({detail:1});assert.equal(opens,2,'cancelamento não abre');
props.onPointerDown({...evt(400,300),button:2});props.onPointerMove(evt(100,100));assert.equal(writes.length,1,'botão secundário não arrasta');
windowMock.innerWidth=320;windowMock.innerHeight=480;listeners.resize();props=render();assert.ok(props.style.left+104<=320 && props.style.top+104<=480,'resize limita viewport');
dispose();assert.equal(Object.keys(listeners).length,0);assert.equal(cleanup.length,2);
hooks=[];storageFails=true;props=render();effects[0]();props=render();assert.equal(props.style.visibility,'visible','sem storage continua visível');
props.onPointerDown(evt(220,360));props.onPointerMove(evt(110,150));props.onPointerUp(evt(110,150));assert.equal(warnings,2,'falhas de leitura e escrita têm recibo');
const limit=exportsMock.limitarPosicao;
const plus={left:230,top:360,right:290,bottom:420};
const p=limit({x:230,y:360},320,480,[plus]);assert.ok(p.x+104<=plus.left || p.x>=plus.right || p.y+104<=plus.top || p.y>=plus.bottom,'desvia do + medido');
const tabs={left:20,top:430,right:300,bottom:480};
const q=limit({x:230,y:400},320,480,[plus,tabs]);assert.ok(q.y+104<=tabs.top,'não cobre navegação');
assert.ok(q.x>=0 && q.y>=0 && q.x+104<=320 && q.y+104<=480,'cabe em 320x480 com navegação e +');
assert.ok(q.x+104<=plus.left || q.x>=plus.right || q.y+104<=plus.top || q.y>=plus.bottom,'continua desviando do + com navegação');
for(const storedValue of ['invalid','{"x":null,"y":15}','{"x":1e300,"y":-1e300}']){
 hooks=[];stored=storedValue;storageFails=false;props=render();effects[0]();props=render();assert.ok(Number.isFinite(props.style.left) && props.style.left>=0 && props.style.left+104<=320,'storage inválido ou extremo limitado');
}
const layout=fs.readFileSync('app/(app)/_layout.tsx','utf8');
assert.match(layout,/posicao === 3 \? \(\s*<BotaoGranabo/,'barra inferior mantém botão central no Android e na web compacta');
assert.match(layout,/Platform.OS === 'web' && temBarraLateral && \(\s*<GranaboFlutuante/,'flutuante só na web com barra lateral');
assert.match(layout,/temBarraLateral \? \(\s*<SideNav[\s\S]*?\) : \(\s*<FloatingTabBar/,'barra inferior e lateral usam o mesmo breakpoint');
assert.match(layout,/Platform.OS === 'web' \? ITENS_LATERAIS.filter/,'Android preserva lateral');
// Executa as duas ramificações do layout real ao cruzar o breakpoint, sem
// reimplementar a decisão de onde montar o mascote.
const layoutExports={};let lateral=false,plataforma='web';
const jsx=(type,props)=>({type,props});
vm.runInNewContext(ts.transpileModule(layout+'\nexport { AbasEmJavaScript };',{
 compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:layoutExports,require(id){
 if(id==='react')return {useState:v=>[v,()=>{}],useRef:v=>({current:v}),useCallback:f=>f,useEffect:()=>{}};
 if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
 if(id==='react-native')return {Platform:{get OS(){return plataforma;}},StyleSheet:{create:v=>v},View:'View',useWindowDimensions:()=>({width:lateral?1440:390,height:900})};
 if(id==='expo-router')return {Tabs:'Tabs'};
 if(id==='@/lib/theme')return {theme:{},spacing:{},sombras:{},menta:()=>''};
 if(id==='@/lib/breakpoints')return {useBreakpoint:()=>({temBarraLateral:lateral})};
 if(id==='@/lib/tab-bar')return {useTabBarInset:()=>({margem:0})};
 if(id==='@/lib/teclado')return {useKeyboardHeight:()=>0};
 if(id.startsWith('@/components/'))return {__esModule:true,default:id.split('/').at(-1)};
 if(id==='expo-linking'||id==='@/lib/deep-links'||id==='@/lib/wallet-context'||id==='@/lib/motion'||id==='@expo/vector-icons/Ionicons')return {};
 throw Error('Import inesperado: '+id);
}});
const nos=n=>n&&typeof n==='object'?[n,...[n.props?.children].flat(Infinity).flatMap(nos)]:[];
const routes=['index','lancamentos','credito','contas','graficos','desafios'].map(name=>({name,key:name}));
const tabProps={state:{routes,index:0},descriptors:Object.fromEntries(routes.map(r=>[r.key,{options:{}}])),navigation:{}};
for(const os of ['web','android'])for(const larga of [false,true,false,true]){
 plataforma=os;lateral=larga;
 const arvore=nos(layoutExports.AbasEmJavaScript());
 const tabs=arvore.find(n=>n.type==='Tabs');
 const barra=tabs.props.tabBar(tabProps);
 const flutuantes=arvore.filter(n=>n.type==='GranaboFlutuante').length;
 if(larga){
  assert.equal(barra.type,'SideNav');
  assert.equal(flutuantes,os==='web'?1:0);
  assert.equal(barra.props.itens.filter(i=>i.rota==='assistente').length,os==='web'?0:1);
 }else{
  const botoes=nos(barra.type(barra.props)).filter(n=>typeof n.type==='function'&&n.type.name==='BotaoGranabo');
  assert.equal(botoes.length,1,'compacto monta exatamente um Granabô na barra');
  assert.equal(flutuantes,0,'compacto nunca monta flutuante');
 }
}
console.log('Granabô web: gesto, limiar, clique, teclado, cancelamento, storage, resize, colisões e isolamento Android passaram.');
