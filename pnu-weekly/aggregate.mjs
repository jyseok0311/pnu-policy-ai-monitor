// 수집 결과 + 서술 → 주차 객체를 만들어 weeks.json 에 반영한다.
// 사용: node aggregate.mjs w37
//
// 역할 분리:
//   수치  = 여기(코드)에서만 계산한다. 서술 파일에는 숫자가 들어가지 않는다.
//   서술  = data/narrative/<id>.json (LLM 산출물). refKey 로 실제 기사와 결합된다.
//   refKey 에 대응하는 기사를 못 찾으면 중단한다 — 근거 없는 문장을 통과시키지 않기 위해서다.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { relevant } from './src/filter.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync as _rd } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const ID = process.argv[2] || 'w37';
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// ── 입력
const narr = J(`data/narrative/${ID}.json`);
// 서술 파일이 collected 를 지정하면 그 수집본을, 아니면 가장 최근 것을 쓴다.
const files = readdirSync(join(root, 'data/collected')).filter((f) => f.endsWith('.json')).sort();
const latest = narr.collected ? `${narr.collected}.json` : files[files.length - 1];
if (!files.includes(latest)) { console.error(`✗ 수집본 없음: data/collected/${latest}`); process.exit(1); }
const raw = J(`data/collected/${latest}`);
console.log(`· 수집본: data/collected/${latest} (원본 ${raw.total}건)`);

// ── 1. 관련성 필터 — 대학 정책과 무관한 기사를 걷어낸다
//    '등록금' 키워드가 연예 기사를 끌어오는 등의 오탐이 실제로 관찰돼 추가한 단계다.
// 관련성 필터는 src/filter.mjs 에 모아 두었다.
// 이전에는 여기에 한국어 전용 규칙을 따로 두어, 해외 기사가 전부 탈락했다.
const items = relevant(raw.items);
console.log(`· 관련성 필터: ${raw.total} → ${items.length}건 (제외 ${raw.total - items.length})`);

// ── 2. 신호 집계
const n = items.length;
const lv = (l) => items.filter((x) => x.level === l).length;
const pct = (v) => +((v / n) * 100).toFixed(1);
const signal = { crisis: pct(lv('crisis')), warning: pct(lv('warning')), total: n, trend: 'baseline' };
const risk = +(signal.crisis + signal.warning).toFixed(1);
const tier = risk >= 32 ? 3 : risk >= 25 ? 2 : 1;
const state = { 4: 'Crisis', 3: 'Warning', 2: 'Watch', 1: 'Normal' }[tier];

// ── 3. 대학별 언급량 → 리스크 지도 등급
const meta = J('data/meta.json');
// 사업명이 대학명을 포함해 오탐을 만든다. '서울대 10개 만들기'는 거점국립대 기사지 서울대 기사가 아니다.
const PROGRAM_NAMES = [/서울대\s?10개\s?만들기/g, /서울대\s?10개/g];
const mentionsOf = (name) => items.filter((x) => {
  let t = x.title + ' ' + x.summary;
  PROGRAM_NAMES.forEach((re) => { t = t.replace(re, '«사업명»'); });
  return t.includes(name);
}).length;
const mentions = Object.fromEntries(meta.universities.map((u) => [u.id, mentionsOf(u.name)]));

