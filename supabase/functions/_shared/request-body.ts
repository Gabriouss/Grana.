// Limita bytes recebidos ANTES de texto/JSON/multipart. Nunca registra o corpo.
// O prazo abrange toda a leitura; cancelar o stream nao pode bloquear a resposta.
export type CorpoLimitado =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; status: 400 | 408 | 413 };

export async function lerCorpoLimitado(
  req: Request, maxBytes: number, prazoMs = 15_000,
): Promise<CorpoLimitado> {
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) {
    void req.body?.cancel().catch(() => {});
    return { ok: false, status: 413 };
  }
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expirou = false;
  const cancelar = () => { void reader.cancel().catch(() => {}); };
  const vencido = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expirou = true; reject(new Error('body_timeout')); }, prazoMs);
  });
  async function ler(): Promise<CorpoLimitado> {
    // Um buffer limitado evita overhead ilimitado com muitos chunks pequenos.
    const buffer = new Uint8Array(maxBytes);
    let tamanho = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > maxBytes) {
        cancelar();
        return { ok: false, status: 413 };
      }
      buffer.set(value, tamanho - value.byteLength);
    }
    return { ok: true, bytes: buffer.slice(0, tamanho) };
  }
  try {
    // Uma corrida para a leitura inteira: nao acumula um listener de timeout
    // por chunk quando o remetente fragmenta o corpo em pedacos pequenos.
    return await Promise.race([ler(), vencido]);
  } catch {
    cancelar();
    // A mensagem da excecao nunca atravessa a fronteira do request.
    console.warn('[request-body] leitura recusada', { status: expirou ? 408 : 400 });
    return { ok: false, status: expirou ? 408 : 400 };
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
