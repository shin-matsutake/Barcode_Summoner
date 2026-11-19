// import の漏れを見つける：①import した名前が、相手のファイルに実際にあるか ②他のファイルの関数を、import せずに使っていないか
// （ブラウザでしか気づけない「xxx is not defined」を、テストの時点で見つける）
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = new URL('../js/', import.meta.url).pathname;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const files = walk(root);
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
const src = Object.fromEntries(files.map(f => [f, strip(fs.readFileSync(f, 'utf8'))]));
const exportsOf = f => { const out = new Set(); for (const m of src[f].matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) out.add(m[1]); for (const m of src[f].matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); }); return out; };
const ex = Object.fromEntries(files.map(f => [f, exportsOf(f)]));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('import した名前は、相手のファイルに、ちゃんとある', () => {
  const raw = Object.fromEntries(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
  const bad = [];
  for (const f of files) for (const m of raw[f].matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^'?]+)(?:\?[^']*)?'/g)) {
    const target = path.resolve(path.dirname(f), m[2]);
    if (!ex[target]) { bad.push(`${path.relative(root, f)}: ${m[2]} が見つからない`); continue; }
    for (const name of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!ex[target].has(name)) bad.push(`${path.relative(root, f)}: ${m[2]} に ${name} がない`);
  }
  assert.deepEqual(bad, []);
});
t('他のファイルの関数を、import せずに使っていない', () => {
  const all = new Map();   // 名前 → それを export しているファイル
  for (const f of files) for (const name of ex[f]) { if (!all.has(name)) all.set(name, []); all.get(name).push(f); }
  const bad = [];
  for (const f of files) {
    const s = src[f], imported = new Set();
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/import\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => imported.add(x.trim().split(/\s+as\s+/).pop()));
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/import\s+\*\s+as\s+([\w$]+)|import\s+([\w$]+)\s+from/g)) imported.add(m[1] || m[2]);
    const declared = new Set([...s.matchAll(/(?:function\*?|const|let|var|class)\s+([\w$]+)/g)].map(m => m[1]));
    for (const m of s.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => declared.add(x.trim().split(/[:=\s]+/).pop()));
    for (const m of s.matchAll(/\(([^()]*)\)\s*(?:=>|\{)|([\w$]+)\s*=>/g)) (m[1] || m[2] || '').split(',').forEach(x => declared.add(x.trim().split(/[=\s]+/)[0].replace(/^\.\.\./, '')));
    for (const [name, from] of all) {
      if (from.includes(f) || imported.has(name) || declared.has(name) || name.length < 4) continue;
      if (new RegExp(`(^|[^.\\w$])${name.replace(/\$/g, '\\$')}\\s*\\(`).test(s)) bad.push(`${path.relative(root, f)}: ${name}() を import せずに使っている`);
    }
  }
  assert.deepEqual(bad, []);
});
console.log(`\n${n} tests passed`);
