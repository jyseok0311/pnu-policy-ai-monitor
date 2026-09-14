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
const J = JSON.parse(readFileSync(join(root, 'data/collected', latest), 'utf8'));

// 어제·오늘(KST) 날짜의 기사. 07:00 에 돌리므로 '오늘' 기사는 아직 적고 '어제'가 본체다.
const today = kst(), yesterday = kst(Date.now() - 864e5);
const recent = J.items.filter((x) => x.date === today || x.date === yesterday);
const domestic = recent.filter((x) => x.region !== 'overseas').length;
const feedsOk = (J.feeds || []).filter((f) => f.상태 === 'ok').length;
const feedsAll = (J.feeds || []).length;

console.log(`· 파일 ${latest} · 전체 ${J.total}건 · 최근 2일(${yesterday}~${today}) ${recent.length}건 (국내 ${domestic})`);
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