// 대학별 상세 — 지도 마커에 마우스를 올렸을 때 보여줄 내용.
// 키워드는 서술이 아니라 '그 대학을 언급한 기사 제목'에서 코드가 뽑는다.
const UNI_STOP = new Set([
  ...meta.universities.map((u) => u.name),
  ...meta.universities.map((u) => u.name + '학교'),   // 부산대 / 부산대학교 중복 제거
  '대학', '대학교', '학생', '교수', '교육', '올해', '내년',
  '기자', '위해', '통해', '대한', '관련', '국내', '우리', '신문', '뉴스', '개최', '운영', '진행',
  '열려', '최초', '이번', '지역', '한국', '전국', '추진', '개최한다', '밝혔다', '나섰다'
]);
const RANK = J('data/rankings.json');
const JA = (() => { try { return J('data/joongang-ranking.json'); } catch { return null; } })();
const UD = (() => { try { return J('data/univ-data.json'); } catch { return null; } })();
// 대학기관평가인증(한국대학평가원) — 인증 여부와 남은 기간
const accreditOf = (id) => {
  const a = UD && UD.accreditation && UD.accreditation.focus && UD.accreditation.focus[id];
  if (!a || !a.to) return null;
  const end = new Date(a.to.replace(/\./g, '-'));
  const days = Math.round((end - new Date()) / 864e5);
  return { from: a.from, to: a.to, type: a.type, region: a.region, daysLeft: days };
};
// 중앙일보는 연도별 패널이라 가장 최근 등재 연도를 뽑아 쓴다
const jaLatest = (id) => {
  const u = JA && JA.universities[id];
  if (!u) return null;
  const years = Object.keys(u.ranks).filter((y) => u.ranks[y] != null).sort();
  if (!years.length) return null;
  const y = years[years.length - 1];
  return { year: y, rank: u.ranks[y], series: u.ranks };
};
const uniDetail = Object.fromEntries(meta.universities.map((u) => {
  const hit = items.filter((x) => {
    let t = x.title + ' ' + x.summary;
    PROGRAM_NAMES.forEach((re) => { t = t.replace(re, '«사업명»'); });
    return t.includes(u.name);
  });
  const f = {};
  // 조사가 붙은 토큰을 원형으로 합친다 ('탈락에' → '탈락')
  const norm = (w) => {
    const t = w.replace(/(에서|에게|으로|에|의|은|는|이|가|을|를|로|와|과|도|만|과의|와의)$/, '');
    return t.length >= 2 ? t : w;
  };
  hit.forEach((x) => (x.title.match(/[가-힣A-Za-z]{2,}/g) || []).forEach((w0) => {
    const w = norm(w0);
    if (w.length < 2 || UNI_STOP.has(w)) return;
    f[w] = (f[w] || 0) + 1;
  }));
  const keywords = Object.entries(f).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const risky = hit.filter((x) => x.level === 'crisis' || x.level === 'warning');
  const lead = risky[0] || hit[0] || null;
  const rr = hit.length ? risky.length / hit.length : 0;
  const rk = RANK.universities[u.id] || null;
  return [u.id, {
    name: u.name,
    rank: rk ? { qs: rk.qs, the: rk.the, city: rk.city, ja: jaLatest(u.id) } : null,
    accredit: accreditOf(u.id),
    mentions: hit.length,
    risky: risky.length,
    riskRate: +(rr * 100).toFixed(1),
    riskLevel: !hit.length ? 0 : rr >= 0.25 ? 3 : rr >= 0.12 ? 2 : rr > 0 ? 1 : 0,   // 위험신호 비율 4단계
    keywords: keywords.length ? keywords : Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 3),
    lead: lead ? { title: lead.title, media: lead.media, level: lead.level } : null
  }];
}));
// 마커 크기 = 주목도(언급량). 색 = 위험신호 비율.
// 두 축을 하나로 합쳐 '위기/경계'로 부르면 언급이 많다는 이유만으로 호재까지 위험으로 읽힌다.
// (실제로 부산대가 62건 언급으로 '위기' 표시됐는데 내용은 사업 선정·예산 확보였다)
const max = Math.max(...Object.values(mentions), 1);
const levels = Object.fromEntries(Object.entries(mentions).map(([id, c]) => {
  const r = c / max;
  return [id, r >= 0.6 ? 4 : r >= 0.3 ? 3 : r >= 0.1 ? 2 : 1];   // 주목도 4단계
}));

