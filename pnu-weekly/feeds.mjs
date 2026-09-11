// 기관 공식 홈페이지의 보도자료·소식 수집 — data/feeds/<date>.json
// 사용: node feeds.mjs [--days 14]
//
// 수집 대상은 기관 공식 홈페이지의 게시판뿐이다(src/gov-sites.mjs).
// 개인 SNS는 받지 않는다(data/watchlist.json 의 _policy 참조).
//
// 전에는 네이버 블로그 RSS 를 읽었다. 블로그는 홍보 편집본이라 원문 보도자료와
// 제목·시점이 어긋나고 링크도 blog.naver.com 으로 나가 출처가 흐려졌다. 지금은 원문만 본다.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES, fetchSite } from './src/gov-sites.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
// 부처 보도자료는 뉴스보다 뜸하다. 7일로 자르면 절반이 빈다.
const DAYS = Number(arg('--days')) || 14;

const since = Date.now() - DAYS * 864e5;
const items = [];
const log = [];

for (const site of SITES) {
  try {
    const { items: raw, note } = await fetchSite(site);
    let kept = 0;
    for (const it of raw) {
      const ts = it.date ? Date.parse(it.date) : NaN;
      // 날짜를 못 읽은 항목은 버리지 않는다 — 목록 상단은 최신이라는 전제가 더 안전하다.
      if (Number.isFinite(ts) && ts < since) continue;
      items.push({
        org: site.name, orgId: site.id, channel: site.board,
        title: it.title, link: it.link, date: it.date, summary: ''
      });
      kept++;
    }
    log.push({ 기관: site.name, 게시판: site.board, 수신: raw.length, [`최근${DAYS}일`]: kept, 상태: note || 'ok' });
  } catch (e) {
    log.push({ 기관: site.name, 게시판: site.board, 수신: 0, [`최근${DAYS}일`]: 0, 상태: `실패 ${e.message}`.slice(0, 60) });
  }
}

items.sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));

const out = {
  collectedAt: new Date().toISOString(),
  window: `최근 ${DAYS}일`,
  policy: '기관 공식 홈페이지 게시판만 수집. 개인 SNS·블로그는 수집하지 않는다.',
  sources: SITES.map((s) => ({ id: s.id, name: s.name, board: s.board, home: s.home, list: s.list })),
  total: items.length,
  byOrg: Object.fromEntries([...new Set(items.map((x) => x.org))].map((o) => [o, items.filter((x) => x.org === o).length])),
  feeds: log,
  items
};

mkdirSync(join(root, 'data/feeds'), { recursive: true });
const tagDate = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, `data/feeds/${tagDate}.json`), JSON.stringify(out, null, 2), 'utf8');

console.table(log);
console.log(`\n총 ${out.total}건 · ${out.window}`);
console.log('기관별', out.byOrg);
console.log(`저장: data/feeds/${tagDate}.json`);
const failed = log.filter((l) => String(l.상태).startsWith('실패') || String(l.상태).startsWith('목록'));
if (failed.length) {
  console.log(`\n⚠ ${failed.length}곳 수집 실패 — 사이트 점검·개편 가능성. src/gov-sites.mjs 의 파서를 확인하세요.`);
  failed.forEach((f) => console.log(`   ${f.기관}: ${f.상태}`));
}
