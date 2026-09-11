// 산지니 활용 시안 → dist/sanjini-mockup.html
// 사용: node mockup.mjs
// 실제 리포트 스타일(src/styles.css)을 그대로 써서 현재 화면에 그대로 얹었을 때의 모습을 본다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanjini } from './src/browser/sanjini.svg.js';

const root = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');

const TIERS = [
  { t: 1, name: '관심', state: 'Normal', mood: 'happy', why: '위험신호가 낮은 주. 밝은 표정으로 "이상 없음"을 한눈에.' },
  { t: 2, name: '주의', state: 'Watch', mood: 'base', why: '평상 수준. 기본 표정 — 감정을 싣지 않는다.' },
  { t: 3, name: '경계', state: 'Warning', mood: 'tense', why: '긴장 표정 + 땀. 아직 사고는 아니지만 지켜봐야 하는 상태.' },
  { t: 4, name: '위기', state: 'Crisis', mood: 'angry', why: '화남. 다만 실제 피해 사안에는 캐릭터를 빼는 것을 권한다(아래 원칙 참조).' }
];

const ANCHORS = [
  { mood: 'grad', sec: '리포트 읽는 법 · 상단 공지', why: '해설자 역할. 상단에 한 번만 등장해 톤을 잡는다.' },
  { mood: 'question', sec: '향후 주시 포인트 · 취약점 진단', why: '아직 결론이 없는 영역. 물음표가 "지켜보는 중"을 나타낸다.' },
  { mood: 'idea', sec: '모니터링 권고 · 기회(AX) 전파경로', why: '행동을 제안하는 자리. 전구가 권고임을 표시한다.' }
];

const EMPTY = [
  { mood: 'question', title: '이번 주 언급 없음', body: '워치리스트에 등록됐지만 이번 주 기사에 나오지 않았습니다.' },
  { mood: 'sad', title: '표본 부족 — 등급 미산정', body: '수집 기사가 30건 미만인 날은 등급을 매기지 않습니다.' },
  { mood: 'tense', title: '지도를 불러올 수 없습니다', body: '오프라인이거나 타일 서버에 접근할 수 없습니다.' }
];

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>산지니 활용 시안 | 대학 AX정책 AI 주간 모니터링</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css}
.mk{max-width:1000px;margin:0 auto;padding:0 20px 60px}
.mk h2{font-size:19px;font-weight:800;color:var(--navy);margin:34px 0 6px;
  padding-bottom:7px;border-bottom:2px solid var(--navy)}
