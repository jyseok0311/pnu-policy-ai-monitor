// 출처별 수집 이력을 갱신한다 — data/source-health.json (설명은 src/source-health.mjs)
// 사용: node tools/source-health.mjs            이번 실행이 쓴 수집 파일을 읽어 오늘 칸에 더한다
//       node tools/source-health.mjs --backfill 남아 있는 날짜별 파일(기관 보도자료·법령)로 지난 기록을 다시 만든다
//
// '이번 실행'의 산출물인지는 파일의 수집 시각으로 판단한다(60분 안). 매시 실행은 기사만 걷으므로
// 기관 보도자료·법령 칸은 하루 한 번 전체 실행 때만 채워진다.
// 같은 수집 결과를 두 번 세지 않도록 출처마다 마지막으로 센 수집 시각(lastRun)을 둔다.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHealth, KEEP_DAYS, longFailures } from '../src/source-health.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const kst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
const fresh = (iso) => iso && Date.now() - Date.parse(iso) < 60 * 60e3;
const backfill = process.argv.includes('--backfill');

const H = loadHealth(root);
H.sources ||= {};

function record(key, kind, label, at, ok, n, note) {
  const s = (H.sources[key] ||= { kind, label, days: {} });
  s.kind = kind; s.label = label;
  if (s.lastRun === at) return;            // 같은 수집 결과를 두 번 세지 않는다
  s.lastRun = at;
  const d = (s.days[kst(at)] ||= { ok: 0, fail: 0, n: 0 });
  if (ok) d.ok++; else d.fail++;
  d.n = Math.max(d.n, n || 0);
  if (/우회/.test(note || '')) d.via = true;
  if (!ok || d.via) d.note = String(note || '').slice(0, 120);
}

// 기사(구글 뉴스·언론사 RSS·해외) — 주 단위 수집본의 feeds 칸
function fromCollected(c) {
  for (const f of c.feeds || []) {
    const st = String(f.상태 || '');
    const kind = /^구글뉴스:/.test(f.feed) ? 'news' : /^해외:/.test(f.feed) ? 'overseas' : 'press';
    const label = f.feed.replace(/^(구글뉴스|해외):/, '');
    record(`${kind}:${label}`, kind, label, c.collectedAt, st.startsWith('ok'), f.수신, st);
  }
}

// 기관 보도자료 — data/feeds/<날짜>.json
function fromFeeds(F) {
  for (const f of F.feeds || []) {
    const st = String(f.상태 || '');
    const label = `${f.기관} · ${f.게시판}`;
    record(`org:${f.기관}:${f.게시판}`, 'org', label, F.collectedAt, st.startsWith('ok'), f.수신, st);
  }
}

// 법령·조례 — data/legal/<날짜>.json. 'carried'(전날 것을 이어 씀)는 실패로 센다.
function fromLegal(L) {
  for (const [k, s] of Object.entries(L.sources || {})) {
    const ok = s.status === 'ok';
    record(`legal:${k}`, 'legal', s.label || k, L.collectedAt, ok, s.fetched ?? s.kept, ok ? '' : `${s.status} ${s.error || ''}`.trim());
  }
}

const dated = (dir) => existsSync(join(root, dir))
  ? readdirSync(join(root, dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];

if (backfill) {
  const from = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  for (const f of dated('data/feeds').filter((f) => f >= from)) { const F = J(`data/feeds/${f}`); if (F.collectedAt) fromFeeds(F); }
  for (const f of dated('data/legal').filter((f) => f >= from)) { const L = J(`data/legal/${f}`); if (L.collectedAt) fromLegal(L); }
  for (const f of dated('data/collected').slice(-2)) { const C = J(`data/collected/${f}`); if (C.collectedAt) fromCollected(C); }
} else {
  const newest = (dir) => { const fs = dated(dir); return fs.length ? J(`${dir}/${fs[fs.length - 1]}`) : null; };
  // 주 단위 수집본은 주가 바뀌면 새 파일이 생긴다. 이번 실행이 쓴 것은 수집 시각이 가장 늦은 쪽이다.
  const cs = dated('data/collected').slice(-2).map((f) => J(`data/collected/${f}`)).sort((a, b) => String(a.collectedAt).localeCompare(String(b.collectedAt)));
  const C = cs.pop();
  if (C && fresh(C.collectedAt)) fromCollected(C);
  const F = newest('data/feeds'); if (F && fresh(F.collectedAt)) fromFeeds(F);
  const L = newest('data/legal'); if (L && fresh(L.collectedAt)) fromLegal(L);
}

// 오래된 날짜와, 그 기간에 한 번도 보이지 않은 출처(검색어를 뺀 경우)를 지운다.
const cut = new Date(Date.now() + 9 * 3600e3 - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
for (const [k, s] of Object.entries(H.sources)) {
  for (const d of Object.keys(s.days)) if (d < cut) delete s.days[d];
  if (!Object.keys(s.days).length) delete H.sources[k];
}
H.updatedAt = new Date().toISOString();
writeFileSync(join(root, 'data/source-health.json'), JSON.stringify(H, null, 1) + '\n', 'utf8');

const bad = longFailures(H);
console.log(`✓ 출처 이력 ${Object.keys(H.sources).length}곳 갱신${backfill ? ' (지난 기록 다시 만듦)' : ''}`);
if (bad.length) {
  console.log(`⚠ 장기 실패 ${bad.length}곳 — 기록이 있는 최근 날들이 모두 실패`);
  for (const b of bad) console.log(`   ${b.label}  (${b.since}부터, 마지막 성공 ${b.lastOk || '기록 없음'}) ${b.note}`);
}
