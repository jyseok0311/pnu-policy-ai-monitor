// 산지니(부산대 마스코트) SVG — 표정 변형.
// 실제 PNG 자산이 들어오면 이 파일 대신 <img> 로 교체하면 된다. 배치·크기 규칙은 그대로 쓴다.
// 사용: sanjini('tense', 44)  → 44px 짜리 '긴장' 표정
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_DIR = 'dist/assets/sanjini';

/* 실제 산지니 이미지가 dist/assets/sanjini/<mood>.png 에 있으면 그걸 쓰고,
   없으면 아래 SVG 임시본으로 대체한다. 파일을 넣는 순간 자동으로 바뀐다.
   (아래 SVG 는 배치·크기를 검토하기 위한 것이지 실제 캐릭터가 아니다) */
export function sanjini(mood = 'base', size = 40) {
  for (const ext of ['png', 'PNG', 'svg', 'webp']) {
    const rel = `${ASSET_DIR}/${mood}.${ext}`;
    if (existsSync(join(ROOT, rel))) {
      return `<img class="sanjini" src="assets/sanjini/${mood}.${ext}" width="${size}" height="${size}" alt="산지니 ${mood}" loading="lazy">`;
    }
  }
  return sanjiniSvg(mood, size);
}

function sanjiniSvg(mood = 'base', size = 40) {
  const B = '#4a90d9';        // 몸통 파랑
  const BD = '#2f6fb5';       // 그림자
  const Y = '#f5c542';        // 부리
  const P = '#f4a0a0';        // 볼

  // 표정별 눈·부가요소
  const FACE = {
    base: `<circle cx="38" cy="50" r="9" fill="#fff"/><circle cx="62" cy="50" r="9" fill="#fff"/>
           <circle cx="39" cy="51" r="5.4" fill="#20252d"/><circle cx="61" cy="51" r="5.4" fill="#20252d"/>
           <circle cx="37" cy="49" r="1.8" fill="#fff"/><circle cx="59" cy="49" r="1.8" fill="#fff"/>`,
    happy: `<path d="M30 52 q8 -11 16 0" stroke="#20252d" stroke-width="3.4" fill="none" stroke-linecap="round"/>
            <path d="M54 52 q8 -11 16 0" stroke="#20252d" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    tense: `<circle cx="38" cy="50" r="7.5" fill="#fff"/><circle cx="62" cy="50" r="7.5" fill="#fff"/>
            <circle cx="38" cy="51" r="3.6" fill="#20252d"/><circle cx="62" cy="51" r="3.6" fill="#20252d"/>
            <path d="M28 38 q6 -4 12 -1" stroke="#20252d" stroke-width="2.6" fill="none" stroke-linecap="round"/>
            <path d="M72 38 q-6 -4 -12 -1" stroke="#20252d" stroke-width="2.6" fill="none" stroke-linecap="round"/>
            <path d="M79 30 q4 6 0 9 q-4 -3 0 -9z" fill="#8fc4f0"/>`,
    angry: `<circle cx="38" cy="52" r="8" fill="#fff"/><circle cx="62" cy="52" r="8" fill="#fff"/>
            <circle cx="38" cy="53" r="4.4" fill="#20252d"/><circle cx="62" cy="53" r="4.4" fill="#20252d"/>
            <path d="M27 38 L44 45" stroke="#20252d" stroke-width="4" stroke-linecap="round"/>
            <path d="M73 38 L56 45" stroke="#20252d" stroke-width="4" stroke-linecap="round"/>
            <path d="M74 24 q7 -3 9 3 q5 -1 4 5 q-7 2 -13 -1z" fill="#cbd5e1"/>`,
    sad: `<path d="M31 45 L45 55 M45 45 L31 55" stroke="#20252d" stroke-width="3.2" stroke-linecap="round"/>
          <path d="M55 45 L69 55 M69 45 L55 55" stroke="#20252d" stroke-width="3.2" stroke-linecap="round"/>
          <path d="M70 58 q4 7 0 10 q-4 -3 0 -10z" fill="#8fc4f0"/>`,
    idea: `<circle cx="38" cy="50" r="9" fill="#fff"/><circle cx="62" cy="50" r="9" fill="#fff"/>
           <circle cx="39" cy="51" r="5.4" fill="#20252d"/><circle cx="61" cy="51" r="5.4" fill="#20252d"/>
           <circle cx="37" cy="49" r="1.8" fill="#fff"/><circle cx="59" cy="49" r="1.8" fill="#fff"/>
           <g transform="translate(74 18)"><circle r="8" fill="#ffd84d"/><rect x="-3" y="7" width="6" height="4" rx="1" fill="#c9a227"/>
           <path d="M-13 -9 L-9 -6 M13 -9 L9 -6 M0 -15 L0 -11" stroke="#ffd84d" stroke-width="2.4" stroke-linecap="round"/></g>`,
    grad: `<circle cx="38" cy="52" r="9" fill="#fff"/><circle cx="62" cy="52" r="9" fill="#fff"/>
           <circle cx="39" cy="53" r="5.4" fill="#20252d"/><circle cx="61" cy="53" r="5.4" fill="#20252d"/>
           <circle cx="37" cy="51" r="1.8" fill="#fff"/><circle cx="59" cy="51" r="1.8" fill="#fff"/>
           <g transform="translate(50 16)"><path d="M-26 0 L0 -9 L26 0 L0 9z" fill="#20252d"/>
           <path d="M-13 3 L-13 12 q13 7 26 0 L13 3" fill="#20252d"/>
           <path d="M24 1 L24 16" stroke="#f5c542" stroke-width="2.4"/><circle cx="24" cy="17" r="3" fill="#f5c542"/></g>`,
    question: `<circle cx="38" cy="50" r="9" fill="#fff"/><circle cx="62" cy="50" r="9" fill="#fff"/>
           <circle cx="36" cy="52" r="5" fill="#20252d"/><circle cx="58" cy="52" r="5" fill="#20252d"/>
           <path d="M28 38 q6 -3 11 0" stroke="#20252d" stroke-width="2.4" fill="none" stroke-linecap="round"/>
           <path d="M72 38 q-6 -3 -11 0" stroke="#20252d" stroke-width="2.4" fill="none" stroke-linecap="round"/>
           <text x="80" y="26" font-size="22" font-weight="800" fill="#4a90d9" font-family="system-ui">?</text>`
  };

  const beak = mood === 'happy'
    ? `<path d="M44 62 q6 8 12 0 q-6 3 -12 0z" fill="${Y}"/>`
    : `<path d="M43 60 L57 60 L50 70z" fill="${Y}"/>`;

  return `<svg class="sanjini" width="${size}" height="${size}" viewBox="0 0 100 100"
    role="img" aria-label="산지니 ${mood}" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 14 q-5 -11 4 -13 q-2 8 6 12z" fill="${BD}"/>
    <ellipse cx="50" cy="54" rx="35" ry="33" fill="${B}"/>
    <ellipse cx="50" cy="70" rx="17" ry="14" fill="#fff" opacity=".92"/>
    <circle cx="24" cy="62" r="6.5" fill="${P}" opacity=".8"/>
    <circle cx="76" cy="62" r="6.5" fill="${P}" opacity=".8"/>
    ${FACE[mood] || FACE.base}
    ${beak}
  </svg>`;
}
