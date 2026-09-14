// 보고서 UI 문자열 (한국어).
// 기사 제목·언론사명은 데이터 그대로 쓴다 — 여기 있는 건 라벨·범례·안내문만이다.
// 한때 영어판을 함께 굽던 구조(i18n)였으나 걷어냈다. 문자열을 한 곳에 모아 두는 이점만 남긴다.

// 조사 선택 — 받침이 있으면 '이', 없으면 '가'. 한글이 아니면 '가'로 둔다.
// ('등록금가 든' 같은 문장을 내보내지 않기 위해서다.)
const iga = (w) => {
  const c = String(w || '').trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return '가';
  return (c - 0xac00) % 28 ? '이' : '가';
};

const ko = {
  locale: 'ko-KR', unit: '건', stubBadge: '미생성',
  brandSub: (org) => org,
  navDaily: 'Go To Daily ›',
  navWeekly: '‹ Go To Weekly',
  weeklyLink: '주간 리포트',
  pdfDownload: 'PDF 다운로드',
  pdfAll: (n) => `전체 (${n}주차 합본)`,
  pdfAllDays: (n) => `전체 (${n}일 합본)`,
  pdfSelectLabel: 'PDF 회차 선택',
  pdfDateLabel: 'PDF 날짜 선택',
  progressBadge: '진행 중',
  progressTitle: '이번 주차는 아직 진행 중입니다.',
  progressBody: '매일 아침 기사가 자동으로 쌓이고 있습니다. 위의 신호 수치는 지금까지 모인 기사로 계산한 잠정값이며, 주차가 금요일에 마감되면 상황요약·리스크 지도·전파경로가 이 자리에 채워집니다.',

  trendTitle: (n) => `위험신호 비중 추이 (위기+경고, 최근 ${n}주)`,
  trendCap: '막대를 클릭하면 해당 주차로 이동합니다. 외부 통계가 아니라 <b>수집 기사 분류 결과에서 파이프라인이 직접 산출</b>한 값입니다. 주차 간 비교가 공정하도록 <b>구글 뉴스 소스로 통일</b>해 계산했습니다(과거 주차는 언론사 RSS 소급이 불가).',
  trendAria: '주차별 위험신호 비중 추이 — 막대는 주차별 값, 선은 흐름',

  tierWord: { 4: '위기', 3: '경계', 2: '주의', 1: '관심' },
  collectRange: '기사수집기간',
  signal: (c, w, sum, total, trend) =>
    `신호: <b>Crisis ${c}%</b> | <b>Warning ${w}%</b> | 합산 ${sum}% | 총 ${total}건 | 추세: <b>${trend}</b>`,
  liveBadge: '실데이터',

  secMap: '거점국립대 정책 리스크 지도',
  legPrimary: '주요', legSecondary: '부차',
  legWorld: '<b>세계 랭킹 레이어</b> — 지도 오른쪽 위 <b>🌐</b> 버튼을 누르면 QS·THE 랭킹 대학의 위치와 순위가 함께 표시됩니다.',
  legMarker: '<b>마커 읽는 법</b> — 크기 = 주목도(주간 언급량) · 색 = 위험신호 비율',
  legNone: '없음', legSome: '일부', legHas: '있음', legHigh: '높음',
  legHover: '마커에 마우스를 올리면 <b>소재지 · QS/THE 세계대학랭킹 · 주간 주요 키워드 · 대표 기사</b>가 표시됩니다. 지도를 <b>클릭하면 휠 확대/축소</b>가 켜지고(커서 위치 기준), 마우스가 지도를 벗어나면 꺼집니다. Ctrl+휠은 클릭 없이도 동작합니다.',
  legPaths: '── 정책 전달 경로 | - - - 예산 배분 경로(RISE) | ·· AI 인재양성 사업',
  legDisturb: '교란 요인', legBuffer: '완충',

  secNet: '주간 키워드 네트워크',
  netSub: (n, e, basis) => `국내 기사 ${basis}건의 제목에서 추출 · 키워드 ${n}개 · 연결 ${e}개`,
  netLegend: (minEdge, minCount) =>
    `원 크기 = 언급 기사 수 · 원 색 = 대표 분야 · 테두리 = 위험신호 비율 · 선 굵기 = <b>같은 기사 제목에 함께 등장한 횟수</b>(${minEdge}회 이상만 이음). ` +
    `${minCount}회 이상 등장한 말만 남깁니다. 원에 마우스를 올리면 이웃만 남습니다. 원을 누르면 그 주 참조 기사 목록에서 해당 키워드가 든 제목을 표시하고 그 자리로 이동합니다. ` +
    `제목만 읽고 본문은 저장하지 않습니다(저작권). 좌표는 빌드 때 한 번 계산해 고정하므로 화면과 PDF 가 같은 그림입니다.`,
  netRisk: '위험신호 비율',
  netNone: '이 주차는 키워드를 뽑을 기사가 부족합니다.',
  netHit: (k, n) => `'${k}'${iga(k)} 든 제목 ${n}건을 표시했습니다`,
  netMiss: (k) => `'${k}'${iga(k) === '이' ? '은' : '는'} 표시된 기사 목록에 없습니다 (목록은 분야별 상위 일부만 실립니다)`,
  secSummary: '상황 요약',
  secArticles: (n) => `📰 주간 참조 기사 · 국내 (${n}건 · 7일)`,
  secOverseas: (n) => `🌐 해외 동향 · 참고 (${n}건)`,
  overseasSub: '국내 신호·지표·네트워크에 반영하지 않는 참고 자료 — 국내 이슈의 선행·대조 사례. 영문 구글 뉴스 8개 검색어로 수집',
  overseasNone: '이번 주 해외 수집분이 없습니다.',
  whyTip: (lv, w) => `'${w}' 때문에 ${lv}로 분류됨 — 제목에서만 판정합니다`,
  secArticlesDaily: '기사',
  more: (n) => `… 외 ${n}건`, moreMany: '… 외 다수',
  changesDefault: '전주 대비 주요 변화',
  secWatch: '향후 주시 포인트',
  secWeekly: '⚡ 주간 변동 지표',
  secWeeklySub: '수집 기사에서 파이프라인이 직접 집계 · 매주 갱신',
  weekBadge: '주간',
  secKpi: '📈 배경 지표',
  secKpiSub: '(지표명 클릭 시 원자료 사이트로 이동 · 갱신주기 배지 확인)',
  secVoices: '🗣 주요 인물·기관 동향',
  secVoicesSub: '기사 언급 집계 + 기관 공식 홈페이지 보도자료 · 개인 SNS·블로그는 수집하지 않음',
  grpPersons: '인물 (직책 기준)', grpOrgs: '기관·단체',
  grpFeeds: '기관 공식 홈페이지 최신 글',
  noMention: '이번 주 언급 없음',
  riskySuffix: (n) => `위험신호 ${n}건`,
  vacantNote: (list) => `직책만 등록되고 이름이 비어 있어 집계되지 않은 항목: ${list} — <code>data/watchlist.json</code> 에서 채우면 자동 집계됩니다.`,
  secPaths: '정책 → 대학 전파경로',
  secInner: '대학 내 부문간 전파경로',
  pathRoute: '경로',
  secSectors: '부문별 영향 및 전파경로',
  thSector: '부문', thDir: '방향', thEarly: '초기(0-4주)', thMid: '중기(4-12주)', thLate: '장기(12주+)',
  thImpact: '영향 및 전파경로', thChange: '변화',
  lvWord: { s: '심각', i: '중요', m: '보통', l: '낮음' },
  secDiag: '대학 취약점 진단 및 모니터링 권고',
  subWeak: '취약점 진단', subRec: '모니터링 권고',
  secRefs: '🔗 참조 기사 원문',
  secRefsSub: '본문의 [번호]를 클릭하면 해당 항목으로 이동합니다',
  srcDirect: '원문 URL', srcVia: '구글뉴스 경유',
  stubTitle: '이 주차는 아직 리포트가 생성되지 않았습니다.',
  stubBody: '수집·분류가 끝난 신호 집계값만 보유한 상태입니다. 파이프라인(<code>collect → classify → aggregate → narrate</code>)을 해당 주차에 실행하면 상황요약·리스크 지도·전파경로·부문별 영향표가 이 자리에 동일한 서식으로 채워집니다.',
  genAt: '생성',
};


