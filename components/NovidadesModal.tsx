import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { verificarNovidades, marcarNovidadesVistas, type Novidades } from '@/lib/atualizacao';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import AccessibleModalPanel from './AccessibleModalPanel';

/**
 * Pop-up de "o que mudou", mostrado uma única vez por versão, na primeira
 * abertura do app depois de uma atualização de verdade (nunca numa
 * instalação nova — ver o comentário em verificarNovidades). Nunca bloqueia
 * nada: some sozinho se não houver nota publicada pra versão instalada.
 *
 * Centralizado em qualquer largura de tela, ao contrário da maioria dos
 * modais do app (que usam `useSheetFlutuante` e viram folha-de-baixo no
 * compacto) — é um aviso informativo curto, não um formulário/ação, então
 * não faz sentido ancorar embaixo nem ocupar a tela inteira no celular.
 */
export default function NovidadesModal() {
  const [novidades, setNovidades] = useState<Novidades | null>(null);

  useEffect(() => {
    verificarNovidades().then(setNovidades);
  }, []);

  if (!novidades) return null;

  function fechar() {
    marcarNovidadesVistas(novidades!.versao);
    setNovidades(null);
  }

  return (
    <AppModal visible animationType="fade" transparent onRequestClose={fechar}>
      <Pressable style={styles.scrim} onPress={fechar}>
        <AccessibleModalPanel ativo style={styles.sheet}>
          <View style={styles.icone}>
            <Ionicons name="sparkles" size={22} color={theme.accent2} />
          </View>

          <Text style={styles.eyebrow}>Versão {novidades.versao}</Text>
          <Text style={styles.titulo}>O que mudou no Grana.</Text>

          <View style={styles.lista}>
            {novidades.itens.map((item, i) => (
              <View key={i} style={styles.linha}>
                <View style={styles.marcador} />
                <Text style={styles.itemTexto}>{item}</Text>
              </View>
            ))}
          </View>

          <AppPressable
            style={({ hovered }) => [styles.botao, hovered && { opacity: 0.88 }]}
            onPress={fechar}
          >
            <Text style={styles.botaoTexto}>Entendi</Text>
          </AppPressable>
        </AccessibleModalPanel>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    // Mesmo teto de largura do painel flutuante que os outros modais usam
    // em tela ampla — no celular, `width: '100%'` some contra o padding do
    // scrim, então o card nunca vira uma faixa fina nem uma parede no
    // desktop.
    maxWidth: 420,
    backgroundColor: theme.paperRaised,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  icone: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: theme.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  eyebrow: { color: theme.inkFaint, fontSize: type.legenda, letterSpacing: 0.5, fontFamily: fonts.light },
  titulo: {
    color: theme.ink,
    fontSize: type.titulo,
    fontFamily: fonts.light,
    lineHeight: lh(type.titulo, 'titulo'),
    marginBottom: spacing.sm,
  },
  lista: { gap: 12, marginBottom: spacing.md },
  linha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  marcador: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accent2,
    marginTop: 8,
  },
  itemTexto: {
    flex: 1,
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    fontFamily: fonts.light,
  },
  botao: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoTexto: { color: theme.paper, fontSize: type.corpo, fontFamily: fonts.regular },
});
