// 서술 파일을 본문에 반영한다 — 새로 올라온 것과 고쳐진 것 둘 다.
// 사용: node tools/aggregate-pending.mjs   (series.mjs 보다 먼저 돌린다)
//
// 대상
//   ① 마감됐는데 본문이 없고 서술 파일이 있는 주차 — weekly-report 워크플로가 서술만 올리면 여기서 본문이 붙는다.
//   ② 이미 본문이 있지만 서술 파일이 그 뒤에 바뀐 주차 — 서술 파일만 고쳐 올려도 화면이 바뀐다.
//      본문을 만든 서술의 지문(week.narrativeHash)과 지금 서술 파일의 지문이 다르면 다시 집계한다.
//      예전에는 ② 가 없어서, 완료된 주차의 서술을 고치면 weeks.json 까지 손으로 다시 만들어 올려야 했다.
//
// 잘못된 서술이 배포를 막지 않게 한다
//   집계 전에 tools/check-narrative-file.mjs 로 먼저 검사한다. 통과하지 못하면 그 주차는 건너뛰고
//   이전 본문을 그대로 둔다(고친 서술이 깨졌다고 멀쩡한 화면까지 내리지 않는다).
//   건너뛴 사실은 GitHub 의 주석(::error)과 출력(narr_bad)으로 알린다 — 워크플로가 이슈를 연다.
//   새 서술(①)도 같다: 사이트는 계속 배포되고 본문만 비어 있다.
//
// aggregate 는 주차 객체를 통째로 갈아끼우므로 반드시 series.mjs 앞에서 돈다
// (뒤에서 돌면 등급·비교지표·주간지표가 지워진다 — daily.yml 의 단계 순서가 그렇다).
//
// 부수 효과: 다시 집계하는 주차는 '오늘 기준' 값이 갱신된다(인증 만료까지 남은 일수 등).
// 서술과 무관한 값이고 aggregate 가 늘 그렇게 계산해 왔다.

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrativeHash } from '../src/narrative-hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const weeks = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8'));
const narrFile = (id) => join(root, `data/narrative/${id}.json`);

const targets = [];
for (const w of weeks) {
  if (!existsSync(narrFile(w.id))) continue;
  if (!w.complete && !w.partial) { targets.push({ w, why: '새 서술' }); continue; }       // ①
  if (w.complete) {                                                                       // ②
    let h; try { h = narrativeHash(narrFile(w.id)); } catch { h = 'unreadable'; }
    if (w.narrativeHash && w.narrativeHash !== h) targets.push({ w, why: '서술 수정' });
  }
}

if (!targets.length) { console.log('· 반영할 서술 없음'); process.exit(0); }

const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
const bad = [];

for (const { w, why } of targets) {
  const chk = run(['tools/check-narrative-file.mjs', w.id]);
  if (chk.status !== 0) {
    const msg = ((chk.stderr || '') + (chk.stdout || '')).trim();
    bad.push({ id: w.id, why, msg });
    console.error(`✗ ${w.id} ${w.label} — 서술 검사 실패(${why}). 이전 본문을 그대로 둡니다.\n${msg}`);
    console.log(`::error file=pnu-weekly/data/narrative/${w.id}.json::${w.id} 서술 검사 실패 — 이전 본문을 그대로 둡니다. ${msg.split('\n').find((l) => /✗|없음|불일치|허용값|refKey/.test(l)) || ''}`);
    continue;
  }
  const r = run(['aggregate.mjs', w.id]);
  if (r.status === 0) {
    console.log(`✓ ${w.id} ${w.label} — ${why}: 본문 ${w.complete ? '다시 ' : ''}생성`);
  } else {
    const msg = ((r.stderr || '') + (r.stdout || '')).trim();
    bad.push({ id: w.id, why, msg });
    console.error(`✗ ${w.id} 집계 실패(${why}). 이전 본문을 그대로 둡니다.\n${msg}`);
    console.log(`::error file=pnu-weekly/data/narrative/${w.id}.json::${w.id} 집계 실패 — 이전 본문을 그대로 둡니다.`);
  }
}

// 워크플로가 읽는 출력. 실패해도 빌드는 계속한다 — 사이트는 멀쩡하다.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT,
    `narr_bad=${bad.map((b) => b.id).join(' ')}\n` +
    `narr_bad_msg=${bad.map((b) => `${b.id}: ${(b.msg.split('\n').find((l) => /✗/.test(l)) || b.msg.split('\n')[0] || '').slice(0, 160)}`).join(' | ').replace(/[\r\n%]/g, ' ')}\n`);
}
if (bad.length) console.log(`\n⚠ ${bad.length}개 주차는 건너뛰었습니다: ${bad.map((b) => b.id).join(', ')}`);
