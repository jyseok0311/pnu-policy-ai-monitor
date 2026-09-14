import { groupOf } from './classify.mjs';
// 기사 제목에서 키워드와 공기(共起) 관계를 뽑는다.
//
// 형태소 분석기를 쓰지 않는다. 외부 의존성 없이 빌드 한 번으로 끝나야 하고,
// 뉴스 표제어는 어차피 명사구가 대부분이라 아래 둘을 합치면 충분히 읽을 만한 결과가 나온다.
//   ① 도메인 사전 — 정책·재정·입시·AI 용어와 대학·기관·인물. 표기 흔들림(별칭)을 하나로 묶는다.
//   ② 자동 n-gram — 사전에 없는 신규 이슈를 놓치지 않기 위해 2~6자 한글 조각을 세고,
//      조사·접미사로 끝나는 조각과 '더 긴 조각의 부분'인 조각을 걷어낸다.
//
// 본문은 절대 쓰지 않는다(저작권). 제목만 센다.

// ── 사전: [대표어, ...별칭]
const LEXICON = [
  // 정책 사업
  ['서울대 10개 만들기', '서울대10개', '서울대 10개', '서울대10개만들기'],
  ['RISE', '라이즈', '지역혁신중심 대학지원체계'],
  ['글로컬대학', '글로컬 대학', '글로컬30'],
  ['대학혁신지원사업'], ['국립대학육성사업'], ['LINC'], ['BK21'],
  ['등록금'], ['등록금 동결'], ['반값등록금'],
  ['고등교육교부금', '교부금'], ['고등·평생교육지원특별회계', '고특회계'],
  ['정원 감축', '정원감축'], ['학과 통폐합', '통폐합'], ['구조조정'],
  ['무전공', '전공자율선택'], ['수시'], ['정시'], ['수능'], ['학령인구'],
  ['지역인재전형', '지역인재'], ['의대 증원', '의대증원', '의대 정원'],
  ['첨단학과'], ['계약학과'],
  // 융합연구 · 증강인재교육
  ['AI 대학원', 'AI대학원'], ['인공지능', 'AI'], ['디지털 전환', 'DX'],
  ['AI 교육', 'AI교육'], ['AI 인재', 'AI인재'], ['소프트웨어중심대학', 'SW중심대학'],
  ['데이터센터'], ['반도체'], ['GPU'],
  // 정책/철학
  ['교육부'], ['기획재정부', '기재부'], ['과학기술정보통신부', '과기정통부', '과기부'],
  ['국회'], ['교육위원회', '국회 교육위'], ['감사원'], ['지방자치단체', '지자체'],
  ['총장'], ['이사회'], ['교수회'], ['총학생회'], ['교수노조'], ['대학노조'],
  ['국립대', '국립대학'], ['사립대', '사립대학'], ['전문대', '전문대학'],
  ['거점국립대', '거점 국립대', '9개 거점국립대'],
  ['한국대학교육협의회', '대교협'], ['한국전문대학교육협의회', '전문대교협'],
  // 적응형행정 — 행정에 AI 를 쓰는 쪽
  ['학사행정', '학사 행정'], ['행정혁신', '행정 혁신'], ['업무 자동화', '업무자동화'],
  ['챗봇', 'AI 챗봇'], ['대학 ERP', 'ERP'], ['수강신청'], ['정보시스템', '통합정보시스템'],
  ['전자결재'], ['스마트캠퍼스', '스마트 캠퍼스'], ['정보보호'], ['개인정보'],
  ['공공 AX', '공공AX'], ['AI 행정'], ['디지털 정부', '전자정부'],
  // AX 기술 동향 — 기술 자체의 움직임
  ['생성형 AI', '생성형AI', '생성형'], ['거대언어모델', 'LLM'], ['AI 에이전트', 'AI에이전트'],
  ['소버린 AI', '소버린AI'], ['AI 반도체'], ['챗GPT', 'ChatGPT'], ['오픈AI', 'OpenAI'],
  ['엔비디아', 'NVIDIA'], ['멀티모달'], ['온디바이스'], ['AI 모델'], ['클라우드'],
  // 대학 (지도와 같은 표기)
  ['부산대'], ['경북대'], ['전남대'], ['충남대'], ['충북대'], ['전북대'],
  ['경상국립대', '경상대'], ['강원대'], ['제주대'], ['서울대'],
  ['카이스트', 'KAIST'], ['포스텍', 'POSTECH'], ['연세대'], ['고려대'],
  // 지역
  ['부산'], ['대구'], ['광주'], ['대전'], ['울산'], ['경남'], ['경북'], ['전남'], ['전북'],
  // 인물 직책 (이름은 watchlist 가 따로 센다)
  ['대통령'], ['교육부 장관', '교육부장관'], ['부산시장'],
  // 위험 어휘
  ['폐교'], ['미충원'], ['미달'], ['적자'], ['삭감'], ['반발'], ['소송'], ['파업'],
  ['선정'], ['탈락'], ['공모'], ['지원금'], ['예산'], ['재정지원제한대학', '재정지원제한']
];

