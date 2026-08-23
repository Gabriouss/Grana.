/**
 * Conteúdo de Termos de Uso, Política de Privacidade e Exclusão de Dados.
 *
 * Esta é a ÚNICA fonte de verdade destes documentos. Até 23/08/2026 o texto
 * vivia em três Edge Functions (supabase/functions/{privacy-policy,
 * terms-of-service,data-deletion}), publicadas em *.supabase.co — mas sem
 * link nenhum DENTRO do app, e sem controle de estilo (HTML solto). A Meta
 * (Configurações do app → Privacy Policy URL / Terms of Service URL /
 * Exclusão de dados do usuário) já foi atualizada para apontar pras rotas
 * novas (granaponto.com.br/privacidade, /termos, /exclusao-de-dados) e as
 * três Edge Functions antigas foram removidas — as URLs *.supabase.co não
 * respondem mais.
 *
 * Renderizado por app/termos.tsx, app/privacidade.tsx e
 * app/exclusao-de-dados.tsx, via components/LegalDocScreen.tsx. Um link
 * cruzado em texto usa a sintaxe `[rótulo](destino)`, lida por
 * TextoComLinks; `destino` começando com "/" navega dentro do app, e-mail e
 * URL externa abrem por Linking.
 */

export type BlocoLegal =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'subtitulo'; texto: string }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'passos'; itens: string[] };

export type DocumentoLegal = {
  titulo: string;
  atualizadoEm: string;
  blocos: BlocoLegal[];
};

const EMAIL_CONTATO = '[gbr.design30@gmail.com](mailto:gbr.design30@gmail.com)';

