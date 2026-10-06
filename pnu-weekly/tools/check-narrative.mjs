// 본문이 비어 있는 마감 주차를 찾는다.
// 사용: node tools/check-narrative.mjs
//
// 왜 필요한가:
//   주차 본문은 자동으로 만들어지지 않는다. aggregate.mjs 가 서술 파일
//   data/narrative/<id>.json 을 첫 입력으로 요구하는데, 그 파일은 사람이(LLM이) 쓴다.
//   워크플로에는 aggregate 단계 자체가 없다 — 넣어 봐야 서술이 없으면 돌지 않는다.
//
//   그래서 금요일에 주차가 닫히면 그 주차는 조용히 '리포트가 생성되지 않았습니다' 상태로
//   사이트에 남는다. 수집도 배포도 성공하므로 아무도 실패를 통보받지 않는다.
//   Week 38 과 Week 39 가 연달아 이렇게 지나갔다.
//
//   빌드를 깨뜨리지는 않는다 — 본문이 없어도 사이트는 정상이고 신호 수치는 맞다.
//   다만 '대기 중'이라는 사실을 워크플로가 알 수 있도록 내보내, 이슈로 남게 한다.

import { readFileSync, existsSync } from 'node:fs';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const weeks = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8'));

// 마감됐는데 본문이 없는 주차.
//   complete = aggregate 를 거쳐 본문이 붙었는가
//   partial  = 아직 진행 중인가(금요일이 오지 않음)
// 둘 다 false 면 '닫혔는데 본문이 없다'는 뜻이다.
const pending = weeks.filter((w) => !w.complete && !w.partial);

if (!pending.length) {
  console.log('✓ 마감된 주차에 모두 본문이 있습니다.');
} else {
  console.log(`⏳ 본문 대기 ${pending.length}개 주차`);
  for (const w of pending) {
    const has = existsSync(join(root, `data/narrative/${w.id}.json`));
    console.log(`  · ${w.id}  ${w.label}  서술파일 ${has ? '있음 — aggregate 만 돌리면 됩니다' : '없음 — 먼저 작성해야 합니다'}`);
  }
  console.log('\n  만드는 법:  node aggregate.mjs <id>  →  node series.mjs  →  node build.mjs  →  node pdf.mjs');
  console.log('  series.mjs 를 반드시 aggregate 뒤에 돌린다 — aggregate 는 주차 객체를 통째로 갈아끼우므로');
  console.log('  먼저 돌리면 등급·비교지표·주간지표가 지워진다.');
}

// '써야 할' 주차 — 달력상 닫혔고, 본문도 없고, 서술 파일도 아직 없는 것.
// weekly-report 워크플로가 이것만 보고 쓴다. pending 만 보면 안 된다:
// 서술을 이미 올렸지만 아직 집계 전인 주차도 pending 이라, 두 번째 실행이 써 둔 서술을 덮어쓴다.
// partial 깃발 대신 달력으로 판단한다 — weeks.json 의 깃발은 마지막 수집 실행 때 값이라 늦을 수 있다.
const kstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const needWrite = weeks.filter((w) => !w.complete && w.date && w.date <= kstToday
  && !existsSync(join(root, `data/narrative/${w.id}.json`)));

// 워크플로가 읽을 수 있게 내보낸다. 실패로 끝내지는 않는다 — 사이트는 멀쩡하기 때문이다.
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT,
    `pending=${pending.length}\n` +
    `pending_list=${pending.map((w) => `${w.id} (${w.label})`).join(', ')}\n` +
    `need_write=${needWrite.length}\n` +
    `need_write_ids=${needWrite.map((w) => w.id).join(' ')}\n`);
}
if (needWrite.length) console.log(`\n✍ 서술을 새로 써야 할 주차: ${needWrite.map((w) => w.id).join(' ')}`);
