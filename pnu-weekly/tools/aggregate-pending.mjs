// 서술 파일은 있는데 본문이 붙지 않은 마감 주차를 찾아 집계한다.
// 사용: node tools/aggregate-pending.mjs   (series.mjs 보다 먼저 돌린다)
//
// 왜 필요한가:
//   주간 서술은 GitHub 의 weekly-report 워크플로가 쓴다. 그 워크플로는 서술 파일 하나만 커밋한다 —
//   weeks.json 은 매시 수집도 고쳐 쓰므로 둘이 같이 건드리면 push 가 엇갈린다.
//   그래서 '서술 → 본문' 결합은 여기, 결정적인 파이프라인 쪽에서 한다.
//   덤으로 사람이 서술을 손으로 써서 올려도 다음 실행에서 저절로 붙는다.
//
//   aggregate 는 주차 객체를 통째로 갈아끼우므로 반드시 series.mjs 앞에서 돈다
//   (뒤에서 돌면 등급·비교지표·주간지표가 지워진다 — daily.yml 의 단계 순서가 그렇다).

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const weeks = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8'));
const ready = weeks.filter((w) => !w.complete && !w.partial && existsSync(join(root, `data/narrative/${w.id}.json`)));

if (!ready.length) { console.log('· 서술이 있는 미완성 주차 없음'); process.exit(0); }

let failed = 0;
for (const w of ready) {
  const r = spawnSync(process.execPath, ['aggregate.mjs', w.id], { cwd: root, encoding: 'utf8' });
  if (r.status === 0) {
    console.log(`✓ ${w.id} ${w.label} — 서술을 붙여 본문 생성`);
  } else {
    // 하나가 실패해도 나머지는 붙인다. 실패는 끝에서 알린다 — 빌드를 깨뜨려 알림 이슈가 뜨게.
    failed++;
    console.error(`✗ ${w.id} 집계 실패\n${(r.stdout || '') + (r.stderr || '')}`.trim());
  }
}
if (failed) process.exit(1);
