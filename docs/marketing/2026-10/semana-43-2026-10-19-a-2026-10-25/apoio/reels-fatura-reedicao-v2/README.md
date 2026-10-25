# Fatura e parcelas: reedição v2

Pedido em25/10/2026: reeditar o Reel com as skills meu-editor-de-video e motion-supremo, usando os brutos locais indicados pelo autor. Execução Codex PH. Nova versão para aprovação; original preservado. Nenhuma postagem/aceite implícito.

Direção: gancho em4linhas de88/108px, compras em entrada escalonada com etiquetas de parcela, total revelado sem valores aleatórios; demonstração em mockup fotográfico e recortes reais; legenda de2a3palavras sincronizada; CTA com botão e fecho sequencial. Fundo petróleo/menta, NeueMachina Light/Regular. Nova trilha local108bpm, mesma locução sem mudança de velocidade, pausas inseridas reduzidas. Previsão20,29s contra21,3s do original.

Fontes: E:/Grana-temporarios/2026-10-24-tino-videos/trabalho/narracoes/brutos/v2-take1.mp3 e take2; tomou-se take1 após comparação. Só quatro cortes dentro de silêncio medido; locução limpa18,23s. Telas reais da conta de teste em E:/Grana-temporarios/2026-10-23-reels-ganchos/fontes-limpas/credito.mp4 e metas-cofrinhos.mp4. Originais não alterados. Brutos, fontes licenciadas e intermediários grandes ficam locais; este pacote não é projeto portátil.

## Receita e reabertura na M1

Projeto completo: E:/Grana-temporarios/2026-10-25-fatura-reedicao/trabalho/v2/projeto. Preparar.py reproduz a variante a partir das fontes locais acima e do motor da montagem Tino. Config.py e cena.template.html registram os bytes específicos da variante. Conferir.py recebe o caminho do MP4 e mede formato/áudio/quadro preto/movimento no arquivo real. QA final e folha de contato são acrescentados depois do render.

Motor: Editonny1.0.0/HyperFrames0.8.171, local. Render: python build.py hf render --quality delivery --workers 1 --low-memory-mode --video-frame-format png --output renders/v2.mp4. Finalização usa loudnorm em2passadas, H264 yuv420p/AAC48kHz estéreo. Nenhuma geração ou API paga.

Limites: não foi produzida capa; autor fará a avaliação estética e de escuta. Uma nova montagem não equivale à aprovação editorial. A identidade financeira depende das telas reais existentes; nenhum dado de cliente foi usado.


## QA final

MP4 final20,29s,608quadros de vídeo,1080x1920/30fps/H264/yuv420p, AAC48kHz estéreo. Medição −13,99LUFS e pico −5,10dBTP; nenhum quadro preto detectado. Quality gate Editonny passed=true, failures=[], text_reader=null (OCR indisponível, não alegar aprovação automática de texto). Folha final10quadros vista diretamente; fontes/takes/original com SHA256 preservados. Diferença real entre quadros medida em10fps nas5etapas, todas com movimento (qa-final.json). Palavras seguem alinhamento herdado da mesma fala e início real por silêncio; não houve nova ASR nem avaliação humana de escuta. Não foi produzido criativo com geração paga.

Intercorrências: a checagem de largura recusou uma linha de913px para912px; reorganizada em4linhas. Prévia manual precisou materializar o template HyperFrames, usar booleano na espera da timeline GSAP (o objeto é thenable) e aplicar aos frames substitutos os estilos dos recortes de vídeo. A captura final utiliza o renderer HyperFrames e foi conferida no MP4 real. A saída de áudio do motor herdado era mono, convertida para estéreo na finalização sem novo render de imagem. O processo de render registrou arquivo completo, mas o shell retornou1; arquivo final decodificado/medido e quality gate exit0 aprovados, sem presumir sucesso só pela mensagem do renderer.

Original Fatura e parcelas.mp4 permanece intacto. Variante Fatura e parcelas - reedicao v2.mp4 em para-aprovacao, com legenda própria em COPYS-FINAIS.md. Aceite/publicação não executados. Avaliação estética e escuta final cabem ao autor.
