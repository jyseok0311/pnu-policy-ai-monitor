// 소급 수집한 주차들 → 실제 시계열을 만들고, 등급 임계값을 실측 분포로 재설정한다.
// 사용: node series.mjs
//
// 왜 필요한가: 임계값(Tier 3 ≥32% 등)이 샘플 데이터 기준이라 실제 분포와 맞지 않았다.
// 임의로 고치는 대신 소급 수집한 주차들의 실제 분포에서 사분위로 뽑는다.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant, googleOnly, mentionsOf } from './src/filter.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// ISO 주차 번호
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
const fmt = (iso) => iso.replace(/-/g, '.');

// ── 수집본 → 주차 통계
const files = readdirSync(join(root, 'data/collected')).filter((f) => f.endsWith('.json')).sort();
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
const stats = files.map((f) => {
  const raw = J(`data/collected/${f}`);
  // 진행 중 주차(to 가 비어 있음)의 끝은 '그 주가 닫히는 금요일'로 잡는다.
  // 수집한 날로 잡으면 토·일에 돌린 실행분이 ISO 주차 번호상 지난 주차와 같은 id 를 얻어
  // 완성 주차를 덮어쓴다(금~일이 같은 ISO 주에 들어간다).
  const partial = !raw.to && !!raw.from;
  const to = raw.to || (raw.from ? addDays(raw.from, 7) : raw.collectedAt.slice(0, 10));
  const from = raw.from || addDays(to, -7);

  // 비교 가능성: 과거 주차는 구글 뉴스로만 수집되므로 전 주차를 구글 소스로 통일한다
  // 주차 비교 지표는 구글 뉴스 '국내' 소스로 통일한다(과거 주차엔 해외 수집분이 없다).
  const all = relevant(raw.items);
  const items = googleOnly(all);
  const n = items.length || 1;
  const p = (l) => +((items.filter((x) => x.level === l).length / n) * 100).toFixed(1);
  const crisis = p('crisis'), warning = p('warning');
  const d = new Date(Date.parse(to));
  // 진행 중 주차가 실제로 담고 있는 마지막 기사 날짜 — 화면에 '어디까지 모였는지' 적기 위해서다
  const dates = items.map((x) => x.date).filter(Boolean).sort();
  return {
    file: f, from, to, partial, upto: dates[dates.length - 1] || from, days: new Set(dates).size,
    week: isoWeek(d),
    id: 'w' + isoWeek(d),
    label: `${fmt(to)} (Week ${isoWeek(d)})`,
    range: `${fmt(from)}~${fmt(to)}`,
    total: items.length, crisis, warning, risk: +(crisis + warning).toFixed(1),
    field: (fl) => items.filter((x) => x.field === fl).length,
    pnu: mentionsOf(items, '부산대'),
    overseas: all.filter((x) => x.region === 'overseas').length,   // 비교 대상 아님 — 참고용
    items
  };
}).sort((a, b) => b.to.localeCompare(a.to));   // 최신 → 과거

// ── 임계값 재설정 (중앙값 + MAD)
// 사분위로 뽑았더니 표본이 8주뿐이라 Tier4(6.9%)와 Tier3(6.7%)이 붙어 구분이 무의미해졌다.
// 중앙값에서 MAD(중앙절대편차) 간격으로 띄워 밴드가 항상 분리되도록 한다.
// 임계값은 '완결된 주차'로만 잡는다. 3일치만 모인 진행 중 주차를 섞으면
// 표본 크기가 다른 값이 분포에 끼어들어 밴드가 흔들린다.
const risks = stats.filter((s) => !s.partial).map((s) => s.risk).sort((a, b) => a - b);
const med = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const M = med(risks);
const MAD = Math.max(med(risks.map((r) => Math.abs(r - M))), 1.0);  // 최소 간격 1.0%p 보장
const TH = { t4: +(M + 2 * MAD).toFixed(1), t3: +(M + MAD).toFixed(1), t2: +M.toFixed(1) };
const tierOf = (r) => (r >= TH.t4 ? 4 : r >= TH.t3 ? 3 : r >= TH.t2 ? 2 : 1);
const WORD = { 4: '위기', 3: '경계', 2: '주의', 1: '관심' };
const STATE = { 4: 'Crisis', 3: 'Warning', 2: 'Watch', 1: 'Normal' };

console.log(`· 수집본 ${files.length}개 → 주차 ${stats.length}개`);
console.log(`· 위험신호 분포: ${risks.join(' / ')}`);
console.log(`· 재설정 임계값: Tier4 ≥${TH.t4}% · Tier3 ≥${TH.t3}% · Tier2 ≥${TH.t2}%\n`);

// ── weeks.json 재구성: 실데이터만 남긴다 (기획용 샘플 주차는 제거)
const existing = J('data/weeks.json');
// aggregate.mjs 가 만든 완성 주차를 전부 보존한다.
// (예전에는 find 로 하나만 잡아 나머지 완성 주차가 신호만으로 덮이는 버그가 있었다)
const fullById = new Map(existing.filter((w) => w.complete).map((w) => [w.id, w]));
const weeks = [];

