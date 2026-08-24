import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme, spacing, radius, fonts, type } from '@/lib/theme';
import { colunaLeitura, useBreakpoint } from '@/lib/breakpoints';
import AppPressable from '@/components/AppPressable';
import BrandLogotype from '@/components/BrandLogotype';
import TextoComLinks from '@/components/TextoComLinks';
import type { DocumentoLegal } from '@/lib/legal-content';

type Props = { doc: DocumentoLegal };

const DOCUMENTOS = [
  { rota: '/termos', rotulo: 'Termos de Uso' },
  { rota: '/privacidade', rotulo: 'Privacidade' },
  { rota: '/exclusao-de-dados', rotulo: 'Excluir dados' },
] as const;

/**
 * Renderizador único pra Termos, Privacidade e Exclusão de dados — ver
 * lib/legal-content.ts.
 *
 * Quem abre esta tela raramente vem de dentro do app: é o revisor da Meta
 * validando o app do WhatsApp, é o formulário de checkout da Kiwify, é
 * alguém buscando "grana política de privacidade" no Google. Por isso o
 * cabeçalho mostra a marca (ninguém que chegou por link direto tem outro
 * jeito de saber que está no lugar certo) e o corpo usa `colunaLeitura`, não
 * `colunaFormulario` — 420px é largura de campo de e-mail, não de parágrafo;
 * nesta tela ela deixava a linha quebrar a cada 4-5 palavras.
 *
 * Só no navegador, a partir do primeiro corte de largura (`!ehCompacto`), o
 * texto ganha um cartão flutuante sobre o fundo — o mesmo vocabulário visual
 * de `useSheetFlutuante` (lib/breakpoints.ts). No celular (nativo ou web
 * estreito) o cartão some e o texto volta a ir de ponta a ponta.
 *
 * A partir do corte mais largo (`ehAmplo`, >=1280px), sobrava espaço vazio
 * demais dos dois lados do cartão pra um documento de 10 seções — a versão
 * anterior deixava a pessoa rolando às cegas até achar a cláusula que
 * queria. O sumário lateral usa esse espaço com propósito: pula direto pra
 * seção, sem precisar de outra ferramenta além de rolagem.
 */
