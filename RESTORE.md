# PC 교체 · 포맷 후 이어하기

이 문서는 **다른 PC에서 Cursor로 퉁공대 장부를 바로 다시 받아 작업**하는 절차입니다.

## 1. 요약

| 항목 | 값 |
|------|-----|
| GitHub (origin) | https://github.com/qotjdals147/toonggongdae |
| 기본 브랜치 | `main` |
| 로컬 폴더 권장 | 원하는 경로 (예: `Downloads/퉁공대`) |
| 스택 | 정적 HTML/JS (프레임워크 없음) · Supabase · GitHub Pages |
| 에이전트 맥락 | **`HANDOFF.md`** + **`.cursor/rules/*.mdc`** |

## 2. Clone

```powershell
git clone https://github.com/qotjdals147/toonggongdae.git
cd toonggongdae
```

**Pages 배포:** GitHub **Free** 는 **public** 저장소에서만 Pages 무료입니다. repo를 **private** 로 두면 사이트가 **404** 됩니다 (장부 데이터는 Supabase·로그인으로 보호).

private clone이 필요하면 `gh auth login` 후 clone합니다.

## 3. Cursor에서 열기

1. Cursor → **Open Folder** → clone한 `toonggongdae` 폴더
2. 새 Agent 채팅 시 **`HANDOFF.md`** 와 **`RESTORE.md`** 를 먼저 읽으라고 하거나, 규칙이 자동 적용됨 (`.cursor/rules/`)

## 4. 의존성 (선택)

장부 앱 자체는 **빌드 없이** `index.html` 만으로 동작합니다.

디스코드 구인 이모지 슬라이스 스크립트만 쓸 때:

```powershell
npm install
npm run slice-discord-emojis
```

(`package.json` · `sharp` — 개발용, `node_modules` 는 Git에 없음)

## 5. 환경 변수 · 클라우드

### 5.1 앱 (GitHub Pages)

- **`index.html` / `maple-party-ledger.html`** 안 `CLOUD_CONFIG`:
  - `supabaseUrl`
  - `supabaseAnonKey` (anon — 클라이언트 노출 전제, 그래도 service role 과 혼동 금지)
- 방: URL `?room=tongtongi` (기본)

별도 `.env` 없이도 배포본은 위 설정만 있으면 됩니다. 로컬에서 덮어쓸 때만 `.env.example` → `.env` 복사 후 값 입력.

### 5.2 키 이름만 (값은 커밋 금지)

`.env.example` 참고.

### 5.3 Supabase

- SQL: `supabase-migration.sql`, `supabase-auth-migration.sql`
- Auth·공대원 계정: **`AUTH-SETUP.md`**
- 대시보드: [Supabase](https://supabase.com/dashboard) — 프로젝트 `rpktsgrbwnxolnmgvdos` (URL 기준)

### 5.4 배포

- **GitHub Pages:** push `main` → Actions 배포 (`GITHUB-PAGES.md`)
- 과거 Netlify 안내: `NETLIFY-배포.md` (Supabase 연동 개념 동일)

## 6. 비밀 파일 USB 백업

Git에 **넣지 않는** 것: `.env`, service role, PAT, 초기 비밀번호 메모 등.

포맷 전에 프로젝트 폴더(또는 상위)의 **`퉁공대_비밀파일백업.zip`** 을 USB/클라우드에 보관하세요.  
ZIP 안 `README_비밀백업.txt` 에 체크리스트가 있습니다.

## 7. 작업 후 동기화 (에이전트 규칙)

구현 턴 종료 시: `HANDOFF.md` 갱신 → `git commit` → **`git push origin main`** (배포 반영).

## 8. gh CLI (Windows)

```powershell
winget install GitHub.cli
gh auth login
```

PATH에 `gh` 가 없으면: `"$env:ProgramFiles\GitHub CLI\gh.exe" auth status`
