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
| `image/몬스터/` | 보스·몬스터 GIF/PNG · 처치 도전 아이콘 (`challengeMonsterCatalog`) |
| **`maple-party-ledger.html`** | **배포/미러용 복사본.** 변경 시 `index.html`과 **항상 동일**하게 유지 (`Copy-Item -Force`). |
| **`party-timer-app.js`** | **퉁공대 타이머** 로직 · `#partyTimerModal` + Document PiP · `state.partyTimer`는 `scheduleSave` |
| **`party-timer.html`** | 구 URL → `index.html?openTimer=1` 리다이렉트만 |
| `image/아이콘/` | meso·섹션 아이콘 |
| `image/훈장아이콘/` | 레벨·도전 칭호 PNG |
| `image/주문서 아이콘/` | 10·60·100% 주문서 아이콘 (카탈로그·자동완성) |
| `image/아이템아이콘/` | 기타 아이템 (예: 시간의 조각) |
| `image/메이커보석아이콘/` | 메이커 보석 48종 · 파일명=카탈로그 공식명 |
| `image/공대원캐릭터/` | 공대원 칸 **전신 PNG**(투명) · `{순퉁|지퉁|배퉁}.png` · **실제 알파 필수**(흰 사각만 RGBA면 네모 박스로 보임) |
| `README.md`, `HOSTING.md` | 배포 안내 |

**하지 말 것:** `_patch_*.py` 같은 일회성 패치 스크립트를 repo에 남기지 않기 (과거 실수 있음).

---

## 3. 아키텍처

- **프레임워크 없음** — IIFE `(function(){ ... })();` 안에 전부.
- **상태** `state` → Supabase `party_ledgers.data` (JSON) + localStorage 폴백.
- **회차** `state.cycles[]`: `open` 1개 + `closed` N개. `viewCycleId`는 **저장 안 함** (`stateForPersistence`에서 삭제) → 새로고침 시 **작성 중 회차**로 스냅 (`snapViewToActiveOpenCycle`, `hasInitialViewFocus`).
- **Realtime:** `subscribeCloudRealtime` — 편집 중 `modalBlocksRemote()`면 원격 덮어쓰기 방지.
- **게임화:** `gamificationActive()` — 클라우드 + 로그인 + `memberProfiles` 있을 때만. 없으면 Lv/도전/XP UI 숨김.
- **부트(클라우드):** `bootApp` → `refreshAuthSession` → `loadState` → `applyStateFromRemote` → `render()`. **`refreshAuthSession`에서 `renderMembers` 호출하지 않음** (장부 로드 전 UI 깜빡임 방지).
- **모듈 플래그:** `partyStateHydrated` — Supabase/로컬 JSON **1회 반영 후** `true` (`applyStateFromRemote`·`loadState` 실패 시에도). 클라우드 공대원 칸은 `false`일 때 **「불러오는 중…」** (`DEFAULT_MEMBERS` `나·친구·아는형` 노출 금지).

### 3.1 `state` 주요 필드

```text
members[3], cycles[], activeCycleId, viewCycleId (비영속)
warehouseChars[], memberParcelReceive[3]
entryPriceBasis: 'listing' | (legacy net → 1회 마이그)
entryPriceNetUpgraded: boolean
partyRoster: { loginId, memberIdx }[]   // Auth ID ↔ 슬롯 0·1·2 (데이터는 idx로만 연결)
members[3]   // 표시 닉네임 (계정 슬롯과 동기, idx 변경 없음)
memberProfiles[3]  // totalXp, equippedTitleId|null, unlockedTitleIds[], xpLog[](최근 200, UI용) — **클라우드+로그인**
xpGrantKeys[]      // XP 중복 방지 · acq:/sale:/cycle:/hot:/login:/ach:/exclusive: · 장착 훈장 보너스 `{baseKey}:medalXp`
challengeDefs[]    // 배퉁 · bonuses?, badgeColor?, badgeTextColor?, description?, optionsText?, …
levelTitleBadgeColors{}  // 레벨 훈장 4종 · badgeColor
levelTitleMeta{}       // 레벨 · description, optionsText, badgeTextColor, bonuses?
exclusiveTitleMeta{} // 고유 훈장 UI 오버라이드 · id → description, badgeColor, badgeTextColor, bonuses?
challengeItemCatalog[]  // { id, canonical, aliases[], icon? } · 장부·도전 자동완성 · 집계 매칭
catalogSearchFlags      // { accuracyScrolls, shieldScrollsExtra } · 미출시 주문서 자동완성 공개(배퉁 토글)
hotIssues: { id, …, authorMemberIdx?, **targetMemberIdxs[]**, text, images[] }[]
challengeMonsterCatalog[]  // { id, canonical, aliases[], icon? } · 처치 도전
partyTimer?  // presets[] · runtime · **soundProfiles[slotId]** { src(dataURL), volume 0–1, fileName } · **`party-timer-app.js`**
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
- **예외 — `잡장비`:** NPC 상점 일괄 판매 · **`CATALOG_AH_FEE_EXEMPT`** · `entrySkipsAhSaleFee` → 수수료 0 · 등록가=실수령 · fair share에서 ⅓ 차감 없음.
- **획득 수정 모달 — `잡장비`:** 라벨 **상점 판매 총금액** · placeholder **판매 금액** · **함께 기여** 획득자 제외 전원 **체크+비활성** (`syncEntryEditJunkGearUi`) · 잡장비 해제·아이템 비우면 **거래소 등록가/올린 금액·기여 초기**로 복귀.
- **획득 수정 모달 — 카탈로그 매칭:** `#eEditItemIcon` — 카탈로그에 resolve되면 입력 **왼쪽 아이콘** (`syncEntryEditItemIcon`).
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