ko.dirWord = { pos: '포지티브', neg: '네거티브', mix: '혼합' };

// 일일 브리핑 전용 문자열
ko.daily = {
  suffix: '일일 브리핑',
  subline: '일일 브리핑 · 당일 수집 기사 기준',
  lvWord: { crisis: '위기', warning: '경고', watch: '관찰', normal: '일반' },
  tierWord: { 4: '위기', 3: '경계', 2: '주의', 1: '관심' },
  noTier: '표본 부족',
  noTierState: (n) => `등급 미산정 <small style="font-weight:500;font-size:12px">(${n}건 미만)</small>`,
  signal: (c, w, sum, n, delta) =>
    `신호: <b>Crisis ${c}%</b> | <b>Warning ${w}%</b> | 합산 ${sum}% | 총 ${n}건${delta}`,
  vsPrev: (cls, v) => ` | 전일 대비 <b class="${cls}">${v}%p</b>`,
  liveNote: '무료·공개 소스(구글 뉴스 + 언론사 RSS) 수집분 · 서술 없이 집계와 목록만 제공',
  secFields: '분야별', dayTotal: (n) => `당일 ${n}건`,
  riskNone: '위험신호 —', riskPct: (p) => `위험신호 ${p}%`,
  secUni: '거점국립대 언급',
  secArticles: '기사 · 국내', secArticlesSub: '위험도 순 · 제목을 누르면 원문으로 이동',
  overseas: (n) => `🌐 해외 참고 (${n}건)`, overseasNote: '신호·등급·분야 집계에 반영하지 않음',
  whyTip: (lv, w) => `'${w}' 때문에 ${lv}로 분류됨 — 제목에서만 판정합니다`,
  ruleNote: '등급은 기사 제목에 나온 위험 낱말로만 매깁니다(요약·본문은 보지 않음). 배지에 마우스를 올리면 어떤 낱말이 그 등급을 만들었는지 보입니다. 부정 표현(반발 없이·부담 없는)은 제외합니다.',
  count: (n) => `${n}건`,
  more: (n) => `… 외 ${n}건`,
  notice: '일일 브리핑은 <b>집계와 기사 목록만</b> 제공합니다. 해석·전망·권고는 주간 리포트에서 다룹니다. 매일 생성되며 생성형 AI 서술을 포함하지 않으므로 수치 외의 판단이 들어가지 않습니다.',
  thresholdNote: (t, min) => `일간 임계값은 일별 분포로 별도 산정한 잠정값 (Tier4 ≥${t.t4}% / Tier3 ≥${t.t3}% / Tier2 ≥${t.t2}%) · ${min}건 미만인 날은 등급 미산정`,
  weekday: ['일', '월', '화', '수', '목', '금', '토']
};


export const T = ko;