// 조사·어미로 끝나면 명사구가 아니다. n-gram 후보를 거를 때 쓴다.
const TAIL = /(은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|에게|부터|까지|만|보다|처럼|라고|한다|했다|된다|됐다|하는|하고|이라|이다|들|중|등|씨|간|측|내|외|년|월|일|건|명|개|차)$/;
const HEAD = /^(그|이|저|및|또|더|덜|한|두|세|네|첫|올|지난|오는|내년|작년|올해)/;
const STOP = new Set([
  '대학', '학생', '교수', '교육', '학교', '학과', '대학생', '대학교', '기자', '뉴스', '단독', '속보',
  '사진', '영상', '인터뷰', '기고', '칼럼', '사설', '오피니언', '종합', '개최', '실시', '진행',
  '개최한다', '밝혔다', '말했다', '나섰다', '위해', '통해', '대한', '관련', '가능', '추진',
  '개최해', '열려', '열린', '첫날', '이번', '지역', '전국', '우리', '국내', '해외', '세계',
  // 일반 업무 명사 — 어느 기사에나 붙어 다니고 이슈를 가리키지 못한다
  '지원', '개발', '운영', '협력', '공동', '사업', '연구', '학기', '기업', '기관', '센터',
  '행사', '참여', '선발', '체결', '협약', '업무', '방문', '기념', '출범', '설립',
  '개관', '발표', '공개', '예정', '계획', '추진력', '강화', '확대', '구축', '조성', '마련', '제공',
  'campus', '캠퍼스', '프로그램', '과정', '교실', '수업', '강의', '연수', '특강', '세미나',
  '공모전', '경진', '대회', '수상', '장학', '졸업', '입학식', '축제', '동아리'
]);

