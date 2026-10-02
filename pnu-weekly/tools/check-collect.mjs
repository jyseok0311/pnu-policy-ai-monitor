// 자동 수집 검증 — 이번 주차 파일에 '최근 기사'가 실제로 들어왔는지 본다.
// 사용: node tools/check-collect.mjs
//
// 수집기가 오류 없이 끝났다는 것과 기사를 받아 왔다는 것은 다르다.
// 구글 뉴스가 빈 RSS 를 주거나 러너 IP 가 막혀도 collect.mjs 는 0건으로 '성공'한다.
// 그래서 결과를 따로 세고, 비면 실패로 끝내 워크플로가 알림을 띄우게 한다.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

const files = readdirSync(join(root, 'data/collected')).filter((f) => f.endsWith('.json')).sort();
const latest = files[files.length - 1];
const read = (f) => JSON.parse(readFileSync(join(root, 'data/collected', f), 'utf8'));
const J = read(latest);

// 어제·오늘(KST) 날짜의 기사. 07:00 에 돌리므로 '오늘' 기사는 아직 적고 '어제'가 본체다.
//
// 주차 경계를 넘겨서 본다. 금요일 새벽에 새 주차 파일이 막 생기면 그 파일은 비어 있고,
// 어제(목요일) 기사는 지난 주차 파일에 들어 있다. 최신 파일만 보던 때에는
// 수집이 멀쩡한데도(피드 25/26 정상) '최근 2일 0건'으로 실패해 배포가 막히고
// 실패 이슈가 열렸다 — 2026-10-02 05:12 실행이 그랬다. 마지막 두 파일을 합쳐 센다.
const today = kst(), yesterday = kst(Date.now() - 864e5);
const seen = new Set();
const recent = files.slice(-2).flatMap((f) => (f === latest ? J : read(f)).items)
  .filter((x) => x.date === today || x.date === yesterday)
  .filter((x) => { const k = x.link || x.title; if (seen.has(k)) return false; seen.add(k); return true; });
const domestic = recent.filter((x) => x.region !== 'overseas').length;
const feedsOk = (J.feeds || []).filter((f) => f.상태 === 'ok').length;
const feedsAll = (J.feeds || []).length;

console.log(`· 파일 ${files.slice(-2).join(' + ')} · 최근 2일(${yesterday}~${today}) ${recent.length}건 (국내 ${domestic})`);
console.log(`· 피드 ${feedsOk}/${feedsAll} 정상`);

const problems = [];
if (recent.length === 0) problems.push('최근 2일 기사가 0건 — RSS 가 비었거나 러너 IP 가 막혔을 가능성');
else if (domestic < 10) problems.push(`국내 기사가 ${domestic}건뿐 — 평일 기준 수십 건이 정상`);
if (feedsAll && feedsOk / feedsAll < 0.5) problems.push(`피드 절반 이상 실패 (${feedsAll - feedsOk}/${feedsAll})`);

if (problems.length) {
  console.error('\n✗ 수집 검증 실패');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('✓ 수집 정상');
