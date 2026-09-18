# 퉁공대 장부 — HANDOFF (에이전트·개발 인수인계)

> **목적:** 새 채팅/새 에이전트가 맥락 없이 들어와도 이 파일만 읽고 이어서 작업할 수 있게 한다.  
> **소유자 의도:** 질문에는 **답만** · 구현은 **명시 요청 시만** · 구현 후 **§13 종료 체크리스트 전부** (코드 sync · **HANDOFF 갱신** · commit · **push**) — **빠지면 안 됨.** (`.cursor/rules` 참고)

---

## 1. 프로젝트 한 줄

**퉁퉁이 공대 장부** — 3인 파티 메이플(메이플랜드) **획득·지출·인수·메이커·정산** 단일 페이지 앱. GitHub Pages + Supabase Realtime 공유.

| 항목 | 값 |
|------|-----|
| Repo | `https://github.com/qotjdals147/toonggongdae` |
| 로컬 | `C:\Users\qotjd\Downloads\퉁공대` |
| 배포 | GitHub Pages — [GITHUB-PAGES.md](./GITHUB-PAGES.md) |
| DB | Supabase `party_ledgers` — [supabase-migration.sql](./supabase-migration.sql), [NETLIFY-배포.md](./NETLIFY-배포.md) |
| 접속 | `https://qotjdals147.github.io/toonggongdae/?room=<방>` (기본 room: `tongtongi`) |

---

## 2. 소스 파일 (중요)

| 파일 | 역할 |
|------|------|
| **`index.html`** | **유일한 실제 소스.** HTML + CSS + JS 한 파일. |
| **`maple-party-ledger.html`** | **배포/미러용 복사본.** 변경 시 `index.html`과 **항상 동일**하게 유지 (`Copy-Item -Force`). |
| `image/아이콘/` | meso·섹션 아이콘 |
| `image/훈장아이콘/` | 레벨·도전 칭호 PNG |
| `README.md`, `HOSTING.md` | 배포 안내 |

**하지 말 것:** `_patch_*.py` 같은 일회성 패치 스크립트를 repo에 남기지 않기 (과거 실수 있음).

---

## 3. 아키텍처

- **프레임워크 없음** — IIFE `(function(){ ... })();` 안에 전부.
- **상태** `state` → Supabase `party_ledgers.data` (JSON) + localStorage 폴백.
- **회차** `state.cycles[]`: `open` 1개 + `closed` N개. `viewCycleId`는 **저장 안 함** (`stateForPersistence`에서 삭제) → 새로고침 시 **작성 중 회차**로 스냅 (`snapViewToActiveOpenCycle`, `hasInitialViewFocus`).
- **Realtime:** `subscribeCloudRealtime` — 편집 중 `modalBlocksRemote()`면 원격 덮어쓰기 방지.

### 3.1 `state` 주요 필드

```text
members[3], cycles[], activeCycleId, viewCycleId (비영속)
warehouseChars[], memberParcelReceive[3]
entryPriceBasis: 'listing' | (legacy net → 1회 마이그)
entryPriceNetUpgraded: boolean
partyRoster: { loginId, memberIdx }[]   // Auth ID ↔ 슬롯 0·1·2 (데이터는 idx로만 연결)
members[3]   // 표시 닉네임 (계정 슬롯과 동기, idx 변경 없음)
memberProfiles[3]  // totalXp, equippedTitleId|null, unlockedTitleIds[], xpLog[](최근 200, UI용) — **클라우드+로그인**
xpGrantKeys[]      // XP 중복 방지 (acq:/sale:/cycle:/hot:/login:/ach:/exclusive:)
challengeDefs[]    // 배퉁 · 조건 1개=칭호 1개 — threshold | requiredCount, xpReward, icon?, badgeColor?(hex)
levelTitleBadgeColors{}  // 레벨 칭호 4종 titleId → badgeColor (도전 관리에서 편집)
challengeItemCatalog[]  // 도전과제 아이템 자동완성 전용
hotIssues: { id, createdAt, updatedAt?, authorMemberIdx?, targetMemberIdx?, text, images[] }[]
```

### 3.2 회차(`cycle`) 안

```text
entries[], expenditures[], takeovers[], makerRefines[]
status: 'open' | 'closed'
closed 시 스냅: entryTotal, expTotal, netTotal, txList
legacySummaryOnly (옛 회차 요약만)
```

