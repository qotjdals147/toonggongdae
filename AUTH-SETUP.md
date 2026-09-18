# 퉁공대 로그인 · 계정 연동 (최초 1회)

장부 데이터(`party_ledgers.data`)는 **그대로** 두고, Supabase Auth 계정만 붙입니다.  
획득·정산·핫이슈 등은 모두 **memberIdx 0·1·2** 로 이미 연결되어 있어 JSON 이관은 필요 없습니다.

## 로그인 ID ↔ 슬롯 (방 `tongtongi`)

| 슬롯 | 로그인 ID | 초기 비밀번호 | Auth 이메일 (앱이 사용) |
|------|-----------|---------------|-------------------------|
| 0 | 순퉁 | 순퉁 | `party+suntung@tongtongi.toonggongdae.app` |
| 1 | 지퉁 | 지퉁 | `party+jitung@tongtongi.toonggongdae.app` |
| 2 | 배퉁 | 배퉁 | `party+baetung@tongtongi.toonggongdae.app` |

화면에는 **ID에 한글(순퉁 등)** 만 입력하면 됩니다.

## 설정 순서 (데이터 잠기지 않게)

1. **Supabase Dashboard → Authentication → Users → Add user**  
   위 표의 **이메일** + **초기 비밀번호**로 사용자 3명 생성 (Email confirmed 켜기).

2. 각 사용자 **UUID** 복사 (Users 목록).

3. SQL Editor에서 `party_room_access` INSERT ( `supabase-auth-migration.sql` 맨 아래 주석 참고).

4. **`supabase-auth-migration.sql` 전체** 실행 (테이블 + RLS).  
   ⚠ 1~3 완료 **후**에 실행. 그 전에 배포하면 anon으로는 저장이 막힙니다.

5. GitHub Pages에 최신 `index.html` 배포 후, 세 공대원 각자 로그인 → **내 계정**에서 닉·비밀번호 변경.

## 새 공대원 계정 추가 (요청 시)

Dashboard에서 Auth 사용자 추가 → `party_room_access`에 `(room_id, member_idx, login_id, user_id)` INSERT.  
`member_idx`는 0·1·2 중 빈 슬롯과 맞출 것.

## 로컬만 쓸 때

Supabase 미설정이면 예전처럼 로컬 저장만 (로그인 화면 없음).
