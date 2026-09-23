/**
 * O link do checkout, já com o e-mail de quem está comprando.
 *
 * ── Por que existe ─────────────────────────────────────────────────────────
 *
 * O vínculo entre a compra e a conta é feito pelo E-MAIL: o webhook da Cakto
 * chega com o e-mail do comprador e procura a conta correspondente. Até
 * 23/09/2026 o app mandava para o checkout quem já estava logado, sem levar
 * nada e sem dizer nada — bastava digitar outro e-mail, o que é comum quando o
 * navegador preenche sozinho o endereço pessoal, para a compra não encontrar
 * conta nenhuma. A pessoa paga, volta ao app e continua no paywall; o conserto
 * depende de um token que a auditoria de 22/09/2026 já achou inalcançável
 * (`app/ativar.tsx`). É o achado C5.
 *
 * ── O contrato ─────────────────────────────────────────────────────────────
 *
 * Os nomes dos parâmetros são os da documentação da Cakto (conferida em
 * 23/09/2026): `name`, `email`, `confirmEmail`, `cpf`, `phone` e `coupon`.
 * Aqui só o par de e-mail interessa — é o que decide o vínculo. O checkout
 * deixa a pessoa corrigir o campo, então isto é preenchimento, não trava; o
 * aviso na tela continua sendo necessário.
 *
 * A URL pode já vir com parâmetros (atribuição de anúncio, cupom), por isso
 * ela é montada com `URL` em vez de concatenada na mão. E-mail tem `@` e
 * pode ter `+`, que numa concatenação viraria espaço do outro lado.
 */
export function checkoutComEmail(url: string, email: string | null | undefined): string {
  if (!email) return url;
  try {
    const destino = new URL(url);
    /* Não sobrescreve o que já veio na URL configurada: se alguém montou um
       link com e-mail fixo, a intenção era essa. */
    if (!destino.searchParams.has('email')) destino.searchParams.set('email', email);
    if (!destino.searchParams.has('confirmEmail')) destino.searchParams.set('confirmEmail', email);
    return destino.toString();
  } catch {
    /* URL que o `URL` não entende não vira erro na cara de quem ia comprar: o
       pior desfecho aqui é não conseguir pagar. Segue o link como está. */
    return url;
  }
}