---

## 4. 도메인 규칙 (정산·금액) — 반드시 유지

### 4.1 획득(판매) — **거래소 등록가**

- `entry.price` = **경매장 등록가(성사액)**.
- **거래소 수수료** `AH_SALE_FEE_RATE = 0.05`.
- **실수령** `entryNetReceived` = 등록가 − 5%.
- **보유(`computeHeld`)** = 판매자에게 **실수령**만 가산.
- **몫(`computeFairShare`)** = 등록가×분배율 − **(수수료÷3)** per member (`applySoldEntryFairShare`).
- **버그 주의:** `parseStoredState`에서 `entryPriceBasis` / `entryPriceNetUpgraded` **반드시 parsed에서 복원**. 없으면 불러올 때마다 `÷0.95` 반복되어 등록가가 **계속 증가** (`migrateEntryPriceBasisToListing`).

### 4.2 메이커 재련 — **재련 메소만**

- 원석·재료 **기회비용 없음** (파티 재고).
- `computeMakerBatchCosts` → `meso` = 11/33/55만 × 횟수, `total = meso`.
- 재련자 `held`에서 meso 차감, 3명 **meso/3** 몫 차감.

### 4.3 인수

- 경매장 최소가 기준, 인수자 → 나머지 2명에게 **⅓×2** 송금 (`buildSettleRawLines`).

### 4.4 정산 송금

- `netSettlementTransfers` — 쌍별 상계 + breakdown 라벨.
- 택배 수수료: `PARCEL_FEE_BRACKETS`, `memberParcelReceive`.

### 4.5 교환·택배 vs 거래소

- UI **수수료 표** — 거래소 5%와 교환/택배 구간 fee **별개**.

---

## 5. UI 섹션 ↔ 함수

| UI | 렌더/핵심 |
|----|-----------|
| 획득 장부 | `renderLedger`, `openEntryAdd`, `saveEntryEdit` |
| 인수 | `renderTakeovers` |
| 메이커 | `renderMakerRefines`, `computeMakerBatchCosts` |
| 지출 | `renderExpenditures` |
| 정산 | `renderSettlement`, `computeHeld`, `computeFairShare` |
| 통계 | `renderStatsModal` — 등록가/수수료/메이커/인수/순수익 반영 |
| 핫이슈 | `hotIssues`, `openHotIssueModal`, `postHotIssue` — 붙여넣기·첨부 |
| 창고캐 | `warehouseChars` |
| 상단 헤더 | `.app-toolbar` — 수수료·창고캐·핫이슈·통계·도전·로그아웃 (마이페이지는 공대원 카드) |
| 장부 점프 | `#ledgerJumpNav` sticky · `#ledgerCycleSummary` — `partyNet` = 실수령−지출−`makerCycleCostTotal()` |
| 로그인 | `#authGate`, `signInWithPartyAccount`, `party_room_access` — **AUTH-SETUP.md** |
| 공대원·레벨 | `renderMembers` — Lv·칭호·EXP 바 (**클라우드+로그인**) · `replayLedgerGamificationXp` |
| 마이페이지 | `#accountModal` — 닉·비밀번호·칭호 장착/해제 |
| 도전과제 | `#challengeModal`(진행도) · `#challengeAdminModal`(memberIdx **2** 배퉁만) |
| 핫이슈 대상 | `#hotIssueTarget` — 대상 멤버 XP (`XP_HOT_ISSUE`) |

### 5.1 표 CSS 주의

- `<td>`에 **`display:flex` 금지** (격자선 깨짐). flex는 **내부 wrapper** (`owner-tags-wrap`, `row-actions` div).
- `.data-table` — `border-collapse: separate`, 일반 `tbody td` 규칙은 `table:not(.data-table)`로 분리.

---

## 6. 퉁공대 **핫이슈** · 아이템명

### 6.1 핫이슈

