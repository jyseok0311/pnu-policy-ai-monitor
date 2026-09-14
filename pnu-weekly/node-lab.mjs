// 노드 표현 시안 — dist/node-lab.html
// 사용: node node-lab.mjs
//
// 배치(분야별 깊이판)·선·라벨은 전부 같게 두고 '노드를 무엇으로 그리는가'만 바꿔 비교한다.
// 한 번에 한 가지만 달라야 무엇 때문에 달라 보이는지 알 수 있다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkSvg } from './src/network.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const meta = J('data/meta.json');
const week = J('data/weeks.json').find((w) => w.network && w.network.nodes.length);

const OPTS = [
  {
    id: 'ball', tag: '현재', name: '구체',
    lead: '지금 쓰고 있는 방식. 크기로 언급량을, 테두리로 위험신호를 나타낸다.',
    spec: [['모양', '입체 음영을 준 원. 왼쪽 위에서 빛이 온다'],
      ['크기', '√(언급 기사 수) — 13~37px'],
      ['위험신호', '테두리 색과 굵기'],
      ['라벨', '원 아래 12px, 흰 테두리를 둘러 선 위에서도 읽힘']],
    pros: ['크기 차이가 가장 잘 보인다 — 어느 키워드가 큰 이슈인지 즉시 읽힌다.'],
    cons: ['면적이 커서 <b>선을 가린다</b>. 연결 구조가 원 뒤로 숨는다.',
      '입체 음영이 판의 깊이감과 경쟁한다 — 원도 3D, 판도 3D 라 시선이 분산된다.']
  },
  {
    id: 'dot', tag: '시안 A', name: '작은 점',
    lead: '점은 위치만 표시하고, 크기 차이는 최소로. 읽는 일은 라벨과 선에 맡긴다.',
    spec: [['모양', '단색 원. 음영 없음'],
      ['크기', '5~11px — 지금의 1/3. 차이는 남기되 좁힌다'],
      ['위험신호', '점 색을 위험신호 색으로 (분야는 라벨 색으로 옮김)'],
      ['라벨', '점 오른쪽 13px, 굵게 — 라벨이 주인공이 된다']],
    pros: ['<b>선이 다 보인다.</b> 판을 가로지르는 연결이 가려지지 않는다.',
      '점이 작아 판의 깊이감만 남는다 — 3D 가 오히려 또렷해진다.',
      '라벨이 커져 22개를 훑기 쉽다.'],
    cons: ['언급량 차이가 거의 안 보인다. 크기로 읽던 정보를 잃는다.',
      '분야를 라벨 색으로 옮기면 색이 두 군데(점·글자)로 나뉜다.']
  },
  {
    id: 'ring', tag: '시안 B', name: '빈 원(링)',
    lead: '테두리만 그리고 속을 비운다. 크기는 남기되 면적이 선을 가리지 않는다.',
    spec: [['모양', '속이 빈 원. 테두리 2~3px'],
      ['크기', '√(언급 기사 수) — 지금과 같은 11~30px'],
      ['위험신호', '테두리 색. 20% 이상이면 이중 링'],
      ['라벨', '원 아래 12px — 지금과 같음']],
    pros: ['크기 정보를 <b>그대로 두면서</b> 선이 원을 통과해 보인다.',
      '잉크가 적어 인쇄본이 가볍고, 겹쳐도 서로 읽힌다.',
      '분야는 테두리 색, 위험신호는 두께로 나눠 담을 수 있다.'],
    cons: ['작은 원은 링이 가늘어 잘 안 보인다.',
      '속이 비어 있어 원끼리 겹쳤을 때 어느 게 앞인지 모호하다.']
  },
  {
    id: 'halo', tag: '시안 C', name: '점 + 후광',
    lead: '점은 작게, 크기 정보는 옅은 후광으로. 둘을 분리한다.',
    spec: [['모양', '작은 단색 점 + 언급량만큼 퍼지는 옅은 원'],
      ['크기', '점 6px 고정 · 후광 12~40px'],
      ['위험신호', '점 색. 후광은 분야색'],
      ['라벨', '점 아래 12px']],
    pros: ['크기 정보를 남기면서 <b>선을 거의 안 가린다</b>(후광이 반투명).',
      '점이 작아 위치가 정확히 읽힌다 — 겹쳐도 중심이 보인다.',
      '후광이 판 위의 "번짐"처럼 보여 깊이감과 어울린다.'],
    cons: ['후광이 넓어 이웃 노드와 섞이면 어느 쪽 것인지 헷갈린다.',
      '인쇄에서 옅은 후광이 날아갈 수 있다 — 크기 정보가 사라진다.']
  }
];

