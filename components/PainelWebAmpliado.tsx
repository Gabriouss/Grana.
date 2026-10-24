/* Fora da web não existe ponteiro nem `document`: a ampliação do painel só existe
   em PainelWebAmpliado.web.tsx. Este arquivo mantém o react-dom fora do bundle nativo. */
export type PropsPainelWebAmpliado = {
  src: string;
  legenda: string;
  aberta: boolean;
  aoSair: () => void;
  camadaRef: { current: HTMLDivElement | null };
  /** 'ponteiro' (padrão): ampliação a 70% enquanto o mouse está no painel.
      'detalhe': camada na própria página com a captura em tamanho real, para
      arrastar, aberta pelo "Ver detalhes do painel". */
  modo?: 'ponteiro' | 'detalhe';
};

export default function PainelWebAmpliado(_: PropsPainelWebAmpliado) {
  return null;
}
