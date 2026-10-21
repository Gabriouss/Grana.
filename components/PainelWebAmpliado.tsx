/* Fora da web não existe ponteiro nem `document`: a ampliação do painel só existe
   em PainelWebAmpliado.web.tsx. Este arquivo mantém o react-dom fora do bundle nativo. */
export type PropsPainelWebAmpliado = {
  src: string;
  legenda: string;
  aberta: boolean;
  aoSair: () => void;
  camadaRef: { current: HTMLDivElement | null };
};

export default function PainelWebAmpliado(_: PropsPainelWebAmpliado) {
  return null;
}
