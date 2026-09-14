// 빅카인즈 없이 뉴스를 수집한다 — 무료·공개 RSS만 사용하는 수집기 프로토타입.
// 사용: node collect.mjs [--days 7]
//
// 설계 원칙(저작권):
//   기사 "본문"은 어떤 경우에도 저장·인용하지 않는다.
//   제목 / 링크 / 매체 / 날짜 / 매체가 RSS로 스스로 배포한 요약만 보관한다.
//   분류·집계·경보는 이 정보만으로 충분하고, 서술의 근거는 공공누리 1차 소스(보도자료·법안·공고)에서 가져온다.
//   유료 구매 경로(뉴스 아카이브·건별 구매)는 사용하지 않는다 — 전 구간 무료·공개 소스로만 운영한다.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { classify } from './src/classify.mjs';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FROM = arg('--from');            // YYYY-MM-DD (포함)
const TO = arg('--to');                // YYYY-MM-DD (미포함)
const DAYS = Number(arg('--days')) || 7;
// --week : 매일 돌리는 모드. 이번 주차 파일에 누적한다.
//   주차 경계는 금요일이다(weeks.json 의 모든 range 가 금→금).
//   파일 이름은 '그 주가 시작한 금요일'로 통일한다. 수집한 날짜로 이름을 붙이면
//   같은 주차가 여러 파일로 흩어지고, 어떤 파일이 어느 주차인지 이름만 봐서는 알 수 없다.
const WEEKLY = process.argv.includes('--week');
// 주차 경계는 한국 시간으로 따진다. GitHub Actions 러너는 UTC 라서,
// 그냥 UTC 로 계산하면 금요일 아침 07:00 KST(=목요일 22:00 UTC) 실행분이
// 지난 주차 파일에 들어간다. 9시간을 더해 한국 날짜로 맞춘다.
// --today YYYY-MM-DD : 실행 날짜를 고정한다(검증용). 금요일 경계 처리는 금요일에만 도는데,
//   그날까지 기다려서 확인할 수는 없으므로 날짜를 꾸며 넣어 미리 돌려 본다.
const TODAY = arg('--today') ? new Date(arg('--today') + 'T00:00:00Z') : new Date();
const KST = (d = TODAY) => new Date(d.getTime() + 9 * 3600e3);
const kstDate = (d = TODAY) => KST(d).toISOString().slice(0, 10);
function weekStart(d = TODAY) {
  const k = KST(d);
  const x = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  // getUTCDay: 0=일 … 5=금. 그 주가 시작한 금요일까지 거슬러 올라간다.
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() - 5 + 7) % 7));
  return x.toISOString().slice(0, 10);
}
// 구글 뉴스 RSS는 after:/before: 로 과거 구간 검색을 지원한다 — 지난 주차 소급 수집에 쓴다.
const RANGE = FROM && TO ? `after:${FROM} before:${TO}` : `when:${DAYS}d`;
const TAG = FROM && TO ? FROM : WEEKLY ? weekStart() : kstDate();
const UA = 'Mozilla/5.0 (compatible; PNU-AX-Monitor/0.1; +ax@pusan.ac.kr)';

