// 저장된 수집본의 분야·등급을 현재 규칙(src/classify.mjs)으로 다시 매긴다.
// 사용: node tools/reclassify.mjs [--dry]
//
// 분류 규칙을 고치면 과거 주차도 같은 규칙으로 맞춰야 한다. 안 그러면 주차 간 비교가
// '규칙이 달라진 것'인지 '상황이 달라진 것'인지 구분되지 않는다.
// 제목만 보고 판정하므로 저장된 데이터만으로 재현된다 — 다시 수집할 필요가 없다.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../src/classify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const dir = join(root, 'data/collected');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

const UNIV = ['부산대', '경북대', '전남대', '전북대', '충남대', '충북대', '강원대', '경상국립대', '제주대', '서울대'];
const FIELD_KEYS = ['거버넌스', '재정', '입시·학령인구', 'AI·디지털', '기타'];
const moved = [];
let totalItems = 0, changedLevel = 0, changedField = 0;

for (const f of files) {
  const p = join(dir, f);
  const J = JSON.parse(readFileSync(p, 'utf8'));
  for (const it of J.items) {
    totalItems++;
    const { field, level, why } = classify(it.title);
    if (it.level !== level) {
      changedLevel++;
      // 위험신호에서 빠지거나 새로 들어온 것만 따로 본다 — 수치가 실제로 움직이는 건 이쪽이다
      const wasRisk = it.level === 'crisis' || it.level === 'warning';
      const nowRisk = level === 'crisis' || level === 'warning';
      if (wasRisk !== nowRisk) moved.push({ file: f, from: it.level, to: level, why, title: it.title });
      it.level = level;
    }
    if (it.field !== field) { changedField++; it.field = field; }
    if (why) it.why = why; else delete it.why;
  }

  // 파일 머리의 집계도 다시 계산한다. 안 하면 items 와 요약이 어긋난다.
  const n = J.items.length || 1;
  const cnt = (k, v) => J.items.filter((x) => x[k] === v).length;
  const pct = (v) => +((v / n) * 100).toFixed(1);
  J.signal = { crisis: pct(cnt('level', 'crisis')), warning: pct(cnt('level', 'warning')), watch: pct(cnt('level', 'watch')) };
  J.byField = Object.fromEntries(FIELD_KEYS.map((k) => [k, cnt('field', k)]));
  J.byRegion = { 국내: cnt('region', 'domestic'), 해외: cnt('region', 'overseas') };
  J.byUniv = Object.fromEntries(UNIV.map((u) => [u, J.items.filter((x) => (x.univ || []).includes(u)).length]));
  J.reclassifiedAt = new Date().toISOString().slice(0, 10);

  if (!DRY) writeFileSync(p, JSON.stringify(J, null, 2), 'utf8');
  const risk = (J.signal.crisis + J.signal.warning).toFixed(1);
  console.log(`${DRY ? '· ' : '✓ '}${f}  ${J.items.length}건 · 위험신호 ${risk}%`);
}

console.log(`\n기사 ${totalItems}건 · 등급 변경 ${changedLevel} · 분야 변경 ${changedField}`);
console.log(`위험신호 편입/이탈 ${moved.length}건`);
const out = moved.filter((m) => m.from === 'crisis' || m.from === 'warning');
console.log(`\n[위험신호에서 빠진 것 ${out.length}건 · 앞 20개]`);
out.slice(0, 20).forEach((m) => console.log(`  ${m.from} → ${m.to}  ${m.title.slice(0, 62)}`));
const into = moved.filter((m) => m.to === 'crisis' || m.to === 'warning');
if (into.length) {
  console.log(`\n[새로 위험신호가 된 것 ${into.length}건 · 앞 10개]`);
  into.slice(0, 10).forEach((m) => console.log(`  → ${m.to} (${m.why})  ${m.title.slice(0, 58)}`));
}
if (DRY) console.log('\n(--dry: 파일은 쓰지 않았다)');
