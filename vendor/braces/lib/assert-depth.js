'use strict';

// Grana.: depth guard for GHSA-vfj7-8cjw-p6xm (CVE-2026-93687), same approach as
// micromatch/braces PR #88. Walks the AST iteratively (no recursion) and rejects
// trees deeper than MAX_DEPTH or with cycles before the recursive walkers run.
const { MAX_DEPTH } = require('./constants');

module.exports = ast => {
  const pending = [[ast, 0, false]];
  const seen = new WeakSet();
  while (pending.length) {
    const [node, depth, exit] = pending.pop();
    if (exit) { seen.delete(node); continue; }
    if (depth > MAX_DEPTH) throw new SyntaxError(`Brace AST exceeds safe depth of ${MAX_DEPTH}`);
    if (!node || typeof node !== 'object') continue;
    if (seen.has(node)) throw new SyntaxError('Brace AST must be an acyclic tree');
    seen.add(node);
    pending.push([node, depth, true]);
    if (node.nodes) for (const child of node.nodes) pending.push([child, depth + 1, false]);
  }
};
