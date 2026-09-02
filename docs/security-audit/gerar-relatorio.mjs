import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:'));
const dataPath = path.join(here, 'dados-auditoria.json');
const htmlPath = path.join(here, 'relatorio-auditoria-seguranca.html');
const pdfPath = path.join(here, 'relatorio-auditoria-seguranca.pdf');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const severityClass = (severity) => severity === 'ALTA' ? 'alta' : severity === 'MÉDIA' ? 'media' : 'baixa';
const findingCard = (f) => `
  <article class="finding ${severityClass(f.severity)}">
    <div class="finding-head"><span class="finding-id">${esc(f.id)}</span><span class="badge">${esc(f.severity)}</span><span class="confidence">${esc(f.confidence)}</span></div>
    <h3>${esc(f.title)}</h3>
    <p class="status">${esc(f.status)}</p>
    <p><strong>Impacto.</strong> ${esc(f.impact)}</p>
    <p><strong>Evidência.</strong> ${f.evidence.map(esc).join(' · ')}</p>
    <p class="fix"><strong>Correção.</strong> ${esc(f.fix)}</p>
  </article>`;

const matrix = data.findings.map((f) => `<tr><td>${esc(f.id)}</td><td>${esc(f.title)}</td><td><span class="badge ${severityClass(f.severity)}">${esc(f.severity)}</span></td><td>${esc(f.confidence)}</td></tr>`).join('');
const controls = data.controls.map((x) => `<li>${esc(x)}</li>`).join('');
const limitations = data.limitations.map((x) => `<li>${esc(x)}</li>`).join('');
const sources = data.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('');

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Auditoria de segurança — Grana.</title>
<style>
@page{size:A4;margin:14mm 15mm 16mm}*{box-sizing:border-box}html{background:#e8efed}body{margin:0;background:#fff;color:#092b31;font-family:Arial,"Segoe UI",sans-serif;font-size:10.2pt;line-height:1.42}main{max-width:900px;margin:0 auto}.page{min-height:266mm;break-after:page;padding:2mm 0}.page:last-child{break-after:auto}.kicker{font-size:8pt;letter-spacing:2px;text-transform:uppercase;color:#0d7a63;font-weight:700}.brand{font-size:36pt;letter-spacing:-2px;font-weight:300;margin:18mm 0 4mm}.brand span{color:#35b995}.rule{height:3px;background:#0d7a63;width:100%;margin:7mm 0 10mm}.meta{color:#647875;font-size:9pt}.lead{font-size:16pt;line-height:1.25;max-width:620px;margin:13mm 0 9mm}.callout{border:1px solid #b9d7cd;border-left:5px solid #0d7a63;background:#f1f8f5;border-radius:8px;padding:11px 14px;margin:7mm 0}.callout strong{color:#0b5549}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:9mm 0}.metric{border:1px solid #d6e2df;border-radius:8px;padding:10px}.metric .num{display:block;font-size:22pt;font-weight:700;color:#0d7a63}.metric .label{font-size:8pt;text-transform:uppercase;letter-spacing:.7px;color:#647875}.section-title{font-size:19pt;letter-spacing:-.5px;margin:0 0 6mm}.section-sub{font-size:9pt;color:#647875;margin-top:-3mm;margin-bottom:7mm}h3{font-size:13pt;line-height:1.2;margin:3mm 0 2mm}p{margin:2.5mm 0}.finding{border:1px solid #d6e2df;border-left:4px solid #91aaa4;border-radius:7px;padding:8px 11px;margin:0 0 5mm;break-inside:avoid}.finding.alta{border-left-color:#a8443c}.finding.media{border-left-color:#bf8d2f}.finding.baixa{border-left-color:#0d7a63}.finding-head{display:flex;align-items:center;gap:7px;font-size:8pt}.finding-id{font-weight:700;color:#0b5549;letter-spacing:.5px}.badge{display:inline-block;border-radius:99px;padding:2px 7px;background:#dfe9e6;color:#254640;font-size:7.5pt;font-weight:700;letter-spacing:.5px}.badge.alta{background:#f6dfdd;color:#8c302a}.badge.media{background:#f8edd0;color:#805d12}.badge.baixa{background:#dcf1e8;color:#0d654f}.confidence{color:#647875;margin-left:auto}.status{font-size:8.5pt;color:#647875;font-style:italic}.fix{background:#f7fbfa;border-radius:5px;padding:6px 8px}.finding strong{color:#0b5549}table{width:100%;border-collapse:collapse;font-size:8.6pt}th{text-align:left;text-transform:uppercase;letter-spacing:.7px;font-size:7.5pt;color:#647875;border-bottom:1px solid #aebfbb;padding:6px}td{border-bottom:1px solid #e5eeeb;padding:7px 6px;vertical-align:top}ul{padding-left:19px;margin:4mm 0}li{margin:2.3mm 0}a{color:#0d7a63;text-decoration:none}.two{display:grid;grid-template-columns:1fr 1fr;gap:14mm}.small{font-size:8.5pt;color:#647875}.pill{display:inline-block;border:1px solid #b9d7cd;border-radius:99px;padding:3px 8px;color:#0d7a63;font-size:8pt;margin:2px 2px 2px 0}.footer{border-top:1px solid #d6e2df;margin-top:10mm;padding-top:4mm;color:#647875;font-size:7.5pt;display:flex;justify-content:space-between}.no-break{break-inside:avoid}
</style></head><body><main>
<section class="page"><div class="kicker">Relatório confidencial · revisão de código</div><div class="brand">Grana<span>.</span></div><div class="rule"></div><div class="meta">Auditoria de segurança · ${esc(data.date)} · ${esc(data.timezone)}<br>Commit analisado: <code>${esc(data.commit)}</code></div><p class="lead">Cinco riscos de segurança e integridade encontrados na superfície Supabase/Expo, com evidência rastreável e correção recomendada.</p><div class="callout"><strong>Veredito.</strong> O isolamento por locatário, RLS e os handlers privilegiados apresentam boas barreiras no código atual. Os bloqueadores desta rodada estão em credenciais de webhook, tokens de ativação no cliente, garantia de reautenticação para exclusão e confiança excessiva em estado de gamificação.</div><div class="grid"><div class="metric"><span class="num">${data.summary.findings}</span><span class="label">achados</span></div><div class="metric"><span class="num">${data.summary.high}</span><span class="label">alta</span></div><div class="metric"><span class="num">${data.summary.medium}</span><span class="label">média</span></div><div class="metric"><span class="num">0</span><span class="label">XSS confirmado</span></div></div><p class="small">Escopo: ${data.scope.map(esc).join(' · ')}.</p><div class="footer"><span>Grana. · auditoria interna</span><span>01</span></div></section>

<section class="page"><div class="kicker">01 · método e cobertura</div><h2 class="section-title">O que foi verificado</h2><p class="section-sub">Revisão somente leitura do repositório local; nenhum build, deploy, migração ou escrita em produção foi disparado.</p><div class="grid"><div class="metric"><span class="num">${data.execution.files_reviewed}</span><span class="label">arquivos</span></div><div class="metric"><span class="num">${data.execution.edge_functions}</span><span class="label">Edge Functions</span></div><div class="metric"><span class="num">${data.execution.rls_tables}</span><span class="label">tabelas com RLS</span></div><div class="metric"><span class="num">0</span><span class="label">testes mutáveis</span></div></div><div class="two"><div><h3>Critérios</h3><ul><li>Tenant isolation: auth.uid(), USING, WITH CHECK, FKs compostas e joins.</li><li>Autorização: gates da UI comparados com RPCs/Edge Functions.</li><li>IDOR: todos os parâmetros UUID/telefone/evento rastreados até o filtro de dono.</li><li>Segredos: fontes atuais, histórico Git e bundle dist escaneados sem imprimir valores.</li><li>XSS: HTML, CSS inline, document.write, SVG e templates de relatório.</li></ul></div><div><h3>Resultado por categoria</h3><p><span class="pill">Tenant: sem brecha confirmada</span><span class="pill">IDOR: sem brecha confirmada</span><span class="pill">XSS: sem XSS confirmado</span><span class="pill">Integridade: 1 risco</span></p><div class="callout"><strong>Nota de confiança.</strong> F-001 e F-004 dependem de estado externo que não está versionado. Eles são riscos de garantia/control-plane, não alegações de exploração confirmada em produção.</div></div></div><div class="footer"><span>Base técnica: schema.sql, app/, lib/, supabase/functions/</span><span>02</span></div></section>

<section class="page"><div class="kicker">02 · matriz de achados</div><h2 class="section-title">Prioridade de correção</h2><p class="section-sub">A severidade considera impacto, facilidade e dependências externas; a confiança separa prova no código de hipótese condicional.</p><table><thead><tr><th>ID</th><th>Achado</th><th>Severidade</th><th>Confiança</th></tr></thead><tbody>${matrix}</tbody></table><h3 style="margin-top:12mm">Leitura executiva</h3><div class="callout"><strong>Primeiro:</strong> retire o bearer da URL/corpo da Kiwify e faça a função de exclusão existir em código versionado com step-up server-side. <strong>Depois:</strong> elimine o token de ativação do armazenamento persistente cru, imponha e-mail confirmado no vínculo automático e torne conquistas somente leitura para o cliente.</div><h3>Controles positivos</h3><ul>${controls}</ul><div class="footer"><span>Achados detalhados nas páginas seguintes</span><span>03</span></div></section>

<section class="page"><div class="kicker">03 · achados críticos e de credencial</div><h2 class="section-title">Riscos que atravessam a fronteira de confiança</h2>${findingCard(data.findings[0])}${findingCard(data.findings[1])}${findingCard(data.findings[2])}<div class="footer"><span>Remediações propostas em cada cartão</span><span>04</span></div></section>

<section class="page"><div class="kicker">04 · autorização e integridade</div><h2 class="section-title">Riscos condicionais e de estado</h2>${findingCard(data.findings[3])}${findingCard(data.findings[4])}<h3 style="margin-top:10mm">Limitações e próximos testes</h3><ul>${limitations}</ul><div class="footer"><span>Não substitui teste autorizado em staging/produção</span><span>05</span></div></section>

<section class="page"><div class="kicker">05 · plano de ação e fontes</div><h2 class="section-title">Fechamento</h2><div class="callout"><strong>Sequência sugerida em staging:</strong> (1) HMAC/header-only e rotação da Kiwify; (2) Edge Function de exclusão com step-up; (3) SecureStore/sessionStorage e limpeza de tokens; (4) confirmação de e-mail no RPC; (5) RPC de conquistas com allowlist; (6) testes negativos RLS/IDOR com dois usuários.</div><h3>Controles que devem permanecer</h3><ul>${controls}</ul><h3>Fontes primárias</h3><ul>${sources}</ul><p class="small">O bundle dist contém somente JWTs com claim de role <code>anon</code> e a chave pública correspondente ao projeto; valores foram omitidos deste documento. Nenhum token PAT fornecido para operações Supabase foi usado ou reproduzido no relatório.</p><div class="footer"><span>Gerado a partir de dados-auditoria.json</span><span>06</span></div></section>
</main></body></html>`;

fs.writeFileSync(htmlPath, html, 'utf8');

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browser = edgeCandidates.find((p) => fs.existsSync(p));
if (!browser) throw new Error('Microsoft Edge/Chrome não encontrado para gerar o PDF.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-audit-pdf-'));
const result = spawnSync(browser, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--no-pdf-header-footer', `--user-data-dir=${profile}`, `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replaceAll('\\', '/')}`
], { encoding: 'utf8', timeout: 120000, windowsHide: true });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
if (result.error) throw result.error;
if (result.status !== 0 || !fs.existsSync(pdfPath)) {
  throw new Error(`Navegador não gerou PDF (status ${result.status}): ${result.stderr || result.stdout || 'sem saída'}`);
}
console.log(`PDF criado: ${pdfPath}`);