### 4.6 퉁공대 타이머 (partyTimer)

- **데이터:** `state.partyTimer` → `party_ledgers.data` · 장부 **`scheduleSave`** 와 동일 JSON.
- **UX:** **장부 팝업(모달) 없음 · PIP만** · `huntActive` false → PIP **설정 화면**(+ 사냥 시작) · true → **타일 그리드**(+ 사냥 종료, 설정/종료 버튼 없음).
- **PIP CSS:** `#partyTimerPipStyles` **textContent**만 PiP `<head>`에 주입 — **`cloneNode`+`media="not all"` 금지**(스타일 미적용·흰 화면).
- **PIP 크기:** `computePipTargetSize` + `measurePipContentSize`(CTA bottom 포함) + `resizeTo` · 전환 후 rAF·지연 재측정 · `overflow:hidden`에서 scrollHeight만 쓰면 **사냥 종료 잘림** 간헐 버그.
- **동기화:** `runtime.slotEndsAt` + `huntActive` · 0초 **`scheduleSlotExpiryAlarm`(setTimeout)** + tick 백업(`processSlotTimerLoops`) · 알람 후 `slotCycleMs` 재시작 · `slotAlarmFired` cycleKey · PiP 닫아도 tick 유지.
- **PIP:** Chrome/Edge Document PiP · **2×2 타일** · 사냥 중 상단 **좌** ▶⏸↺🔊 · **우** **사냥 종료**(하단 CTA 없음 — 잘림 방지) · urgent·0초 alarm·반복.
- **슬롯:** 사냥 중 **개별 일시정지/재개** · **↺ = 설정 초( durationSec )로 리셋** · `runtime.slotPaused`.
- **프리셋:** `presets[{ name, slots[{ label, durationSec, durationUnit?, icon?, enabled }] }]` · PiP 설정 **2열** · **초/분** 토글 · **삭제=즉시**.
- **기본 4슬롯(id 고정):** `slot-holy` **홀리 심볼** `image/스킬아이콘/홀리심볼.png` · `slot-session` **한타임** `image/스킬아이콘/한타임.png` · `slot-buff1` **경쿠** `image/아이템아이콘/경쿠.png` · `slot-consume` **기타**(이름 **자유 입력**) · `normalizePartyTimer`→`applyBuiltinSlotDefaults` · PiP 설정 행 **이름 왼쪽 12px 아이콘**.
- **알람:** **0초** `is-alarm` 플래시만 · **소리는 2초 남음(00:02)** `ALARM_SOUND_BEFORE_END_MS` · `scheduleSlotAlarms` + tick 백업 · PIP 열림·음소거 아닐 때만.
- **소리:** `soundProfiles` · **volume** · **사이클당 1회** · preload + 매번 새 `Audio` · 파일 없으면 **880Hz 비프**.
- **설정 UI:** **배퉁(memberIdx 2)** · 마스터 옵션 **「타이머 사운드」** 탭 · `renderTimerSoundAdmin()` · 최대 ~900KB/파일.
- **음소거:** 툴바 🔊 → `pipUi.muted` (**세션만**) · 타일 🔊·⟲ **`noop`** · **슬롯끼리 알람 동시 재생 가능** · 등록 mp3 실패 시 **비프 fallback 없음**(파일 없을 때만 비프).

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
| 상단 헤더 | `#appHeaderBanner` · **공대 도구** 상시 노출 · `app-tool-card` + `image/NPC/*` · **연결 상태=마스터 옵션만** |
| 장부 점프 | `#ledgerJumpNav` sticky · `#ledgerCycleSummary` — `partyNet` = 실수령−지출−`makerCycleCostTotal()` |
| 로그인 | `#authGate`, `signInWithPartyAccount`, `party_room_access` — **AUTH-SETUP.md** |
| 공대원·레벨 | `renderMembers` — **§5.2** · `memberCharSpriteHtml` · `partyStateHydrated` · `replayLedgerGamificationXp` |
| 마이페이지 | `#accountModal` — 닉·비밀번호·칭호 장착/해제 · 공대원 칸 **머리** `member-slot-mypage` |
| 훈장·도전(전원) | `#challengeModal` — 도전 탭 **공대원별 접이 패널**(기본 접힘 · 펼쳐보기/▼) · `renderChallengeListView` |
| 마스터 옵션(배퉁) | `#challengeAdminModal` · **몬스터 추가** · 도전 **monster_kill(처치)** · 타이머 사운드 · memberIdx **=== 2** |
| 획득 아이템 AC | `#eEditItem` + `#eEditItemDropdown` + `#eEditItemIcon` · `bindItemNameAutocomplete` · `syncEntryEditFormForItem` |
| 퉁공대 타이머 | `#partyTimerBtn` → **PIP만** · 사냥 전=PIP 설정 / 사냥 중=2×2 타일+**사냥 종료** · `party-timer-app.js` |
| 핫이슈 대상 | `#hotIssueTargetPicks` **복수 체크** · 대상마다 XP (`XP_HOT_ISSUE`) |

