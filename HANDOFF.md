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
| `image/` | meso 아이콘, 섹션 아이콘 등 정적 이미지 |
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
itemCatalog: { id, name, itemId?, aliases? }[]   // 공대 자체 목록, 스탯 없음
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
| 아이템 목록 | `itemCatalog`, `openItemCatalogModal`, `attachCatalogAutocomplete` |
| 창고캐 | `warehouseChars` |

### 5.1 표 CSS 주의

- `<td>`에 **`display:flex` 금지** (격자선 깨짐). flex는 **내부 wrapper** (`owner-tags-wrap`, `row-actions` div).
- `.data-table` — `border-collapse: separate`, 일반 `tbody td` 규칙은 `table:not(.data-table)`로 분리.

---

## 6. 아이템 **아이콘·이름** (풀 DB 아님)

### 6.1 현재 구현 (사이트)

- `state.itemCatalog[]`: `{ id, name, itemId?, aliases? }` — `aliases`는 쉼표로 등록한 **검색 줄임말**(예: `어크`).
- **자동완성:** `attachCatalogAutocomplete` on `eEditItem`, `fTakeItem`, `fMakerGem`, `mEditGem`, `tEditItem`.
- **검색:** `filterCatalogItems` — 이름 부분일치 + **띄어쓰기 단어 첫 글자 줄임**(하급/중급/상급 접두는 줄임 계산에서 제외) + `aliases`. 목록에 없는 이름은 그대로 입력·저장(아이콘 없음).
- **UI:** 입력 1글자 이상 + 매칭 있을 때만 드롭다운(아이콘+이름, ↑↓·Enter·클릭).
- **아이콘 URL** (코드 상수):

```text
ITEM_ICON_IO_REGION = 'gms'
ITEM_ICON_IO_VERSION = 'latest'
https://maplestory.io/api/gms/latest/item/{itemId}/icon
```

- ID 없으면 이름만 자동완성. ID 틀리면 `onerror`로 아이콘 숨김.
- **메이플랜드와 100% 일치 보장 없음** — 비공식 CDN.

### 6.2 아이콘/데이터를 **구하는 수단** (에이전트 참고용)

| 수단 | 설명 | 이 프로젝트에 쓰기 |
|------|------|---------------------|
| **MapleStory.io API** | REST: item JSON, `/icon`, `/iconRaw`. [maplestory.io](https://maplestory.io/) · 소스 [crrio/maplestory.io](https://github.com/crrio/maplestory.io) | **현재 사용 중** (아이콘만). region/version 맞춰야 함. |
| **WZ 클라이언트** | `Item.wz`, `String.wz` — MapleLib / HaRepacker | 풀 DB 안 만들 거면 **직접 추출 불필요**. 특정 ID 아이콘 PNG만 뽑을 때. |
| **DumpItems / wztosql** | 서버 소스의 Java 덤프 → MySQL | 사설서버 운영자용. 정적 JSON 생성 파이프라인 참고만. |
| **커뮤니티 사이트** | maplelog.gg, malan-util, 메이플노트 등 — WZ 대조 + 제보 | **공식 API 아님.** 장부에 크롤링/임베드 **하지 말 것** (ToS·유지보수). |
| **자체 호스팅** | WZ에서 PNG 추출 → `image/items/{id}.png` | 100개 미만이면 **가장 안정적**. CDN 의존 제거. |
| **인게임 ID 확인** | 툴팁/메랜 DB/커뮤니티에서 numeric ID | `itemCatalog`에 수동 등록. |

### 6.3 100개 미만 수동 카탈로그 권장 흐름

1. 사용자가 **표시 이름** + **아이템 ID**를 「아이템 목록」에 추가.
2. 자동완성 + 아이콘 (MapleStory.io 또는 추후 `image/items/`).
3. **스탯·드랍·가격 DB 확장은 사용자가 원할 때만** — 질문만 했을 때 구현 금지.

### 6.4 MapleStory.io 예시 (참고)

```http
GET https://maplestory.io/api/gms/latest/item/{itemId}
GET https://maplestory.io/api/gms/latest/item/{itemId}/icon
```

버전을 옛날 클래식에 맞추려면 `latest` 대신 특정 버전 문자열 조사 필요 (문서/Swagger).

---

## 7. Supabase

- 테이블: `party_ledgers (room_id PK, data jsonb, updated_at)`.
- `CLOUD_CONFIG` in `index.html` — anon key (공개 프론트).
- Realtime on `party_ledgers`.

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

- [ ] `image/items/` 로 아이콘 self-host (MapleStory.io 의존 줄이기)
- [ ] itemCatalog CSV import/export
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

*Last updated: 2026-09-17*
