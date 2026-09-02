import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:'));
const html = fs.readFileSync(path.join(dir, 'relatorio-auditoria-seguranca.html'), 'utf8');
const sections = [...html.matchAll(/<section class="page">[\s\S]*?<\/section>/g)].map((m) => m[0]);
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-audit-pages-'));
for (let i = 0; i < sections.length; i++) {
  const one = html.replace(/<main>[\s\S]*?<\/main>/, `<main>${sections[i]}</main>`);
  const source = path.join(temp, `page-${i + 1}.html`);
  const image = path.join(dir, `render-page-${String(i + 1).padStart(2, '0')}.png`);
  fs.writeFileSync(source, one, 'utf8');
  const profile = path.join(temp, `profile-${i + 1}`);
  fs.mkdirSync(profile);
  spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--window-size=1200,1800', `--user-data-dir=${profile}`, `--screenshot=${image}`, `file:///${source.replaceAll('\\', '/')}`], { timeout: 120000, windowsHide: true, stdio: 'ignore' });
}
console.log(`Renderizadas ${sections.length} páginas para inspeção visual.`);
