# 공대원 3명이 **같은 장부** 쓰기 — Netlify + Supabase

각자 다른 사냥터에서 **본인 판매분만 입력** → **모두 같은 화면**을 봐야 하므로  
**localStorage만으로는 불가능**하고, **Supabase(공유 저장)** + **Netlify(HTML 배포)** 가 필요합니다.

---

## 1. Supabase — 공용 저장소 (5분)

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
   - 이름 예: `tongtongi-ledger`
   - 비밀번호 저장해 두기
   - Region: **Northeast Asia (Seoul)** 권장
2. 프로젝트가 Ready 되면 **SQL Editor** → New query  
   → `supabase-migration.sql` 내용 **전부 붙여넣고 Run**
3. **Database → Publications** (또는 Table Editor에서 `party_ledgers` → Realtime)  
   → **`party_ledgers` Realtime 켜기**
4. **Project Settings → API** 에서 복사:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key (긴 JWT)

5. `index.html` (또는 `maple-party-ledger.html`) 안 **`CLOUD_CONFIG`** 에 붙여넣기:

```javascript
const CLOUD_CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

6. **방 이름** (같은 공대만 들어오게):  
   배포 URL 뒤에 `?room=비밀영문`  
   예: `https://tongtongi.netlify.app/?room=tungtung2026`  
   (기본값 `tongtongi` — room을 길고 추측하기 어렵게)

> ⚠️ 기존 **popup-platform** 같은 다른 서비스 DB에는 이 테이블 넣지 마세요. 장부 전용 프로젝트를 새로 만드는 게 안전합니다.

---

## 2. Netlify — HTML 올리기 (Git 없이)

지금 보이는 **Builds** 메뉴는 Git 연동용입니다. **한 파일 배포**는 아래가 더 쉽습니다.

1. 왼쪽 **Projects** 클릭
2. **Add new project** → **Deploy manually** (또는 "Drag and drop your site output folder")
3. `퉁공대` 폴더 통째로 드래그  
   (`index.html`, `supabase-migration.sql`, `HOSTING.md` 포함 OK)
4. 배포 끝나면 `https://랜덤이름.netlify.app` 주소 생성
5. **Site configuration → Domain management** 에서 이름 바꿀 수 있음 (선택)

**공대원에게 보낼 링크 (예):**

`https://your-site.netlify.app/?room=tungtung2026`

---

## 3. 잘 되는지 확인

1. PC에서 링크 접속 → 항목 하나 추가  
2. 휴대폰( LTE/Wi‑Fi )에서 **같은 링크** 접속  
3. PC에서 넣은 항목이 **몇 초 안에** 폰에도 보이면 성공  
4. 상단: **`실시간 공유 중 · 방 xxx`** + **링크 복사**

---

## 4. 자주 하는 실수

| 증상 | 원인 |
|------|------|
| 기기마다 장부가 다름 | `CLOUD_CONFIG` 비어 있음 → localStorage만 사용 중 |
| 저장 실패 | SQL 마이그레이션 안 함 / RLS |
| 실시간 안 됨 | `party_ledgers` Realtime 미활성 |

---

## 요약

- **Netlify** = 앱(HTML) 주소  
- **Supabase** = 셋이 **같이 읽고 쓰는** 장부 데이터  
- **localStorage만** = 각자 폰에만 저장 → 공대용 ❌
