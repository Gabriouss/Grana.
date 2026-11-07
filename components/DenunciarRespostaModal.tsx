import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, radius, spacing, theme, touchTarget, type } from '@/lib/theme';
import {
  LIMITE_COMENTARIO_DENUNCIA,
  MOTIVOS_DENUNCIA,
  denunciarResposta,
  type MotivoDenuncia,
} from '@/lib/assistente';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

/** Denúncia de uma resposta do Granabô (política da Play para IA generativa).
    Só reaproveita Sheet, AppModal e AppPressable; não cria componente visual novo. */
export default function DenunciarRespostaModal({
  mensagem,
  onClose,
}: {
  mensagem: { id: string; texto: string } | null;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoDenuncia | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function fechar() {
    setMotivo(null);
    setComentario('');
    setFalhou(false);
    setEnviado(false);
    onClose();
  }

  async function enviar() {
    if (!mensagem || !motivo || enviando) return;
    setEnviando(true);
    setFalhou(false);
    try {
      await denunciarResposta(mensagem, motivo, comentario);
      setEnviado(true);
    } catch {
      // O erro já foi registrado em denunciarResposta; aqui o recibo é visível.
      setFalhou(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppModal visible={!!mensagem} transparent onRequestClose={fechar}>
      <Sheet centered onClose={fechar}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {enviado ? 'Recebemos sua denúncia' : 'Denunciar resposta'}
          </Text>
          <AppPressable onPress={fechar} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={theme.inkFaint} />
          </AppPressable>
        </View>

        {enviado ? (
          <>
            <Text style={styles.message}>Obrigado por avisar. Vamos analisar essa resposta.</Text>
            <AppPressable style={styles.confirm} onPress={fechar} accessibilityRole="button">
              <Text style={styles.confirmText}>Fechar</Text>
            </AppPressable>
          </>
        ) : (
          <>
            <Text style={styles.message}>O que há de errado com essa resposta?</Text>
            {MOTIVOS_DENUNCIA.map((m) => {
              const ativo = motivo === m.valor;
              return (
                <AppPressable
                  key={m.valor}
                  style={[styles.opcao, ativo && styles.opcaoAtiva]}
                  onPress={() => setMotivo(m.valor)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={m.rotulo}
                >
                  <Ionicons
                    name={ativo ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={ativo ? theme.accent2 : theme.inkFaint}
                  />
                  <Text style={styles.opcaoTexto}>{m.rotulo}</Text>
                </AppPressable>
              );
            })}
            <TextInput
              accessibilityLabel="Comentário opcional sobre a denúncia"
              style={styles.campo}
              placeholder="Quer contar mais? (opcional)"
              placeholderTextColor={theme.inkFaint}
              value={comentario}
              onChangeText={setComentario}
              maxLength={LIMITE_COMENTARIO_DENUNCIA}
              multiline
            />
            {falhou && (
              <Text style={styles.erro} role="alert" accessibilityLiveRegion="assertive">
                Não foi possível enviar a denúncia. Confira a conexão e tente de novo.
              </Text>
            )}
            <AppPressable
              style={[styles.confirm, (!motivo || enviando) && styles.desligado]}
              onPress={enviar}
              disabled={!motivo || enviando}
              accessibilityRole="button"
              accessibilityState={{ disabled: !motivo || enviando }}
            >
              <Text style={styles.confirmText}>
                {enviando ? 'Enviando…' : falhou ? 'Tentar de novo' : 'Enviar denúncia'}
              </Text>
            </AppPressable>
          </>
        )}
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.titulo, fontFamily: fonts.regular },
  closeBtn: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  message: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.light },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
  },
  opcaoAtiva: { borderColor: theme.accent2 },
  opcaoTexto: { flex: 1, minWidth: 0, color: theme.ink, fontSize: type.apoio, fontFamily: fonts.regular },
  campo: {
    minHeight: touchTarget * 1.5,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.rule,
    color: theme.ink,
    fontSize: type.apoio,
    fontFamily: fonts.light,
    textAlignVertical: 'top',
  },
  erro: { color: theme.inkSoft, fontSize: type.apoio, fontFamily: fonts.regular },
  confirm: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: theme.ink, alignItems: 'center' },
  desligado: { opacity: 0.4 },
  confirmText: { color: theme.paper, fontSize: type.apoio, fontFamily: fonts.regular },
});