for (const s of stats) {
  const tier = tierOf(s.risk);
  const prev = stats.find((x) => x.to < s.to);
  const trend = !prev ? 'baseline' : s.risk > prev.risk * 1.1 ? 'rising' : s.risk < prev.risk * 0.9 ? 'falling' : 'stable';

  const full = fullById.get(s.id);
  if (full) {
    // 완성 주차: 서술·지도·표는 유지하고 비교 가능 지표만 갱신
    full.tier = tier; full.tierName = WORD[tier]; full.state = STATE[tier];
    full.signal.trend = trend;
    full.comparable = { total: s.total, crisis: s.crisis, warning: s.warning, risk: s.risk };
    if (prev) {
      const dd = (a, b, u = '') => `${a - b >= 0 ? '+' : ''}${(a - b).toFixed(u === '%p' ? 1 : 0)}${u}`;
      full.changesTitle = '전주 대비 주요 변화';
      full.changesNote = `비교 지표는 구글 뉴스 소스로 통일해 산출했다(과거 주차는 언론사 RSS 소급이 불가). 이번 주 ${s.total}건 vs 전주 ${prev.total}건.`;
      full.weeklyMetrics = [
        { name: '위험신호 비중', value: String(s.risk), unit: '%', change: dd(s.risk, prev.risk, '%p'), dir: s.risk > prev.risk ? 'up' : s.risk < prev.risk ? 'down' : 'flat' },
        { name: '수집 기사(비교기준)', value: s.total.toLocaleString('ko-KR'), unit: '건', change: dd(s.total, prev.total, '건'), dir: s.total > prev.total ? 'up' : 'down' },
        { name: '정책/철학 기사', value: String(s.field('정책/철학')), unit: '건', change: dd(s.field('정책/철학'), prev.field('정책/철학'), '건'), dir: s.field('정책/철학') >= prev.field('정책/철학') ? 'up' : 'down' },
        { name: '증강인재교육 기사', value: String(s.field('증강인재교육')), unit: '건', change: dd(s.field('증강인재교육'), prev.field('증강인재교육'), '건'), dir: s.field('증강인재교육') >= prev.field('증강인재교육') ? 'up' : 'down' },
        { name: '부산대 직접 언급', value: String(s.pnu), unit: '건', change: dd(s.pnu, prev.pnu, '건'), dir: s.pnu >= prev.pnu ? 'up' : 'down' },
        // 해외 기사는 참고 항목이다. 비율(전체의 n%)로 적으면 국내 지표에 섞인 것처럼 읽힌다.
        { name: '해외 기사 (참고)', value: String(s.overseas), unit: '건', change: s.overseas ? '신호·지표 미반영 · 별도 항목' : '수집 전 주차', dir: 'flat' },
        { name: '추세', value: trend, unit: '', change: `전주 ${prev.risk}%`, dir: trend === 'rising' ? 'up' : trend === 'falling' ? 'down' : 'flat' }
      ];
    }
    weeks.push(full);
  } else {
    weeks.push({
      id: s.id, label: s.label, date: s.to, range: s.range,
      tier, tierName: WORD[tier], state: STATE[tier],
      complete: false, live: true, partial: s.partial,
      sourceNote: s.partial
        ? `진행 중 — ${fmt(s.from)}부터 ${fmt(s.upto)}까지 ${s.days}일치 수집 · 관련 기사 ${s.total}건 (주차 마감 후 본문 생성)`
        : `구글 뉴스 소급 수집 · 관련 기사 ${s.total}건`,
      signal: { crisis: s.crisis, warning: s.warning, total: s.total, trend }
    });
  }
}

writeFileSync(join(root, 'data/weeks.json'), JSON.stringify(weeks, null, 2), 'utf8');
// samples 는 임계값 표본 = 완결 주차 수. 진행 중 주차는 weeksTotal 에만 잡힌다.
writeFileSync(join(root, 'data/thresholds.json'), JSON.stringify({ ...TH, method: '중앙값 + MAD(최소 1.0%p)', median: M, mad: +MAD.toFixed(2), samples: risks.length, weeksTotal: stats.length, note: '표본이 12주 미만이면 잠정값으로 취급할 것', updated: new Date().toISOString().slice(0, 10) }, null, 2), 'utf8');

console.log('주차   기간                    기사   위험신호  Tier  추세');
weeks.forEach((w) => {
  const c = w.comparable || w.signal;
  console.log(`${w.id.padEnd(6)} ${w.range.padEnd(22)} ${String(c.total).padStart(4)}   ${String(c.risk ?? (c.crisis + c.warning).toFixed(1)).padStart(6)}%   T${w.tier}   ${w.signal.trend}${w.complete ? '   ← 본문 생성' : ''}`);
});
