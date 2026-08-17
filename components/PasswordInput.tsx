import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, radius, spacing } from '@/lib/theme';
import AppPressable from './AppPressable';

/**
 * Campo de senha com botão de mostrar/ocultar.
 *
 * Existe porque digitar uma senha sem ver o que foi digitado é a causa mais
 * comum de "senha errada" em formulários de cadastro — a pessoa erra uma
 * tecla, não percebe, e só descobre no erro do servidor. O ícone de olho é
 * convenção estabelecida o bastante pra não precisar de instrução.
 *
 * `backgroundColor` é ajustável porque os quatro lugares que usam este campo
 * sentam sobre fundos diferentes: sign-in/sign-up ficam direto sobre
 * `theme.paper`, e por isso a caixa é `theme.paperRaised`; o modal de
 * reautenticação já é um card `paperRaised`, então a caixa dele precisa ser
 * `theme.paper` pra continuar havendo contraste entre os dois.
 */
export default function PasswordInput({
  backgroundColor = theme.paperRaised,
  maxLength,
  placeholder,
  placeholderTextColor,
  autoComplete,
  autoFocus,
  value,
  onChangeText,
}: Pick<
  TextInputProps,
  'maxLength' | 'placeholder' | 'placeholderTextColor' | 'autoComplete' | 'autoFocus' | 'value' | 'onChangeText'
> & { backgroundColor?: string }) {
  const [visivel, setVisivel] = useState(false);

  return (
    <View style={[styles.caixa, { backgroundColor }]}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor ?? theme.inkFaint}
        secureTextEntry={!visivel}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        onChangeText={onChangeText}
      />
      <AppPressable onPress={() => setVisivel((v) => !v)} hitSlop={10} style={styles.botao}>
        <Ionicons name={visivel ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.inkFaint} />
      </AppPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.rule,
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.ink,
  },
  botao: { paddingHorizontal: spacing.md, paddingVertical: 12 },
});
