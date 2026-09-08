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

    // Feedback é deliberadamente preservado para análise do produto, mas sem
    // continuar associado a uma pessoa que não existe mais.
    const { error: feedbackError } = await admin
      .from('feedbacks')
      .update({ user_id: null })
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
