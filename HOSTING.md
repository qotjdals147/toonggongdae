# 퉁퉁이 공대 장부 — 웹 호스팅 & 실시간 공유

지금 HTML은 **한 파일**이지만, 저장 방식에 따라 동작이 달라집니다.

| 환경 | 공대원이 같은 장부를 보나? |
|------|---------------------------|
| Cursor에서만 열기 (`window.storage`) | Cursor 안에서만 공유 |
| 그냥 HTML 더블클릭 / 로컬만 | **각자 PC에만** 저장 (링크 공유해도 데이터 안 맞음) |
| **Supabase + 정적 호스팅** | **같은 링크·같은 `room`이면 실시간 동기화** |

---

## 1. Supabase (공유 DB, 무료 티어로 시작 가능)

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor**에서 `supabase-migration.sql` 내용 실행
3. **Project Settings → API** 에서  
   - Project URL  
   - `anon` public key (또는 publishable key)  
   복사
4. `maple-party-ledger.html` 안 `CLOUD_CONFIG` 에 붙여넣기:

```javascript
const CLOUD_CONFIG = {
  supabaseUrl: 'https://xxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

5. **Database → Replication** (또는 Publications)에서 `party_ledgers` 테이블 **Realtime** 켜기  
   (대시보드에서 해당 테이블 Realtime enable)

### 방(room) 나누기

- 기본: `?room=tongtongi` (없으면 `tongtongi` 사용)
- 다른 공대용: `https://your-site.example/maple-party-ledger.html?room=비밀방이름`  
  영문·숫자·`_` `-` 만 (3~48자)

같은 `room` URL을 공대원 3명에게 보내면, 한 사람이 추가·수정하면 다른 사람 화면도 **실시간**으로 갱신됩니다.

> **보안:** anon 키는 브라우저에 노출됩니다. RLS는 “아는 사람만 room 이름을 안다” 수준입니다. room 이름을 길고 추측하기 어렵게 하세요.

---

## 2. 정적 웹 호스팅 (HTML 올리기)

아래 아무 곳이나 **무료**로 가능합니다. Supabase 설정만 되어 있으면 됩니다.

### GitHub Pages

1. GitHub 저장소에 `maple-party-ledger.html` 업로드 (또는 `index.html` 로 이름 변경)
2. Settings → Pages → branch `main` / root
3. `https://<username>.github.io/<repo>/maple-party-ledger.html?room=tongtongi`

### Netlify / Vercel

1. 폴더 통째로 드래그 배포 (Netlify Drop) 또는 Git 연결
2. 빌드 없음 — 정적 파일만
3. 배포 URL + `?room=...` 공유

### Cloudflare Pages

동일하게 정적 파일만 배포.

---

## 3. 동작 확인

1. PC에서 항목 하나 추가
2. 휴대폰(또는 다른 브라우저)에서 **같은 URL** 접속
3. 상단에 `실시간 공유 중 · 방 xxx` 와 **링크 복사** 버튼이 보이면 클라우드 모드 OK

---

## 4. 문제 해결

- **“이 기기에만 저장됨”** → `CLOUD_CONFIG` 가 비어 있거나 URL/키 오타
- **저장 실패** → SQL 마이그레이션·RLS 정책 확인
- **실시간 안 됨** → Supabase에서 `party_ledgers` Realtime 활성화, 새로고침
