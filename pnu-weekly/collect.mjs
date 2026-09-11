// 빅카인즈 없이 뉴스를 수집한다 — 무료·공개 RSS만 사용하는 수집기 프로토타입.
// 사용: node collect.mjs [--days 7]
//
// 설계 원칙(저작권):
//   기사 "본문"은 어떤 경우에도 저장·인용하지 않는다.
//   제목 / 링크 / 매체 / 날짜 / 매체가 RSS로 스스로 배포한 요약만 보관한다.
//   분류·집계·경보는 이 정보만으로 충분하고, 서술의 근거는 공공누리 1차 소스(보도자료·법안·공고)에서 가져온다.
//   유료 구매 경로(뉴스 아카이브·건별 구매)는 사용하지 않는다 — 전 구간 무료·공개 소스로만 운영한다.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FROM = arg('--from');            // YYYY-MM-DD (포함)
const TO = arg('--to');                // YYYY-MM-DD (미포함)
const DAYS = Number(arg('--days')) || 7;
// 구글 뉴스 RSS는 after:/before: 로 과거 구간 검색을 지원한다 — 지난 주차 소급 수집에 쓴다.
const RANGE = FROM && TO ? `after:${FROM} before:${TO}` : `when:${DAYS}d`;
const TAG = FROM && TO ? FROM : new Date().toISOString().slice(0, 10);
const UA = 'Mozilla/5.0 (compatible; PNU-AX-Monitor/0.1; +ax@pusan.ac.kr)';

// ── 수집 대상 ────────────────────────────────────────────────
const GOOGLE_QUERIES = [
  '거점국립대', '국립대 통합', '글로컬대학', 'RISE 지역혁신중심 대학지원',
  '대학 정원 감축', '대학 등록금', '대학 생성형 AI', '대학 구조개혁', '부산대학교'
];
const PRESS_FEEDS = [
  { media: '한국대학신문', url: 'https://news.unn.net/rss/allArticle.xml' },
  { media: '교수신문', url: 'https://www.kyosu.net/rss/allArticle.xml' },
  { media: '베리타스알파', url: 'https://www.veritas-a.com/rss/allArticle.xml' },
  { media: '대학지(유니프레스)', url: 'https://www.unipress.co.kr/rss/allArticle.xml' }
];
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' ' + RANGE)}&hl=ko&gl=KR&ceid=KR:ko`;

// ── 분류 규칙 (LLM 아님 — 결정적 규칙으로 집계해야 수치를 신뢰할 수 있다) ──
const FIELDS = {
  '거버넌스': ['통합', '연합', '거버넌스', '구조개혁', '총장', '국립대', '공공기관', '재편', '법인화'],
  '재정': ['예산', 'RISE', '라이즈', '등록금', '재정지원', '국고', '교부금', '적자', '지원금'],
  '입시·학령인구': ['수시', '정시', '경쟁률', '충원', '입시', '학령인구', '모집', '정원', '신입생', '수능'],
  'AI·디지털': ['AI', '인공지능', '디지털', 'AX', '생성형', '데이터', '에이전트', 'SW', '반도체']
};
const RISK = {
  crisis: ['폐교', '폐과', '통폐합', '위기', '미달', '무산', '삭감', '소송', '파행', '반발', '퇴출'],
  warning: ['감축', '하락', '우려', '갈등', '축소', '논란', '지적', '경고', '부담', '압박', '차질'],
  watch: ['검토', '추진', '논의', '개편', '예고', '공청회', '발의', '심사']
};

// ── 최소 RSS 파서 (의존성 없음) ──────────────────────────────
const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? strip(m[1]) : '';
};

function parseRss(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => {
    const b = m[0];
    return {
      title: tag(b, 'title'),
      link: (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').trim(),
      date: tag(b, 'pubDate') || tag(b, 'dc:date'),
      summary: tag(b, 'description').slice(0, 400),
      source: tag(b, 'source')
    };
  });
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// 구글 뉴스 제목은 "제목 - 매체명" 형태
function splitMedia(item) {
  if (item.source) return { title: item.title.replace(new RegExp(` - ${item.source}$`), ''), media: item.source };
  const m = item.title.match(/^(.*) - ([^-]{2,20})$/);
  return m ? { title: m[1], media: m[2] } : { title: item.title, media: '미상' };
}

function classify(text) {
  const hit = (ws) => ws.filter((w) => text.includes(w)).length;
  let field = '기타', best = 0;
  for (const [f, ws] of Object.entries(FIELDS)) { const n = hit(ws); if (n > best) { best = n; field = f; } }
  const level = hit(RISK.crisis) ? 'crisis' : hit(RISK.warning) ? 'warning' : hit(RISK.watch) ? 'watch' : 'normal';
  return { field, level };
}

const UNIV = ['부산대', '경북대', '전남대', '전북대', '충남대', '충북대', '강원대', '경상국립대', '제주대', '서울대'];

// ── 실행 ────────────────────────────────────────────────────
const since = FROM ? Date.parse(FROM + 'T00:00:00Z') : Date.now() - DAYS * 864e5;
const until = TO ? Date.parse(TO + 'T00:00:00Z') : Infinity;
const items = new Map();          // 링크·제목 기준 중복 제거
const feedLog = [];

// 언론사 RSS는 최신 50건만 제공하므로 과거 구간 수집에는 쓸 수 없다(구글 뉴스만 사용).
const feeds = [
  ...GOOGLE_QUERIES.map((q) => ({ kind: 'google', label: `구글뉴스:${q}`, url: gnews(q) })),
  ...(FROM ? [] : PRESS_FEEDS.map((f) => ({ kind: 'press', label: f.media, url: f.url, media: f.media })))
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
      const text = title + ' ' + it.summary;
      const { field, level } = classify(text);
      items.set(key, {
        title, media, link: it.link,
        date: Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null,
        field, level,
        univ: UNIV.filter((u) => text.includes(u)),
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
  window: FROM ? `${FROM} ~ ${TO}` : `최근 ${DAYS}일`,
  from: FROM, to: TO,
  total: all.length,
  signal: {
    crisis: pct(count('level', 'crisis')),
    warning: pct(count('level', 'warning')),
    watch: pct(count('level', 'watch'))
  },
  byField: Object.fromEntries(['거버넌스', '재정', '입시·학령인구', 'AI·디지털', '기타'].map((f) => [f, count('field', f)])),
  byUniv: Object.fromEntries(UNIV.map((u) => [u, all.filter((x) => x.univ.includes(u)).length])),
  feeds: feedLog,
  items: all
};

mkdirSync(join(root, 'data/collected'), { recursive: true });
const file = join(root, `data/collected/${TAG}.json`);
writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');

console.table(feedLog);
console.log(`\n총 ${out.total}건 (중복 제거 후) · ${out.window}`);
console.log(`위험신호  crisis ${out.signal.crisis}% / warning ${out.signal.warning}% / watch ${out.signal.watch}%  → 합산 ${(out.signal.crisis + out.signal.warning).toFixed(1)}%`);
console.log('분야별   ', out.byField);
console.log('대학 언급 ', Object.fromEntries(Object.entries(out.byUniv).filter(([, v]) => v > 0)));
console.log(`\n저장: data/collected/${TAG}.json`);
