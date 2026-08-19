/**
 * Tetos de entrada de texto, em um lugar só.
 *
 * Existem por dois motivos, e os dois importam para quem usa o app:
 *
 *  1. Sem limite, `description` e `category` são `text` livre no Postgres —
 *     dá para gravar megabytes por lançamento, inflando o banco e travando a
 *     renderização da lista no aparelho de quem tem a conta.
 *  2. O banco agora recusa valores acima destes limites (os `check` de
 *     char_length em supabase/schema.sql). Cortar no input evita que a pessoa
 *     digite um texto longo e só descubra que não cabe quando o salvamento
 *     falha com erro de constraint.
 *
 * Ou seja: estes números precisam bater com os do schema. Mudar um lado exige
 * mudar o outro.
 */
export const LIMITS = {
  /** transactions.description e bills.description */
  description: 200,
  /** transactions.category, bills.category, budgets.category */
  category: 60,
  /** Campo de valor monetário: "999.999.999,99" cabe em 14 caracteres. */
  amount: 14,
  /** E-mail — o RFC permite 254; não há motivo para aceitar mais. */
  email: 254,
  /** Senha. O piso está em MIN_PASSWORD; o teto evita payloads absurdos. */
  password: 128,
  /**
   * Texto colado no importador de comprovante e no de CSV. 200 KB dá conta de
   * um extrato anual com folga e ainda assim impede que colar um arquivo
   * gigante estoure a memória do aparelho.
   */
  pastedText: 200_000,
  /**
   * Máximo de linhas que uma importação de CSV cria de uma vez. O insert em
   * lote vai numa requisição só, então sem teto um arquivo grande vira uma
   * escrita em massa no banco e um array enorme em memória.
   */
  csvRows: 500,
  /** goals.title */
  goalTitle: 100,
  /** feedbacks.message */
  feedbackMessage: 2000,
};

/**
 * Mínimo de caracteres da senha no cadastro.
 *
 * Precisa ser igual ao "Minimum password length" configurado no painel do
 * Supabase (Authentication → Sign In / Providers → Email), hoje em 9. Se o
 * app aceitar menos que o servidor, a pessoa preenche o formulário inteiro,
 * passa na validação local e só toma o erro depois do round-trip — sem
 * entender o motivo, porque a mensagem vem do backend.
 */
export const MIN_PASSWORD = 9;

/**
 * Regra de senha do cadastro. Seis caracteres livres aceitavam `123456`, que é
 * a primeira tentativa de qualquer ataque de força bruta ou credential
 * stuffing. Exigimos comprimento maior e ao menos uma letra e um dígito —
 * suficiente para descartar as senhas de lista, sem virar aquele formulário
 * que obriga símbolo e maiúscula e empurra a pessoa para o post-it.
 *
 * Retorna a mensagem de erro, ou null se a senha passa.
 */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  }
  if (password.length > LIMITS.password) {
    return `A senha pode ter no máximo ${LIMITS.password} caracteres.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha precisa misturar letras e números.';
  }
  return null;
}
