import { SafeAreaView as NativeSafeAreaView, type Edge, type EdgeMode, type Edges, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { useFaixaTopoVisivel } from '@/lib/faixa-topo';

function retirarTopo(edges: Edges | undefined): Edges {
  if (!edges) return ['right', 'bottom', 'left'];
  if (Array.isArray(edges)) return edges.filter((edge: Edge) => edge !== 'top');
  const semTopo = { ...(edges as Readonly<Partial<Record<Edge, EdgeMode>>>) };
  delete semTopo.top;
  return semTopo;
}

/** Safe area das telas, sem reservar o topo duas vezes quando há faixa global. */
export default function SafeAreaViewComFaixa({ edges, ...props }: SafeAreaViewProps) {
  const faixaVisivel = useFaixaTopoVisivel();
  const edgesAjustados = faixaVisivel ? retirarTopo(edges) : edges;
  return <NativeSafeAreaView {...props} edges={edgesAjustados} />;
}