export const POLITICA_PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de Privacidade',
  atualizadoEm: '17 de agosto de 2026',
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Grana. é um aplicativo de controle financeiro pessoal. Esta política explica quais dados o aplicativo coleta, para que servem, com quem podem ser compartilhados e como você pode acessá-los, corrigi-los ou excluí-los, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).',
    },
    { tipo: 'subtitulo', texto: '1. Quem é o responsável pelos dados' },
    {
      tipo: 'paragrafo',
      texto: `O Grana. é desenvolvido e operado de forma independente. Dúvidas, solicitações sobre seus dados ou pedidos de exclusão podem ser enviados para ${EMAIL_CONTATO}.`,
    },
    { tipo: 'subtitulo', texto: '2. Quais dados coletamos' },
    {
      tipo: 'lista',
      itens: [
        'Conta: e-mail e senha (a senha nunca é armazenada em texto puro — a autenticação é feita pelo Supabase Auth).',
        'Perfil: nome de exibição e, opcionalmente, uma foto de perfil.',
        'Dados financeiros que você registra: lançamentos (descrição, valor, categoria, data), contas a pagar, orçamentos por categoria e categorias personalizadas. Esses dados existem só para o app funcionar — o Grana. não tem finalidade de análise de crédito, publicidade ou repasse a terceiros para fins comerciais.',
        'Vínculo de WhatsApp (opcional): se você ativar o lançamento por WhatsApp, guardamos o número de telefone informado e um código de pareamento temporário, usados só para confirmar que aquele número é seu.',
        'Dados técnicos mínimos: identificador interno da conta e horários de criação/atualização dos seus registros, para o funcionamento normal do banco de dados.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto:
        'O bloqueio do app por biometria/senha do aparelho (quando ativado) é verificado inteiramente pelo sistema operacional do seu celular — o Grana. não recebe nem armazena nenhum dado biométrico.',
    },
    { tipo: 'subtitulo', texto: '3. Para que usamos esses dados' },
    {
      tipo: 'lista',
      itens: [
        'Exibir seus lançamentos, contas, orçamentos e o diagnóstico financeiro dentro do próprio app.',
        'Enviar lembretes de vencimento de contas (notificações geradas e agendadas no próprio aparelho).',
        'Permitir o registro de lançamentos por voz, por texto colado ou pelo WhatsApp, quando você opta por usar esses recursos.',
        'Manter sua sessão conectada com segurança entre usos do app.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto: 'Não usamos seus dados para publicidade, não os vendemos e não fazemos perfilamento para terceiros.',
    },
    { tipo: 'subtitulo', texto: '4. Com quem os dados são compartilhados' },
    {
      tipo: 'lista',
      itens: [
        'Supabase (banco de dados, autenticação e armazenamento de arquivos) — infraestrutura que hospeda todos os dados descritos acima.',
        'Meta / WhatsApp Cloud API — somente se você vincular um número de WhatsApp: as mensagens que você envia para registrar lançamentos passam pela API oficial da Meta até chegarem ao nosso servidor.',
        'OpenAI e Groq (Whisper) — somente para transcrever mensagens de áudio enviadas pelo WhatsApp, quando esse canal está em uso. O áudio é enviado só para a transcrição e não é retido por nós após o processamento.',
        'Kiwify — se você assinar o Grana. como plano pago: o processamento do pagamento é feito inteiramente pela Kiwify, que nos informa o e-mail usado na compra e o status da assinatura (ativa, atrasada, cancelada, reembolsada), só para liberar o acesso correspondente. O Grana. não recebe nem armazena dados de cartão.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto: 'Nenhum desses terceiros recebe mais dados do que o estritamente necessário para a função específica descrita.',
    },
    { tipo: 'subtitulo', texto: '5. Por quanto tempo guardamos seus dados' },
    {
      tipo: 'paragrafo',
      texto:
        'Seus dados ficam armazenados enquanto sua conta existir. Você pode excluir a conta a qualquer momento diretamente no app (Perfil → Excluir conta), o que apaga permanentemente seus lançamentos, contas, orçamentos, categorias e vínculo de WhatsApp, sem necessidade de contato prévio.',
    },
    { tipo: 'subtitulo', texto: '6. Seus direitos (LGPD, art. 18)' },
    { tipo: 'paragrafo', texto: 'Você pode, a qualquer momento:' },
    {
      tipo: 'lista',
      itens: [
        'Confirmar a existência e acessar os dados que temos sobre você;',
        'Corrigir dados incompletos, inexatos ou desatualizados (editando-os diretamente no app);',
        'Solicitar a exclusão de dados desnecessários ou excessivos;',
        'Excluir sua conta e todos os dados associados, pelo próprio app ou pelo e-mail de contato acima;',
        'Solicitar informações sobre com quem seus dados são compartilhados.',
      ],
    },
    { tipo: 'subtitulo', texto: '7. Segurança' },
    {
      tipo: 'paragrafo',
      texto:
        'O acesso aos seus dados no banco é restrito por políticas de Row Level Security — cada conta só enxerga os próprios dados, mesmo internamente. No aparelho, a sessão de login é armazenada de forma criptografada, e capturas de tela são bloqueadas nas telas com informação financeira.',
    },
    { tipo: 'subtitulo', texto: '8. Crianças e adolescentes' },
    {
      tipo: 'paragrafo',
      texto: 'O Grana. não é direcionado a menores de 18 anos e não coleta intencionalmente dados de crianças.',
    },
    { tipo: 'subtitulo', texto: '9. Alterações desta política' },
    {
      tipo: 'paragrafo',
      texto:
        'Podemos atualizar este documento quando o app ganhar novas funcionalidades que envolvam dados pessoais. A data no topo desta página sempre reflete a versão vigente.',
    },
    { tipo: 'subtitulo', texto: '10. Contato' },
    { tipo: 'paragrafo', texto: `Para qualquer solicitação relacionada aos seus dados pessoais: ${EMAIL_CONTATO}.` },
  ],
};

export const TERMOS_DE_SERVICO: DocumentoLegal = {
  titulo: 'Termos de Serviço',
  atualizadoEm: '17 de agosto de 2026',
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Estes Termos regem o uso do Grana., um aplicativo de controle financeiro pessoal. Ao criar uma conta ou usar o aplicativo, você concorda com o que está descrito aqui. Para saber quais dados coletamos e como os tratamos, veja também a nossa [Política de Privacidade](/privacidade).',
    },
    { tipo: 'subtitulo', texto: '1. O que é o Grana.' },
    {
      tipo: 'paragrafo',
      texto:
        'O Grana. é uma ferramenta de organização financeira pessoal: registro de lançamentos, contas a pagar, orçamentos por categoria e um diagnóstico gerado a partir desses dados. O aplicativo não é uma instituição financeira, não movimenta dinheiro de verdade, não processa pagamentos e não oferece consultoria de investimentos. Tudo que ele mostra é um reflexo do que você mesmo registra — a exatidão dos números depende do que é informado.',
    },
    { tipo: 'subtitulo', texto: '2. Sua conta' },
    {
      tipo: 'lista',
      itens: [
        'Você precisa ter 18 anos ou mais para usar o Grana.',
        'Você é responsável por manter sua senha em sigilo e por tudo que acontecer na sua conta.',
        'As informações fornecidas (e-mail, nome) devem ser verdadeiras.',
        'Você pode excluir sua conta a qualquer momento, direto no app (Perfil → Excluir conta) — isso apaga permanentemente seus dados, de forma irreversível.',
      ],
    },
    { tipo: 'subtitulo', texto: '3. Uso aceitável' },
    { tipo: 'paragrafo', texto: 'Ao usar o Grana., você concorda em não:' },
    {
      tipo: 'lista',
      itens: [
        'Tentar acessar dados de outras contas ou burlar as proteções do aplicativo;',
        'Usar o canal de lançamento por WhatsApp para enviar conteúdo abusivo, spam ou tentar sobrecarregar o serviço;',
        'Usar o aplicativo para qualquer finalidade ilegal.',
      ],
    },
    { tipo: 'paragrafo', texto: 'Contas que violem isso podem ser suspensas ou encerradas.' },
    { tipo: 'subtitulo', texto: '4. Recursos que dependem de terceiros' },
    {
      tipo: 'paragrafo',
      texto:
        'Alguns recursos (lançamento por WhatsApp e transcrição de áudio) dependem de serviços de terceiros — Meta (WhatsApp Cloud API), OpenAI e Groq (Whisper). Interrupções, mudanças de política ou indisponibilidade desses serviços podem afetar esses recursos específicos sem que isso dependa de nós.',
    },
    { tipo: 'subtitulo', texto: '5. Planos pagos e assinatura' },
    {
      tipo: 'paragrafo',
      texto:
        'Quando o Grana. oferecer um plano pago, a cobrança é processada por um parceiro de pagamento (atualmente Kiwify) — não diretamente por nós. As condições de cobrança, renovação, período de acesso e cancelamento válidas são as apresentadas na página de compra no momento da assinatura. Cancelamento, reembolso ou contestação de cobrança são tratados pelo parceiro de pagamento conforme a política dele; o acesso ao app é ajustado automaticamente a partir dessas notificações.',
    },
    { tipo: 'subtitulo', texto: '6. Sem garantias' },
    {
      tipo: 'paragrafo',
      texto:
        'O Grana. é fornecido "como está". Fazemos o possível para manter o serviço no ar e os dados corretos, mas não garantimos disponibilidade contínua nem ausência total de erros — inclusive nas heurísticas automáticas de categorização e leitura de valores (por texto, voz ou WhatsApp), que são estimativas e podem errar. Revise os lançamentos importantes antes de tomar decisões financeiras com base neles.',
    },
    { tipo: 'subtitulo', texto: '7. Limitação de responsabilidade' },
    {
      tipo: 'paragrafo',
      texto:
        'Na máxima medida permitida por lei, o Grana. não se responsabiliza por decisões financeiras tomadas com base nas informações do aplicativo, nem por perdas indiretas decorrentes do uso ou da indisponibilidade do serviço.',
    },
    { tipo: 'subtitulo', texto: '8. Alterações' },
    {
      tipo: 'paragrafo',
      texto: 'Podemos atualizar estes Termos quando o aplicativo mudar de forma relevante. A data no topo desta página sempre reflete a versão vigente.',
    },
    { tipo: 'subtitulo', texto: '9. Contato' },
    { tipo: 'paragrafo', texto: `Dúvidas sobre estes Termos: ${EMAIL_CONTATO}.` },
  ],
};

