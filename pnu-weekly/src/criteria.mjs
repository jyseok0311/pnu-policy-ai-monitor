// 일일 브리핑에 보여 줄 '수집·분류 기준' 데이터.
//
// 판정은 classify.mjs · filter.mjs · law-sources.mjs 가 한다. 여기서는 그 규칙을 '읽기만' 해서
// 사람이 읽는 낱말 목록으로 바꾼다. 규칙을 따로 한 벌 적어 두면 규칙을 고치고 화면은 안 고치는 일이 생긴다
// — 그래서 규칙 자체(배열·정규식)를 읽는다.
//
// 정규식으로 쓰인 낱말은 사람이 읽는 말로 풀어 쓴다.
//   /(?:지정|선정|승인|인가)\s?취소/   →  지정취소 · 선정취소 · 승인취소 · 인가취소
//   /교육(?!부|청|감|…)/               →  교육  (교육부·교육청·교육감 등 제외)
//   /(?<!기후|행)위기(?!가구|…)/       →  위기  (기후위기·행위기 · 위기가구·위기가정·위기아동 등 제외)

import { FIELDS as FIELD_RULES, RISK, BUKYEONG } from './classify.mjs';
import { FILTER_RULES } from './filter.mjs';
import { LAW_QUERIES, ORDIN_QUERIES, ADMRUL_QUERIES, LAW_HIT_WORDS, LAW_SKIP_WORDS, NOTICE_HIT, NOTICE_SKIP } from './law-sources.mjs';
import { GOOGLE_QUERIES, PRESS_FEEDS, OVERSEAS_QUERIES } from './sources.mjs';
import { SITES } from './gov-sites.mjs';

// ── 정규식 → 읽을 수 있는 낱말들 ─────────────────────────────
const MAX_EXPAND = 8;

function splitTop(src) {              // 괄호 밖의 | 로만 가른다
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { cur += c + src[++i]; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === '|' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const plain = (s) => s.replace(/\\s\?/g, '').replace(/\\s\*/g, ' ').replace(/\\([\].()\\\-])/g, '$1').trim();

function expandBranch(b) {
  let pre = [], post = [];
  b = b.replace(/\(\?<!([^)]*)\)/, (_, x) => { pre = x.split('|'); return ''; });
  b = b.replace(/\(\?!([^)]*)\)/, (_, x) => { post = x.split('|'); return ''; });
  // (?:a|b|c) 묶음이 있으면 곱해 펼친다
  const tokens = []; let m, last = 0;
  const re = /\(\?:([^)]*)\)/g;
  while ((m = re.exec(b))) { if (m.index > last) tokens.push([plain(b.slice(last, m.index))]); tokens.push(m[1].split('|').map(plain)); last = re.lastIndex; }
  if (last < b.length) tokens.push([plain(b.slice(last))]);
  let words = tokens.reduce((acc, t) => acc.flatMap((a) => t.map((x) => a + x)), ['']).filter(Boolean);
  const hasGroup = tokens.some((t) => t.length > 1);
  // 펼친 것이 너무 많으면 한 칸에 접는다 — '지적(됐·된·되·했·하는·…)'
  if (hasGroup && words.length > MAX_EXPAND) {
    const gi = tokens.findIndex((t) => t.length > 1);
    const head = tokens.slice(0, gi).map((t) => t[0]).join(''), tail = tokens.slice(gi + 1).map((t) => t[0]).join('');
    words = [`${head}(${tokens[gi].join('·')})${tail}`];
  }
  const base = words[0] || '';
  const some = (a, n = 3) => a.slice(0, n).join('·') + (a.length > n ? ' 등' : '');
  const notes = [];
  if (pre.length) notes.push(some(pre.map((p) => p + plain(b.replace(/\(\?[^)]*\)/g, '')))));
  if (post.length) notes.push(some(post.map((p) => plain(b.replace(/\(\?[^)]*\)/g, '')) + p)));
  return words.map((w) => ({ label: w, note: notes.length ? notes.join(' · ') + ' 제외' : '' }));
}

