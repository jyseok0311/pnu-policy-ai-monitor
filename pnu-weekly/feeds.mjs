// 기관 공식 홈페이지의 보도자료·소식 수집 — data/feeds/<date>.json
// 사용: node feeds.mjs [--days 14]
//
// 수집 대상은 기관 공식 홈페이지의 게시판뿐이다(src/gov-sites.mjs).
// 개인 SNS는 받지 않는다(data/watchlist.json 의 _policy 참조).
//
// 전에는 네이버 블로그 RSS 를 읽었다. 블로그는 홍보 편집본이라 원문 보도자료와
// 제목·시점이 어긋나고 링크도 blog.naver.com 으로 나가 출처가 흐려졌다. 지금은 원문만 본다.

import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
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
const down = [];

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
    down.push({ site, why: e.message });
    log.push({ 기관: site.name, 게시판: site.board, 수신: 0, [`최근${DAYS}일`]: 0, 상태: `실패 ${e.message}`.slice(0, 60) });
  }
}

// ── 실패한 기관은 직전 수집분에서 이월한다.
//    응답이 없다는 것이 '아무것도 안 냈다'는 뜻은 아니다. 창이 14일이라 직전 항목도
//    아직 유효하다. 이월분은 carriedOver 에 적어 두어 어디서 온 값인지 남긴다.
const carried = {};
if (down.length) {
  const dir = join(root, 'data/feeds');
  const snaps = existsSync(dir)
    ? readdirSync(dir).filter((x) => x.endsWith('.json')).sort().reverse()
    : [];
  for (const { site } of down) {
    for (const snap of snaps) {
      let prev;
      try { prev = JSON.parse(readFileSync(join(dir, snap), 'utf8')); } catch { continue; }
      const mine = (prev.items || []).filter((x) => x.orgId === site.id
        && (!x.date || !Number.isFinite(Date.parse(x.date)) || Date.parse(x.date) >= since));
      if (!mine.length) continue;
      const seen = new Set(items.filter((x) => x.orgId === site.id).map((x) => x.link));
      let n = 0;
      for (const it of mine) {
        if (seen.has(it.link)) continue;
        items.push({ ...it, carriedFrom: snap.replace('.json', '') });
        n++;
      }
      if (n) {
        carried[site.name] = { 건수: n, 출처: snap.replace('.json', '') };
        const row = log.find((L) => L.기관 === site.name);
        if (row) row.상태 = `${row.상태} → ${snap.replace('.json', '')} 이월 ${n}건`;
      }
      break;   // 가장 최근 스냅샷 하나만 쓴다
    }
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
  ...(Object.keys(carried).length ? { carriedOver: carried } : {}),
  items
};

mkdirSync(join(root, 'data/feeds'), { recursive: true });
// 파일 이름은 한국 날짜다. 러너는 UTC 라서 07:00 KST 실행이 전날 이름을 받는다.
const tagDate = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
writeFileSync(join(root, `data/feeds/${tagDate}.json`), JSON.stringify(out, null, 2), 'utf8');

console.table(log);
console.log(`\n총 ${out.total}건 · ${out.window}`);
if (Object.keys(carried).length) console.log('이월', carried);
console.log('기관별', out.byOrg);
console.log(`저장: data/feeds/${tagDate}.json`);
const failed = log.filter((l) => String(l.상태).startsWith('실패') || String(l.상태).startsWith('목록'));
if (failed.length) {
  console.log(`\n⚠ ${failed.length}곳 수집 실패 — 사이트 점검·개편 가능성. src/gov-sites.mjs 의 파서를 확인하세요.`);
  failed.forEach((f) => console.log(`   ${f.기관}: ${f.상태}`));
}