- `state.hotIssues[]`: `{ id, createdAt, updatedAt?, authorMemberIdx?, targetMemberIdx?, text, images[] }`.
- **수정:** 피드 **수정** → 상단 작성란에 불러오기 → **저장** / **수정 취소** (`startHotIssueEdit`, `postHotIssue` 분기).
- `images`: JPEG **data URL** — `compressImageBlobToDataUrl` (최대 약 1280px, 품질 자동 하향).
- **입력:** `#hotIssueCompose` — 파일 첨부, **Ctrl+V** 캡처 붙여넣기, **Ctrl+Enter** 등록.
- **사진 보기:** 썸네일 클릭 → `#hotIssueLightbox` (data URL은 새 탭 URL 한도로 깨질 수 있어 라이트박스 사용).
- **오늘 알림:** `#hotIssueBadge` — `createdAt`이 **로컬 달력 오늘**인 글이 1건 이상이면 `N` + 버튼 glow (자정 넘기면 1분 주기로 갱신).
- **한도:** `HOT_ISSUE_MAX_IMAGES = 4`, 장당 data URL 길이 상한 (`HOT_ISSUE_MAX_DATA_URL_LEN`).
- **주의:** Supabase `jsonb` 전체 크기 — 사진 많이 쌓이면 저장 실패 가능. (추후 Storage 분리는 요청 시)

### 6.2 아이템명

- **itemCatalog / MapleStory.io 자동완성 제거** (2026-09-17). 획득·인수·메이커 등 **자유 텍스트**만.

### 6.3 계정 레벨·칭호·도전과제 (클라우드+로그인)

- **Lv 1~200** · `xpToNextLevel` / `levelFromTotalXp` · EXP 바는 메이플랜드 스타일.
- **레벨 칭호 4종** (`LEVEL_TITLE_DEFS`): 초보(1), 주니어(30), 베테랑(70), 마스터(120) — 아이콘 `image/훈장아이콘/*.png`.
- **XP:** 획득 entry 기여자(`entryParticipantIdxs`) · 등록가 비례 판매(`sale:`) · 회차 마감 3명 · 핫이슈 대상 · 일 1회 로그인 · 도전 `ach:`.
- **집계:** `replayLedgerGamificationXp()` — 불러올 때·장부/핫이슈/마감/도전 변경 후 · **과거 회차 소급** · `login:` 키만 보존.
- **고유 훈장:** `EXCLUSIVE_TITLE_DEFS`(코드) · `memberIdx` 전용 · `xpReward` · `bonuses`(예: `xpGainRate: 0.05`) · **장착 시** EXP 보너스(`grantXp` → 키 `:medalXp`) · 호버 툴팁(설명+[훈장 옵션]) · UI **칭호→훈장** 통일.
- **경험치 내역:** 마이페이지 탭 · `rebuildAllXpLogs()`(키→라벨·일시) · 최근 **200건** · 필터(전체/장부/훈장·도전/기타).
- **도전과제(조건부 칭호):** 초보/주니어/베테랑/마스터 **제외** · `challengeDefs` — 유형 `sale_amount`(threshold) | `item_acquire`(requiredCount·itemCanonical) · **조건 하나당 훈장 하나**.
- **관리 UI(배퉁):** 칭호 이름 · 등록가 또는 획득 횟수+아이템 · XP · **뱃지 배경색**(color) · 추가 시·목록에서 **레벨 칭호 4종** 색도 편집 (`levelTitleBadgeColors`). 장착·도전 미리보기 동일 템플릿(`memberTitleBadgeStyleAttr`).
- **레거시:** 예전 `levels[]` 다단계 정의는 불러올 때 **단계마다 별도 challengeDef**로 펼침 (`migrateChallengeDefs`).
- **아이콘/뱃지:** 관리 UI 없음. 도전 추가 후 **에이전트에게 요청** → `CHALLENGE_TITLE_ASSETS`(칭호 이름→icon·`badgeEffect`) · PNG `image/훈장아이콘/`. 예: **시간의 광부** → `시간의광부.png` · `sparkle-subtle`(흰 점 3개, 약함 — 10·20회는 더 강한 effect 추가 예정).
- **칭호 아이콘 참고:** https://www.inven.co.kr/board/maple/2304/7662

---

## 7. Supabase · Auth

