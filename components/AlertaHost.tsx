import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, theme, touchTarget, type, lh } from '@/lib/theme';
import {
  assinarAlertas,
  dispensarAlerta,
  obterAlertaAtual,
  pressionarAlerta,
} from '@/lib/alerta';
import AppModal from './AppModal';
import AppPressable from './AppPressable';
import Sheet from './Sheet';

/** Host único das confirmações do app, montado no layout raiz. */
export default function AlertaHost() {
  const [, atualizar] = useState(0);

  useEffect(() => {
    const removerListener = assinarAlertas(() => atualizar((valor) => valor + 1));
    return () => {
      removerListener();
    };
  }, []);

  const pedido = obterAlertaAtual();
  if (!pedido) return null;

  const podeFecharSemBotao = pedido.options?.cancelable !== false;
  const fechar = () => {
    if (podeFecharSemBotao) dispensarAlerta(pedido.id);
  };

  return (
    <AppModal
      visible
      transparent
      onRequestClose={fechar}
      accessibilityViewIsModal
    >
      <Sheet centered onClose={fechar}>
        {pedido.title ? <Text style={styles.title} accessibilityRole="header">{pedido.title}</Text> : null}
        {pedido.message ? <Text style={styles.message}>{pedido.message}</Text> : null}
        <View style={styles.actions} accessibilityRole="none">
          {pedido.buttons.map((botao, indice) => {
            const estilo = botao.style ?? 'default';
            return (
              <AppPressable
                key={`${pedido.id}-${indice}`}
                style={[styles.button, estilo === 'cancel' && styles.cancel, estilo === 'destructive' && styles.destructive]}
                onPress={() => pressionarAlerta(pedido.id, indice)}
                accessibilityRole="button"
                accessibilityLabel={botao.text ?? 'OK'}
              >
                <Text style={[styles.buttonText, estilo === 'cancel' && styles.cancelText]}>{botao.text ?? 'OK'}</Text>
              </AppPressable>
            );
          })}
        </View>
      </Sheet>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.ink,
    fontSize: type.titulo,
    fontFamily: fonts.regular,
  },
  message: {
    color: theme.inkSoft,
    fontSize: type.apoio,
    lineHeight: lh(type.apoio),
    fontFamily: fonts.light,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  cancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.ruleStrong,
  },
  destructive: {
    backgroundColor: theme.danger,
  },
  buttonText: {
    color: theme.paper,
    fontSize: type.apoio,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  cancelText: {
    color: theme.ink,
  },
});