### 5.1 표 CSS 주의

- `<td>`에 **`display:flex` 금지** (격자선 깨짐). flex는 **내부 wrapper** (`owner-tags-wrap`, `row-actions` div).
- `.data-table` — `border-collapse: separate`, 일반 `tbody td` 규칙은 `table:not(.data-table)`로 분리.
- **`.table-scroll:has(> .data-table)`** — `overflow-x: auto` (모바일 가로 스크롤). `overflow: hidden` 쓰면 열 잘림.
- **`table.data-table`** — `min-width: 720px` · 좁은 화면은 `.table-scroll` 안에서 스와이프.

### 5.3 모달 · 스크롤

- **배경 스크롤 잠금:** `installOverlayScrollLock()` · `.modal-backdrop` / `#hotIssueLightbox` `hidden` 감시 → `body.is-modal-scroll-locked` (`position: fixed` + scrollY 복원).
- **체이닝 완화:** `.modal` · `.hot-feed` — `overscroll-behavior: contain` · backdrop `overflow: hidden`.
- **핫이슈:** `.modal-hot-issue` flex · 피드만 세로 스크롤 (모달 전체+피드 이중 스크롤 축소).

### 5.2 공대원 카드 (`#membersGrid` · `gamificationActive()`)

**인게임 순서(길드 생략):** 캐릭터 → 닉(Lv 네임플레이트) → 훈장 → EXP(맨 아래).

| DOM | 클래스 | 비고 |
|-----|--------|------|
| 머리 | `member-slot-head` | 본인만 `내 캐릭터` + **마이페이지** · 타 슬롯은 `member-slot-head--empty`(높이 맞춤) |
| 몸 | `member-slot-body` | `flex-end` — 스프라이트·`member-nameplate`·`member-slot-medal` |
| 발 | `member-slot-foot` | `member-exp-wrap` — **칸 바닥**에 붙음 (`member-slot` `min-height` + `margin-top: auto`) |

- **스프라이트:** `MEMBER_CHAR_ROSTER` · `memberCharSpritePath` — `members[i]` → `loginIdForMemberIdx` → 슬롯 기본명 순 매칭 · `catalogAssetUrl`.
- **비게임화:** 슬롯당 텍스트 input (`DEFAULT_MEMBERS` 편집).

---

## 6. 퉁공대 **핫이슈** · 아이템명

### 6.1 핫이슈

- `state.hotIssues[]`: `{ id, createdAt, updatedAt?, authorMemberIdx?, **targetMemberIdxs[]**, text, images[] }` (구 `targetMemberIdx`는 로드 시 배열로 흡수).
- **수정:** 피드 **수정** → 상단 작성란에 불러오기 → **저장** / **수정 취소** (`startHotIssueEdit`, `postHotIssue` 분기).
- `images`: JPEG **data URL** — `compressImageBlobToDataUrl` (최대 약 1280px, 품질 자동 하향).
- **입력:** `#hotIssueCompose` — 파일 첨부, **Ctrl+V** 캡처 붙여넣기, **Ctrl+Enter** 등록.
- **사진 보기:** 썸네일 클릭 → `#hotIssueLightbox` (data URL은 새 탭 URL 한도로 깨질 수 있어 라이트박스 사용).
- **오늘 알림:** `#hotIssueBadge` — `createdAt`이 **로컬 달력 오늘**인 글이 1건 이상이면 `N` + 버튼 glow (자정 넘기면 1분 주기로 갱신).
- **한도:** `HOT_ISSUE_MAX_IMAGES = 4`, 장당 data URL 길이 상한 (`HOT_ISSUE_MAX_DATA_URL_LEN`).
- **주의:** Supabase `jsonb` 전체 크기 — 사진 많이 쌓이면 저장 실패 가능. (추후 Storage 분리는 요청 시)

### 6.2 아이템명 · 카탈로그

