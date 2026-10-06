// 자동 취합본 — 토큰(LLM) 없이 코드만으로 주간 서술 파일을 만든다.
//
// 무엇을 하나
//   수집된 기사에서 '같은 사건을 다룬 기사'를 묶고, 몇 개 매체가 다뤘는지로 순위를 매겨
//   위기·경고 사건 · 정부 사업 · 부산대 · 부울경 · 산업·AX 로 모아 보여 준다.
//   문장은 전부 템플릿이다 — 기사 제목과 매체 수·분류 낱말 같은 코드가 센 사실만 담는다.
//
// 무엇을 못 하나 (일부러 하지 않는다)
//   해석·진단·권고·전파경로·부문별 영향. '이 사안이 부산대에 무슨 뜻인가'는 읽고 판단해야 나온다.
//   코드가 그럴듯하게 흉내 내면 근거 없는 서술이 사이트 이름으로 나간다. 비워 두고 취합본임을 화면에 밝힌다.
//
// 언제 쓰나
//   LLM 인증이 없을 때(weekly-report 워크플로) — 빈 화면 대신 취합본이 나가게 한다.
//   인증이 생기면 같은 서술 파일을 해석 본문으로 덮어쓴다. mode:'digest' 인 파일이 교체 대상이다.

import { programsOf, PROGRAMS } from './programs.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── 같은 사건을 다룬 기사 묶기: 제목의 글자 2-gram 이 많이 겹치면 한 묶음.
// 같은 통신사 기사를 여러 매체가 받아쓰면 제목이 거의 같고, 사건이 같으면 핵심 낱말이 겹친다.
const norm = (t) => String(t).replace(/^\[[^\]]*\]/, '').replace(/[\s'"‘’“”\[\]()·…,.?!:~\-—–]/g, '');
const grams = (t) => { const s = norm(t), g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
const jaccard = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const SAME = 0.42;

const LV = { crisis: 3, warning: 2, watch: 1, normal: 0 };
const LV_WORD = { 3: '위기', 2: '경고' };

// 홍보성 기사는 여러 매체에 퍼져도 정책 동향이 아니다 — 시험에서 'SKT 찾아가는 캠퍼스'가 4위에 올랐다.
const PR = /개최|성료|운영|모집|표창|수상|초청|콘서트|특강|캠페인|봉사|기부|후원|취임|개소|개관|축제|공연|전시|발대식|오리엔테이션|워크숍|세미나|간담회|견학|체험|캠프|서포터즈|진로 상담|찾아가는/;
// 강한 정책 낱말이 있으면 홍보성 감점을 면한다. 약한 낱말('교육부'·'평가')은 가산만 한다 — '교육부장관 표창'이 정책 기사는 아니다.
const POLICY_STRONG = /국회|국정감사|법안|예산|재정|지원사업|선정|통합|폐교|등록금|정원|입시|글로컬|RISE|라이즈|서울대 10개|AI중심대학|AX대학원|윤리기준|기본법|규제|무산|유보/;
const POLICY_WEAK = /정부|교육부|과기정통부|정책|평가|랭킹|순위|거점국립대|수시|정시/;
const POSITIVE = /선정|확정|출범|개원|개소|유치|확대|증가|협약|성과|1위|최고|신설|가동|도입/;
// 서술 검사(check-narrative-file)가 막는 꼴 — 코드가 센 값이라도 서술에 적으면 안 된다. 제목에 우연히 있으면 그 사건은 뺀다.
const BANNED = [/위험신호\s*\d+(\.\d+)?\s*%/, /(수집|관련)\s*기사\s*[\d,]+\s*건/, /Tier\s*[1-4]/i, /전주\s*대비\s*[+-]?\d+(\.\d+)?\s*%p/];
const safe = (t) => !BANNED.some((re) => re.test(t));

/** 기사 → 사건 묶음 [{ rep, n, media, lv, why, field, score, progs, items }] */
export function cluster(items) {
  const G = items.map((x) => grams(x.title));
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (find(i) !== find(j) && jaccard(G[i], G[j]) >= SAME) parent[find(j)] = find(i);
  }
  const groups = new Map();
  items.forEach((x, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); });

  return [...groups.values()].map((idx) => {
    const g = idx.map((i) => items[i]);
    // 대표 제목 = 묶음 안에서 다른 제목들과 가장 많이 겹치는 것
    let best = idx[0], bs = -1;
    for (const i of idx) { const s = idx.reduce((a, j) => a + jaccard(G[i], G[j]), 0); if (s > bs) { bs = s; best = i; } }
    const rep = items[best];
    const media = new Set(g.map((x) => x.media)).size;
    const lv = g.reduce((m, x) => Math.max(m, LV[x.level] || 0), 0);
    const why = (g.find((x) => LV[x.level] === lv && x.why) || {}).why || '';
    const progs = [...new Set(g.flatMap((x) => programsOf(x.title)))];
    const strong = POLICY_STRONG.test(rep.title), weak = POLICY_WEAK.test(rep.title), pr = PR.test(rep.title);
    const score = media + [0, 1, 4, 8][lv] + (strong ? 2 : weak ? 1 : 0) + (progs.length ? 4 : 0) + (rep.title.includes('부산대') ? 3 : 0) - (pr && !strong ? 4 : 0);
    return { rep, n: g.length, media, lv, why, field: rep.field, group: rep.group, local: g.some((x) => x.local), score, progs, items: g };
  });
}

const mediaWord = (c) => (c.media === 1 ? `1개 매체(${esc(c.rep.media)})` : `${c.media}개 매체`);
// '낱말 ‘무산’로' 처럼 받침에 따라 달라지는 조사를 코드가 맞히려 들지 않는다 — 조사가 안 붙는 꼴로 쓴다.
const lvText = (c) => (c.lv >= 2 && c.why ? ` [${LV_WORD[c.lv]} · 분류 낱말 ‘${esc(c.why)}’]` : '');
const plainT = (t) => String(t).replace(/["“”'‘’]/g, '');
const item = (c) => ({ t: `<b>${esc(c.rep.title)}</b> — ${mediaWord(c)}가 보도했다.${lvText(c)}`, refKey: [c.rep.title] });
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// 제목에서 대학 이름만 뽑는다('국립금오공대'→'금오공대'). 사업 이름·일반 명사가 섞이지 않게 막는다.
const NOT_UNIV = new Set(['거점국립대', '국립대', '사립대', '지방대', '전문대', '지역대', '수도권대', '중심대', '혁신대', '글로컬대', '의과대', '공과대', '종합대']);
function univNames(titles) {
  const seen = new Map();
  for (const t of titles) {
    for (const m of String(t).matchAll(/([가-힣]{2,7}?(?:대학교|대))(?![가-힣])/g)) {
      const n = m[1].replace(/^(국립|사립)/, '').replace(/대학교$/, '대');
      if (NOT_UNIV.has(n) || n.length < 3) continue;
      seen.set(n, (seen.get(n) || 0) + 1);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/**
 * 취합본 서술 파일을 만든다.
 * @param wk     weeks.json 의 주차 항목(id·label·date·range)
 * @param items  그 주 국내 관련 기사(relevant() 를 거친 것)
 * @param collected  수집본 날짜(서술 파일의 collected)
 */
export function buildDigest({ wk, items, collected }) {
  const cs = cluster(items);
  const used = new Set();
  const take = (list, n, pred = () => true) => {
    const out = [];
    for (const c of list) {
      if (out.length >= n) break;
      if (used.has(c) || !safe(c.rep.title) || !pred(c)) continue;
      used.add(c); out.push(c);
    }
    return out;
  };
  const byScore = [...cs].sort((a, b) => b.score - a.score || b.media - a.media);
  const byMedia = [...cs].sort((a, b) => b.media - a.media || b.score - a.score);

  const summary = [];
  const add = (h, list, mk = item) => { if (list.length) summary.push({ h, items: list.map(mk) }); };

  // 1) 위기·경고 — 코드가 낱말로 판정한 사건. 가장 먼저 본다.
  const alerts = take(byMedia.filter((c) => c.lv >= 2), 5, (c) => c.media >= 3);
  add('위기·경고로 분류된 사건', alerts);

  // 2) 이번 주 크게 다뤄진 사건 — 매체 수에 정책성·부산대·정부 사업 가산, 홍보성 감점
  add('이번 주 크게 다뤄진 사건', take(byScore, 7, (c) => c.media >= 4 && c.score >= 7));

  // 3) 정부 AI·AX 인재양성 사업 — 사업마다 한 줄. 대학별로 쪼개진 기사를 한데 모아 이름만 뽑는다.
  const progItems = [];
  for (const p of PROGRAMS) {
    const hit = cs.filter((c) => c.progs.includes(p.id));
    const arts = hit.flatMap((c) => c.items);
    if (arts.length < 5) continue;
    const rep = [...hit].sort((a, b) => b.media - a.media)[0];
    if (!safe(rep.rep.title)) continue;
    const names = univNames(arts.map((x) => x.title));
    progItems.push({
      t: `<b>${esc(p.name)}</b>(${esc(p.org)}) 소식이 이어졌다 — ${names.length ? esc(names.slice(0, 8).join('·')) + (names.length > 8 ? ' 등' : '') + ' 관련 ' : ''}${arts.length}건이 보도됐다. ` +
         `대표 기사: <b>${esc(rep.rep.title)}</b>`,
      refKey: [rep.rep.title]
    });
    hit.forEach((c) => used.add(c));
  }
  if (progItems.length) summary.push({ h: '정부 AI·AX 인재양성 사업 소식', items: progItems.slice(0, 4) });

  // 4) 부산대 — 한 매체만 다뤄도 싣는다(직접 관련 기사는 적어도 놓치지 않는다)
  add('부산대 관련 기사', take(byMedia.filter((c) => c.rep.title.includes('부산대') || c.items.some((x) => x.title.includes('부산대'))), 5));

  // 5) 부울경 · 6) 산업·AX
  add('부울경 지역', take(byScore.filter((c) => c.local), 4, (c) => c.media >= 2));
  add('산업 — 적응형행정 · AX 기술 동향', take(byScore.filter((c) => c.group === '산업'), 4, (c) => c.media >= 2));

  // ── 변화·주시 — 모두 위의 사건에서 뽑는다. 전주와 비교한 것이 아니다(changesNote 에 밝힌다).
  const downs = alerts.slice(0, 3);
  const ups = cs.filter((c) => c.lv < 2 && POSITIVE.test(c.rep.title) && (POLICY_STRONG.test(c.rep.title) || POLICY_WEAK.test(c.rep.title)) && safe(c.rep.title) && c.media >= 3 && !(PR.test(c.rep.title) && !POLICY_STRONG.test(c.rep.title)))
    .sort((a, b) => b.score - a.score).slice(0, 2);
  const changes = [
    ...downs.map((c) => ({ dir: 'down', v: cut(c.rep.title, 78), why: `${c.media}개 매체 보도 · ${LV_WORD[c.lv]} (분류 낱말 ‘${c.why || '—'}’)` })),
    ...ups.map((c) => ({ dir: 'up', v: cut(c.rep.title, 78), why: `${c.media}개 매체 보도 · 긍정 낱말 ‘${(c.rep.title.match(POSITIVE) || ['—'])[0]}’` }))
  ];
  const watch = downs.map((c) => ({ when: '초기(0-4주)', t: `${cut(plainT(c.rep.title), 40)} — 후속 보도와 결정·발표 여부` }));

  const lead = (list, n) => list.slice(0, n).map((c) => cut(plainT(c.rep.title), 34)).join(' · ') || '—';
  const warnOnly = alerts.filter((c) => c.lv === 2), crisisOnly = alerts.filter((c) => c.lv === 3);

  return {
    _comment: '자동 취합본 — tools/digest-narrative.mjs 가 만들었다. 코드가 수집 기사에서 같은 사건을 묶고 매체 수·분류 낱말로 순위를 매긴 것이며 해석·진단·권고는 없다. 해석 본문(AI)이 만들어지면 이 파일을 덮어쓴다(mode 칸이 없는 파일로 교체).',
    mode: 'digest',
    id: wk.id, label: wk.label, date: wk.date, range: wk.range, tierName: '', collected,
    changesTitle: '이번 주 눈에 띄는 변화 (자동 취합)',
    changesNote: '전주와 비교한 변화가 아니라, 이번 주 기사에서 코드가 뽑은 사건입니다. ▲▼ 방향은 제목의 낱말로 정했습니다.',
    summary, changes, watch,
    paths: [], innerPaths: [], sectors: [], diagnosis: null,
    legend: {
      primary: lead(crisisOnly.length ? crisisOnly : alerts, 2),
      secondary: lead(warnOnly, 2),
      disturb: '자동 취합본에서는 구분하지 않음', buffer: '자동 취합본에서는 구분하지 않음'
    },
    flows: [{ to: 'pnu', style: 'solid', color: '#3b7dd8', label: '정책 전달 경로' }],
    _stats: { clusters: cs.length, multi: cs.filter((c) => c.media >= 2).length }
  };
}
