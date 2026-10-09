'use strict';
// Ponte da fila de ajustes da M1 com a tabela remota (admin_ajuste_pedidos), onde o
// painel web cria pedidos. Quem entrega ao agente continua sendo a fila LOCAL: o vigia
// importa os pedidos remotos novos para ela e espelha de volta cada mudanca de estado,
// para o painel web mostrar o andamento.
//
// Credencial: SUPABASE_SERVICE_ROLE_KEY do .env, lida no processo e so mandada ao
// proprio projeto. Sem ela a ponte fica "ausente" com motivo visivel, e a fila local
// segue funcionando. O texto do autor so trafega na importacao, nunca em log.

const PRAZO_MS = 10_000;
const CAMPOS = 'id,peca_id,caminho,versao_alvo,texto_original,criado_em';

function criarRemoto({ url, chave, fetch: fazer = fetch, agora = () => new Date().toISOString() }) {
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`;
  const cab = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };
  async function pedir(caminho, init = {}) {
    let r;
    try { r = await fazer(base + caminho, { ...init, headers: { ...cab, ...(init.headers || {}) }, signal: AbortSignal.timeout(PRAZO_MS) }); }
    catch { throw Object.assign(new Error('remoto-sem-resposta'), { codigo: 'remoto-sem-resposta' }); }
    // Nunca o corpo do erro: ele pode repetir dado do pedido.
    if (!r.ok) throw Object.assign(new Error('remoto-http'), { codigo: 'remoto-http', status: r.status });
    return r.status === 204 ? null : r.json().catch(() => null);
  }
  const evento = (pedidoId, estado, codigo) => pedir('/admin_ajuste_eventos', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pedido_id: pedidoId, estado, codigo }),
  });
  return {
    async novos() {
      const lista = await pedir(`/admin_ajuste_pedidos?select=${CAMPOS}&estado=eq.novo&importado_em=is.null&order=criado_em.asc&limit=20`);
      if (!Array.isArray(lista)) throw Object.assign(new Error('remoto-formato'), { codigo: 'remoto-formato' });
      return lista;
    },
    // So marca o que ainda nao estava marcado; repetir e inofensivo.
    async marcarImportado(id) {
      await pedir(`/admin_ajuste_pedidos?id=eq.${encodeURIComponent(id)}&importado_em=is.null`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ importado_em: agora() }),
      });
      await evento(id, 'novo', 'importado-m1');
    },
    // Espelha o estado local. As constraints da tabela exigem lease completo so em
    // correcao e aceite igual a versao corrigida; o formato aqui segue as duas.
    async refletir(r) {
      const lease = r.estado === 'em-correcao' && r.lease ? r.lease : null;
      const corpo = {
        estado: r.estado,
        tentativas: Math.min(10, Math.max(0, r.tentativas | 0)),
        lease_id: lease ? lease.id : null, lease_agente: lease ? lease.agente : null,
        lease_inicio: lease ? lease.inicio || agora() : null, lease_expira_em: lease ? lease.expiraEm : null,
        versao_corrigida: r.versaoCorrigida || null, commit_correcao: r.commit || null,
        aceite_versao: r.estado === 'aceito' && r.aceite ? r.aceite.versao : null,
        aceite_em: r.estado === 'aceito' && r.aceite ? r.aceite.em : null,
      };
      try {
        await pedir(`/admin_ajuste_pedidos?id=eq.${encodeURIComponent(r.remotoId)}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(corpo),
        });
        await evento(r.remotoId, r.estado, 'espelho-m1');
      } catch (e) {
        // Only a fixed code, never the provider body/message or request text.
        const codigo = e.codigo === 'remoto-http' && [400, 409, 422].includes(e.status) ? 'remoto-estado-recusado' : e.codigo;
        throw Object.assign(new Error(codigo), { codigo, status: e.status });
      }
    },
  };
}

// Le a configuracao do .env. Devolve { remoto } ou { ausente: motivo }.
function remotoDoEnv(cfg) {
  if (!cfg.tem('SUPABASE_SERVICE_ROLE_KEY')) return { ausente: 'SUPABASE_SERVICE_ROLE_KEY nao esta no .env; pedidos feitos no painel web nao chegam a esta fila.' };
  const url = cfg.ler('EXPO_PUBLIC_SUPABASE_URL');
  if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) return { ausente: 'EXPO_PUBLIC_SUPABASE_URL ausente ou fora do formato.' };
  return { remoto: criarRemoto({ url, chave: cfg.ler('SUPABASE_SERVICE_ROLE_KEY') }) };
}

module.exports = { criarRemoto, remotoDoEnv };