- **MapleStory.io 외부 자동완성 없음.**
- **`challengeItemCatalog[]`:** `{ id, canonical, aliases[], icon? }` — **마스터 옵션 → 아이템 추가** CRUD + 코드 **시드 merge** (`mergeBuiltinCatalogSeeds`, `SCROLL_CATALOG_BASES` × 10/60/100%).
- **시드:** load/`ensureGamificationState`마다 **canonical norm 중복 없이** 주문서·`시간의 조각`(별칭 `시조`)·**소모품 6종**(`BUILTIN_MISC_ITEM_CATALOG`: 엘릭서·파워 엘릭서·이슬·순록의 우유·**잡장비**)·**메이커 보석 48종** 보충 · 아이콘 `CATALOG_ITEM_ICON_BY_CANONICAL` · 신규 추가 시 `scheduleSave`.
- **아이콘:** `inferCatalogIconForCanonical` — 주문서 `%` → `image/주문서 아이콘/` · `시간의 조각` → `image/아이템아이콘/` · 보석 → `image/메이커보석아이콘/{공식명}.png` (`makerGemIconPath`). **자동완성:** 획득 `#eEditItem` · **메이커 `#fMakerGem`/`#mEditGem`은 `gemsOnly`** — `MAKER_GEM_CATALOG_NAMES`만 · 저장 시 `validateMakerRefineRow` 검증.
- **미출시 자동완성 숨김:** `catalogEntryHiddenByReleasePolicy` — **명중률 주문서** 전종 · **방패 주문서 중 방어력 제외** · 기본 **순퉁·지퉁 검색 불가** · **배퉁(memberIdx 2)만** 검색 가능. 출시 후 **마스터 옵션 → 아이템 추가** 상단 체크(`catalogSearchFlags`)로 전원 공개 — 소유자 “출시됐다”고 하면 토글 또는 HANDOFF에 따라 `accuracyScrolls` / `shieldScrollsExtra` 켜기.
- **자동완성:** `filterItemNameSuggestions` → **카탈로그만** · query **공백 제거 후 1자 이상** · 드롭다운 **아이콘+canonical** (`catalogAssetUrl` — 경로 `%`·공백 인코딩) · 별칭은 **검색용** (`itemNameMatchesQuery`).
- **자동완성 정렬:** 주문서 — 종류별 **100 → 60 → 10** · 보석 — **기본 → 하급 → 중급 → 상급** (`compareMakerGemCatalogSuggestions`) · 기타 가나다 · 마스터 **아이템 추가** 목록도 동일 comparator.
- **저장:** 획득 `saveEntryEdit` · 도전 추가 — `resolveCatalogItemInput`으로 canonical 치환(별칭 exact norm 일치) · 도전 `item_acquire`는 **카탈로그에 있는 이름만** 추가 가능.
- **도전 매칭:** `itemTextMatchesChallenge` — 카탈로그 canonical+별칭 · `ch.itemMatchTokens` · `syncChallengeItemMatchFromCatalog(ch)`가 `item_acquire` 토큰 갱신.
- **마이그:** `migrateChallengeItemCatalog` — parse/load 시 aliases 배열 보장.

### 6.3 계정 레벨·훈장·도전과제 (클라우드+로그인)

- **Lv 1~200** · `xpToNextLevel` / `levelFromTotalXp` · EXP 바는 메이플랜드 스타일.
- **레벨 칭호 4종** (`LEVEL_TITLE_DEFS`): 초보(1), 주니어(30), 베테랑(70), 마스터(120) — 아이콘 `image/훈장아이콘/*.png`.
- **XP:** 획득 `acq:`(고정 **28**) · **판매 `sale:`**(등록가 비례·상한 — **템플릿 없음**, 예전부터 코드에 존재 · 팀이 “판매 XP 제거”로 정했으면 `replay`의 `sale:` grant 제거 요청) · 회차 `cycle:` · 핫이슈 `hot:` · 로그인 `login:` · 도전 `ach:` · 고유 `exclusive:`.
- **집계:** `replayLedgerGamificationXp()` — `xpGrantKeys`를 **`login:`만 남기고** 전부 재생성 · `totalXp` 0부터 재합산 · **`stripReplayChallengeTitleUnlocks`** 후 도전 충족분만 `unlockChallengeTitle` · 끝에 **`syncExclusiveTitlesAll`** + `syncAllLevelTitles` + `rebuildAllXpLogs`.
- **UI 갱신 래퍼:** `gamificationReplayAndRefresh()` — replay + `renderMembers` + (훈장 모달 열려 있으면) 진행도 뷰.
- **replay 호출 예:** 획득 저장/삭제 · 도전 추가/삭제 · 회차 마감 · 핫이슈 등록 · **카탈로그 추가/저장/삭제** · `runGamificationAfterStateLoad`.
- **주의:** **카탈로그 항목 자체는 XP를 주지 않음.** 카탈로그 변경으로 **도전 완료 조건(매칭)이 바뀔 때만** ach XP가 replay로 변동. 획득 줄 삭제는 acq/sale XP 감소.
- **금지(재귀):** `ensureGamificationState` 안에서 **`syncExclusiveTitlesAll()` 호출 금지** · `syncExclusiveTitlesForMember` 안에서 **`ensureGamificationState()` 호출 금지** (과거 불러오기 멈춤 버그).
- **고유 훈장:** `EXCLUSIVE_TITLE_DEFS`(코드) · `memberIdx` 전용 · `xpReward` · `EXCLUSIVE_XP_TIER_HIGH`(150)·`TIER_MID`(80) · unlock 시 `exclusive:{id}:{idx}` → 내역 **고유 훈장 · 이름** · **장착 시** EXP 보너스 · 예: 중급 샤프20=80 · (예정) 샤프30=150=리버스.
- **도전 XP:** `challengeDefs[].xpReward` · 달성 시 `ach:{chId}:{idx}` · 내역 **도전과제 · 훈장명** · **도전 추가**·**등록된 도전**에서 편집 · 저장 후 replay.
- **경험치 내역:** 마이페이지 탭 · `rebuildAllXpLogs()`(키→라벨·일시) · 최근 **200건** · 필터(전체/장부/훈장·도전/기타).
- **도전과제(조건부 칭호):** 초보/주니어/베테랑/마스터 **제외** · `challengeDefs` — 유형 `sale_amount`(threshold) | `item_acquire`(requiredCount·itemCanonical) · **조건 하나당 훈장 하나**.
- **마스터 옵션(배퉁):** 탭 **도전 추가 / 아이템 추가 / 레벨 훈장 / 등록된 도전 / 고유 훈장** · **고유**=`EXCLUSIVE_TITLE_DEFS`(코드) + `exclusiveTitleMeta` 오버라이드 · `resolveExclusiveTitleDef` · XP 보상·대상 멤버는 코드 고정.
- **장착 시만:** `equippedTitleDef` → `grantMedalBonusKeys` / `equippedMedalBonuses` · **장착·해제** 시 replay · (주의) replay는 **현재 장착** 기준으로 과거 키에도 medal suffix 재부여 — 장착 바꾸면 totalXp 변동.
- **`bonuses` 필드:** `xpGainRate`(전체 %), `flatAcq`, `achXpRate`, `flatCycleClose`, `hotXpRate` · grant suffix `:medalXp`, `:medalFlatAcq`, `:medalFlatCycle`, `:medalAchPct`, `:medalHotPct`.
- **툴팁:** `medalBonusLinesFromBonuses` · legacy `optionsText` fallback.
- **뱃지 스타일:** `memberTitleBadgeStyleAttr`(그라데이션) · `--badge-text` CSS 변수로 글자색.
- **레거시:** 예전 `levels[]` 다단계 정의는 불러올 때 **단계마다 별도 challengeDef**로 펼침 (`migrateChallengeDefs`).
- **아이콘/뱃지:** 관리 UI 없음. 도전 추가 후 **에이전트에게 요청** → `CHALLENGE_TITLE_ASSETS`(칭호 이름→icon·`badgeEffect`) · PNG `image/훈장아이콘/`. 예: **시간의 광부** → `시간의광부.png` · `sparkle-subtle`(흰 점 3개, 약함 — 10·20회는 더 강한 effect 추가 예정).
- **`badgeEffect` (코드/CSS):**
  - `sparkle-subtle` — 흰 별 깜빡임 (`titleBadgeSparkleHtml`).
  - `burn` — **리버스 블라인드니스** (`EXCLUSIVE_TITLE_DEFS`) · 뱃지 **drop-shadow 펄스** + 잿불 점 (`titleBadgeBurnHtml`). (SVG/스프라이트 불 연출 **사용 안 함** — 커스텀 불 에셋은 요청 시 §11.)
  - `sharp-zap` — **중급 샤프아이즈** · 뱃지 **내부 클립** · 가로 SVG **`stroke-dashoffset`** 번개 (`titleBadgeSharpZapHtml`, ~1.65s).