- **`party_ledgers`**: room별 JSON (cycles·hotIssues 등) — **memberIdx 0·1·2** 로 연결, 로그인 후에도 JSON 구조 **이관 없음**.
- **`party_room_access`**: `(room_id, member_idx, login_id, user_id)` — RLS: 이 방에 등록된 Auth 사용자만 read/write.
- 로그인 이메일: `party+{slug}@{room}.toonggongdae.app` (화면 ID는 한글 `순퉁` 등).
- **최초 설정:** [AUTH-SETUP.md](./AUTH-SETUP.md) + [supabase-auth-migration.sql](./supabase-auth-migration.sql) (순서 엄수).
- `CLOUD_CONFIG` — anon key; 클라우드 모드는 **로그인 필수**. 로컬-only는 로그인 UI 없음.
- Realtime on `party_ledgers` (로그인 후).

---

## 8. Git · 배포 워크플로 (팀 규칙)

구현 작업의 **마지막 단계는 항상 §13**. 요약:

1. 코드 (`index.html` → mirror)
2. **`HANDOFF.md` 자동 인수인계 갱신** (§13.2)
3. **`git commit` + `git push origin main`** — **매번 자동.** 별도 “푸시해줘” 없어도 push.

커밋 메시지: 한국어 한 줄, **why** 위주. HANDOFF만 고친 commit도 push.

**예외:** 사용자가 **push/commit 하지 마**라고 한 경우, 또는 **질문-only** 턴(§9).

---

## 9. 대화·작업 규칙 (소유자)

| 상황 | 행동 |
|------|------|
| **질문만** (“가능해?”, “어디서 구해?”) | **답변만.** 코드/커밋/push **하지 않음.** |
| **“해줘”, “구현”, “적용”** 등 명시 | 구현 → **§13 전체** (HANDOFF 포함) → push |
| **commit만 요청** | user rule git protocol 따름 |
| **과도한 기능** (풀 DB, 자동 마이그레이션 등) | 먼저 범위 확인 |

---

## 10. 변경 이력 (에이전트가 구현할 때마다 **맨 위에 한 줄 추가**)

- **2026-09-18** — 훈장 툴팁 **fixed** 배치(공대원 카드 overflow 밖 표시)
- **2026-09-18** — 훈장 **옵션**(리버스 EXP+5%·내역 분리·툴팁) · UI 칭호→훈장
- **2026-09-18** — 훈장 모달 탭 **패널 hidden** fix · 제목 **훈장제목아이콘**
- **2026-09-18** — fix: `ensureGamificationState`↔고유훈장 sync **무한 재귀**(불러오기 멈춤)
- **2026-09-18** — 고유 훈장 **150 XP** · 마이페이지 **경험치 획득내역** 탭(200건·필터)
- **2026-09-18** — **고유 훈장**(순퉁·리버스 블라인드니스·burn) · **훈장** 모달 탭(도전/고유)
- **2026-09-18** — 도전 관리 **뱃지 배경색**(조건부·레벨 4종) · `badgeColor` / `levelTitleBadgeColors`
- **2026-09-18** — `sparkle-subtle` **별 6~8개**·밝기·위치 분산 강화
- **2026-09-18** — 도전과제 모달 **장착 뱃지와 동일 미리보기** (`titleBadgePreviewHtml`)
- **2026-09-18** — **시간의 광부** 훈장·`sparkle-subtle` 뱃지 이펙트 · `CHALLENGE_TITLE_ASSETS`
- **2026-09-18** — 도전과제 **단일 조건=단일 훈장**으로 복귀 (다단계·titleTiers 제거) · HANDOFF §6.3
- **2026-09-18** — 도전 관리 **아이콘 경로 입력 제거** (기본 아이콘 · 커스텀은 요청 시)
- **2026-09-18** — 공대원 제목·EXP 텍스트 **가운데 정렬**
- **2026-09-18** — 헤더 **링크 공유·마이페이지** 제거 · 통계/도전/로그아웃 **컬러 버튼** (마이페이지는 공대원 카드)
- **2026-09-18** — 로그인 슬롯: **`party_room_access.login_id`→슬롯** · 로그인 전 signOut · 세션 갱신 시 공대원 UI
- **2026-09-18** — 로그인 슬롯: **`party_room_access` 우선** · `LOGIN_ID_TO_MEMBER_IDX` · partyRoster 0·1·2 고정
- **2026-09-18** — 로그인 슬롯: **입력 ID·Auth 이메일** 우선 (`resolveAuthMember`) · access UUID 필수
- **2026-09-18** — 공대원 카드 **닉 가독성**(nameplate) · 상단 **순퉁/지퉁/배퉁** 라벨 · 아이디 안내 문구 제거
- **2026-09-18** — **계정 Lv/EXP·칭호·도전과제**(배퉁 관리) · 핫이슈 **대상** · 공대원 카드 UI · 마이페이지
- **2026-09-18** — Supabase **로그인**·`partyRoster`/슬롯 연동 · AUTH-SETUP (데이터 idx 유지)
- **2026-09-18** — 회차 요약 **순수익**에 메이커 재련 메소 반영 (정산·송금과 일치)
- **2026-09-18** — 장부 **점프 내비·회차 요약 스트립**(sticky, 구역별 뱃지, 접기 없음)
- **2026-09-18** — 핫이슈 **글 수정**(작성란 재사용·사진 편집·`updatedAt`)
- **2026-09-18** — 헤더 가운데 정렬·제목 **퉁퉁이 공대** · 핫이슈 **오늘 글 N 뱃지**(로컬 날짜)
- **2026-09-17** — 핫이슈 사진 **라이트박스**(썸네일 클릭 확대, Esc/바깥 닫기)
- **2026-09-17** — itemCatalog 제거 · 상단 `.app-header` 툴바 · **퉁공대 핫이슈**(텍스트+사진 붙여넣기)
- **2026-09-17** — itemCatalog 자동완성: 줄임 검색(어크 등)·aliases·검색 결과 UI(키보드 안내)
- **2026-09-17** — HANDOFF·규칙: 작업 후 **자동 push** + **HANDOFF 자동 갱신** §13 의무화
- **2026-09-17** — HANDOFF.md + `.cursor/rules` 최초 추가 (질문-only, push 규칙)
- 등록가 + 거래소 5% 3등분 정산
- 메이커 재련 메소만
- `entryPriceBasis` 유실 버그 수정 (등록가 inflation)
- data-table 격자선 (flex on td)
- 퉁공대 통계 확장
- itemCatalog + 아이콘 자동완성 (경량)

