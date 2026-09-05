import { readFileSync } from 'fs';
import path from 'path';

function ler(relativo: string): string {
  return readFileSync(path.join(__dirname, '..', relativo), 'utf8');
}

const task = ler('lib/widget-voz-task.ts');
const operacoes = ler('lib/voice-operations.ts');
const notificacoes = ler('lib/widget-voz-notificacoes.ts');
const resposta = ler('components/RespostaVozWidget.tsx');
const manifest = ler('modules/grana-voice-widget/android/src/main/AndroidManifest.xml');
const push = ler('supabase/functions/enviar-lembretes-habito/index.ts');

let total = 0;
let falhas = 0;
function checar(nome: string, condicao: boolean) {
  total++;
  if (!condicao) {
    falhas++;
    console.error(`FALHOU: ${nome}`);
  }
}

checar('a tarefa exige requestId antes de transcrever', /if \(!requestId\) throw/.test(task));
checar('o requestId chega ao processamento financeiro', /processar\(caminho, requestId\)/.test(task));
checar('nenhuma escrita financeira da voz usa insert direto do cliente',
  !/data\.add(?:Bill|Transaction|InstallmentPurchase)\(/.test(task));
checar('conta, transação e parcelamento usam a RPC idempotente',
  (task.match(/registrarOperacaoVoz\(requestId/g) ?? []).length === 4);
checar('o recibo carrega operationId', /operationId: resultado\.operationId/.test(task)
  && /operationId\?: string/.test(notificacoes));
checar('desfazer novo usa uma única RPC atômica', /await desfazerOperacaoVoz\(dados\.operationId\)/.test(resposta));
checar('notificações antigas preservam o fallback local', /for \(const id of dados\.ids\)/.test(resposta));
checar('cliente chama registro e undo pelos nomes públicos corretos',
  /rpc\('registrar_operacao_voz'/.test(operacoes) && /rpc\('desfazer_operacao_voz'/.test(operacoes));
checar('nenhum receiver de widget fica exportado', !/android:exported="true"/.test(manifest));
checar('push remoto leva collapseId', /collapseId: chave/.test(push));
checar('push Android leva tag de substituição', /plataforma === 'android'[\s\S]*tag: chave/.test(push));

console.log(`${total - falhas}/${total} guardas de idempotência da voz passaram`);
if (falhas > 0) process.exit(1);