// ── 수집 대상 ────────────────────────────────────────────────
const GOOGLE_QUERIES = [
  '거점국립대', '국립대 통합', '글로컬대학', 'RISE 지역혁신중심 대학지원',
  '대학 정원 감축', '대학 등록금', '대학 생성형 AI', '대학 구조개혁', '부산대학교',
  // 적응형행정(AURA A) — 대학·공공의 행정 AX.
  // 대학 기사만 봐서는 주당 서너 건뿐이라 분야 판이 그려지지 않았다.
  '대학 행정 AI', '대학 학사행정 시스템', '공공부문 생성형 AI', '공공기관 AI 행정혁신',
  '생성형 AI 업무 도입'
];
const PRESS_FEEDS = [
  { media: '한국대학신문', url: 'https://news.unn.net/rss/allArticle.xml' },
  { media: '교수신문', url: 'https://www.kyosu.net/rss/allArticle.xml' },
  { media: '베리타스알파', url: 'https://www.veritas-a.com/rss/allArticle.xml' },
  { media: '대학지(유니프레스)', url: 'https://www.unipress.co.kr/rss/allArticle.xml' }
];
// 해외 고등교육 정책 — 국내 이슈의 선행/대조 사례로 쓴다.
// 영문 구글 뉴스는 언어·지역 파라미터만 바꾸면 된다.
const OVERSEAS_QUERIES = [
  'higher education policy reform',
  'university funding cuts government',
  'national university merger',
  'university tuition free policy',
  'generative AI university policy',
  'declining student enrollment university',
  'regional university revitalization',
  'university world rankings policy'
];
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' ' + RANGE)}&hl=ko&gl=KR&ceid=KR:ko`;
const gnewsEn = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' ' + RANGE)}&hl=en-US&gl=US&ceid=US:en`;

// ── 최소 RSS 파서 (의존성 없음) ──────────────────────────────
const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// RSS <link> 가 CDATA 로 감싸 오는 매체가 있다. 벗기지 않으면 href 가 깨진다.
const url = (v) => String(v || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
};

function parseRss(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => {
    const b = m[0];
    return {
      title: tag(b, 'title'),
      link: url(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]),
      date: tag(b, 'pubDate') || tag(b, 'dc:date'),
      summary: tag(b, 'description').slice(0, 400),
      source: tag(b, 'source')
    };
  });
}