---

## 11. 다음에 손대기 쉬운 개선 (요청 시만)

- [ ] 핫이슈 이미지 Supabase Storage 분리 (JSON 용량)
- [ ] closed cycle `entryTotal`에 메이커 반영 여부 정리
- [ ] AGENTS.md 없음 — **이 HANDOFF가 AGENTS 역할**

---

## 12. 에이전트 **시작** 체크리스트

1. Read **`HANDOFF.md`** (this file)
2. Read **`.cursor/rules/*.mdc`**
3. 큰 변경 전 **`index.html`만** 편집, mirror sync
4. 금액 로직 변경 시 §4 regression mentally check
5. 질문-only 턴인지 확인 (§9)

---

## 13. 에이전트 **작업 종료** 체크리스트 (구현마다 필수 · 생략 금지)

구현·버그fix·문서(규칙) 변경을 **한 턴이라도** 코드/repo에 반영했으면, 사용자에게 “완료” 말하기 **전에** 아래를 **전부** 수행.

### 13.1 코드·배포

- [ ] `index.html` 수정했다면 **`maple-party-ledger.html` 동기화** (`Copy-Item -Force`)
- [ ] `git add` — 변경된 파일만 (secret 없음)

### 13.2 HANDOFF **자동 인수인계** (항상)

**`HANDOFF.md`를 같은 턴에서 반드시 갱신.** “나중에” 금지.

| 변경 종류 | HANDOFF 어디에 반영 |
|-----------|---------------------|
| 정산·금액·수수료 | §4 |
| 새 UI / 함수 / state 필드 | §3, §5 |
| 아이템·아이콘 | §6 |
| Supabase·배포 | §7, §8 |
| 아무 구현이나 | **§10 맨 위 한 줄** (날짜 + 요약) |
| TODO 완료/추가 | §11 |
| — | **`Last updated` 날짜** |

HANDOFF-only 변경(규칙 정리)도 §10 + Last updated.

### 13.3 Git push (항상 자동)

- [ ] `git commit` — 한국어, why
- [ ] **`git push origin main`** — **별도 요청 없이 매번**
- [ ] push 실패 시 사용자에게 알리고 재시도/원인 보고 (멈춘 채로 “완료” 금지)

### 13.4 사용자에게 보고

- 짧게 **무엇을 바꿨는지** + **commit hash** (push 성공 시)

*Last updated: 2026-09-18 (훈장 툴팁 fixed)*
