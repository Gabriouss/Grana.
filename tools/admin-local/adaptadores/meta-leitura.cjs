'use strict';
// Resultados de marketing / leitura Meta (E4, dono da tela: Lumen; contrato: Harbor, admin-meta).
//
// Devolve o MESMO DTO da Edge Function admin-meta ({ periodos, meta, cakto, medicaoPropria }), calculado
// aqui com os mesmos limites de período (supabase/functions/_shared/admin-meta.ts, periodosMeta).
//
// Este adaptador NÃO chama a Meta nem a Cakto, e não escreve em lugar nenhum:
//  - sem META_READ_ACCESS_TOKEN, META_AD_ACCOUNT_ID e META_GRAPH_API_VERSION no .env: "Não configurado",
//    com os nomes que faltam (só nomes, nunca valores);
//  - com as três: "Indisponível, leitura ainda não ligada ao painel local". A Edge Function exige o
//    login admin do Supabase (aal2), que este servidor não tem; ligar as duas pontas é decisão aberta
//    (ver PENDENCIAS-DO-AUTOR-META.md). Nada vira zero: toda métrica sem prova fica null.
// Totais Cakto ficam null/Parcial até existir prova de completude do ledger (parecer do Beacon).

const { tem } = require('../config.cjs');

const FUSO = 'America/Sao_Paulo';
const CONFIG = ['META_READ_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_API_VERSION'];
const DIA = 86_400_000;

function periodosMeta(agora = new Date()) {
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const base = Date.parse(`${hoje}T00:00:00Z`);
  const dia = (n) => new Date(base + n * DIA).toISOString().slice(0, 10);
  return {
    fuso: FUSO,
    atual: { desde: dia(-30), ateExclusivo: hoje, ateInclusivo: dia(-1), parcial: false },
    anterior: { desde: dia(-60), ateExclusivo: dia(-30), ateInclusivo: dia(-31), parcial: false },
    hoje: { desde: hoje, ateExclusivo: dia(1), ateInclusivo: hoje, parcial: true },
  };
}

function ler({ incluirHoje = false, agora = new Date() } = {}) {
  const periodos = periodosMeta(agora);
  const faltantes = CONFIG.filter((k) => !tem(k));
  const cakto = { estado: 'indisponivel', motivo: 'cobertura-nao-comprovada', novasAssinaturas: null, receitaConfirmadaCentavos: null, reembolsosCentavos: null };
  const medicaoPropria = { estado: 'nao-configurado', coberturaAtribuicao: null };
  const meta = faltantes.length
    ? { estado: 'nao-configurado', rotulo: 'Não configurado', faltantes, atualizadoEm: null, campanhas: null, investimentoCentavos: null }
    : { estado: 'indisponivel', motivo: 'leitura-nao-ligada-ao-painel-local', atualizadoEm: null, campanhas: null, investimentoCentavos: null };
  return {
    fonte: 'painel-local', demonstracao: false, incluirHoje: incluirHoje === true,
    periodos: { ...periodos, hoje: incluirHoje === true ? periodos.hoje : null },
    meta, cakto, medicaoPropria,
  };
}

module.exports = { ler, periodosMeta, CONFIG };
