// 일일 브리핑의 '기준 낱말' 화면 조각.
//
// 낱말 목록은 페이지에 '한 번만' 둔다(<div id="crit-data" hidden>). 날짜마다 10번 박으면
// 분야 다섯에 낱말 수백 개씩이라 HTML 이 수백 KB 불어난다. 각 항목에는 빈 자리(slot)만 두고,
// 펼칠 때 app.js 가 data 에서 복사해 채운다. 인쇄(PDF)에는 싣지 않는다 — 낱말 목록은 화면에서 읽는 것이다.

import * as C from './criteria.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const kws = (list, cls = '') => list.map((w) => {
  const label = typeof w === 'string' ? w : w.label;
  const star = typeof w === 'object' && w.note ? '<i>*</i>' : '';
  return `<span class="kw${cls}">${esc(label)}${star}</span>`;
}).join('');

// 예외가 있는 낱말은 마우스를 올려야 보이게 두지 않는다 — 휴대전화에는 호버가 없다. 아래에 글로 적는다.
const notes = (list) => {
  const n = list.filter((w) => typeof w === 'object' && w.note);
  return n.length ? `<ul class="kw-notes">${n.map((w) => `<li><b>${esc(w.label)}*</b> ${esc(w.note)}</li>`).join('')}</ul>` : '';
};
const block = (title, inner) => `<div class="crit-blk"><h5>${title}</h5>${inner}</div>`;

/** 빈 자리 — 항목마다 이것을 둔다. */
export function critSlot(key, D, label) {
  return `<details class="crit"><summary>${esc(label || D.critShow)}</summary><div class="crit-slot" data-crit="${esc(key)}"></div></details>`;
}

/** 모든 조각을 한 번만 담는 숨은 상자. */
export function critData(D, { universities }) {
  const parts = {};

  // ── 마스터: 어떻게 모으고 거르나
  const col = C.collectCriteria(), flt = C.filterCriteria();
  parts.master =
    `<p class="crit-lead">${esc(D.critMasterLead)}</p>` +
    block(esc(D.critGather),
      `<p class="crit-sub">${esc(D.critGoogle)}</p>${kws(col.google)}` +
      `<p class="crit-sub">${esc(D.critPress)}</p>${kws(col.press)}` +
      `<p class="crit-sub">${esc(D.critGov)}</p>${kws(col.gov)}` +
      `<p class="crit-sub">${esc(D.critOverseasQ)}</p>${kws(col.overseas)}`) +
    block(esc(D.critKeep),
      `<p class="crit-sub">${esc(D.critKeepTopic)}</p>${kws(flt.topic)}` +
      `<p class="crit-sub">${esc(D.critKeepUniv)}</p>${kws(flt.univName)}` +
      `<p class="crit-sub">${esc(D.critKeepAbbr)}</p>${kws(flt.abbr)}` +
      `<p class="crit-sub">${esc(D.critKeepAx)}</p>${kws(flt.axAdmin)}` +
      `<p class="crit-sub">${esc(D.critDrop)}</p>${kws([flt.spam, flt.foreign])}` +
      `<p class="crit-sub">${esc(D.critDropNoise)}</p>${kws(flt.noise)}`) +
    block(esc(D.critField), `<p class="crit-rule">${D.critFieldRule}</p>`) +
    block(esc(D.critRisk), `<p class="crit-rule">${esc(D.critRiskRule)}</p>`);

  // ── 분야별
  for (const f of C.FIELD_ORDER) {
    const k = C.fieldCriteria(f);
    parts[`field:${f}`] = !k
      ? `<p class="crit-rule">${esc(D.critOther)}</p>`
      : `<p class="crit-rule">${D.critFieldRule}</p>` +
        `<p class="crit-sub">${esc(D.critStrong)} · ${k.strong.length}개</p>${kws(k.strong, ' s')}` +
        `<p class="crit-sub">${esc(D.critWeak)} · ${k.weak.length}개</p>${kws(k.weak)}` +
        notes([...k.strong, ...k.weak]) +
        (notes([...k.strong, ...k.weak]) ? `<p class="crit-fine">* 표시가 있는 낱말은 예외가 있습니다.</p>` : '');
  }

  // ── 위험 등급
  const risk = C.riskCriteria();
  parts.risk = `<p class="crit-rule">${esc(D.critRiskRule)}</p>` + ['crisis', 'warning', 'watch'].map((lv) =>
    block(`<span class="lv ${{ crisis: 's', warning: 'i', watch: 'm' }[lv]}">${esc(D.critRiskLv[lv])}</span> ${risk[lv].ko.length}개`,
      kws(risk[lv].ko) + notes(risk[lv].ko) +
      (risk[lv].en.length ? `<p class="crit-sub">${esc(D.critEn)}</p>${kws(risk[lv].en)}` : ''))).join('') +
    `<p class="crit-fine">* 표시가 있는 낱말은 예외가 있습니다.</p>`;

  // ── 거점국립대 언급
  const lg = C.legalCriteria();
  parts.uni = `<p class="crit-rule">${esc(D.critUni)}</p>${kws(universities)}` +
    `<p class="crit-sub">${esc(D.critLocal)}</p>${kws(lg.local)}`;

  // ── 법령·조례
  const lawKeep = `<p class="crit-sub">${esc(D.critLegalKeep)}</p>${kws(lg.hit)}<p class="crit-sub">${esc(D.critLegalDrop)}</p>${kws(lg.skip)}`;
  parts['legal:law'] = `<p class="crit-rule">${esc(D.critLegalNote)}</p><p class="crit-sub">${esc(D.critLegalQ)}</p>${kws(lg.law)}${lawKeep}`;
  parts['legal:admrul'] = `<p class="crit-rule">${esc(D.critLegalNote)}</p><p class="crit-sub">${esc(D.critLegalQ)}</p>${kws(lg.admrul)}${lawKeep}`;
  parts['legal:ordin'] = `<p class="crit-rule">${esc(D.critLegalNote)}</p><p class="crit-sub">${esc(D.critLegalQ)}</p>${kws(lg.ordin)}${lawKeep}`;
  parts['legal:notice'] = `<p class="crit-rule">${esc(D.critNoticeNote)}</p><p class="crit-sub">${esc(D.critLegalKeep)}</p>${kws(lg.noticeHit)}<p class="crit-sub">${esc(D.critLegalDrop)}</p>${kws(lg.noticeSkip)}`;

  // ── 해외 참고
  parts.overseas = `<p class="crit-rule">${esc(D.critOverseasNote)}</p><p class="crit-sub">${esc(D.critOverseasQ)}</p>${kws(col.overseas)}` +
    `<p class="crit-sub">${esc(D.critEn)}</p>${kws(flt.topicEn)}`;

  return `<div id="crit-data" hidden>${Object.entries(parts).map(([k, v]) => `<section data-crit-src="${esc(k)}">${v}</section>`).join('')}</div>`;
}