- **칭호 아이콘 참고:** https://www.inven.co.kr/board/maple/2304/7662

### 6.4 게임화 함수 빠른 참조

| 목적 | 함수 |
|------|------|
| 상태 정규화 | `ensureGamificationState`, `migrateChallengeDefs`, `migrateChallengeItemCatalog` |
| XP 1회 지급 | `grantXp`, `grantMedalBonusKeys` (장착 훈장) |
| 옵션 UI/저장 | `mountMedalBonusEditor`, `normalizeMedalBonuses`, `MEDAL_BONUS_TEMPLATES` |
| XP 전체 재계산 | `replayLedgerGamificationXp` |
| 도전 진행 | `challengeProgressForMember`, `countItemAcquireForMember`, `itemTextMatchesChallenge` |
| 카탈로그 | `findCatalogEntryByAnyLabel`, `resolveCatalogItemInput`, `addMasterCatalogItem`, `mergeBuiltinCatalogSeeds`, `catalogItemDisplayHtml` |
| 훈장 정의 | `getTitleDefById`, `getLevelTitleDef`, `getChallengeTitleDef`, `EXCLUSIVE_TITLE_DEFS` |
| 코드 전용 훈장 | `CHALLENGE_TITLE_ASSETS` (이름→icon·effect·description) |
| 장착 UI | `memberTitleBadgeHtml`, `renderTitlePickList` |
| 공대원 스프라이트 | `memberCharSpritePath`, `memberCharSpriteHtml`, `MEMBER_CHAR_ROSTER` |

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
| **UI “정리”** 등 모호한 요청 | **카테고리/구조 vs 색·라벨 통일** 구분 · **소유자 의도 확인 후** 변경 (2026-09-21: 헤더를 임의 outline 통일했다가 **롤백** — 원하는 건 **참고/운영 카테고리별 묶음**) |

---

## 10. 변경 이력 (에이전트가 구현할 때마다 **맨 위에 한 줄 추가**)

