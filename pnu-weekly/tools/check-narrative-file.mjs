// 서술 파일을 aggregate 에 넣기 전에 검사한다. 아무것도 바꾸지 않는다.
// 사용: node tools/check-narrative-file.mjs w39
//
// 왜 따로 두는가:
//   aggregate.mjs 도 refKey 를 검사하고 못 찾으면 중단한다. 그런데 그건 weeks.json 을
//   이미 건드리기 직전이고, 오류도 refKey 하나만 알려 준다.
//   무인으로 돌릴 때는 '고쳐서 다시'를 반복해야 하므로, 손대기 전에 전부 모아서 보여 준다.
//
//   검사 항목
//     1. 필수 칸이 다 있는가 (없으면 렌더에서 빈 구역이 생긴다)
//     2. refKey 가 실제 기사 제목에 걸리는가 — 지어낸 근거를 막는 핵심 장치
//     3. 서술에 집계 수치를 적어 넣지 않았는가 — 숫자는 코드만 만든다는 역할 분리
//     4. 값 범위가 맞는가 (d/lv/chg/dir 은 렌더가 클래스 이름으로 쓴다)

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant } from '../src/filter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const ID = process.argv[2];
if (!ID) { console.error('사용: node tools/check-narrative-file.mjs <주차id>'); process.exit(2); }

const path = `data/narrative/${ID}.json`;
if (!existsSync(join(root, path))) { console.error(`✗ 없음: ${path}`); process.exit(2); }

let narr;
try { narr = J(path); } catch (e) { console.error(`✗ JSON 문법 오류: ${e.message}`); process.exit(1); }

const err = [];
const warn = [];

// ── 1. 필수 칸
// 자동 취합본(mode:'digest')은 해석 칸(경로·부문별·진단)을 일부러 비운다 — 코드가 해석을 흉내 내지 않는다.
// 그래도 요약의 refKey 가 실제 기사에 걸리는지, 집계 수치가 안 섞였는지는 똑같이 검사한다.
const digest = narr.mode === 'digest';
const need = ['id', 'label', 'date', 'range', 'collected', 'summary', 'changes', 'watch', 'legend',
  ...(digest ? [] : ['paths', 'innerPaths', 'sectors', 'diagnosis'])];
for (const k of need) if (narr[k] === undefined) err.push(`필수 칸 없음: ${k}`);
if (narr.id && narr.id !== ID) err.push(`id 불일치: 파일은 ${ID}, 내용은 ${narr.id}`);
for (const k of ['primary', 'secondary', 'disturb', 'buffer']) {
  if (narr.legend && !narr.legend[k]) err.push(`legend.${k} 없음`);
}
if (narr.diagnosis) {
  if (!Array.isArray(narr.diagnosis.weak) || !narr.diagnosis.weak.length) err.push('diagnosis.weak 비어 있음');
  if (!Array.isArray(narr.diagnosis.rec) || !narr.diagnosis.rec.length) err.push('diagnosis.rec 비어 있음');
}
// 너무 빈약하면 화면에 구역이 휑하게 남는다
const least = digest ? { summary: 2 } : { summary: 3, changes: 3, watch: 3, paths: 2, innerPaths: 2, sectors: 4 };
for (const [k, n] of Object.entries(least)) {
  if (Array.isArray(narr[k]) && narr[k].length < n) warn.push(`${k} 가 ${narr[k].length}개뿐 — 최소 ${n}개 권장`);
}

// ── 2. 값 범위
const ok = (v, set, where) => { if (v !== undefined && !set.includes(v)) err.push(`${where}: '${v}' 는 허용값이 아님 (${set.join('/')})`); };
(narr.changes || []).forEach((c, i) => ok(c.dir, ['up', 'down'], `changes[${i}].dir`));
(narr.sectors || []).forEach((s, i) => {
  ok(s.d, ['pos', 'neg', 'mix'], `sectors[${i}].d`);
  ok(s.chg, ['up', 'down', 'flat'], `sectors[${i}].chg`);
  if (!Array.isArray(s.lv) || s.lv.length !== 3) err.push(`sectors[${i}].lv 는 3개여야 함(초기·중기·장기)`);
  else s.lv.forEach((l, j) => ok(l, ['s', 'i', 'm', 'l'], `sectors[${i}].lv[${j}]`));
});
(narr.paths || []).forEach((p, i) => ok(p.cls, ['', 'w'], `paths[${i}].cls`));

// ── 3. refKey → 실제 기사
const collectedFile = `data/collected/${narr.collected}.json`;
if (!existsSync(join(root, collectedFile))) {
  err.push(`수집본 없음: ${collectedFile} (collected 값 확인)`);
} else {
  const items = relevant(J(collectedFile).items).filter((x) => x.region !== 'overseas');
  const miss = [];
  let total = 0;
  for (const g of narr.summary || []) {
    for (const it of g.items || []) {
      if (!it.refKey || !it.refKey.length) { warn.push(`근거 없는 문장: "${(it.t || '').slice(0, 34)}…"`); continue; }
      for (const k of it.refKey) {
        total++;
        if (!items.some((x) => x.title.includes(k))) miss.push(k);
      }
    }
  }
  if (miss.length) err.push(`refKey 가 기사에 없음 (${miss.length}/${total}):\n     - ` + [...new Set(miss)].join('\n     - '));
  else console.log(`· refKey ${total}개 전부 실제 기사에 결합됨`);

  // ── 4. 집계 수치를 서술에 적었는지 — 역할 분리를 깨는 전형적 실수
  //    '9개 거점국립대 중 3곳' 처럼 기사에 적힌 사실은 괜찮다.
  //    걸러야 할 것은 이 파이프라인이 세는 값이다 — 수집 건수·위험신호 비율·주차 등급.
  const text = JSON.stringify([narr.summary, narr.changes, narr.watch, narr.diagnosis]);
  const banned = [
    [/위험신호\s*\d+(\.\d+)?\s*%/, '위험신호 비율'],
    [/(수집|관련)\s*기사\s*[\d,]+\s*건/, '수집 기사 건수'],
    [/Tier\s*[1-4]/i, '주차 등급'],
    [/전주\s*대비\s*[+-]?\d+(\.\d+)?\s*%p/, '전주 대비 증감']
  ];
  for (const [re, what] of banned) if (re.test(text)) err.push(`서술에 집계 수치가 들어 있음 (${what}) — 숫자는 aggregate 가 센다`);
}

// ── 결과
console.log('');
warn.forEach((w) => console.log(`⚠ ${w}`));
if (err.length) {
  console.error(`\n✗ ${ID} 서술 검사 실패 — ${err.length}건`);
  err.forEach((e) => console.error(`   ${e}`));
  process.exit(1);
}
console.log(`✓ ${ID} 서술 검사 통과${warn.length ? ` (경고 ${warn.length}건)` : ''}`);