// ── 4. 일자별 기사 (분야별로 묶고 대표 제목만 노출 — 본문은 쓰지 않는다)
const days = [...new Set(items.map((x) => x.date).filter(Boolean))].sort();
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const articles = days.map((d) => {
  const dayItems = items.filter((x) => x.date === d);
  // 분야 × 국내/해외로 나눈다. 해외 기사는 국내 이슈의 선행·대조 사례로 읽는다.
  const groups = [];
  ['domestic', 'overseas'].forEach((rg) => {
    const pool = dayItems.filter((x) => (x.region || 'domestic') === rg);
    [...new Set(pool.map((x) => x.field))].forEach((f) => {
      groups.push({ f, rg, list: pool.filter((x) => x.field === f) });
    });
  });
  // 상위 N 만 자르면 건수가 많은 국내가 자리를 다 차지해 해외가 사라진다.
  // 지역별로 자리를 나눠 보장한다.
  const pick = (rg, n) => groups.filter((g) => g.rg === rg).sort((a, b) => b.list.length - a.list.length).slice(0, n);
  const fields = [...pick('domestic', 3), ...pick('overseas', 2)];
  const dt = new Date(d);
  return {
    day: `${dt.getMonth() + 1}/${dt.getDate()}(${WD[dt.getDay()]})`,
    count: dayItems.length,
    open: d === days[days.length - 1],
    cats: fields.map(({ f, rg, list }) => ({
      name: `${f} · ${rg === 'overseas' ? '해외' : '국내'}`,
      count: list.length,
      items: list.sort((a, b) => ({ crisis: 0, warning: 1, watch: 2, normal: 3 })[a.level] - ({ crisis: 0, warning: 1, watch: 2, normal: 3 })[b.level])
        .slice(0, 3).map((x) => x.title)
    }))
  };
});

// ── 5. 주간 변동 지표 (전부 수집 데이터에서 계산)
const field = (f) => items.filter((x) => x.field === f).length;
const STOP = new Set('대학 대학교 학생 교수 교육 올해 내년 기자 위해 통해 대한 지원 사업 선정 개최 운영 열려 진행 최초 관련 국내 우리 신문 뉴스'.split(' '));
const freq = {};
items.forEach((x) => (x.title.match(/[가-힣A-Za-z]{2,}/g) || []).forEach((w) => {
  if (w.length < 2 || STOP.has(w)) return; freq[w] = (freq[w] || 0) + 1;
}));
const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3);

const weeklyMetrics = [
  { name: '위험신호 비중', value: String(risk), unit: '%', change: '기준치', dir: 'flat' },
  { name: '총 수집 기사', value: n.toLocaleString('ko-KR'), unit: '건', change: '기준치', dir: 'flat' },
  { name: '거버넌스 기사', value: String(field('거버넌스')), unit: '건', change: `전체의 ${pct(field('거버넌스'))}%`, dir: 'flat' },
  { name: 'AI·디지털 기사', value: String(field('AI·디지털')), unit: '건', change: `전체의 ${pct(field('AI·디지털'))}%`, dir: 'flat' },
  { name: '부산대 직접 언급', value: String(mentions.pnu), unit: '건', change: `거점국립대 1위`, dir: 'up' },
  { name: '해외 기사', value: String(items.filter((x) => x.region === 'overseas').length), unit: '건',
    change: `전체의 ${pct(items.filter((x) => x.region === 'overseas').length)}%`, dir: 'flat' },
  { name: '최다 출현 키워드', value: topWords[0][0], unit: '', change: `${topWords[0][1]}회`, dir: 'up' }
];

// ── 6. 서술의 refKey → 실제 기사 결합
const refs = []; const seen = new Map(); let miss = [];
const pick = (key) => {
  const hit = items.filter((x) => x.title.includes(key));
  if (!hit.length) return null;
  // 원문 URL(언론사 RSS)을 구글 리디렉션보다 우선한다
  return hit.sort((a, b) => (a.link.includes('news.google.com') ? 1 : 0) - (b.link.includes('news.google.com') ? 1 : 0))[0];
};
const summary = narr.summary.map((g) => ({
  h: g.h,
  items: g.items.map((it) => {
    const ns = [];
    for (const key of it.refKey || []) {
      const a = pick(key);
      if (!a) { miss.push(key); continue; }
      if (!seen.has(a.title)) {
        seen.set(a.title, refs.length + 1);
        refs.push({
          n: refs.length + 1, title: a.title, media: a.media, date: a.date,
          url: a.link, direct: !a.link.includes('news.google.com')
        });
      }
      const num = seen.get(a.title);
      if (!ns.includes(num)) ns.push(num);
    }
    return { t: it.t, refs: ns };
  })
}));
if (miss.length) {
  console.error(`✗ 서술의 refKey에 대응하는 기사를 찾지 못했습니다:\n  - ${[...new Set(miss)].join('\n  - ')}`);
  process.exit(1);
}

