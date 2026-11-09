import { Alert } from './alerta';
import type { CategoriasConsultadas } from './categorias-cliente';
import type { Visao } from './gastos-categoria';

type DestinoCategoria = { pathname: '/(app)/lancamentos' | '/(app)/credito'; params: {
  modo: 'categoria'; categoria: string; inicio: string; fim: string;
} };

/** Preserva a visão e o período do gráfico sem misturar caixa e cartão. */
export function abrirCategoria(r: CategoriasConsultadas | null, categoria: string, visao: Visao, navegar: (destino: DestinoCategoria) => void) {
  if (!r) { Alert.alert('Categorias indisponíveis', 'Atualize as categorias e tente novamente.'); return; }
  const gasto = r.consumo.porCategoria.find(c => c.category === categoria);
  const destinos = visao === 'tudo'
    ? (['avista', 'credito'] as const).filter(forma => (gasto?.[forma] ?? 0) > 0)
    : [visao];
  const abrir = (forma: 'avista' | 'credito') => navegar({
    pathname: forma === 'credito' ? '/(app)/credito' : '/(app)/lancamentos',
    params: { modo: 'categoria', categoria, inicio: r.inicio, fim: r.fim },
  });
  if (destinos.length === 1) { abrir(destinos[0]); return; }
  if (!destinos.length) { Alert.alert('Categoria sem gastos', 'Atualize as categorias e tente novamente.'); return; }
  Alert.alert('Onde abrir esta categoria?', 'Há gastos em débito e Pix e no crédito. Escolha o que quer consultar.', [
    { text: 'Débito e Pix', onPress: () => abrir('avista') },
    { text: 'Crédito', onPress: () => abrir('credito') },
    { text: 'Cancelar', style: 'cancel' },
  ]);
}