- **2026-09-21** — 헤더 **NPC 박스 도구** (`image/NPC`) · 접이 제거 · hover lift
- **2026-09-21** — 훈장·마스터·로그아웃 도구 카드 **`display:flex`** (inline-block 레이아웃 깨짐 fix)
- **2026-09-21** — 핫이슈 **대상 복수** · 도전 **처치(monster_kill)** · **몬스터 카탈로그** · PNG 아이콘
- **2026-09-21** — 타이머 **반복 횟수 제거** · 알람음 **2초 전(00:02) 1회** · 0초는 플래시만
- **2026-09-21** — 타이머 알람 **매회 새 Audio** · Web Audio 경로 제거(2회째 무음 fix)
- **2026-09-21** — 타이머 0초 **`setTimeout(endsAt)`** 정밀 알람 + preload
- **2026-09-21** — 타이머 0초 감지 **80ms tick** · 알람 mp3 **PIP preload** (재생 지연 완화)
- **2026-09-21** — 타이머 알람 **파일 재생 후 비프 제거** · repeat 시퀀스 정리 · **슬롯 간 겹침** 허용
- **2026-09-21** — 타이머 0초 **알람·루프 버그** fix · `slotAlarmFired` 만료 키 · 사냥 종료 시 재생 중단
- **2026-09-21** — 메이커 보석명 **gemsOnly** AC · 보석/주문서 **카탈로그 정렬** 보강
- **2026-09-21** — 타이머 **슬롯별 사운드·볼륨·반복** · 배퉁 마스터 **타이머 사운드** 탭 · `soundProfiles` JSON
- **2026-09-21** — HANDOFF **§11.1.1 타이머 알람 사운드** 인수인계 · §4.6 알람/tick 정확화
- **2026-09-21** — 배너 제목 **세로·가로 중앙** (`.app-banner-core` absolute + flex)
- **2026-09-21** — 배너 **배경만** 표시(캐릭·보스·이펙트 레이어 제거) · `buildAppBannerStage()` 비움
- **2026-09-21** — 배너 **multiply 블렌드·대치 방향(flip)·크기** 보정 — **투명 PNG/GIF 누끼**는 에셋 교체가 정답
- **2026-09-21** — 헤더 **3인 보스전 배너** — `image/퉁공대배너리소스` 레이어 · 배퉁 2모션+슬래시 CSS 동기(`baetungCycleSec`)
- **2026-09-21** — 배너 제목 **글자별 통통 바운스**(퉁→…→공대 · ~2s 휴식 후 반복)
- **2026-09-21** — 헤더 **배너 슬롯** · 도구 **접이** · **실시간/방 상태 → 마스터 옵션** · `APP_HEADER_BANNER`
- **2026-09-21** — 장부 섹션 아이콘 · **획득/지출/정산** `image/아이콘/*.png` · **인수** `스틸(인수).png` · **메이커** `메이커.png`
- **2026-09-21** — **메이커 재련** 섹션 제목 · `image/스킬아이콘/메이커.png` (획득/지출과 동일 section-title)
- **2026-09-21** — PiP 사냥 **사냥 종료 → 상단 툴바 우측** · 퉁공대 라벨 제거
- **2026-09-21** — 타이머 **0초 후 자동 반복**(사냥 종료 전) · 사냥 중 백그라운드 tick
- **2026-09-21** — PiP **사냥 종료 버튼 잘림** fix · 콘텐츠 rect 측정·재resize
- **2026-09-21** — 타이머 **기본 슬롯** 홀리 심볼·한타임·경쿠 아이콘 · **기타** 자유 이름 · PiP 설정 아이콘
- **2026-09-21** — HANDOFF **§11.1~11.3 · §14** 인수인계 · §9 UI 의도 확인 · `partyTimer` 편집 위치 정정
- **2026-09-21** — 상단 헤더 **카테고리 박스**(참고·운영 · 라벨 위·버튼 아래) · 잘못된 outline 통일 롤백
- **2026-09-21** — PiP **프리셋 삭제** 즉시 (확인창 없음 · 마지막 1개만 차단)
- **2026-09-21** — PiP 설정 **2열·초/분 단위** · 상단 제목 제거 · resize 여유↑
- **2026-09-21** — PiP **CSS 주입 버그 수정**(`media=not all` clone) · **resizeTo** 설정/사냥 공통
- **2026-09-21** — 타이머 **PIP 전용** · 설정↔사냥 화면 전환 · 타일 UI·자동 resize
- **2026-09-21** — PIP **maple-atelier형 2×2 UI** · 슬롯별 ⏸/↺ · 상단 전역·줌
- **2026-09-21** — 타이머 **장부 모달 통합** · PiP user-gesture 수정 · `party-timer-app.js`
- **2026-09-21** — **`party-timer.html`** MVP · **`퉁공대 타이머`** 버튼 · PiP·사냥 시작/종료·프리셋 · `partyTimer` merge 저장
- **2026-09-20** — 획득 모달 **카탈로그 아이콘** · **`잡장비` UI**(상점 판매 문구·함께 기여 전원 고정)
- **2026-09-20** — 카탈로그 **소모품 6종**+아이콘 · **`잡장비` 거래소 수수료 면제** (`CATALOG_AH_FEE_EXEMPT`)
- **2026-09-19** — 모바일 **`.table-scroll` 가로 스크롤** · 모달 **배경 scroll lock** + overscroll contain
- **2026-09-19** — HANDOFF **§3 부트/hydrate · §5.2 공대원 카드 · §6.3 badgeEffect** 인수인계 보강
- **2026-09-19** — 공대원 칸 **하단 정렬**(EXP 바닥) · 마이페이지 상단 · 로드 전 닉 깜빡임 방지
- **2026-09-19** — 공대원 캐릭터 PNG **흰 배경→진짜 알파**(모서리 flood) · 스프라이트 CSS 박스/그림자 제거
- **2026-09-19** — 공대원 칸 **캐릭터→네임플레이트→훈장** (인게임 순) · `image/공대원캐릭터/`
- **2026-09-18** — `burn` **초기 연출 복구**(글로우 펄스+잿불) · 불 스프라이트/SVG 제거 · **글로우 강도↑**
- **2026-09-18** — `burn` **Kenney 스프라이트** 11프레임 + 잿불 PNG · 뱃지 전폭 steps 애니
- **2026-09-18** — `burn` **전폭 단일 파도 실루엣** · 바깥 glow 제거 · screen blend · SVG 통째 flicker
- **2026-09-18** — `burn` **전폭 heat·92% 높이 불꽃** · 8혀+베이스 · 잿불 전구간
- **2026-09-18** — `burn`(리버스) **뱃지 하단 SVG 불꽃** + flicker · 글로우 펄스 완화 · 뱃지 내부 클립
- **2026-09-18** — `sharp-zap` 번개 주기 **1.65s** (조금 빠르게)
- **2026-09-18** — `sharp-zap` **뱃지 내부 클립** · `stroke-dashoffset` 가로 번개 그리기(슬라이드 제거)
- **2026-09-18** — `sharp-zap` **가로 지그재그 SVG** · 뱃지 전폭 스weep · z-index 최상
- **2026-09-18** — **등록된 도전** XP 편집 · 중급 샤프 **80 XP** (상티어 150=리버스·예정 샤프30)
- **2026-09-18** — 지퉁 고유 **중급 샤프아이즈** · `sharp-zap` 연두 번개 이펙트
- **2026-09-18** — 주문서 아이콘 **여백 큰 PNG 보정** (`catalog-scroll-icon-slot` 확대)
- **2026-09-18** — 주문서 아이콘 **URL 인코딩** · AC 정렬 **100→60→10**
- **2026-09-18** — 크리스탈 줄임(힘크·행크·지크·민크 등) → **풀네임 마이그** · 카탈로그 별칭
- **2026-09-18** — **메이커 보석 48종** 카탈로그 시드·아이콘 · 메이커 보석명 AC
- **2026-09-18** — 훈장 도전 목록 **접기 후 빈 스크롤 영역** 보정 (`syncMedalChallengeListScroll`)
- **2026-09-18** — **주문서 카탈로그 시드**(192+시간의 조각) · 확률별 아이콘 · 미출시(명중률·방패) 자동완성 숨김 · 배퉁 공개 토글
- **2026-09-18** — 훈장 도전 탭 **접이 패널 `renderChallengeListView` 연동** · 달성 N/M · 퀘스트 블록 구분선
- **2026-09-18** — 훈장 모달 **공대원별 접이 UI** CSS·기본 접힘 (패널 마크업)
- **2026-09-18** — 마스터 옵션 **고유 훈장** 탭 · `exclusiveTitleMeta`
- **2026-09-18** — 훈장 **옵션 템플릿 5종** · `bonuses` 자동 적용 · 장착 시 replay
- **2026-09-18** — HANDOFF **§6.2~6.4** · replay/카탈로그/함수맵 · §13 인수인계 보강
- **2026-09-18** — XP **replay** · 카탈로그 변경·도전 훈장 unlock 재계산 · exclusive XP replay 복원
- **2026-09-18** — **마스터 옵션** · 카탈로그+별칭 · 획득/도전 자동완성
- **2026-09-18** — 아이템 자동완성 **장부 획득명** 풀 연동 · 획득 수정란 (→ 카탈로그 전용으로 대체)
- **2026-09-18** — 훈장 **글자색** (`badgeTextColor`) · 관리 UI
- **2026-09-18** — 도전 관리 **3탭** · 색·메타 **저장 버튼**(HEX)
- **2026-09-18** — 훈장 **설명·optionsText** 관리 UI · 모달/관리 **hover 툴팁**
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

