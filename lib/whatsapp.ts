import { Linking } from 'react-native';
import { Alert } from './alert';

/* ── Caminho do app até a conversa do bot ──────────────────────────────────
 *
 * Regra do fluxo: em nenhum momento a pessoa precisa anotar, decorar ou salvar
 * o número do Grana. na agenda. Isso era o que acontecia antes — as três telas
 * de vínculo mostravam "envie o código para +55 85 8198-9649" e deixavam o
 * resto por conta dela: sair do app, abrir o WhatsApp, digitar um número que
 * não está salvo, achar a conversa, digitar seis dígitos de cabeça. Cada um
 * desses passos é um lugar de desistir, logo no primeiro login.
 *
 * O `wa.me` resolve os dois primeiros de uma vez: abre a conversa certa mesmo
 * com o número não salvo, e o parâmetro `text` já deixa a mensagem escrita na
 * caixa. Sobra um toque em "enviar" — que é o limite do que o WhatsApp
 * permite automatizar (nenhum link consegue disparar o envio sozinho, e é bom
 * que seja assim).
 */

const NUMERO_BOT = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? '';

/** Como o número aparece pra pessoa ler. Vazio quando não há número configurado. */
export const NUMERO_BOT_EXIBICAO = NUMERO_BOT;

/** wa.me exige só dígitos, com DDI e sem sinais. */
export function digitosDoBot(): string {
  return NUMERO_BOT.replace(/\D/g, '');
}

export function temNumeroDoBot(): boolean {
  return digitosDoBot().length > 0;
}

/**
 * Mensagem que já vai escrita na caixa do WhatsApp no pareamento.
 *
 * O código PRECISA ser o único número da frase. `handlePairing`, no webhook,
 * tira tudo que não é dígito e exige que sobrem exatamente seis — então uma
 * palavra com número aqui ("2 minutos", "código nº 1") quebraria o vínculo de
 * um jeito difícil de enxergar: a mensagem chega, o bot não reconhece, e a
 * pessoa fica olhando pra um "já enviei" que nunca confirma. O webhook também
 * passou a aceitar o código embutido numa frase maior, mas a garantia começa
 * aqui.
 */
export function mensagemDePareamento(codigo: string): string {
  return `Oi! Quero vincular meu WhatsApp ao Grana. Meu código é ${codigo}`;
}

/** Link da conversa do bot, opcionalmente com a mensagem já escrita. */
export function linkDoBot(mensagem?: string): string {
  const digitos = digitosDoBot();
  if (!digitos) return '';
  const base = `https://wa.me/${digitos}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}

/**
 * Abre a conversa do bot. `mensagem` deixa o texto pronto na caixa de envio.
 *
 * Continua sendo chamada direto de `onPress` de propósito: na web isto vira um
 * `window.open`, que o navegador só libera enquanto o clique da pessoa ainda
 * está sendo processado. Colocar um `await` antes daqui (buscar algo na rede,
 * por exemplo) faz o bloqueador de pop-up engolir a aba em silêncio.
 */
export async function abrirConversaDoBot(mensagem?: string): Promise<void> {
  const url = linkDoBot(mensagem);
  if (!url) {
    Alert.alert('Número indisponível', 'O número do WhatsApp do Grana. não está configurado neste app.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Não foi possível abrir o WhatsApp',
      NUMERO_BOT ? `Procure pelo número ${NUMERO_BOT} no seu WhatsApp.` : 'Tente abrir o WhatsApp manualmente.'
    );
  }
}

/** Abre a conversa já com o código de pareamento escrito. */
export async function abrirPareamentoNoWhatsapp(codigo: string): Promise<void> {
  await abrirConversaDoBot(mensagemDePareamento(codigo));
}

/* ── Número ainda não confirmado ───────────────────────────────────────────
 *
 * Pedir o número de WhatsApp antes de parear era trabalho jogado fora, e o
 * app nem usava a resposta: quem confirma o vínculo é o webhook, e ele grava
 * o número de quem REALMENTE mandou a mensagem, por cima do que foi digitado.
 * Ou seja, o campo só servia pra criar erro — a pessoa digitava um número,
 * mandava o código de outro aparelho, e o que valia era o segundo.
 *
 * Pior: `whatsapp_links.phone` é `unique`, então digitar um número que outra
 * conta já vinculou fazia o pareamento falhar com erro de banco antes mesmo
 * de começar.
 *
 * Agora o pedido nasce com `phone` NULO, que é o que ele de fato é: um número
 * ainda desconhecido. A primeira tentativa foi gravar um marcador de texto no
 * lugar, e ela morreu contra um `check (char_length(phone) <= 20)` que eu não
 * tinha conferido — de quebra, marcador exigia inventar unicidade à mão pra
 * dois pedidos em aberto não colidirem no `unique`. Nulo resolve os dois: o
 * Postgres aceita quantos nulos existirem num índice único, e continua
 * impedindo duas contas de reivindicarem o MESMO número de verdade.
 */

/** O vínculo ainda não recebeu a mensagem, então não há número de verdade. */
export function numeroAindaNaoConfirmado(phone: string | null | undefined): boolean {
  return !phone;
}

/** Número do vínculo formatado pra leitura, ou null enquanto não houver um de verdade. */
export function numeroVinculadoParaExibir(phone: string | null | undefined): string | null {
  if (numeroAindaNaoConfirmado(phone)) return null;
  const d = phone!.replace(/\D/g, '').replace(/^55/, '');
  if (d.length < 10) return phone!;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const corte = resto.length > 8 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
