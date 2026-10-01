// 법령·자치법규·행정규칙·입법예고 수집 — data/legal/<date>.json
// 사용: node legal.mjs
//
// 일일 브리핑의 '법령·조례 동향' 칸을 채운다. 하루치 스냅숏을 날짜별로 남기므로
// 지난 날짜의 브리핑을 열어도 그날 기준의 목록이 보인다(오늘 것으로 덮이지 않는다).
//
// 창(window)을 줄기마다 다르게 둔다. 법령은 하루에 몇 건 나오지 않는다.
// 하루치만 보이면 대부분의 날이 비어 있으므로 '최근 공포분'을 보여 주고,
// 그중 이번 주에 나온 것에 표시를 단다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLaws, fetchOrdinances, fetchAdminRules, fetchNotices, recent, relevantLaw } from './src/law-sources.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dir = join(root, 'data/legal');
mkdirSync(dir, { recursive: true });

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // KST

// 줄기별 창(일). 법령·행정규칙은 드물게 나오므로 넉넉히, 조례는 많으므로 좁게.
const WINDOW = { law: 120, admrul: 120, ordin: 90 };

// 바로 전 스냅숏 — 출처가 실패하면 그 줄기만 여기서 이어 받는다
const prevFile = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${today}.json`).sort().pop();
const prev = prevFile ? JSON.parse(readFileSync(join(dir, prevFile), 'utf8')) : null;

const out = { collectedAt: new Date().toISOString(), date: today, window: WINDOW, sources: {}, law: [], admrul: [], ordin: [], notice: [] };

async function run(key, label, fn, post) {
  try {
    const raw = await fn();
    out[key] = post(raw);
    out.sources[key] = { status: 'ok', label, fetched: raw.length, kept: out[key].length };
    console.log(`  ${label.padEnd(6)} 수신 ${String(raw.length).padStart(4)} → ${out[key].length}건`);
  } catch (e) {
    // 조용히 비우지 않는다. 전날 것을 이어 받고 그 사실을 남긴다.
    // 4개 부처 사이트가 GitHub 러너에서 막혔을 때 같은 방식으로 버텼다.
    const carry = prev && Array.isArray(prev[key]) ? prev[key] : [];
    out[key] = carry;
    out.sources[key] = { status: 'carried', label, error: String(e.message || e).slice(0, 120), carriedFrom: prevFile ? prevFile.replace('.json', '') : null, kept: carry.length };
    console.log(`  ${label.padEnd(6)} 실패 — ${String(e.message || e).slice(0, 60)} · 전날 ${carry.length}건 이어 받음`);
  }
}

console.log(`법령·조례 수집 (${today})`);

const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

await run('law', '법령', fetchLaws, (r) => relevantLaw(recent(r, WINDOW.law, today)).sort(byDateDesc));
await run('admrul', '행정규칙', fetchAdminRules, (r) => relevantLaw(recent(r, WINDOW.admrul, today)).sort(byDateDesc));
// 조례는 부울경을 앞에 세운다 — 대학에 바로 닿는 쪽이다
await run('ordin', '자치법규', fetchOrdinances, (r) => relevantLaw(recent(r, WINDOW.ordin, today))
  .sort((a, b) => (b.local - a.local) || byDateDesc(a, b)));

// ── 입법예고는 쌓는다.
// 목록이 최신 20건만 주고 GET 으로는 넘길 수 없다. 매일 지나가는 것을 주워
// 마감 전인 것만 남긴다 — 하루라도 수집이 돌면 그날 걸린 예고는 마감까지 남아 있다.
await run('notice', '입법예고', fetchNotices, (fresh) => {
  const pool = new Map();
  for (const x of (prev && prev.notice) || []) pool.set(x.link, x);
  for (const x of fresh) pool.set(x.link, { ...pool.get(x.link), ...x, seen: (pool.get(x.link) || {}).seen || today });
  return [...pool.values()]
    .filter((x) => !x.deadline || x.deadline >= today)        // 마감 지난 것은 내린다
    .sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')));   // 마감 임박 순
});

out.total = out.law.length + out.admrul.length + out.ordin.length + out.notice.length;
writeFileSync(join(dir, `${today}.json`), JSON.stringify(out, null, 2), 'utf8');
console.log(`저장: data/legal/${today}.json — 합계 ${out.total}건`);

// 출처가 전부 실패했으면 실패로 끝낸다 — 워크플로 알림이 뜨게.
// 하나라도 살아 있으면 성공이다(이어 받은 줄기는 화면에 '전날 기준'으로 표시된다).
if (Object.values(out.sources).every((s) => s.status !== 'ok')) {
  console.error('✗ 법령 출처가 모두 실패했습니다.');
  process.exit(1);
}