### 11.1 퉁공대 타이머 (진행 중 · 2026-09-21)

- [x] PiP **기본 4슬롯** 이름·아이콘 · 기타 슬롯 자유 라벨 (`BUILTIN_SLOT_DEFAULTS`)
- [x] **알람 소리** — `partyTimer.soundProfiles` · 마스터 **타이머 사운드** · PIP 전용 재생
- [ ] (선택) 사냥 툴바 **줌 ±** · 슬롯별 음소거 · 0초 전 pre-alert
- [ ] (선택) Realtime **참여자 표시** (동시 편집자)

#### 11.1.1 타이머 **알람 사운드** — 구현됨 (2026-09-21)

<details><summary>에이전트 참고 (초기 설계 메모)</summary>

**소유자 원래 요구 (유지):**

- **PIP가 열려 있는 사람만** 알람음 (PiP 닫으면 소리 없음 — “퇴장” 대체).
- 0초에 **시각** 2초 전후 번쩍 (`pip-tile.is-alarm` / `@keyframes pip-flash` in `index.html` → `#partyTimerPipStyles` 주입).
- 사냥 중 슬롯 0초 → **같은 duration으로 반복** (`processSlotTimerLoops`) — **매 사이클 0초마다** 알람 1회씩 재생되는지 확인.

