// 자동 취합본 서술 파일을 만든다 — 토큰(LLM) 없이.
// 사용: node tools/digest-narrative.mjs <주차id> [--force] [--out <경로>]
//
//   마감된 주차의 수집본에서 같은 사건을 묶고 매체 수로 순위를 매겨 data/narrative/<id>.json 을 쓴다.
//   서술 파일에 mode:'digest' 가 들어가 화면에 '자동 취합본'으로 표시된다(해석·진단·권고 없음).
//
//   이미 해석 본문(AI 가 쓴 것)이 있으면 덮어쓰지 않는다 — --force 를 줘야 한다.
//   이미 취합본이면 다시 만든다(수집이 늘었을 수 있다).
//
// 만든 뒤에는 aggregate → series → build 순서로 본문에 붙인다(tools/publish-week.mjs 가 한다).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant } from '../src/filter.mjs';
import { buildDigest } from '../src/digest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const ID = args.find((a) => /^w\d+$/.test(a));
const force = args.includes('--force');
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!ID) { console.error('사용: node tools/digest-narrative.mjs <주차id> [--force] [--out <경로>]'); process.exit(2); }

const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

const wk = J('data/weeks.json').find((w) => w.id === ID);
if (!wk) { console.error(`✗ ${ID} 주차를 찾지 못했습니다.`); process.exit(2); }
if (wk.partial) { console.error(`✗ ${ID} 는 아직 진행 중입니다(마감 전).`); process.exit(2); }

const out = outArg || join(root, `data/narrative/${ID}.json`);
if (!outArg && existsSync(out)) {
  const cur = J(`data/narrative/${ID}.json`);
  if (cur.mode !== 'digest' && !force) {
    console.error(`✗ ${ID} 에는 이미 해석 본문이 있어 덮어쓰지 않습니다(--force 로 덮어쓸 수 있음).`);
    process.exit(2);
  }
}

// 주차는 끝나는 날로 이름 붙고 수집본은 시작하는 날로 저장된다(week-brief 와 같다).
const collected = addDays(wk.date, -7);
const file = `data/collected/${collected}.json`;
if (!existsSync(join(root, file))) { console.error(`✗ 수집본 없음: ${file}`); process.exit(2); }

const items = relevant(J(file).items).filter((x) => x.region !== 'overseas');
if (items.length < 20) { console.error(`✗ 이 주차의 국내 관련 기사가 ${items.length}건뿐이라 취합본을 만들지 않습니다.`); process.exit(2); }

const d = buildDigest({ wk, items, collected });
const stats = d._stats; delete d._stats;
writeFileSync(out, JSON.stringify(d, null, 2) + '\n', 'utf8');

console.log(`✓ ${ID} 자동 취합본 — ${wk.label}`);
console.log(`  기사 ${items.length}건 → 같은 사건 묶음 ${stats.clusters}개(2개 매체 이상 ${stats.multi}개)`);
d.summary.forEach((g) => console.log(`  · ${g.h} — ${g.items.length}건`));
console.log(`  변화 ${d.changes.length} · 주시 ${d.watch.length}   → ${outArg || `data/narrative/${ID}.json`}`);
