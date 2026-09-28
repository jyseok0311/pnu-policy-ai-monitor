// 서술을 쓰기 위한 자료 묶음을 뽑는다.
// 사용: node tools/week-brief.mjs [주차id]   (생략하면 본문이 비어 있는 가장 최근 마감 주차)
//
// 왜 필요한가:
//   주간 서술을 무인으로 맡기면 가장 큰 위험은 '없는 사실을 그럴듯하게 쓰는 것'이다.
//   그래서 쓰는 쪽이 수집본을 직접 뒤지게 두지 않고, 여기서 뽑은 자료만 보도록 한다.
//   여기 실린 제목은 전부 실제 수집된 기사다 — 서술의 refKey 는 이 목록 안에서만 골라야 한다.
//
//   숫자는 서술에 넣지 않는다. 신호·건수·등급은 aggregate.mjs 가 수집본에서 직접 센다.
//   이 브리프의 숫자는 '무엇이 큰 흐름인지' 판단하라고 보여 주는 것이지 옮겨 적으라는 게 아니다.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant } from '../src/filter.mjs';
import { extract } from '../src/keywords.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);

const weeks = J('data/weeks.json');

// ── 대상 주차: 인자로 받거나, 닫혔는데 본문이 없는 가장 최근 주차
const ID = process.argv[2] || (weeks.find((w) => !w.complete && !w.partial) || {}).id;
if (!ID) { console.error('✗ 본문이 필요한 마감 주차가 없습니다.'); process.exit(2); }
const wk = weeks.find((w) => w.id === ID);
if (!wk) { console.error(`✗ ${ID} 주차를 찾지 못했습니다.`); process.exit(2); }
if (wk.partial) { console.error(`✗ ${ID} 는 아직 진행 중입니다(마감 전).`); process.exit(2); }

// 주차는 끝나는 날로 이름 붙고, 수집본은 시작하는 날로 저장된다.
const collected = addDays(wk.date, -7);
const file = `data/collected/${collected}.json`;
if (!existsSync(join(root, file))) { console.error(`✗ 수집본 없음: ${file}`); process.exit(2); }

const raw = J(file);
const all = relevant(raw.items);
const dom = all.filter((x) => x.region !== 'overseas');
const oversea = all.filter((x) => x.region === 'overseas');

// ── 중복 제거: 같은 사건을 여러 매체가 받아쓴다. 제목 앞부분이 같으면 한 건으로 본다.
const dedup = (arr, n = 26) => {
  const seen = new Set(); const out = [];
  for (const x of arr) {
    const k = x.title.replace(/\s+/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, n);
    if (seen.has(k)) continue;
    seen.add(k); out.push(x);
  }
  return out;
};
const line = (x) => `  - ${x.title}   〔${x.media} · ${x.date}〕`;
const block = (title, arr, cap) => {
  if (!arr.length) return `\n## ${title}\n  (없음)\n`;
  return `\n## ${title}  — ${arr.length}건 중 ${Math.min(cap, arr.length)}건\n` +
    arr.slice(0, cap).map(line).join('\n') + '\n';
};

// ── 전주 비교 — '무엇이 달라졌나'를 쓰려면 앞 주차를 알아야 한다
const prev = weeks.filter((w) => w.date < wk.date).sort((a, b) => b.date.localeCompare(a.date))[0];
let prevNote = '';
if (prev) {
  const pc = prev.comparable || prev.signal || {};
  const c = wk.comparable || wk.signal || {};
  prevNote = `이번 주차 위험신호 ${c.risk ?? '-'}% (기사 ${c.total ?? '-'}건) · ` +
    `전주 ${prev.label} ${pc.risk ?? '-'}% (기사 ${pc.total ?? '-'}건)`;
  if (prev.complete && prev.summary) {
    prevNote += `\n\n전주에 다룬 소제목 — 이어지는 사안인지 새 사안인지 판단에 쓸 것:\n` +
      prev.summary.map((g) => `  · ${g.h}`).join('\n');
  }
}

// ── 키워드 — 어떤 말이 이 주를 지배했는지
// extract 는 { nodes, links, ... } 를 준다 — 네트워크용 구조라 nodes 만 쓴다.
const kw = extract(dom).nodes.slice(0, 24).map((k) => `${k.key}(${k.n})`).join(' · ');

const fields = {};
dom.forEach((x) => { fields[x.field] = (fields[x.field] || 0) + 1; });

const crisis = dedup(dom.filter((x) => x.level === 'crisis'));
const warning = dedup(dom.filter((x) => x.level === 'warning'));
const pnu = dedup(dom.filter((x) => x.title.includes('부산대')));
const industry = dedup(dom.filter((x) => ['적응형행정', 'AX 기술 동향'].includes(x.field)));
const local = dedup(dom.filter((x) => x.local));

console.log(`# ${wk.label} 서술 자료

주차 id      : ${ID}
기간         : ${wk.range}
수집본       : ${file}   ← 서술 파일의 "collected" 에 "${collected}" 를 적을 것
분야 분포    : ${Object.entries(fields).map(([k, v]) => `${k} ${v}`).join(' · ')}
상위 키워드  : ${kw}

${prevNote}

────────────────────────────────────────────────────────────
아래 제목은 전부 실제 수집된 기사다. refKey 는 이 제목들의 '부분 문자열'이어야 하며,
목록에 없는 사실은 쓰지 않는다. 숫자(건수·비율)는 서술에 넣지 않는다 — 코드가 센다.
────────────────────────────────────────────────────────────`
+ block('위기 신호', crisis, 40)
+ block('경고 신호', warning, 25)
+ block('부산대 언급', pnu, 30)
+ block('산업 — 적응형행정 · AX 기술 동향', industry, 30)
+ block('부울경 지역', local, 20)
+ `\n## 해외 참고  — ${oversea.length}건 (국내 지표에 반영하지 않음)\n`
+ dedup(oversea).slice(0, 10).map(line).join('\n') + '\n');