**코드 위치 (편집 파일):**

| 파일 | 내용 |
|------|------|
| **`party-timer-app.js`** | `playPipAlarm`, `processSlotTimerLoops`, `pipUi.muted`, `handlePipAction('mute')`, `openPip` |
| **`index.html`** | PiP CSS only (`#partyTimerPipStyles`, `.pip-tile.is-alarm`) — **타이머 로직은 JS 파일만** |

**현재 `playPipAlarm()` (교체 예정):**

```text
if (pipUi.muted || !pipWindow || pipWindow.closed) return;
pipWindow.AudioContext → oscillator 880Hz, gain 0.15, ~280ms, ctx.close()
```

**구현 시 권장:**

1. **에셋** — repo에 `mp3`/`wav`/`ogg` **아직 없음** · 소유자가 파일·경로 제공 시 `image/…` 또는 `audio/party-timer/` 등 **한 폴더로 고정** 후 `git add`.
2. **재생** — PiP `openPip` / 툴바 클릭 등 **user gesture 이후** `Audio` 또는 **재사용 AudioContext** · 매 알람마다 `new AudioContext`는 autoplay/성능 이슈 가능.
3. **mute** — `pipUi.muted` 유지 · (선택) `state.partyTimer.runtime.muted` 영속화는 **요청 시만**.
4. **PIP 닫힘** — `playPipAlarm` 가드 유지 · 백그라운드 tick은 그대로 두어도 됨 (소리만 차단).
5. **슬롯별 🔊** — UI는 `noop` · 슬롯별 mute는 §11.1 선택 항목.

**검증:** Chrome/Edge · 로그인 → **퉁공대 타이머** → PIP · 짧은 초(예: 5초) 슬롯 · 사냥 시작 → 0초 **번쩍+소리** · PiP 닫은 채 0초 지나도 **메인 탭에서 소리 없음** · 🔇 시 무음.

**하지 말 것:** 장부 `index.html` IIFE에 타이머 로직 복붙 · PiP CSS `cloneNode`+`media="not all"`.

</details>

### 11.2 상단 헤더 · 배너

- [ ] **배너 스테이지** — 현재 **`배경.png`만** · 누끼 에셋 준비 후 `buildAppBannerStage()` 재연결
- [ ] **카테고리 더 나눌지** — **합의 후만**

### 11.3 기타

- [ ] 핫이슈 이미지 Supabase Storage 분리 (JSON 용량)
- [ ] closed cycle `entryTotal`에 메이커 반영 여부 정리
- [ ] 획득 저장 시 **카탈로그 미등록 이름** 경고/차단 (현재는 자유 입력 + AC만 카탈로그)
- [ ] 획득 줄 **아이템명 수정 이력** 없음 — 과거 이름 복구는 Supabase 백업/스냅샷 없으면 불가
- [ ] AGENTS.md 없음 — **이 HANDOFF가 AGENTS 역할**
- [ ] (선택) `burn` **커스텀 불 스프라이트/GIF** — 소유자 에셋 제공 시 `titleBadgeBurnHtml` 연동 (Kenney 실험은 롤백됨)

---

## 12. 에이전트 **시작** 체크리스트

1. Read **`HANDOFF.md`** (this file) — **§14 진행 중** 먼저
2. Read **`.cursor/rules/*.mdc`** (질문-only · mirror · §13 push)
3. Read **`.cursor/rules/toonggongdae-workflow.mdc`** — user rule과 충돌 시 **워크스페이스 규칙**: 구현 턴은 HANDOFF+push; user rule “commit만 요청 시”는 **commit 명시** 턴에만 해당
4. 큰 변경 전 **`index.html`만** 편집, mirror sync · 타이머 로직은 **`party-timer-app.js`**
5. 금액 로직 변경 시 §4 regression mentally check
6. 질문-only 턴인지 확인 (§9)

---

## 14. 진행 중 · 다음 세션 스냅샷 (갱신: 2026-09-21)

**최근 main:** `5dc3dc7` (타이머 soundProfiles · 마스터 탭) · **피해야 할 커밋 의도:** `c98dc9c` (카테고리 제거·outline 통일 — **소유자 거부**, `564eedd`에서 복구)

| 영역 | 상태 |
|------|------|
| **타이머** | PIP · 0초 반복 · **soundProfiles**(마스터 탭) · mp3/wav data URL |
| **헤더** | `배경.png` + 제목 바운스 · **참고 / 운영** 카테고리 |
| **획득 모달** | 잡장비·카탈로그 아이콘 |
| **미커밋 asset** | `image/훈장아이콘/중급샤프아이즈.png` · `image/이펙트/…` — **untracked** |

**로컬 검증:** Chrome/Edge · Ctrl+F5 · `?room=tongtongi` 로그인 → **퉁공대 타이머** PIP.

**다음 작업 후보:** 슬롯별 PiP mute · pre-alert · JSON 용량(짧은 알람 권장).

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

*Last updated: 2026-09-21 (핫이슈 복수 대상·몬스터 처치 도전)*
