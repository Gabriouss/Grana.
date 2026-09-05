# 006 — Refinar o feedback dos estados de voz
Base: d37bd7f • Status: TODO • Aplicativo interno Grana.
Raiz absoluta: C:/Users/user/Desktop/Aplicativo Financeiro/grana-app.
Todos os caminhos abaixo são relativos a essa raiz. Planejamento apenas.

Severidade: LOW. Categoria: indicação de estado. Escopo: components/VoiceEntryButton.tsx e eventual componente visual extraído; lib/motion.ts para tokens. Dependência: 003.

## Hoje
VoiceEntryButton.tsx:170: `const rotulo = enviando ? 'Transcrevendo…' : gravando ? 'Ouvindo…' : label;`.
Em :187–193 há ActivityIndicator durante envio e ícone mic/mic-outline na escuta. O estado já é compreensível; o refinamento deve preservar essa clareza.

## Alvo
Mudança de ícone/estado: fade 125ms cubic-bezier(0.23,1,0.32,1), em espaço reservado para não deslocar texto.
Enquanto gravando realmente: anel local com opacity .55→1→.55, 900ms por trecho, curva cubic-bezier(0.42,0,0.58,1), no máximo um loop e isInteraction false. Indicador não representa volume.
Processamento: spinner existente, rótulo Transcrevendo; nenhuma porcentagem inventada.
Resultado: retorno visual 160ms UI_OUT; sucesso de transcrição não apresenta Lançamento salvo. Confirmação de persistência continua pertencendo ao fluxo que de fato salva.
Modo reduzido: anel estático; texto, ícone e busy mantidos; fade de estado 120ms ou mudança imediata.

## Passos
1. Derivar visual exclusivamente de gravando/enviando já existentes, sem segunda máquina de estados de gravação.
2. Separar ícone visual do rótulo acessível; manter tamanho de toque e medidas do botão.
3. Iniciar loop só quando gravando true, app ativo e redução de movimento desligada. Parar em toda saída, erro, background, cleanup ou troca de preferência.
4. Retarget de fade sem piscar em toques rápidos. Não bloquear parar gravação para completar efeito.
5. Preservar ocupado.current, permissões, limites de tempo, hapticSuccess existente e mapeamento de erros. Não duplicar vibração.
6. Validar o contexto real de salvamento antes de qualquer selo de sucesso novo.

## Limites
Não alterar lib/voz.ts, serialização de áudio, widget Android, transcrição, Edge Functions ou banco. Widget tem implementação separada: consistência com ele exige outro plano. Não usar waveform fictícia, contador de progresso ou gravação em background para manter animação.
## Verificação
npx tsc --noEmit; npm run test:voz; testes visuais/lifecycle para todos os estados. Expo Go: permitir/negar microfone, parar rapidamente, atingir limite, resposta lenta, erro de rede, background e retorno, redução de movimento.
Aceite: nenhuma atividade visual de escuta após encerrar, nenhum sucesso antes da confirmação correta e nenhuma regressão em cancelar/parar áudio. Não criar lançamentos reais apenas para filmar a apresentação; usar ambiente de teste.