// ── 6-2. 워치리스트: 주요 인물·기관 동향
// 개인 SNS 계정은 수집하지 않는다(watchlist.json 의 _policy 참조).
// 인물은 '직책'으로 추적하고 발언은 기사 등 공적 기록으로만 집계한다.
const wl = J('data/watchlist.json');
const countIn = (keys) => {
  // '대통령령' 안의 '이 대통령' 같은 오탐을 막는다
  const norm = (x) => (x.title + ' ' + x.summary).replace(/대통령령/g, '«법령»');
  const hit = items.filter((x) => keys.some((k) => norm(x).includes(k)));
  return { n: hit.length, ex: hit[0] || null, risky: hit.filter((x) => x.level === 'crisis' || x.level === 'warning').length };
};
const voices = {
  // 이름을 몰라도 별칭('한 총리')만 있으면 집계한다.
  persons: wl.persons.filter((p) => p.name || (p.aliases || []).length).map((p) => {
    const c = countIn([p.name, ...(p.aliases || [])].filter(Boolean));
    return { label: p.name ? `${p.name} ${p.role}` : p.role, who: p.name || '', role: p.role, ...c };
  }).filter((x) => x.n).sort((a, b) => b.n - a.n),
  // 이름·별칭이 모두 없어 집계 자체가 불가능한 직책만 '미등록'으로 표시
  vacantList: wl.persons.filter((p) => !p.name && !(p.aliases || []).length).map((p) => p.role),
  // 이름은 등록됐지만 이번 주 언급이 0인 인물 — 추적 중임을 보여준다
  quiet: wl.persons.filter((p) => p.name && !countIn([p.name, ...(p.aliases || [])].filter(Boolean)).n)
    .map((p) => `${p.name} ${p.role}`),
  orgs: wl.orgs.map((o) => {
    const c = countIn([o.name, ...(o.aliases || [])]);
    return { label: o.name, ...c };
  }).filter((x) => x.n).sort((a, b) => b.n - a.n),

  feeds: []
};
voices.vacant = voices.vacantList;
delete voices.vacantList;

// 공식 채널 피드(있으면) 최신 글
try {
  const ff = _rd(join(root, 'data/feeds')).filter((f) => f.endsWith('.json')).sort().pop();
  if (ff) {
    const fd = J(`data/feeds/${ff}`);
    const HI = /대학|고등교육|학과|총장|등록금|학령|국립대|입시|수시|글로컬|RISE|라이즈|인재/;
    voices.feeds = fd.items.filter((x) => HI.test(x.title + ' ' + x.summary)).slice(0, 10)
      .map((x) => ({ org: x.org, channel: x.channel, title: x.title, link: x.link, date: x.date }));
    voices.feedNote = `${fd.byOrg ? Object.entries(fd.byOrg).map(([k, v]) => k + ' ' + v + '건').join(' · ') : ''} (${fd.window})`;
  }
} catch { /* 피드 미수집 상태 */ }