export const EXCLUSAO_DE_DADOS: DocumentoLegal = {
  titulo: 'Como excluir seus dados do Grana.',
  atualizadoEm: '17 de agosto de 2026',
  blocos: [
    {
      tipo: 'paragrafo',
      texto: 'Você pode excluir permanentemente sua conta e todos os dados associados a ela a qualquer momento, de duas formas.',
    },
    { tipo: 'subtitulo', texto: 'Opção 1 — Direto no aplicativo (recomendado)' },
    {
      tipo: 'passos',
      itens: [
        'Abra o Grana. e entre na sua conta;',
        'Vá em Perfil;',
        'Toque em Excluir conta;',
        'Confirme sua senha quando solicitado.',
      ],
    },
    { tipo: 'paragrafo', texto: 'A exclusão é imediata e definitiva. Não é possível desfazer.' },
    { tipo: 'subtitulo', texto: 'Opção 2 — Por e-mail' },
    {
      tipo: 'paragrafo',
      texto: `Se você não tiver mais acesso ao aplicativo, envie um e-mail para ${EMAIL_CONTATO} a partir do endereço cadastrado na sua conta, pedindo a exclusão. Vamos confirmar sua identidade e excluir os dados em até 15 dias.`,
    },
    { tipo: 'subtitulo', texto: 'O que é excluído' },
    {
      tipo: 'lista',
      itens: [
        'Sua conta de login (e-mail e senha);',
        'Todos os lançamentos, contas a pagar, orçamentos e categorias personalizadas;',
        'Foto de perfil e nome de exibição;',
        'Vínculo com o WhatsApp, se houver;',
        'Vínculo com sua assinatura, se houver — o registro da compra em si permanece com o parceiro de pagamento, fora do nosso controle.',
      ],
    },
    {
      tipo: 'paragrafo',
      texto: `Nada fica retido após a exclusão — não mantemos cópias de backup dos dados apagados. Mais detalhes sobre quais dados coletamos e por quê estão na nossa [Política de Privacidade](/privacidade).`,
    },
  ],
};