// 불용어의 '조각'도 불용어다. '캠퍼스'를 막아도 '캠퍼'·'퍼스'가 새어 나온다.
for (const w of [...STOP]) {
  for (let n = 2; n <= 9; n++) for (let i = 0; i + n <= w.length; i++) STOP.add(w.slice(i, i + n));
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 사전 별칭 → 대표어. 긴 별칭부터 봐야 '서울대 10개'가 '서울대'로 먼저 먹히지 않는다.
const ALIAS = [];
for (const row of LEXICON) {
  const canon = row[0];
  for (const a of row) ALIAS.push([a, canon]);
}
ALIAS.sort((a, b) => b[0].length - a[0].length);

/** 제목 하나에서 사전 키워드를 뽑는다(중복 제거). */
export function lexHits(title) {
  let t = ' ' + norm(title) + ' ';
  const found = new Set();
  for (const [alias, canon] of ALIAS) {
    if (t.includes(alias)) {
      found.add(canon);
      // 먹은 자리는 지운다. '서울대 10개 만들기'를 '서울대'로 다시 세지 않기 위해서다.
      t = t.split(alias).join(' ');
    }
  }
  return [...found];
}

/** 사전에 없는 신규어를 n-gram 으로 건진다. */
function autoGrams(titles, minCount) {
  const c = new Map();
  for (const t of titles) {
    // 한글 덩어리 단위로 자른다. 숫자·영문·기호는 사전에 맡긴다.
    for (const chunk of norm(t).split(/[^가-힣]+/)) {
      if (chunk.length < 2) continue;
      for (let n = 2; n <= 9; n++) {
        for (let i = 0; i + n <= chunk.length; i++) {
          const g = chunk.slice(i, i + n);
          if (TAIL.test(g) || HEAD.test(g) || STOP.has(g)) continue;
          c.set(g, (c.get(g) || 0) + 1);
        }
      }
    }
  }
  // '부분 조각' 제거 — 더 긴 조각이 거의 같은 횟수로 나오면 짧은 쪽은 버린다.
  const grams = [...c.entries()].filter(([, n]) => n >= minCount).sort((a, b) => b[0].length - a[0].length);
  const keep = new Map();
  for (const [g, n] of grams) {
    let covered = false;
    for (const [k, kn] of keep) {
      if (k.includes(g) && n <= kn * 1.3) { covered = true; break; }
    }
    if (!covered) keep.set(g, n);
  }
  return keep;
}

/**
 * 기사 배열 → 키워드 통계 + 공기 네트워크.
 * @param items  collect 결과의 items (title, field, level, univ, region, date)
 * @param opt    { top, minCount, minEdge }
 */
export function extract(items, opt = {}) {
  const TOP = opt.top || 40;
  const MIN = opt.minCount || Math.max(3, Math.round(items.length / 120));
  const MIN_EDGE = opt.minEdge || 2;

  const titles = items.map((x) => x.title);
  const auto = autoGrams(titles, Math.max(MIN, 4));

  // 문서별 키워드 집합 — 사전 우선, 모자라면 자동어로 채운다.
  const docs = items.map((it) => {
    const set = new Set(lexHits(it.title));
    const t = norm(it.title);
    for (const [g] of auto) {
      if (set.size >= 6) break;
      if (t.includes(g)) {
        // 이미 뽑은 사전어에 포함되는 조각은 중복이다.
        let dup = false;
        for (const k of set) if (k.includes(g) || g.includes(k)) { dup = true; break; }
        if (!dup) set.add(g);
      }
    }
    return { it, keys: [...set] };
  });

  // 키워드별 집계
  const stat = new Map();
  for (const { it, keys } of docs) {
    for (const k of keys) {
      let s = stat.get(k);
      if (!s) stat.set(k, (s = { key: k, n: 0, risky: 0, fields: {}, regions: { domestic: 0, overseas: 0 }, sample: null }));
      s.n++;
      if (it.level === 'crisis' || it.level === 'warning') s.risky++;
      s.fields[it.field] = (s.fields[it.field] || 0) + 1;
      s.regions[it.region === 'overseas' ? 'overseas' : 'domestic']++;
      if (!s.sample || (it.level === 'crisis' && s.sample.level !== 'crisis')) {
        s.sample = { title: it.title, link: it.link, media: it.media, level: it.level };
      }
    }
  }

  const ranked = [...stat.values()]
    .filter((s) => s.n >= MIN)
    .map((s) => ({
      ...s,
      risk: +((s.risky / s.n) * 100).toFixed(1),
      field: Object.entries(s.fields).sort((a, b) => b[1] - a[1])[0][0]   // 대표 분야
    }))
    .sort((a, b) => b.n - a.n);

  // 대분류별 최소 자리. 언급 수로만 자르면 기사가 많은 교육이 자리를 다 가져가,
  // 산업 판이 빈 채로 남는다. 자리를 남겨 두되 후보가 없으면 채우지 않는다.
  const QUOTA = { '산업': Math.min(5, Math.round(TOP * 0.2)) };
  const picked = [], taken = new Set();
  for (const [g, q] of Object.entries(QUOTA)) {
    for (const n of ranked) {
      if (picked.filter((x) => groupOf(x.field) === g).length >= q) break;
      if (groupOf(n.field) !== g || taken.has(n.key)) continue;
      picked.push(n); taken.add(n.key);
    }
  }
  for (const n of ranked) {
    if (picked.length >= TOP) break;
    if (taken.has(n.key)) continue;
    picked.push(n); taken.add(n.key);
  }
  // 자리 보장은 '들어갈 자격'만 준다. 그린 뒤 크기 순서는 그대로 언급 수다.
  const nodes = picked.sort((a, b) => b.n - a.n);

  const idx = new Map(nodes.map((n, i) => [n.key, i]));

  // 공기 — 같은 제목에 함께 나온 횟수
  const pair = new Map();
  for (const { keys } of docs) {
    const ks = keys.filter((k) => idx.has(k)).sort();
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const id = ks[i] + ' ' + ks[j];
        pair.set(id, (pair.get(id) || 0) + 1);
      }
    }
  }
  const links = [...pair.entries()]
    .filter(([, n]) => n >= MIN_EDGE)
    .map(([id, n]) => {
      const [a, b] = id.split(' ');
      return { s: idx.get(a), t: idx.get(b), n };
    })
    .sort((a, b) => b.n - a.n);

  return { nodes, links, docCount: items.length, minCount: MIN };
}
