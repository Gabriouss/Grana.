import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme, spacing, radius, type, fonts } from '@/lib/theme';
import { useBreakpoint } from '@/lib/breakpoints';
import BrandLogotype from './BrandLogotype';
import AppPressable from './AppPressable';

export type ItemNav = {
  /** Nome da rota no expo-router (o mesmo usado em <Tabs.Screen name=...>). */
  rota: string;
  rotulo: string;
  icone: keyof typeof Ionicons.glyphMap;
};

/**
 * Navegação lateral da versão web em janela média/ampla.
 *
 * Substitui a barra flutuante web quando a janela passa de 768px — não por
 * preferência estética, mas porque as premissas mudam. Uma barra colada no
 * rodapé existe para ficar ao alcance do polegar; num monitor ela vira uma
 * faixa distante no canto inferior, longe de onde o olho e o cursor estão.
 * Na horizontal também acaba o aperto por espaço: cabem rótulos junto dos
 * ícones, e cabem mais de cinco destinos.
 *
 * No desktop, todos os destinos de uso diário cabem no trilho lateral, e
 * Perfil continua separado no rodapé por ser configuração. No nativo, o Expo
 * Router fornece tab bar/sidebar/Navigation Bar diretamente pelo sistema.
 */
export default function SideNav({
  itens,
  rotaAtiva,
  onNavegar,
  rodape,
}: {
  itens: ItemNav[];
  rotaAtiva: string;
  onNavegar: (rota: string) => void;
  /** Itens fixados na base (Perfil), separados do bloco principal. */
  rodape?: ItemNav[];
}) {
  const { ehAmplo } = useBreakpoint();
  const mostrarRotulos = ehAmplo;
  /* Vale em janela larga de qualquer plataforma — web e, desde a remoção das
     Native Tabs, também tablet nativo (ver `temBarraLateral` em
     lib/breakpoints.ts). Os insets importam nos dois casos: a web
     instalada/PWA ocupa janela edge-to-edge, e no tablet o inset esquerdo
     cobre o notch em paisagem. */
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.barra,
        {
          width: (mostrarRotulos ? 232 : 76) + insets.left,
          paddingLeft: spacing.md + insets.left,
          paddingTop: spacing.lg + insets.top,
          paddingBottom: spacing.lg + insets.bottom,
        },
      ]}
    >
      <View style={[styles.marca, !mostrarRotulos && styles.marcaCompacta]}>
        {mostrarRotulos ? (
          <BrandLogotype width={104} />
        ) : (
          <Ionicons name="ellipse" size={12} color={theme.accent2} />
        )}
      </View>

      <View style={styles.grupo}>
        {itens.map((item) => (
          <ItemBarra
            key={item.rota}
            item={item}
            ativo={rotaAtiva === item.rota}
            mostrarRotulo={mostrarRotulos}
            onPress={() => onNavegar(item.rota)}
          />
        ))}
      </View>

      {rodape && rodape.length > 0 && (
        <View style={styles.rodape}>
          {rodape.map((item) => (
            <ItemBarra
              key={item.rota}
              item={item}
              ativo={rotaAtiva === item.rota}
              mostrarRotulo={mostrarRotulos}
              onPress={() => onNavegar(item.rota)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ItemBarra({
  item,
  ativo,
  mostrarRotulo,
  onPress,
}: {
  item: ItemNav;
  ativo: boolean;
  mostrarRotulo: boolean;
  onPress: () => void;
}) {
  const cor = ativo ? theme.accent2 : theme.inkFaint;

  return (
    <AppPressable
      onPress={onPress}
      /* `assistente` é AÇÃO, não destino: ele abre a conversa sobre a tela
         atual em vez de navegar, e por isso não recebe `href` na linha abaixo.
         Anunciar isso como `link` prometia ao leitor de tela uma navegação que
         não acontece. O botão central da barra compacta já resolvia assim
         (app/(app)/_layout.tsx:246) — era o mesmo controle com dois papéis
         diferentes dependendo da largura da janela. */
      accessibilityRole={item.rota === 'assistente' ? 'button' : 'link'}
      accessibilityState={
        item.rota === 'assistente'
          ? { expanded: ativo }
          : ativo ? { selected: true } : {}
      }
      /* Com o rótulo escondido (trilho de 76px) o botão fica só com o ícone,
         e um botão só de ícone sem nome é invisível para leitor de tela. */
      accessibilityLabel={item.rotulo}
      href={item.rota === 'assistente' ? undefined : item.rota === 'index' ? '/' : `/${item.rota}`}
      scaleOnPress={false}
      style={({ hovered }) => [
        styles.item,
        !mostrarRotulo && styles.itemCompacto,
        hovered && !ativo && styles.itemHover,
        ativo && styles.itemAtivo,
      ]}
    >
      <Ionicons name={item.icone} size={20} color={cor} />
      {mostrarRotulo && (
        <Text style={[styles.rotulo, { color: cor }, ativo && styles.rotuloAtivo]} numberOfLines={1}>
          {item.rotulo}
        </Text>
      )}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  /* `paddingLeft`/`paddingTop`/`paddingBottom` e a largura vêm do componente,
     somados aos insets — ver o comentário lá. Aqui fica só o `paddingRight`,
     que nunca encosta em recorte de tela (o trilho está colado na borda
     esquerda; a direita dele é conteúdo do app). */
  barra: {
    height: '100%',
    backgroundColor: theme.paperRaised,
    borderRightWidth: 1,
    borderRightColor: theme.rule,
    paddingRight: spacing.md,
    gap: spacing.xl,
  },
  marca: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs },
  marcaCompacta: { alignItems: 'center', paddingHorizontal: 0 },
  grupo: { gap: 2, flex: 1 },
  rodape: { gap: 2, borderTopWidth: 1, borderTopColor: theme.rule, paddingTop: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    /* 44px de altura: o mesmo mínimo de alvo de toque do celular. Um monitor
       tem cursor preciso e toleraria menos, mas a mesma janela pode estar
       num tablet com dedo — e reduzir aqui não compraria nada visualmente. */
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  itemCompacto: { justifyContent: 'center', paddingHorizontal: 0 },
  itemHover: { backgroundColor: theme.hover },
  itemAtivo: { backgroundColor: 'rgba(174,255,227,0.16)' },
  rotulo: { fontSize: type.corpo, fontFamily: fonts.regular, flexShrink: 1 },
  rotuloAtivo: {},
});
