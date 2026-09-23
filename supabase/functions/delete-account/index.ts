import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const AVATAR_BUCKET = 'avatars';
const REAUTH_WINDOW_MS = 10 * 60 * 1000;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function bearer(req: Request): string | null {
  const value = req.headers.get('authorization') ?? '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function removerArquivosDoUsuario(userId: string): Promise<void> {
  const { data: objects, error: listError } = await admin.storage
    .from(AVATAR_BUCKET)
    .list(userId, { limit: 1000 });
  if (listError) throw Object.assign(new Error('Falha ao listar arquivos da conta'), { cause: listError });

  const paths = (objects ?? [])
    .filter((object) => !!object.name)
    .map((object) => `${userId}/${object.name}`);

  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await admin.storage
      .from(AVATAR_BUCKET)
      .remove(paths.slice(i, i + 100));
    if (removeError) throw Object.assign(new Error('Falha ao remover arquivos da conta'), { cause: removeError });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[delete-account] configuração obrigatória ausente');
    return json({ error: 'not_configured' }, 500);
  }

  const token = bearer(req);
  if (!token) return json({ error: 'unauthorized' }, 401);

  const { data: userData, error: authError } = await admin.auth.getUser(token);
  const user = userData.user;
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  const ultimoLogin = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  if (!Number.isFinite(ultimoLogin) || Date.now() - ultimoLogin > REAUTH_WINDOW_MS || ultimoLogin > Date.now() + 30_000) {
    return json({ error: 'reauthentication_required' }, 428);
  }

  try {
    // Storage não participa da cascata do Auth. Remova primeiro; se falhar,
    // preservamos a conta inteira para não prometer uma exclusão parcial.
    await removerArquivosDoUsuario(user.id);

    /* Feedback é deliberadamente preservado, por decisão do autor em
       23/09/2026: "precisamos manter os feedbacks para ajustes do aplicativo e
       geração de prova social". O que permite guardá-lo depois da exclusão é a
       ANONIMIZAÇÃO: a LGPD (art. 12) tira o dado anonimizado do alcance da
       lei. Por isso a limpeza vai além de desligar o vínculo:

       - `user_id`: some, e com ele qualquer atribuição a uma pessoa;
       - `screenshot_url`: um print do app financeiro mostra valores e, muitas
         vezes, nome e e-mail na própria interface — anular o vínculo não
         anonimizaria a imagem. Nada no app preenche esse campo hoje (nenhuma
         tela anexa print, e não existe bucket para isso), então aqui a coluna
         só é zerada. ATENÇÃO para quem for implementar o anexo de print: a
         imagem em si precisará ser APAGADA do Storage neste mesmo ponto —
         zerar a coluna deixaria o arquivo vivo e a anonimização seria falsa;
       - `device_info`: guardava nome do aparelho ("iPhone da Maria"), que é
         quase-identificador. Fica só a plataforma, que já está em `platform`.

       O que fica: tipo, nota, mensagem, versão do app e data. É o que serve
       para melhorar o produto, e nada disso aponta para alguém.

       A mensagem é texto livre e pode conter dado pessoal escrito pela própria
       pessoa. Não dá para apagar isso automaticamente sem destruir o conteúdo,
       então a política declara a retenção e o uso público identificado exige a
       autorização de `public_use_consent`. */
    const { error: feedbackError } = await admin
      .from('feedbacks')
      .update({ user_id: null, screenshot_url: null, device_info: null })
      .eq('user_id', user.id);
    if (feedbackError) throw Object.assign(new Error('Falha ao anonimizar feedbacks'), { cause: feedbackError });

    // As tabelas do produto referenciam auth.users com ON DELETE CASCADE. A
    // remoção administrativa é a única etapa que encerra também o login,
    // diferente de apagar apenas as linhas visíveis ao cliente.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw Object.assign(new Error('Falha ao encerrar a conta'), { cause: deleteError });

    return json({ complete: true });
  } catch (error) {
    console.error('[delete-account] exclusão incompleta', {
      userId: user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: 'deletion_failed' }, 500);
  }
});
