// 서술 파일의 지문.
//
// 완료된 주차는 집계된 본문이 weeks.json 에 박혀 있어서, 서술 파일(data/narrative/<id>.json)만 고쳐 올려서는
// 화면이 바뀌지 않았다 — 본문을 다시 만드는 단계는 '아직 본문이 없는 주차'만 봤다.
// 집계할 때 이 지문을 주차에 남겨 두고, 배포 때 서술 파일의 지문과 다르면 다시 집계한다.
//
// 파일 바이트가 아니라 '파싱한 내용'을 해시한다. 같은 서술이 윈도우(CRLF)와 리눅스(LF)에서 줄바꿈이나
// 들여쓰기만 달라도 다른 파일로 보이면, 아무도 안 고쳤는데 매번 다시 집계하게 된다.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function narrativeHash(path) {
  const j = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  return createHash('sha1').update(JSON.stringify(j)).digest('hex').slice(0, 12);
}
