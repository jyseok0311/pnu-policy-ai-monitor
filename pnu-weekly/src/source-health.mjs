// 출처별 수집 이력 — data/source-health.json
//
// 왜 필요한가:
//   수집본에는 '이번 실행'의 피드 상태만 남는다. 그래서 한 출처가 몇 주째 0건이어도 아무도 몰랐다.
//   대학지(유니프레스)는 GitHub 러너에서만 막혀 5주 넘게, 과기정통부는 게시판 주소가 바뀌어 2주 넘게 비어 있었다.
//   수집 검증(check-collect)은 '전체가 절반 이상 실패'만 보므로 출처 하나가 죽은 것은 걸리지 않는다.
//
//   그래서 출처마다 날짜별로 성공·실패 횟수를 쌓는다.
//   tools/source-health.mjs 가 수집 실행마다 갱신하고, 일일 브리핑의 '수집 상태' 표와
//   감시 워크플로(watchdog.yml)의 '출처 장기 실패' 알림이 이 파일을 읽는다.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const KEEP_DAYS = 14;        // 이 기간만 남긴다
export const LONG_FAIL_DAYS = 3;    // 기록이 있는 최근 n일이 모두 실패면 '장기 실패'

export const KIND_LABEL = { news: '구글 뉴스 검색어', press: '대학 전문 언론 RSS', overseas: '해외 검색어', org: '기관 보도자료', legal: '법령·조례' };
export const KIND_ORDER = ['org', 'press', 'legal', 'news', 'overseas'];

export function loadHealth(root) {
  const p = join(root, 'data/source-health.json');
  if (!existsSync(p)) return { updatedAt: null, sources: {} };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { updatedAt: null, sources: {} }; }
}

// 하루치 기록 → ok | partial | fallback | fail
//   fallback = 성공했지만 원래 경로가 아닌 우회로(구글 뉴스 site:)로 받은 것
export function dayStatus(rec) {
  if (!rec) return null;
  if (rec.ok && rec.fail) return 'partial';
  if (rec.ok) return rec.via ? 'fallback' : 'ok';
  return 'fail';
}

// 기록이 있는 최근 n일이 전부 실패인 출처. 기록이 n일보다 적으면 판단하지 않는다.
export function longFailures(health, n = LONG_FAIL_DAYS) {
  const out = [];
  for (const [key, s] of Object.entries(health.sources || {})) {
    const ds = Object.keys(s.days || {}).sort().slice(-n);
    if (ds.length < n) continue;
    if (ds.every((d) => dayStatus(s.days[d]) === 'fail')) {
      const all = Object.keys(s.days).sort();
      let i = all.length - 1;
      while (i > 0 && dayStatus(s.days[all[i - 1]]) === 'fail') i--;   // 실패가 이어진 첫날
      const okDays = all.filter((d) => s.days[d].ok);
      out.push({ key, label: s.label, kind: s.kind, since: all[i], lastOk: okDays.pop() || null, note: s.days[all[all.length - 1]].note || '' });
    }
  }
  return out;
}
