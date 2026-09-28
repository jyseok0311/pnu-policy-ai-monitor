// 서술 파일 하나로 주차 리포트를 끝까지 굽는다.
// 사용: node tools/publish-week.mjs w39 [--no-pdf]
//
// 왜 스크립트로 묶는가:
//   순서가 틀리면 조용히 망가진다. aggregate 는 주차 객체를 통째로 갈아끼우므로
//   series 를 먼저 돌리면 등급·비교지표·주간지표가 지워진 채 남는다.
//   실제로 그렇게 해서 전 주차가 T1 로 뭉개진 적이 있다.
//   무인 실행에서 그 실수가 나면 아무도 모르므로 순서를 코드에 박아 둔다.
//
//   단계마다 실패하면 즉시 멈춘다 — 반쯤 만들어진 상태로 배포되는 것이 가장 나쁘다.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID = process.argv[2];
const noPdf = process.argv.includes('--no-pdf');
if (!ID) { console.error('사용: node tools/publish-week.mjs <주차id> [--no-pdf]'); process.exit(2); }

const steps = [
  ['서술 검사', ['tools/check-narrative-file.mjs', ID], '서술 파일을 고친 뒤 다시 실행하세요.'],
  ['주차 집계', ['aggregate.mjs', ID], null],
  // ↓ 반드시 aggregate 뒤. 등급·임계값·비교지표를 여기서 다시 세운다.
  ['시계열·등급', ['series.mjs'], null],
  ['주간 HTML', ['build.mjs'], null],
  ['일일 HTML', ['daily.mjs'], null]
];
if (!noPdf) steps.push(['PDF', ['pdf.mjs'], null]);

console.log(`▶ ${ID} 리포트 생성 — ${steps.length}단계\n`);
for (const [name, args, hint] of steps) {
  process.stdout.write(`  [${name}] `);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('실패\n');
    console.error((r.stdout || '') + (r.stderr || ''));
    if (hint) console.error(`\n→ ${hint}`);
    process.exit(1);
  }
  // 마지막 의미 있는 한 줄만 보여 준다 — 무인 로그가 길어지면 아무도 안 읽는다
  const tail = (r.stdout || '').trim().split('\n').filter((l) => l.trim()).pop() || 'ok';
  console.log(tail.trim().slice(0, 96));
}

// ── 끝났는지 실제로 확인한다. 단계가 0 으로 끝났다는 것과 결과가 생겼다는 것은 다르다.
const wk = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8')).find((w) => w.id === ID);
if (!wk || !wk.complete) { console.error(`\n✗ ${ID} 가 여전히 미완성입니다.`); process.exit(1); }
console.log(`\n✓ ${ID} 완료 — ${wk.label} · Tier ${wk.tier} ${wk.tierName} · 참조 기사 ${wk.refs.length}건`);