const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const renderer = readFileSync(join(root, 'src/browser/nodelab.js'), 'utf8');
// 같은 SVG(좌표·색·판)를 네 번 쓴다. 그리는 방식만 다르다.
// networkSvg 는 화면용 빈 캔버스(.net-gl)를 함께 내놓는다. 이 페이지는 자체 렌더러를 쓰므로 떼어 낸다.
const svg = networkSvg(week.network, { esc, id: 'lab', label: '노드 표현 비교' })
  .replace(/<canvas class="net-gl"[^>]*><\/canvas>\s*/, '');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>노드 표현 시안 | PNU</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css}
.lab{max-width:1100px;margin:0 auto}
.opt{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px 24px;margin-bottom:24px}
.opt.cur{border-color:#c7d2e4;background:#f7f9fc}
.opt-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:3px}
.opt-tag{background:var(--head-bg);color:var(--head-ink);font-weight:800;font-size:12px;border-radius:5px;padding:3px 9px}
.opt.cur .opt-tag{background:var(--mute)}
.opt-h h2{margin:0;font-size:20px;font-weight:800;color:var(--navy)}
.opt-lead{color:var(--ink-3);font-size:14px;margin:0 0 14px}
.stage{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fbfcfe}
.stage canvas{display:block;width:100%;height:auto;cursor:grab}
.stage canvas:active{cursor:grabbing}
.sp{width:100%;font-size:13px;margin:14px 0 0;border-collapse:collapse}
.sp th{width:72px;text-align:left;color:var(--navy);font-weight:700;padding:5px 10px 5px 0;vertical-align:top;background:none;border:0}
.sp td{padding:5px 0;border:0;border-top:1px solid var(--line);color:var(--ink-2)}
.sp tr:first-child td,.sp tr:first-child th{border-top:0}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.pc > div{border:1px solid var(--line);border-radius:7px;padding:10px 14px;background:var(--soft)}
.pc h4{margin:0 0 6px;font-size:12.5px;font-weight:800}
.pc .good h4{color:#1f6b42}
.pc .bad h4{color:var(--crisis)}
.pc ul{margin:0;padding-left:17px;font-size:13px;line-height:1.65}
.tipbox{position:fixed;z-index:9998;pointer-events:none;max-width:300px;background:#fff;color:var(--ink);
  border:1px solid var(--line);border-radius:8px;padding:8px 11px;font-size:12.5px;line-height:1.5;
  box-shadow:0 8px 22px rgba(26,43,76,.18)}
.tipbox b{display:block;font-size:14px;margin-bottom:2px;color:var(--navy)}
.tipbox span{display:block;color:var(--mute);font-size:11.5px}
.hint{font-size:12.5px;color:var(--mute);margin:6px 0 0}
@media (max-width:640px){ .pc{grid-template-columns:1fr} .opt{padding:15px 13px} }
</style>
</head>
<body>
<div class="shell" style="grid-template-columns:minmax(0,1fr)">
<div>
<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="48" height="48">
    <div><h1>노드 표현 시안</h1>
    <div class="sub">${esc(meta.org)} · ${esc(week.label)} 실데이터 · 배치·선·라벨은 모두 같고 <b>노드만</b> 다릅니다</div></div>
  </div>
  <div class="acts"><a class="btn" href="index.html">‹ 주간 리포트</a></div>
</header>
<main class="main lab">
<p class="notice">네 그림 모두 <b>같은 좌표·같은 선·같은 라벨</b>입니다. 노드를 그리는 방식만 다릅니다 —
한 번에 한 가지만 달라야 무엇 때문에 달라 보이는지 알 수 있습니다.
<span class="sample">끌어서 360° 돌려 보세요 · 두 번 누르면 처음 각도</span></p>

${OPTS.map((o) => `
<section class="opt${o.id === 'ball' ? ' cur' : ''}" id="opt-${o.id}">
  <div class="opt-h"><span class="opt-tag">${esc(o.tag)}</span><h2>${esc(o.name)}</h2></div>
  <p class="opt-lead">${esc(o.lead)}</p>
  <div class="stage" data-style="${o.id}">${svg.replace(/id="net-lab"/, `id="net-${o.id}"`)}</div>
  <table class="sp"><tbody>${o.spec.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</tbody></table>
  <div class="pc">
    <div class="good"><h4>좋은 점</h4><ul>${o.pros.map((p) => `<li>${p}</li>`).join('')}</ul></div>
    <div class="bad"><h4>걸리는 점</h4><ul>${o.cons.map((p) => `<li>${p}</li>`).join('')}</ul></div>
  </div>
</section>`).join('')}

<p class="foot">${esc(meta.foot)}<br>생성: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · ${esc(week.label)} 실데이터</p>
</main>
</div>
</div>
<script>${renderer}</script>
</body>
</html>`;

writeFileSync(join(root, 'dist/node-lab.html'), html, 'utf8');
console.log(`✓ dist/node-lab.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
console.log(`  ${week.label} · 노드 ${week.network.nodes.length} · 연결 ${week.network.links.length} · 시안 ${OPTS.length}종`);
