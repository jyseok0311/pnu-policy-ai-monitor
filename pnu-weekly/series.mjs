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
const stats = files.map((f) => {
  const raw = J(`data/collected/${f}`);
  const to = raw.to || raw.collectedAt.slice(0, 10);
  const from = raw.from || new Date(Date.parse(to) - 7 * 864e5).toISOString().slice(0, 10);

  // 비교 가능성: 과거 주차는 구글 뉴스로만 수집되므로 전 주차를 구글 소스로 통일한다
  const items = relevant(googleOnly(raw.items));
  const n = items.length || 1;
  const p = (l) => +((items.filter((x) => x.level === l).length / n) * 100).toFixed(1);
  const crisis = p('crisis'), warning = p('warning');
  const d = new Date(Date.parse(to));
  return {
    file: f, from, to, week: isoWeek(d),
    id: 'w' + isoWeek(d),
    label: `${fmt(to)} (Week ${isoWeek(d)})`,
    range: `${fmt(from)}~${fmt(to)}`,
    total: items.length, crisis, warning, risk: +(crisis + warning).toFixed(1),
    field: (fl) => items.filter((x) => x.field === fl).length,
    pnu: mentionsOf(items, '부산대'),
    items
  };
}).sort((a, b) => b.to.localeCompare(a.to));   // 최신 → 과거

// ── 임계값 재설정 (중앙값 + MAD)
// 사분위로 뽑았더니 표본이 8주뿐이라 Tier4(6.9%)와 Tier3(6.7%)이 붙어 구분이 무의미해졌다.
// 중앙값에서 MAD(중앙절대편차) 간격으로 띄워 밴드가 항상 분리되도록 한다.
const risks = stats.map((s) => s.risk).sort((a, b) => a - b);
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
        { name: '거버넌스 기사', value: String(s.field('거버넌스')), unit: '건', change: dd(s.field('거버넌스'), prev.field('거버넌스'), '건'), dir: s.field('거버넌스') >= prev.field('거버넌스') ? 'up' : 'down' },
        { name: 'AI·디지털 기사', value: String(s.field('AI·디지털')), unit: '건', change: dd(s.field('AI·디지털'), prev.field('AI·디지털'), '건'), dir: s.field('AI·디지털') >= prev.field('AI·디지털') ? 'up' : 'down' },
        { name: '부산대 직접 언급', value: String(s.pnu), unit: '건', change: dd(s.pnu, prev.pnu, '건'), dir: s.pnu >= prev.pnu ? 'up' : 'down' },
        { name: '추세', value: trend, unit: '', change: `전주 ${prev.risk}%`, dir: trend === 'rising' ? 'up' : trend === 'falling' ? 'down' : 'flat' }
      ];
    }
    weeks.push(full);
  } else {
    weeks.push({
      id: s.id, label: s.label, date: s.to, range: s.range,
      tier, tierName: WORD[tier], state: STATE[tier],
      complete: false, live: true,
      sourceNote: `구글 뉴스 소급 수집 · 관련 기사 ${s.total}건`,
      signal: { crisis: s.crisis, warning: s.warning, total: s.total, trend }
    });
  }
}

writeFileSync(join(root, 'data/weeks.json'), JSON.stringify(weeks, null, 2), 'utf8');
writeFileSync(join(root, 'data/thresholds.json'), JSON.stringify({ ...TH, method: '중앙값 + MAD(최소 1.0%p)', median: M, mad: +MAD.toFixed(2), samples: stats.length, note: '표본이 12주 미만이면 잠정값으로 취급할 것', updated: new Date().toISOString().slice(0, 10) }, null, 2), 'utf8');

console.log('주차   기간                    기사   위험신호  Tier  추세');
weeks.forEach((w) => {
  const c = w.comparable || w.signal;
  console.log(`${w.id.padEnd(6)} ${w.range.padEnd(22)} ${String(c.total).padStart(4)}   ${String(c.risk ?? (c.crisis + c.warning).toFixed(1)).padStart(6)}%   T${w.tier}   ${w.signal.trend}${w.complete ? '   ← 본문 생성' : ''}`);
});
