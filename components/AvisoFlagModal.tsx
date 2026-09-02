import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing, fonts, type, lh } from '@/lib/theme';
import { useFlags } from '@/lib/feature-flags';
import type { Flag } from '@/lib/feature-flags-regras';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import AccessibleModalPanel from './AccessibleModalPanel';

/**
 * Aviso de ferramenta fora do ar.
 *
 * Aparece quando uma ferramenta foi desligada remotamente (`feature_flags`) e
 * a linha traz mensagem. Modelado no `NovidadesModal`: mesmo painel
 * centralizado, mesma dispensa por AsyncStorage.
 *
 * ── Regras que decidem quando abre ────────────────────────────────────────
 *
 * `severidade` da linha do banco:
 *  - `info`     — não abre pop-up nenhum. O texto aparece só no ponto de uso
 *                 (o próprio botão desabilitado), que é onde a pessoa vai
 *                 esbarrar no assunto de qualquer jeito.
 *  - `aviso`    — abre uma vez; dispensado, não volta.
 *  - `critico`  — abre em toda abertura enquanto durar.
 *
 * A chave de dispensa inclui `aviso_versao`, então subir esse número no banco
 * faz o aviso reaparecer para quem já dispensou — útil quando a situação muda
 * ("agora sabemos que vai demorar mais"). Mesmo mecanismo do
 * `grana_novidades_versao_vista`.
 *
 * NUNCA bloqueia o app: sempre dá para fechar, e mostra um aviso de cada vez
 * para não empilhar três modais quando três ferramentas caem juntas.
 */

const chaveDispensa = (f: Flag) => `grana_aviso_flag_${f.key}_v${f.aviso_versao}`;

export default function AvisoFlagModal() {
  const { avisosAtivos } = useFlags();
  const [visivel, setVisivel] = useState<Flag | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function decidir() {
      /* Um aviso por vez: se três ferramentas caírem juntas, empilhar três
         modais transformaria a informação em obstáculo. O `critico` tem
         prioridade porque é o que a pessoa mais precisa saber. */
      const fila = [...avisosAtivos].sort((a, b) =>
        Number(b.severidade === 'critico') - Number(a.severidade === 'critico')
      );

      for (const f of fila) {
        if (f.severidade === 'info') continue;
        if (f.severidade === 'critico') {
          if (!cancelado) setVisivel(f);
          return;
        }
        const visto = await AsyncStorage.getItem(chaveDispensa(f));
        if (!visto) {
          if (!cancelado) setVisivel(f);
          return;
        }
      }
      if (!cancelado) setVisivel(null);
    }

    decidir();
    return () => {
      cancelado = true;
    };
  }, [avisosAtivos]);

  if (!visivel) return null;

  const flag = visivel;

  async function fechar() {
    /* `critico` não grava dispensa de propósito: volta na próxima abertura
       enquanto a situação durar. */
    if (flag.severidade !== 'critico') {
      await AsyncStorage.setItem(chaveDispensa(flag), '1');
    }
    setVisivel(null);
  }

  return (
    <AppModal visible animationType="fade" transparent onRequestClose={fechar}>
      <Pressable style={styles.scrim} onPress={fechar}>
        <AccessibleModalPanel ativo style={styles.sheet}>
          <View style={styles.icone}>
            <Ionicons name="alert-circle-outline" size={22} color={theme.accent2} />
          </View>

          <Text style={styles.eyebrow}>Instabilidade</Text>
          <Text style={styles.titulo}>{flag.titulo ?? 'Ferramenta temporariamente indisponível'}</Text>

          <Text style={styles.mensagem}>{flag.mensagem}</Text>

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
  eyebrow: { color: theme.inkFaint, fontSize: type.legenda, lineHeight: lh(type.legenda, 'apoio'), letterSpacing: 0.5, fontFamily: fonts.light },
  titulo: {
    color: theme.ink,
    fontSize: type.titulo,
    fontFamily: fonts.light,
    lineHeight: lh(type.titulo, 'titulo'),
    marginBottom: spacing.sm,
  },
  mensagem: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio, 'corpo'),
    fontFamily: fonts.light,
    marginBottom: spacing.md,
  },
  botao: {
    backgroundColor: theme.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoTexto: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
