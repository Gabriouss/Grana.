/* Leitor da árvore do uiautomator em scripts/emulador.cjs.
 *
 * Em 25/09/2026 o Sentinel relatou o Granabô "mudo" em pedidos de registro. O
 * servidor tinha respondido 200 e gravado o lançamento, e o vídeo mostrava a
 * bolha na tela. O defeito era do leitor: o uiautomator troca para aspas
 * SIMPLES o atributo cujo valor tem aspas duplas, e o leitor só entendia aspas
 * duplas. Os nós abaixo reproduzem o formato real do dump do emulador.
 * Rode com: node __tests__/emulador-leitura-da-tela.cjs */
const assert = require('node:assert/strict');
const { lerNos } = require('../scripts/emulador.cjs');

const xml = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text='Lançamento registrado: R$ 20,00 em Alimentação (Gastei no mercado), na carteira Principal. Se quiser desfazer, é só dizer "desfaz".' resource-id="" class="android.widget.TextView" package="com.gabriouss.grana" content-desc="" checkable="false" bounds="[180,1300][900,1440]" />
<node index="1" text="Olá! Posso ajudar &amp; muito mais &#128202;&#10;Como?" resource-id="" class="android.widget.TextView" package="com.gabriouss.grana" content-desc="" bounds="[100,700][900,960]" />
<node index="2" text="" resource-id="" class="android.view.ViewGroup" package="com.gabriouss.grana" content-desc="Abrir conversa com o Granabô" bounds="[480,2160][600,2284]">
<node index="0" text="" class="android.view.View" content-desc="" bounds="[500,2180][580,2262]" />
</node>
<node index="3" text="O &quot;texto&quot; &lt;com&gt; entidade" class="android.widget.TextView" content-desc="" bounds="[0,0][100,100]" />
</hierarchy>`;

const nos = lerNos(xml);
const textos = nos.map((n) => n.texto);

const registro = nos.find((n) => n.texto.startsWith('Lançamento registrado'));
assert.ok(registro, 'resposta com aspas duplas precisa aparecer');
assert.equal(registro.texto.endsWith('dizer "desfaz".'), true);
assert.equal(registro.classe, 'android.widget.TextView');
assert.deepEqual([registro.x, registro.y], [540, 1370]);

assert.ok(textos.includes('Olá! Posso ajudar & muito mais 📊\nComo?'), 'entidades numéricas e &amp; decodificadas');
const botao = nos.find((n) => n.texto === 'Abrir conversa com o Granabô');
assert.deepEqual([botao.x, botao.y], [540, 2222], 'content-desc vale quando text está vazio');
assert.ok(textos.includes('O "texto" <com> entidade'));
assert.equal(nos.length, 5, 'todos os nós com bounds, inclusive o aninhado');

console.log('emulador-leitura-da-tela: ok');
