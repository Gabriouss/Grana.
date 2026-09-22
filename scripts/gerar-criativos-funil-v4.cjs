// Reutiliza os layouts e mockups aprovados da revisao 03 com novas telas.
const fs=require('fs'),path=require('path'),Module=require('module');
let code=fs.readFileSync('scripts/gerar-criativos-funil-v3.cjs','utf8');
code=code.replaceAll('revisao-03','revisao-04');
code=code.replace('async function assets(){','async function assets(pair){');
code=code.replace("const end=src.indexOf",`src=src.replaceAll("public/telas/inicio-web.png",path.join(out,'telas',pair===1?'credito-web.png':'contas-web.png').replaceAll('\\\\','/'));
 src=src.replaceAll("public/telas/inicio-mobile.png",path.join(out,'telas',pair===1?'lancamentos-mobile.png':'inicio-mobile.png').replaceAll('\\\\','/'));
 const end=src.indexOf`);
code=code.replace("await assets();","for(const pair of [1,2]) { await assets(pair); for(const name of ['celular','notebook'])fs.renameSync(path.join(asset,name+'.png'),path.join(asset,name+'-'+pair+'.png')); }");
code=code.replace("const phone=uri(path.join(asset,'celular.png'),'image/png'),laptop=uri(path.join(asset,'notebook.png'),'image/png');","");
code=code.replace("const H=story?", "const pair=n<=2?1:2; const phone=uri(path.join(asset,'celular-'+pair+'.png'),'image/png'),laptop=uri(path.join(asset,'notebook-'+pair+'.png'),'image/png');\n const H=story?");
code=code.replace('Seu mês.<br>Na tela grande.','Suas faturas.<br>Na tela grande.');
code=code.replace('Receitas, despesas e compromissos.<br>Uma visão do conjunto.','Cartões, parcelas e vencimentos.<br>Uma visão do conjunto.');
const compiled=new Module(path.resolve('scripts/gerar-criativos-funil-v4.generated.cjs'),module);
compiled.filename=path.resolve('scripts/gerar-criativos-funil-v4.generated.cjs');
compiled.paths=module.paths;
compiled._compile(code,compiled.filename);