// 일부 언론사 서버는 GitHub 러너(미국 IP)에서 봇 UA 를 끊는다 — 유니프레스가 로컬은 200, 러너는 'fetch failed'.
// 1차는 정직한 봇 UA, 실패하면 브라우저 UA 로 한 번 더. 그래도 안 되면 그 피드만 '실패'로 남기고 넘어간다.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
async function get(url) {
  const once = async (ua) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 20000);   // 응답 없는 서버 하나가 전체 수집을 잡아먹지 않게
    try {
      const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/rss+xml,application/xml,text/xml,*/*' }, signal: c.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } finally { clearTimeout(t); }
  };
  try { return await once(UA); }
  catch (e) {
    if (/HTTP 4(0[0-9]|1[0-9])/.test(e.message)) throw e;   // 404 같은 건 UA 를 바꿔도 같다
    return once(BROWSER_UA);
  }
}

// 구글 뉴스 제목은 "제목 - 매체명" 형태
function splitMedia(item) {
  if (item.source) return { title: item.title.replace(new RegExp(` - ${item.source}$`), ''), media: item.source };
  const m = item.title.match(/^(.*) - ([^-]{2,20})$/);
  return m ? { title: m[1], media: m[2] } : { title: item.title, media: '미상' };
}

const UNIV = ['부산대', '경북대', '전남대', '전북대', '충남대', '충북대', '강원대', '경상국립대', '제주대', '서울대'];

// ── 실행 ────────────────────────────────────────────────────
const since = FROM ? Date.parse(FROM + 'T00:00:00Z') : Date.now() - DAYS * 864e5;
const until = TO ? Date.parse(TO + 'T00:00:00Z') : Infinity;
const items = new Map();          // 링크·제목 기준 중복 제거
const feedLog = [];

// 언론사 RSS는 최신 50건만 제공하므로 과거 구간 수집에는 쓸 수 없다(구글 뉴스만 사용).
const feeds = [
  ...GOOGLE_QUERIES.map((q) => ({ kind: 'google', region: 'domestic', label: `구글뉴스:${q}`, url: gnews(q) })),
  ...OVERSEAS_QUERIES.map((q) => ({ kind: 'google', region: 'overseas', label: `해외:${q}`, url: gnewsEn(q) })),
  ...(FROM ? [] : PRESS_FEEDS.map((f) => ({ kind: 'press', region: 'domestic', label: f.media, url: f.url, media: f.media })))
];

for (const f of feeds) {
  try {
    const raw = parseRss(await get(f.url));
    let kept = 0;
    for (const it of raw) {
      if (!it.title || !it.link) continue;
      const t = Date.parse(it.date);
      if (Number.isFinite(t) && (t < since || t >= until)) continue;
      const { title, media } = f.kind === 'google' ? splitMedia(it) : { title: it.title, media: f.media };
      const key = title.replace(/\s+/g, '').slice(0, 40);
      if (items.has(key)) { items.get(key).feeds.push(f.label); continue; }
      // 분류는 제목만 본다 — 요약(기사 첫 문단)을 섞으면 본문 소재가 등급을 만든다.
      const { field, group, local, level, why } = classify(title);
      items.set(key, {
        title, media, link: it.link, region: f.region || 'domestic',
        date: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null,
        field, group, ...(local ? { local: true } : {}), level, ...(why ? { why } : {}),
        univ: UNIV.filter((u) => title.includes(u)),   // 제목만 본다 — 분류와 같은 기준
        summary: it.summary.slice(0, 200),   // 매체가 RSS로 배포한 요약만. 본문 저장 안 함
        feeds: [f.label]
      });
      kept++;
    }
    feedLog.push({ feed: f.label, 수신: raw.length, 신규: kept, 상태: 'ok' });
  } catch (e) {
    feedLog.push({ feed: f.label, 수신: 0, 신규: 0, 상태: `실패 ${e.message}` });
  }
}

// ── 집계 (수치는 전부 여기서 코드가 계산한다) ──────────────
const all = [...items.values()];
const count = (k, v) => all.filter((x) => x[k] === v).length;
const pct = (n) => all.length ? +((n / all.length) * 100).toFixed(1) : 0;

const out = {
  collectedAt: new Date().toISOString(),
  window: FROM ? `${FROM} ~ ${TO}` : WEEKLY ? `${TAG} ~ (진행 중)` : `최근 ${DAYS}일`,
  from: FROM || (WEEKLY ? TAG : null), to: TO,
  total: all.length,
  signal: {
    crisis: pct(count('level', 'crisis')),
    warning: pct(count('level', 'warning')),
    watch: pct(count('level', 'watch'))
  },
  byField: Object.fromEntries(['정책/철학', '융합연구', '증강인재교육', '적응형행정', '기타'].map((f) => [f, count('field', f)])),
  byRegion: { 국내: count('region', 'domestic'), 해외: count('region', 'overseas') },
  byUniv: Object.fromEntries(UNIV.map((u) => [u, all.filter((x) => x.univ.includes(u)).length])),
  feeds: feedLog,
  items: all
};

mkdirSync(join(root, 'data/collected'), { recursive: true });
const file = join(root, `data/collected/${TAG}.json`);
const keyOf = (x) => x.title.replace(/\s+/g, '').slice(0, 40);
const FIELD_NAMES = ['정책/철학', '융합연구', '증강인재교육', '적응형행정', '기타'];

// 항목 배열이 바뀌면 집계값을 전부 다시 센다. 손으로 일부만 고치면 어긋난다.
function recompute(o) {
  o.items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  o.total = o.items.length;
  const cnt = (k, v) => o.items.filter((x) => x[k] === v).length;
  const p = (n) => (o.total ? +((n / o.total) * 100).toFixed(1) : 0);
  o.signal = { crisis: p(cnt('level', 'crisis')), warning: p(cnt('level', 'warning')), watch: p(cnt('level', 'watch')) };
  o.byField = Object.fromEntries(FIELD_NAMES.map((f) => [f, cnt('field', f)]));
  o.byRegion = { 국내: cnt('region', 'domestic'), 해외: cnt('region', 'overseas') };
  o.byUniv = Object.fromEntries(UNIV.map((u) => [u, o.items.filter((x) => (x.univ || []).includes(u)).length]));
  return o;
}

// 같은 기간 파일이 이미 있으면 합친다. 덮어쓰지 않는다.
// RSS 창(window)은 시간이 지나면 오래된 기사를 밀어내므로, 덮어쓰면 재실행할 때마다
// 기사를 잃는다. 실제로 재수집 후 서술의 각주 근거가 사라지는 일이 있었다.
function mergeInto(path, fresh) {
  const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  const base = prev ? (prev.items || []).map((it) => ({ region: 'domestic', ...it })) : [];   // 구버전 항목엔 region 이 없다
  const seen = new Set(base.map(keyOf));
  let added = 0;
  for (const it of fresh) {
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k); base.push(it); added++;
  }
  // 기존 파일의 창(window/from/to)은 그대로 둔다 — 닫힌 주차에 항목을 더해도 주차 정의는 바뀌지 않는다.
  const o = prev ? { ...prev, items: base, collectedAt: out.collectedAt, feeds: out.feeds } : { ...out, items: base };
  recompute(o);
  writeFileSync(path, JSON.stringify(o, null, 2), 'utf8');
  return { added, kept: prev ? (prev.items || []).length : 0, total: o.total };
}

if (WEEKLY) {
  // 기사를 '날짜'로 주차에 배정한다. 창이 경계를 넘겨 물어 오기 때문이다.
  //   이번 주차(TAG 이후)   → 이번 주차 파일
  //   지난 주차             → 지난 주차 파일에 추가. 금요일 아침 실행은 목요일 오후·저녁 기사를 처음 보는데,
  //                           이걸 버리면 닫힌 주차의 마지막 날이 늘 반쪽만 남는다.
  //   그보다 오래된 것       → 버림
  const prevTag = weekStart(new Date(Date.parse(TAG) - 864e5));
  const cur = out.items.filter((x) => !x.date || x.date >= TAG);
  const late = out.items.filter((x) => x.date && x.date >= prevTag && x.date < TAG);
  const dropped = out.items.length - cur.length - late.length;

  const r = mergeInto(file, cur);
  if (r.kept) console.log(`· 이번 주차(${TAG}) 파일과 병합 — 기존 ${r.kept}건 보존, ${r.added}건 추가`);
  if (late.length) {
    const pf = join(root, `data/collected/${prevTag}.json`);
    if (existsSync(pf)) {
      const r2 = mergeInto(pf, late);
      console.log(`· 지난 주차(${prevTag}) 파일에 ${r2.added}건 추가 (마감 전날 오후 기사 · 중복 ${late.length - r2.added}건)`);
    } else {
      console.log(`· 지난 주차 파일이 없어 ${late.length}건 버림 (${prevTag}.json)`);
    }
  }
  if (dropped) console.log(`· 주차 경계 밖 ${dropped}건 제외`);
  Object.assign(out, JSON.parse(readFileSync(file, 'utf8')));   // 아래 요약 출력은 이번 주차 파일 기준
} else {
  const r = mergeInto(file, out.items);
  if (r.kept) console.log(`· 기존 수집본과 병합 — ${r.kept}건 보존`);
  Object.assign(out, JSON.parse(readFileSync(file, 'utf8')));
}

console.table(feedLog);
console.log(`\n총 ${out.total}건 (중복 제거 후) · ${out.window}`);
console.log(`위험신호  crisis ${out.signal.crisis}% / warning ${out.signal.warning}% / watch ${out.signal.watch}%  → 합산 ${(out.signal.crisis + out.signal.warning).toFixed(1)}%`);
console.log('분야별   ', out.byField);
console.log('국내/해외 ', out.byRegion);
console.log('대학 언급 ', Object.fromEntries(Object.entries(out.byUniv).filter(([, v]) => v > 0)));
console.log(`\n저장: data/collected/${TAG}.json`);
