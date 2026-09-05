import { readFileSync } from 'fs';
import path from 'path';

function ler(relativo: string): string {
  return readFileSync(path.join(__dirname, '..', relativo), 'utf8');
}

const raiz = 'modules/grana-voice-widget/android/src/main/';
const layout = ler(`${raiz}res/layout/grana_voice_widget.xml`);
const fundo = ler(`${raiz}res/drawable/grana_voice_fundo_gradiente.xml`);
const microfone = ler(`${raiz}res/drawable/ic_grana_voice_mic.xml`);
const microfoneMenta = ler(`${raiz}res/drawable/ic_grana_voice_mic_menta.xml`);
const cores = ler(`${raiz}res/values/colors.xml`);
const provider = ler(`${raiz}java/com/gabriouss/grana/voicewidget/GranaVoiceWidgetProvider.kt`);

let total = 0;
let falhas = 0;
function conferir(nome: string, condicao: boolean) {
  total++;
  if (condicao) return;
  falhas++;
  console.error(`FALHOU: ${nome}`);
}

conferir('o botão visual cresceu de 48dp para 64dp',
  /android:layout_width="64dp"/.test(layout) && /android:layout_height="64dp"/.test(layout));
conferir('o fundo do repouso usa o novo gradiente',
  /android:background="@drawable\/grana_voice_fundo_gradiente"/.test(layout)
    && /R\.drawable\.grana_voice_fundo_gradiente/.test(provider));
conferir('a forma externa é totalmente circular', /android:shape="oval"/.test(fundo));
conferir('a rampa do fundo é horizontal como a referência oficial', /android:angle="0"/.test(fundo));
conferir('o gradiente usa os extremos oficiais da marca',
  /grana_marca_gradiente_inicio">#B0F7C9</.test(cores)
    && /grana_marca_gradiente_fim">#22A1C1</.test(cores));
conferir('o ícone do repouso é escuro sobre o círculo claro (05/09, pedido do autor)',
  /android:fillColor="@color\/grana_voice_escuro"/.test(microfone)
    && !/strokeColor/.test(microfone));
conferir('o ícone ativo (ouvindo) inverte pra menta sobre círculo escuro',
  /android:tint="@color\/grana_voice_menta"/.test(microfoneMenta)
    && /grana_voice_menta">#AEFFE3</.test(cores));
conferir('ouvindo usa o fundo escuro (mesmo padrão de "processando"), nunca a cor de atenção',
  /EstadoWidget\.OUVINDO ->[\s\S]{0,800}?R\.drawable\.grana_voice_fundo\)/.test(provider)
    && /EstadoWidget\.OUVINDO ->[\s\S]{0,800}?R\.drawable\.ic_grana_voice_mic_menta/.test(provider));
conferir('o ícone preserva metade do diâmetro do círculo',
  /android:padding="16dp"/.test(layout) && /android:scaleType="fitCenter"/.test(layout));

console.log(`${total - falhas}/${total} guardas visuais do widget de voz passaram`);
if (falhas > 0) process.exit(1);
