-- 퉁공대 장부: 로그인 계정 ↔ 공대 슬롯(0·1·2) + RLS
-- ⚠ 순서: AUTH-SETUP.md 1~3( Auth 사용자 생성 ) → 4( 아래 INSERT ) → 5( 정책 적용 )
-- 기존 party_ledgers.data JSON(cycles·hotIssues 등)은 그대로 — memberIdx 기반 데이터 이관 불필요

create table if not exists public.party_room_access (
  room_id text not null,
  member_idx smallint not null check (member_idx >= 0 and member_idx <= 2),
  login_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (room_id, member_idx),
  unique (room_id, user_id),
  unique (room_id, login_id)
);

alter table public.party_room_access enable row level security;

create policy "party_room_access_select_own"
  on public.party_room_access for select
  to authenticated
  using (user_id = auth.uid());

-- party_ledgers: 기존 anon 전체 허용 정책 제거 후 계정만
drop policy if exists "party_ledgers_select" on public.party_ledgers;
drop policy if exists "party_ledgers_insert" on public.party_ledgers;
drop policy if exists "party_ledgers_update" on public.party_ledgers;

create policy "party_ledgers_select_member"
  on public.party_ledgers for select
  to authenticated
  using (
    exists (
      select 1 from public.party_room_access a
      where a.room_id = party_ledgers.room_id
        and a.user_id = auth.uid()
    )
  );

create policy "party_ledgers_insert_member"
  on public.party_ledgers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.party_room_access a
      where a.room_id = party_ledgers.room_id
        and a.user_id = auth.uid()
    )
  );

create policy "party_ledgers_update_member"
  on public.party_ledgers for update
  to authenticated
  using (
    exists (
      select 1 from public.party_room_access a
      where a.room_id = party_ledgers.room_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.party_room_access a
      where a.room_id = party_ledgers.room_id
        and a.user_id = auth.uid()
    )
  );

-- 4) Auth 대시보드에서 사용자 UUID 확인 후 아래 3줄의 UUID를 바꿔 실행 (room tongtongi)
-- insert into public.party_room_access (room_id, member_idx, login_id, user_id) values
--   ('tongtongi', 0, '순퉁', '00000000-0000-0000-0000-000000000001'),
--   ('tongtongi', 1, '지퉁', '00000000-0000-0000-0000-000000000002'),
--   ('tongtongi', 2, '배퉁', '00000000-0000-0000-0000-000000000003');