.mk .lead{font-size:13.5px;color:#4b5563;margin:0 0 14px;line-height:1.7}
.grid{display:grid;gap:10px}
.g4{grid-template-columns:repeat(auto-fit,minmax(215px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.card{background:#fff;border:1px solid var(--line);border-radius:9px;padding:14px}
.card .why{font-size:12px;color:var(--mute);margin-top:8px;line-height:1.6}
.sanjini{vertical-align:middle;flex:none}
.tier-row{display:flex;align-items:center;gap:10px}
.demo{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin-top:10px}
.bad{border-color:#f0c9c6;background:#fdf7f7}
.bad h4{color:var(--crisis);margin:0 0 6px;font-size:14px}
.ok{border-color:#bfdccb;background:#f5faf7}
.ok h4{color:#1f6b42;margin:0 0 6px;font-size:14px}
.note{font-size:12.5px;color:#4b5563;line-height:1.75;margin:6px 0 0}
.hdr-demo{background:var(--navy);color:#fff;border-radius:10px;padding:18px 20px;display:flex;
  align-items:center;gap:14px;flex-wrap:wrap}
.hdr-demo h1{margin:0;font-size:19px;font-weight:700}
.hdr-demo .sub{font-size:12.5px;opacity:.85;margin-top:3px}
.hdr-demo .logo-slot{width:44px;height:44px;border-radius:50%;border:2px solid #fff;
  display:grid;place-items:center;font-weight:800;font-size:12px;flex:none}
.empty{display:flex;align-items:center;gap:12px;background:#fafbfc;border:1px dashed var(--line);
  border-radius:8px;padding:14px 16px}
.empty b{display:block;font-size:13.5px;color:var(--ink)}
.empty span{font-size:12.5px;color:var(--mute)}
.rule{display:grid;grid-template-columns:26px 1fr;gap:10px;font-size:13.5px;margin:9px 0;line-height:1.7}
.rule i{font-style:normal;font-weight:800;color:var(--navy)}
</style></head><body style="background:var(--bg)">
<div class="mk">
  <header style="padding:28px 0 6px">
    <div style="font-size:12.5px;color:var(--mute);font-weight:700;letter-spacing:.5px">DESIGN PROPOSAL</div>
    <h1 style="margin:6px 0 4px;font-size:27px;font-weight:800;color:var(--navy)">산지니 활용 시안</h1>
    <p style="margin:0;color:#4b5563;font-size:14px">대학 AX정책 AI 주간 모니터링 · 부산대 AX·정보화혁신본부 AX혁신과</p>
    <p class="note" style="margin-top:12px;max-width:760px">아래 캐릭터는 배치·크기를 검토하기 위한 <b>SVG 임시본</b>입니다.
      실제 산지니 PNG 자산이 준비되면 같은 자리에 그대로 교체하면 됩니다.</p>
  </header>

  <h2>1. 위험 등급 → 표정 (가장 쓸모 있는 자리)</h2>
  <p class="lead">이 리포트의 1차 신호는 <b>Tier 1~4</b>입니다. 표정을 등급에 묶으면 숫자를 읽기 전에
    상태가 전달됩니다. 색(초록·노랑·주황·빨강)과 <b>중복되지만, 색각 이상 사용자에게는 보조 단서</b>가 됩니다.</p>
  <div class="grid g4">
    ${TIERS.map((x) => `<div class="card">
      <div class="tier-row">
        ${sanjini(x.mood, 52)}
        <div><span class="tier t${x.t}" style="font-size:13px">Tier ${x.t} ${x.name}</span>
        <div class="state t${x.t}" style="font-size:15px;margin-top:5px">${x.state}</div></div>
      </div>
      <div class="why">${x.why}</div>
    </div>`).join('')}
  </div>
  <div class="demo">
    <div style="font-size:12px;color:var(--mute);margin-bottom:8px">적용 예 — 주차 헤더</div>
    <div class="wk-head">
      ${sanjini('tense', 46)}
      <span class="tier t3">Tier 3 경계</span>
      <div><div class="wk-title">2026.09.11 (Week 37)</div>
      <div class="wk-range">기사수집기간: 2026.09.04~2026.09.11</div></div>
      <div class="state t3"><i class="dot d3"></i>Warning</div>
    </div>
  </div>

  <h2>2. 섹션 성격 → 전신 포즈</h2>
  <p class="lead">전신 3종은 <b>섹션의 성격</b>을 나타냅니다. 모든 섹션에 붙이지 않고
    <b>세 자리에만</b> 씁니다. 남발하면 정책 보고서의 무게가 떨어집니다.</p>
  <div class="grid g3">
    ${ANCHORS.map((a) => `<div class="card">
      <div class="tier-row">${sanjini(a.mood, 54)}
        <div style="font-weight:800;color:var(--navy);font-size:14.5px">${a.sec}</div></div>
      <div class="why">${a.why}</div>
    </div>`).join('')}
  </div>
  <div class="demo">
    <div style="font-size:12px;color:var(--mute);margin-bottom:8px">적용 예 — 섹션 제목</div>
    <h2 class="sec" style="margin-top:0">${sanjini('question', 30)} 향후 주시 포인트</h2>
    <div class="watch"><div><span>초기(0-4주)</span>패키지 지원 세부 실행계획과 연차별 성과지표 확정</div></div>
    <h2 class="sec">${sanjini('idea', 30)} 모니터링 권고</h2>
    <div class="diag"><ol style="margin:0"><li>미선정 거점국립대와의 공동 프로그램·자원 공유 모델을 부산대가 먼저 제안</li></ol></div>
  </div>

  <h2>3. 빈 상태 (empty state) — 효과가 가장 큰 자리</h2>
  <p class="lead">데이터가 없을 때가 화면이 가장 어색합니다. 지금은 회색 글씨 한 줄뿐인데,
    여기에 캐릭터를 두면 <b>“고장난 것”이 아니라 “해당 없음”</b>임이 전달됩니다.</p>
  <div class="grid g3">
    ${EMPTY.map((e) => `<div class="empty">${sanjini(e.mood, 44)}
      <div><b>${e.title}</b><span>${e.body}</span></div></div>`).join('')}
  </div>

  <h2>4. 헤더 — 부산대 공식 로고와의 관계</h2>
  <p class="lead">헤더에는 <b>공식 로고만</b> 둡니다. 로고와 마스코트가 나란히 서면 둘 다 약해집니다.
    산지니는 본문 안에서 기능적으로만 등장합니다.</p>
  <div class="grid g3">
    <div class="ok" style="padding:14px;border-radius:9px;border:1px solid #bfdccb">
      <h4>권장 — 공식 로고 단독</h4>
      <div class="hdr-demo" style="margin-top:8px">
        <img src="assets/logo_w.png" alt="부산대학교" style="height:34px">
        <div><h1>대학 AX정책 AI 주간 모니터링</h1>
        <div class="sub">부산대 AX·정보화혁신본부 AX혁신과</div></div>
      </div>
      <p class="note">흰색 로고(<code>logo_w.png</code>)가 네이비 헤더에 그대로 맞습니다.</p>
    </div>
    <div class="bad" style="padding:14px;border-radius:9px;border:1px solid #f0c9c6">
      <h4>비권장 — 로고 + 마스코트 동시</h4>
      <div class="hdr-demo" style="margin-top:8px">
        <img src="assets/logo_w.png" alt="부산대학교" style="height:34px">
        ${sanjini('happy', 38)}
        <div><h1 style="font-size:17px">대학 AX정책 AI 주간 모니터링</h1></div>
      </div>
      <p class="note">시선이 분산되고, 공문서 성격의 리포트에서 격식이 떨어집니다.</p>
    </div>
  </div>

  <h2>5. 적용 원칙</h2>
  <div class="demo">
    <div class="rule"><i>1</i><div><b>의미가 있는 자리에만.</b> 장식으로 넣지 않습니다.
      등급·섹션 성격·빈 상태 — 세 가지 용도로 한정합니다.</div></div>
    <div class="rule"><i>2</i><div><b>크기는 30~54px.</b> 본문 흐름을 밀어내지 않는 선.
      주차 헤더 46px, 섹션 제목 30px, 빈 상태 44px.</div></div>
    <div class="rule"><i>3</i><div><b>실제 피해가 있는 사안에는 쓰지 않습니다.</b>
      폐교·소송·구조조정처럼 사람이 다치는 내용 옆의 캐릭터는 부적절합니다.
      Tier 4 표정은 <b>지표 카드에만</b> 쓰고 본문 서술에는 넣지 않습니다.</div></div>
    <div class="rule"><i>4</i><div><b>인쇄물(PDF)에서는 등급 표정만 남깁니다.</b>
      섹션 앵커·빈 상태는 <code>@media print</code> 로 숨겨 잉크와 지면을 아낍니다.</div></div>
    <div class="rule"><i>5</i><div><b>색에 의존하지 않는 보조 단서로 씁니다.</b>
      표정이 등급 색과 중복되는 것은 의도된 것입니다 — 색각 이상 사용자를 위한 이중 표시입니다.</div></div>
  </div>

  <h2>6. 표정 세트 매핑</h2>
  <div class="tbl"><table>
    <thead><tr><th>제공 표정</th><th>쓰는 자리</th><th>뜻</th></tr></thead>
    <tbody>
      <tr><td>기본</td><td>Tier 2 주의</td><td>평상 수준 — 감정을 싣지 않는다</td></tr>
      <tr><td>기쁨</td><td>Tier 1 관심</td><td>위험신호 낮음</td></tr>
      <tr><td>긴장</td><td>Tier 3 경계 · 지도 로딩 실패</td><td>지켜봐야 하는 상태</td></tr>
      <tr><td>화남</td><td>Tier 4 위기 (지표 카드 한정)</td><td>임계치 초과</td></tr>
      <tr><td>슬픔</td><td>표본 부족 · 데이터 없음</td><td>판단할 수 없음</td></tr>
      <tr><td>반함</td><td>— (미사용)</td><td>보고서 성격에 맞는 자리가 없다</td></tr>
      <tr><td>졸업모(전신)</td><td>상단 공지 · 읽는 법</td><td>해설자</td></tr>
      <tr><td>물음표(전신)</td><td>주시 포인트 · 취약점 진단</td><td>미결 사안</td></tr>
      <tr><td>전구(전신)</td><td>모니터링 권고 · 기회 경로</td><td>제안</td></tr>
    </tbody>
  </table></div>

  <p class="foot" style="margin-top:34px">시안 생성: ${new Date().toISOString().slice(0, 10)} ·
    실제 자산 교체 시 <code>src/browser/sanjini.svg.js</code> 를 <code>&lt;img&gt;</code> 로 바꾸면 됩니다.</p>
</div>
</body></html>`;

writeFileSync(join(root, 'dist/sanjini-mockup.html'), html, 'utf8');
console.log(`✓ dist/sanjini-mockup.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
