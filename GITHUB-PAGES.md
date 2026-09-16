# GitHub Pages로 퉁퉁이 공대 장부 배포

공대원 **3명이 같은 장부**를 쓰려면:

- **GitHub Pages** → HTML 주소 (무료)
- **Supabase** → 데이터 공유 + 실시간 (필수, `NETLIFY-배포.md` 1번과 동일)

---

## 1. GitHub 저장소 만들기

1. [github.com/new](https://github.com/new)
2. Repository name: `toonggongdae` (원하는 이름)
3. **Public** (Pages 무료는 Public 저장소 기준)
4. README / .gitignore / license **체크 안 함** → **Create repository**

---

## 2. PC에서 파일 올리기

PowerShell에서 (경로는 본인 폴더에 맞게):

```powershell
cd "C:\Users\qotjd\Downloads\퉁공대"

git init
git add index.html maple-party-ledger.html supabase-migration.sql README.md
git commit -m "Add party ledger for GitHub Pages"

git branch -M main
git remote add origin https://github.com/qotjdals147/toonggongdae.git
git push -u origin main
```

> `qotjdals147/toonggongdae` → 본인 아이디·저장소 이름으로 바꾸세요.

처음 push 할 때 GitHub 로그인(브라우저 또는 Personal Access Token) 필요할 수 있습니다.

---

## 3. GitHub Pages 켜기

1. GitHub에서 해당 저장소 → **Settings**
2. 왼쪽 **Pages**
3. **Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/(root)**
4. **Save**

1~2분 뒤 주소:

**https://qotjdals147.github.io/toonggongdae/**

(`index.html` 이 루트에 있으면 `/` 만으로 열립니다.)

---

## 4. Supabase 연결 (공대 공유 — 필수)

`index.html` (또는 `maple-party-ledger.html`) 안:

```javascript
const CLOUD_CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...'
};
```

1. Supabase **새 프로젝트** (장부 전용)
2. `supabase-migration.sql` 실행
3. `party_ledgers` **Realtime** 활성화
4. 위 값 채운 뒤 **다시 commit & push**

```powershell
git add index.html maple-party-ledger.html
git commit -m "Configure Supabase for shared ledger"
git push
```

---

## 5. 공대원에게 보낼 링크

방 이름을 URL에 넣어서 (추측하기 어렵게):

**https://qotjdals147.github.io/toonggongdae/?room=tungtung2026**

- 같은 `room` = 같은 장부
- 상단 **「실시간 공유 중 · 방 xxx」** + **링크 복사** 확인

---

## 6. 수정할 때

장부 UI 고친 뒤:

```powershell
cd "C:\Users\qotjd\Downloads\퉁공대"
git add .
git commit -m "Update ledger"
git push
```

Pages는 push 후 1~2분 안에 반영됩니다.

---

## Netlify vs GitHub Pages

| | GitHub Pages | Netlify |
|---|--------------|---------|
| 비용 | 무료 (Public repo) | 무료 |
| 방식 | Git push | 드래그 or Git |
| 공대 공유 | Supabase 필요 | Supabase 필요 |

**localStorage만** 쓰면 기기마다 장부가 달라서 공대용으로는 사용 불가입니다.
