const path = require('node:path');

// README de docs/marketing: publicação prevista, ou data local de produção.
const agora = new Date();
const pad = (n) => String(n).padStart(2, '0');
const data = process.env.GRANA_MARKETING_DATA || `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
const dia = new Date(`${data}T00:00:00Z`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== data) {
  throw new Error('GRANA_MARKETING_DATA deve ser uma data válida no formato AAAA-MM-DD.');
}
const segunda = new Date(dia);
segunda.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7));
const quinta = new Date(segunda);
quinta.setUTCDate(segunda.getUTCDate() + 3);
const domingo = new Date(segunda);
domingo.setUTCDate(segunda.getUTCDate() + 6);
const numero = Math.ceil(((quinta - Date.UTC(quinta.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
const iso = (d) => d.toISOString().slice(0, 10);
const semana = `semana-${pad(numero)}-${iso(segunda)}-a-${iso(domingo)}`;

module.exports = (estado, ...partes) => path.resolve(__dirname, '../docs/marketing', iso(quinta).slice(0, 7), semana, estado, ...partes);
