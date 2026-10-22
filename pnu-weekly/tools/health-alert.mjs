// 출처 장기 실패를 알림 본문으로 만든다 — 감시 워크플로(watchdog.yml)가 이슈로 올린다.
// 사용: node tools/health-alert.mjs
//   GITHUB_OUTPUT 에 count(장기 실패 출처 수)와 sig(출처 목록 서명 — 바뀌었을 때만 댓글을 달기 위해)를 쓰고,
//   본문은 health-alert.md 로 남긴다.

import { writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHealth, longFailures, KIND_LABEL, LONG_FAIL_DAYS } from '../src/source-health.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = longFailures(loadHealth(root));
const sig = bad.map((b) => b.key).sort().join(', ');

const body = bad.length ? `기록이 있는 최근 ${LONG_FAIL_DAYS}일 이상 수집에 실패한 출처가 ${bad.length}곳 있습니다. 이 출처의 소식은 지금 브리핑과 주간 리포트에서 빠져 있습니다.

| 출처 | 종류 | 실패 시작 | 마지막 성공 | 마지막 오류 |
|---|---|---|---|---|
${bad.map((b) => `| ${b.label} | ${KIND_LABEL[b.kind] || b.kind} | ${b.since} | ${b.lastOk || '기록 안에 없음'} | ${String(b.note).replace(/\|/g, '/')} |`).join('\n')}

흔한 원인
- **사이트 개편·주소 변경** — 옛 주소가 '점검 안내'나 빈 목록을 돌려준다. \`pnu-weekly/src/gov-sites.mjs\` 의 주소와 파서를 확인한다(과기정통부가 2026-10 에 이랬다).
- **해외 IP 차단** — 국내 PC에서는 열리는데 GitHub 러너에서만 \`fetch failed\`. 언론사 RSS 는 \`src/sources.mjs\` 의 \`site:\` 로 구글 뉴스 우회가 걸려 있다.
- **API 일시 장애** — 법령 API 는 실패하면 전날 것을 이어 쓴다(이월). 며칠 이어지면 OC 키·호출 한도를 본다.

일일 브리핑 맨 아래 '수집 상태' 표에서 날짜별 기록을 볼 수 있습니다.
수집이 회복되면 감시 워크플로가 이 이슈를 자동으로 닫습니다.

<!-- sig: ${sig} -->` : '';

writeFileSync(join(root, 'health-alert.md'), body, 'utf8');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${bad.length}\nsig=${sig}\n`);
console.log(bad.length ? `⚠ 장기 실패 ${bad.length}곳: ${bad.map((b) => b.label).join(', ')}` : '✓ 장기 실패 출처 없음');