export default function LegalDocScreen({ doc }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { height: alturaJanela } = useWindowDimensions();
  const { ehCompacto, ehAmplo } = useBreakpoint();
  const flutuante = !ehCompacto; // só existe na web — ver useBreakpoint()
  const comSumario = ehAmplo; // só existe na web, tela larga o bastante pra sobrar espaço de verdade

  const secoes = useMemo(
    () =>
      doc.blocos
        .map((bloco, i) => (bloco.tipo === 'subtitulo' ? { indice: i, texto: bloco.texto } : null))
        .filter((v): v is { indice: number; texto: string } => v !== null),
    [doc]
  );

  const refsSecao = useRef<Record<number, View | null>>({});
  const [ativa, setAtiva] = useState<number | null>(null);

  // Destaca no sumário qual seção está visível — só web, IntersectionObserver
  // direto no DOM, mesmo padrão de lib/foco-web.ts e RevealOnScroll.
  useEffect(() => {
    if (!comSumario || Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined') return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visiveis = entradas.filter((e) => e.isIntersecting);
        if (visiveis.length === 0) return;
        // A mais alta na tela dita a seção "atual" — como o sumário de um editor de texto.
        const topo = visiveis.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const indice = Number(topo.target.getAttribute('data-secao'));
        if (!Number.isNaN(indice)) setAtiva(indice);
      },
      { rootMargin: '-10% 0px -70% 0px' }
    );

    for (const { indice } of secoes) {
      const no = refsSecao.current[indice] as unknown as HTMLElement | null;
      if (no) observador.observe(no);
    }
    return () => observador.disconnect();
  }, [comSumario, secoes]);

  function irPara(indice: number) {
    const no = refsSecao.current[indice] as unknown as HTMLElement | null;
    no?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <View style={styles.pagina}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            /* Sem o sumário, o rodapé de 28px basta. Com ele (`comSumario`), o
               clique de uma seção perto do fim do documento chama
               `scrollIntoView({ block: 'start' })` — que só consegue alinhar o
               alvo ao topo se sobrar, ABAIXO dele, pelo menos uma tela inteira
               de conteúdo pra "empurrar" a rolagem até lá. Perto do fim de um
               documento de 9 seções isso quase nunca é verdade, e o navegador
               trava a rolagem no máximo possível — a última seção clicada
               parava a ~380px do topo, não colada nele. Almofada do tamanho da
               própria janela garante que QUALQUER seção, inclusive a última,
               tenha esse espaço de sobra. */
            paddingBottom: comSumario ? alturaJanela : insets.bottom + spacing.xxl,
          },
        ]}
      >
        <View style={[styles.corpoPagina, comSumario && styles.corpoPaginaComSumario]}>
          {comSumario && (
            <View style={styles.sumario}>
              <Text style={styles.sumarioRotulo}>Nesta página</Text>
              {secoes.map(({ indice, texto }) => {
                const numero = texto.match(/^(\d+)\.\s*(.+)$/);
                return (
                  <AppPressable key={indice} onPress={() => irPara(indice)} style={styles.sumarioItem}>
                    <View style={[styles.sumarioTraço, ativa === indice && styles.sumarioTraçoAtivo]} />
                    <Text style={[styles.sumarioTexto, ativa === indice && styles.sumarioTextoAtivo]} numberOfLines={1}>
                      {numero ? numero[2] : texto}
                    </Text>
                  </AppPressable>
                );
              })}
            </View>
          )}

          {/* `alignSelf: 'center'` dentro de `colunaLeitura` foi pensado pra
              empilhamento vertical (centraliza no eixo horizontal, que é o
              eixo cruzado de uma coluna) — dentro desta linha (sumário +
              conteúdo + espaçador), o eixo cruzado passa a ser o vertical, e
              o cartão de 720px ficava colado à esquerda da própria faixa em
              vez de centralizado nela. Este wrapper existe só pra centralizar
              no eixo certo, sem mexer no layout interno do cartão. */}
          <View style={styles.trilhaCentral}>
          <View style={[colunaLeitura, styles.coluna]}>
            <View style={[styles.cabecalho, { paddingTop: insets.top + spacing.lg }]}>
              <AppPressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                hitSlop={12}
                style={styles.voltar}
              >
                <Ionicons name="chevron-back" size={18} color={theme.inkSoft} />
                <Text style={styles.voltarTexto}>Voltar</Text>
              </AppPressable>
              <BrandLogotype width={92} />
            </View>

            {/* Quem chegou por link direto (Kiwify, Meta) não tem como voltar pro
                Perfil pra ver os outros dois documentos — esta linha é o único
                jeito de ir de um pro outro sem sair do site. */}
            <View style={styles.abasDocs}>
              {DOCUMENTOS.map((d) => {
                const atual = pathname === d.rota;
                return (
                  <AppPressable
                    key={d.rota}
                    onPress={() => !atual && router.push(d.rota)}
                    style={[styles.abaDoc, atual && styles.abaDocAtiva]}
                  >
                    <Text style={[styles.abaDocTexto, atual && styles.abaDocTextoAtivo]}>{d.rotulo}</Text>
                  </AppPressable>
                );
              })}
            </View>

            <View style={[styles.corpo, flutuante && styles.corpoFlutuante]}>
              <Text style={styles.titulo}>{doc.titulo}</Text>
              <Text style={styles.atualizado}>Última atualização: {doc.atualizadoEm}</Text>

              {doc.blocos.map((bloco, i) => {
                if (bloco.tipo === 'subtitulo') {
                  const m = bloco.texto.match(/^(\d+)\.\s*(.+)$/);
                  return (
                    <View
                      key={i}
                      ref={(no) => {
                        refsSecao.current[i] = no;
                      }}
                      // @ts-expect-error — atributo web puro, usado só pra IntersectionObserver identificar a seção.
                      dataSet={Platform.OS === 'web' ? { secao: i } : undefined}
                      style={styles.subtituloLinha}
                    >
                      {m ? (
                        <>
                          <Text style={styles.subtituloNumero}>{m[1]}</Text>
                          <Text style={styles.subtitulo}>{m[2]}</Text>
                        </>
                      ) : (
                        <Text style={styles.subtitulo}>{bloco.texto}</Text>
                      )}
                    </View>
                  );
                }
                if (bloco.tipo === 'paragrafo') {
                  return <TextoComLinks key={i} texto={bloco.texto} style={styles.paragrafo} linkStyle={styles.link} />;
                }
                if (bloco.tipo === 'lista') {
                  return (
                    <View key={i} style={styles.lista}>
                      {bloco.itens.map((item, j) => (
                        <View key={j} style={styles.itemLista}>
                          <View style={styles.marcador} />
                          <TextoComLinks texto={item} style={styles.paragrafoEmLista} linkStyle={styles.link} />
                        </View>
                      ))}
                    </View>
                  );
                }
                // 'passos' — lista numerada, usada só na página de exclusão de dados.
                return (
                  <View key={i} style={styles.caixaPassos}>
                    {bloco.itens.map((item, j) => (
                      <View key={j} style={styles.itemPasso}>
                        <View style={styles.passoNumero}>
                          <Text style={styles.passoNumeroTexto}>{j + 1}</Text>
                        </View>
                        <TextoComLinks texto={item} style={styles.paragrafoEmLista} linkStyle={styles.link} />
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
          </View>

          {/* Espaçador do mesmo tamanho do sumário — sem ele a faixa central
              (onde `trilhaCentral` centraliza o cartão) fica mais larga de um
              lado que do outro, e o cartão centraliza fora do centro real da
              tela. */}
          {comSumario && <View style={styles.sumario} />}
        </View>
      </ScrollView>
    </View>
  );
}

const LARGURA_SUMARIO = 220;

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: theme.paper },
  scroll: { flexGrow: 1 },
  corpoPagina: { flex: 1, paddingHorizontal: spacing.xl },
  corpoPaginaComSumario: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  trilhaCentral: { flex: 1, alignItems: 'center' },
  coluna: { flex: 1 },

  sumario: {
    width: LARGURA_SUMARIO,
    flexShrink: 0,
    // `position: sticky` é CSS puro, sem equivalente tipado no RN — some do
    // tipo mas some também do nativo, que nem monta este bloco (comSumario
    // só é true na web). Sem ele o sumário rolaria junto com o texto e
    // desapareceria da tela assim que a primeira seção passasse.
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: spacing.xl } as any) : null),
  },
  sumarioRotulo: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.sm, marginTop: spacing.xl },
  sumarioItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  sumarioTraço: { width: 2, height: 14, borderRadius: 1, backgroundColor: theme.rule },
  sumarioTraçoAtivo: { backgroundColor: theme.accent2 },
  sumarioTexto: { flex: 1, color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  sumarioTextoAtivo: { color: theme.ink, fontFamily: fonts.regular },

  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.rule,
  },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voltarTexto: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },

  abasDocs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  abaDoc: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.rule },
  abaDocAtiva: { borderColor: theme.ruleStrong, backgroundColor: theme.paperRaised },
  abaDocTexto: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light },
  abaDocTextoAtivo: { color: theme.accent2, fontFamily: fonts.regular },

  corpo: { paddingBottom: spacing.xxl },
  // Cartão flutuante — só na web, a partir do primeiro corte de largura.
  corpoFlutuante: {
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: theme.ruleStrong,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    marginBottom: spacing.xxl,
  },
  titulo: { color: theme.ink, fontSize: type.destaque, fontFamily: fonts.regular, marginBottom: spacing.xs },
  atualizado: { color: theme.inkFaint, fontSize: type.legenda, fontFamily: fonts.light, marginBottom: spacing.xl },
  subtituloLinha: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.rule,
  },
  // Numeração das seções é a numeração real do documento (1., 2., 3.) — não
  // é decoração adicionada por cima; por isso ela ganha destaque de cor em
  // vez de virar um rótulo genérico "Seção X".
  subtituloNumero: { color: theme.accent2, fontSize: type.destaque, fontFamily: fonts.light },
  subtitulo: { color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular, flex: 1 },
  paragrafo: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 22, fontFamily: fonts.light, marginTop: spacing.md },
  // Mesma tipografia do parágrafo solto, mas sem o próprio marginTop — o
  // espaçamento entre itens vem de `itemLista`/`itemPasso`, e o `flex: 1`
  // deixa o texto quebrar linha usando o espaço que sobra ao lado do marcador.
  paragrafoEmLista: { color: theme.inkSoft, fontSize: type.apoio, lineHeight: 22, fontFamily: fonts.light, flex: 1 },
  link: { color: theme.accent2, fontFamily: fonts.regular },
  lista: { marginTop: spacing.sm },
  itemLista: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, alignItems: 'flex-start' },
  // Bolinha em vez de travessão: um travessão preso à fonte Light lia como
  // hífen solto flutuando longe do texto, sem peso suficiente pra marcar
  // item de lista à distância de leitura de monitor.
  marcador: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accent2, marginTop: 8 },
  caixaPassos: {
    marginTop: spacing.md,
    backgroundColor: theme.paper,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.rule,
    padding: spacing.lg,
    gap: spacing.md,
  },
  itemPasso: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  passoNumero: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoNumeroTexto: { color: theme.accent2, fontSize: type.nota, fontFamily: fonts.regular },
});
