# 국내 서버에서 수집 돌리기 (self-hosted runner)

지금은 GitHub 이 빌려주는 해외 러너에서 돈다. 그래서 두 가지가 막힌다.

| 증상 | 원인 |
|---|---|
| 부처 보도자료 4곳이 `fetch failed` — 교육부·과기정통부·산업통상부·행정안전부 | 해당 서버가 해외 IP 의 연결을 끊는다. HTTP 403 이 아니라 **연결 자체가 안 된다**. 헤더·UA 로는 못 푼다 |
| 매시 수집이 실제로는 몇 시간에 한 번 | GitHub 예약 실행은 최선 노력이라 부하가 걸리면 밀리거나 폐기된다. 2026-09-15 에는 6시간 동안 1회만 떴다 |

둘 다 **실행 위치**가 원인이므로 국내 서버에 러너 하나를 붙이면 같이 풀린다.

준비는 이미 해 뒀다. **저장소 변수 `RUNNER_LABEL`** 만 채우면 워크플로 수정 없이 옮겨 간다.
비워 두면 지금처럼 GitHub 러너에서 돈다.

---

## 1. 서버에 필요한 것

- Linux (Ubuntu 22.04 이상 권장) · 상시 켜져 있고 인터넷이 되는 국내 장비
- Node.js 20 이상
- Chrome/Chromium (PDF 생성)
- CJK 폰트 — 없으면 PDF 에서 한글·한자가 빈칸으로 나온다

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm chromium-browser fonts-noto-cjk fonts-noto-color-emoji
```

> 워크플로는 `runner.environment == 'github-hosted'` 일 때만 폰트를 설치한다.
> 자체 서버에는 위처럼 **미리 깔아 두어야 한다**.

## 2. 러너 등록

저장소 → **Settings → Actions → Runners → New self-hosted runner** 에서 나오는
명령을 그대로 따라 한다. 토큰이 화면에 표시되며 한 시간만 유효하다.

```bash
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L <화면에 나온 URL>
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/jyseok0311/pnu-policy-ai-monitor --token <화면에 나온 토큰>
sudo ./svc.sh install     # 부팅 시 자동 시작
sudo ./svc.sh start
```

라벨을 물으면 기본값(`self-hosted`)으로 둔다.

## 3. 스위치 켜기

저장소 → **Settings → Secrets and variables → Actions → Variables → New repository variable**

| 이름 | 값 |
|---|---|
| `RUNNER_LABEL` | `self-hosted` |

이것으로 끝이다. 다음 실행부터 국내 서버에서 돈다.

되돌리려면 이 변수를 지우면 된다 — 즉시 GitHub 러너로 돌아온다.

## 4. 확인

1. Actions 에서 아무 실행이나 열어 `Set up job` → `Runner name` 이 서버 이름인지 본다
2. `기관 보도자료 수집` 단계에서 4개 부처가 `ok` 로 찍히는지 본다
   (이월 문구 `→ … 이월 N건` 이 사라지면 성공)
3. 예약 실행이 매시 정각 근처에 꼬박꼬박 뜨는지 하루 지켜본다

## 주의

- **러너가 없는데 `RUNNER_LABEL=self-hosted` 로 두면 모든 실행이 큐에 걸린 채 멈춘다.**
  러너를 먼저 띄우고 변수를 넣을 것.
- 자체 호스팅 러너는 저장소에 쓰기 권한을 가진 코드를 서버에서 실행한다.
  이 저장소는 Public 이므로, 외부인이 보낸 PR 이 러너에서 돌지 않도록
  Settings → Actions → **Fork pull request workflows** 를 제한해 둘 것.
- 서버가 꺼져 있으면 예약 실행이 쌓인다. 수집 창이 2일이라 데이터가 유실되진
  않지만, 며칠 꺼 둘 예정이면 변수를 잠시 지워 GitHub 러너로 돌려 두는 편이 낫다.

## 그때까지

부처 보도자료는 **실패하면 직전 수집분을 이월**하도록 해 두었다(`feeds.mjs`).
총계가 쪼그라들지는 않지만 새 글이 안 들어온다. 국내에서 가끔 아래를 돌리면
최신본이 채워진다.

```bash
cd pnu-weekly && node feeds.mjs && cd .. && git add -A && git commit -m "기관 보도자료 갱신" && git push
```
