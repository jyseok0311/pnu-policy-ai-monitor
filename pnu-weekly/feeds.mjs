// 워치리스트 기관의 공식 채널 피드 수집 — data/feeds/<date>.json
// 사용: node feeds.mjs [--days 7]
//
// 수집 대상은 기관 공식 채널뿐이다. 개인 SNS는 받지 않는다(data/watchlist.json 의 _policy 참조).
//   · 네이버 블로그 RSS  https://rss.blog.naver.com/<id>.xml
//   · 유튜브 채널 RSS    https://www.youtube.com/feeds/videos.xml?channel_id=<UC...>
// 둘 다 인증키가 필요 없고 기관이 스스로 배포하는 공개 피드다.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const DAYS = Number(arg('--days')) || 7;
const UA = 'Mozilla/5.0 (compatible; PNU-AX-Monitor/0.1)';

const wl = JSON.parse(readFileSync(join(root, 'data/watchlist.json'), 'utf8'));

const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const tag = (b, n) => { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')); return m ? strip(m[1]) : ''; };

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/atom+xml,*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// RSS(<item>)와 Atom(<entry>, 유튜브) 양쪽 처리
function parse(xml) {
  const rss = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => ({
    title: tag(m[0], 'title'),
    link: (m[0].match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim(),
    date: tag(m[0], 'pubDate') || tag(m[0], 'dc:date'),
    summary: tag(m[0], 'description').slice(0, 200)
  }));
  if (rss.length) return rss;
  return [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => ({
    title: tag(m[0], 'title'),
    link: (m[0].match(/<link[^>]*href="([^"]+)"/i)?.[1] || '').trim(),
    date: tag(m[0], 'published') || tag(m[0], 'updated'),
    summary: tag(m[0], 'media:description').slice(0, 200)
  }));
}

const since = Date.now() - DAYS * 864e5;
const items = [];
const log = [];

for (const org of wl.orgs) {
  const ch = org.channels || {};
  const targets = [
    ch.naverBlog && { kind: '네이버블로그', url: `https://rss.blog.naver.com/${ch.naverBlog}.xml` },
    ch.youtube && { kind: '유튜브', url: `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.youtube}` }
  ].filter(Boolean);

  for (const t of targets) {
    try {
      const raw = parse(await get(t.url));
      let kept = 0;
      for (const it of raw) {
        const ts = Date.parse(it.date);
        if (Number.isFinite(ts) && ts < since) continue;
        if (!it.title || !it.link) continue;
        items.push({
          org: org.name, orgId: org.id, channel: t.kind,
          title: it.title, link: it.link,
          date: Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null,
          summary: it.summary
        });
        kept++;
      }
      log.push({ 기관: org.name, 채널: t.kind, 수신: raw.length, [`최근${DAYS}일`]: kept, 상태: 'ok' });
    } catch (e) {
      log.push({ 기관: org.name, 채널: t.kind, 수신: 0, [`최근${DAYS}일`]: 0, 상태: `실패 ${e.message}` });
    }
  }
}

items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

const out = {
  collectedAt: new Date().toISOString(),
  window: `최근 ${DAYS}일`,
  policy: wl._policy,
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
if (!out.total) console.log('\n⚠ 공식 채널이 등록된 기관이 적습니다. watchlist.json 의 channels 를 채우세요.');