// ── 7. 주차 객체 조립
const week = {
  id: narr.id, label: narr.label, date: narr.date, range: narr.range,
  tier, tierName: { 4: '위기', 3: '경계', 2: '주의', 1: '관심' }[tier], state, complete: true, live: true,
  sourceNote: `무료·공개 소스 수집 ${raw.total}건 → 관련성 필터 후 ${n}건 · 수집일 ${latest.replace('.json', '')}`,
  signal,
  map: {
    levels, uni: uniDetail,
    flows: narr.flows || [{ to: 'pnu', style: 'solid', color: '#3b7dd8', label: '정책 전달 경로' }],
    legend: narr.legend
  },
  summary, articles,
  changes: narr.changes, changesTitle: narr.changesTitle, changesNote: narr.changesNote,
  watch: narr.watch, weeklyMetrics,
  kpis: [{
    group: '대학평가·순위 (부산대)',
    items: [
      { name: 'QS 세계대학순위', period: RANK._sources.qs.name.match(/\d{4}/)[0], value: (RANK.universities.pnu.qs || '').replace('=', ''), unit: '위', change: `종합점수 ${RANK.universities.pnu.qsScore}`, dir: 'flat', freq: 'year', src: 'qs' },
      { name: 'THE 세계대학순위', period: RANK._sources.the.name.match(/\d{4}/)[0], value: RANK.universities.pnu.the, unit: '', change: '거점국립대 중 공동 2위', dir: 'flat', freq: 'year', src: 'the' },
      (() => { const j = jaLatest('pnu');
        return j
          ? { name: '중앙일보 국내 종합', period: j.year, value: String(j.rank), unit: '위',
              change: Object.keys(j.series).filter((y) => j.series[y] != null).map((y) => y.slice(2) + '년 ' + j.series[y] + '위').join(' · '),
              dir: 'flat', freq: 'year', src: 'joongang' }
          : { name: '중앙일보 국내 종합', period: '최근', value: '—', unit: '', change: '자료 없음', dir: 'flat', freq: 'year', src: 'joongang' };
      })()
    ]
  }, ...(() => {
    const ac = accreditOf('pnu');
    if (!ac) return [];
    const yrs = (ac.daysLeft / 365).toFixed(1);
    return [{
      group: '대학 공식자료 (부산대)',
      items: [
        { name: '대학기관평가인증', period: ac.to.slice(0, 4) + '까지', value: ac.daysLeft > 0 ? '유효' : '만료',
          unit: '', change: `${ac.from} ~ ${ac.to} (잔여 ${yrs}년)`, dir: ac.daysLeft > 365 ? 'flat' : 'up',
          freq: 'accredit', src: 'kcue_aims' },
        { name: '전국 인증대학', period: '4주기', value: String(UD.accreditation.total), unit: '개교',
          change: `국립 ${UD.accreditation.byType['국립'] || 0} · 사립 ${UD.accreditation.byType['사립'] || 0}`,
          dir: 'flat', freq: 'accredit', src: 'kcue_aims' },
        { name: '부산 지역 인증대학', period: '4주기', value: String(UD.accreditation.byRegion['부산'] || 0), unit: '개교',
          change: '지역 내 경쟁 대학 수', dir: 'flat', freq: 'accredit', src: 'kcue_aims' }
      ]
    }];
  })()],
  paths: narr.paths, innerPaths: narr.innerPaths, sectors: narr.sectors,
  diagnosis: narr.diagnosis, refs, voices
};

// ── 8. weeks.json 반영 (같은 id 는 교체)
const weeks = J('data/weeks.json').filter((w) => w.id !== week.id);
weeks.unshift(week);
writeFileSync(join(root, 'data/weeks.json'), JSON.stringify(weeks, null, 2), 'utf8');

console.log(`\n✓ ${week.id} 생성 — Tier ${tier} ${state}`);
console.log(`  위험신호 ${risk}% (crisis ${signal.crisis} / warning ${signal.warning}) · 기사 ${n}건 · ${days.length}일`);
console.log(`  대학 언급 ${Object.entries(mentions).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(' ')}`);
console.log(`  각주 ${refs.length}건 (원문 URL 직접 ${refs.filter((r) => r.direct).length} / 구글 경유 ${refs.filter((r) => !r.direct).length})`);
console.log(`  상위 키워드 ${topWords.map(([w, c]) => w + '(' + c + ')').join(', ')}`);
