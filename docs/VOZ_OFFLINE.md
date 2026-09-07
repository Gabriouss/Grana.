# Lançamento por voz local

## Comportamento

- Android 13 ou superior, serviço de reconhecimento local disponível e modelo
  pt-BR instalado: o arquivo gravado pelo app ou widget é reconhecido no aparelho.
  requiresOnDeviceRecognition impede o reconhecedor do sistema de usar a rede.
- Perfil > Preparar português para voz offline solicita a instalação do modelo
  pelo Android. Essa preparação inicial precisa de conexão.
- Sem suporte/modelo, ou falha do reconhecedor local, permanece o fallback de
  transcrição existente. Web e iOS continuam usando esse caminho remoto.
- A interpretação usa o parser local existente; não há LLM financeiro remoto
  nessa etapa. Cartões e categorias consultados com conexão são armazenados por
  conta para consulta offline.
- Despesa, crédito, parcelamento e boleto reconhecidos são persistidos antes da
  RPC, com requestId e payload imutáveis. Falha temporária mantém a operação.
  A interface e o widget distinguem salvamento local de sincronização concluída.
- Ao abrir/retomar o Android ou tocar em Tentar sincronizar, operações da conta
  atual são enviadas. Não há execução garantida com o processo encerrado.
- Áudios pendentes do widget passam a documentos privados; a fila não é removida
  antes da tentativa. Isso é recuperação de áudio, distinta de lançamento local.

## Validação

node __tests__/voz-offline.cjs executa os módulos reais com adaptadores simulados:
modelo instalado/ausente, reconhecimento obrigatoriamente local, persistência
sem rede, isolamento por conta, payload preservado e remoção após confirmação.
Também executar voz-upload.cjs, widget-voz-cartoes.cjs e tsc --noEmit.

Não equivale a QA Android: testar em build interna com modelo pt-BR instalado,
modo avião, app aberto/fechado, encerramento manual, crédito e boleto; reconectar
e verificar que o banco recebe uma única operação com o valor e a data originais.
Validar AAC 44,1 kHz no serviço do fabricante. Sem aparelho/emulador nesta sessão,
precisão de transcrição e funcionamento headless não foram comprovados.
