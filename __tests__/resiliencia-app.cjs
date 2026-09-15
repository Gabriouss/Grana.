const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'app', '_layout.tsx'), 'utf8');
const notFound = fs.readFileSync(path.join(root, 'app', '+not-found.tsx'), 'utf8');

assert.match(layout, /export function ErrorBoundary\(\{ error, retry \}: ErrorBoundaryProps\)/);
assert.match(layout, /console\.error\('\[erro-global\]'/);
assert.match(layout, /onPress=\{\(\) => void retry\(\)\}/);
assert.match(notFound, /export default function NotFound\(\)/);
assert.match(notFound, /router\.replace\('\/'\)/);
assert.match(notFound, /Ir para o início/);

console.log('resiliencia-app: 6 verificacoes OK');