/** 규칙 하나(문자열 · 정규식 · {w, unless}) → [{label, note}] */
function toWords(w) {
  if (typeof w === 'string') return [{ label: w, note: '' }];
  if (w instanceof RegExp) return splitTop(w.source).flatMap(expandBranch);
  if (w && w.w) {
    const unless = splitTop(w.unless.source).map((b) => (/\\d/.test(b) ? '10.38대1 같은 경쟁률 배수' : plain(b))).map((x) => `‘${x}’`).join(' ');
    return [{ label: w.w, note: `제목에 ${unless} 중 하나가 있으면 세지 않음`, ctx: true }];
  }
  return [];
}

const isKo = (l) => /[가-힣]/.test(l) || /^[A-Z0-9&.\-+ ]+$/.test(l);   // 한글이거나 R&D·LLM·ERP 같은 약어
const uniq = (arr) => { const seen = new Set(); return arr.filter((x) => (seen.has(x.label) ? false : seen.add(x.label))); };
const words = (list) => uniq(list.flatMap(toWords));

// ── 분야별 ─────────────────────────────────────────
export const FIELD_ORDER = [...Object.keys(FIELD_RULES), '기타'];

export function fieldCriteria(field) {
  const g = FIELD_RULES[field];
  if (!g) return null;                                // '기타' — 낱말이 없다
  const s = words(g.strong), w = words(g.weak);
  return { strong: s.filter((x) => isKo(x.label)), weak: w.filter((x) => isKo(x.label)),
    strongEn: s.filter((x) => !isKo(x.label)).map((x) => x.label), weakEn: w.filter((x) => !isKo(x.label)).map((x) => x.label) };
}

// ── 위험 등급 ───────────────────────────────────────
export function riskCriteria() {
  const out = {};
  for (const [lv, list] of Object.entries(RISK)) {
    const all = words(list);
    out[lv] = { ko: all.filter((x) => isKo(x.label)), en: all.filter((x) => !isKo(x.label)).map((x) => x.label) };
  }
  return out;
}

// ── 관련 기사만 남기는 기준(filter.mjs) ───────────────
const srcWords = (re) => re.source.split('|').map(plain);

export function filterCriteria() {
  const R = FILTER_RULES;
  return {
    topic: srcWords(R.TOPIC),
    abbr: (R.UNIV_ABBR.source.match(/\(\?:([^)]*)\)/) || ['', ''])[1].split('|'),
    topicEn: srcWords(R.TOPIC_EN),
    noise: srcWords(R.NOISE),
    // 아래 둘은 판정 규칙이 복잡해 말로 풀어 쓴다. filter.mjs 의 UNIV_NAME·AX_ADMIN 을 고치면 여기도 고친다.
    univName: ['○○대 · ○○대학교 꼴의 대학 이름 (2~4글자 + 대)', '대학병원 · 산학협력단 같은 부속기관도 포함'],
    axAdmin: ['공공·행정·학사·업무·기관·부처·지자체 + 생성형 AI·AI 전환·AX·AI 도입·AI 활용',
      '생성형 AI + 도입·활용·행정·업무·전환', '공공AX · 행정AX · AI 행정', '대학 ERP · 학사행정'],
    spam: '도박 SEO 스팸 낱말이 제목에 있으면 제외',
    foreign: '한국어로 옮겨 내보내는 외국 매체(Vietnam.vn 등) 제외'
  };
}

// ── 수집 대상 ──────────────────────────────────────
export function collectCriteria() {
  return {
    google: GOOGLE_QUERIES,
    press: PRESS_FEEDS.map((f) => f.media),
    overseas: OVERSEAS_QUERIES,
    gov: SITES.filter((s) => s.list).map((s) => `${s.name} ${s.board}`),
    govLinkOnly: SITES.filter((s) => !s.list).map((s) => s.name)
  };
}

// ── 법령·조례 ──────────────────────────────────────
export function legalCriteria() {
  const asWords = (re) => re.source.split('|').map(plain);
  return {
    law: LAW_QUERIES, admrul: ADMRUL_QUERIES, ordin: ORDIN_QUERIES,
    hit: LAW_HIT_WORDS.map(plain), skip: LAW_SKIP_WORDS.map(plain),
    noticeHit: asWords(NOTICE_HIT), noticeSkip: asWords(NOTICE_SKIP),
    local: BUKYEONG.source.split('|')
  };
}
