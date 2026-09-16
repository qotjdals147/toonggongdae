-- 퉁퉁이 공대 장부: 방(room)별 JSON 한 줄 저장 + Realtime
create table if not exists public.party_ledgers (
  room_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.party_ledgers enable row level security;

-- 공대 내부용: anon 키로 읽기/쓰기 (room id는 URL로만 구분)
create policy "party_ledgers_select"
  on public.party_ledgers for select
  using (true);

create policy "party_ledgers_insert"
  on public.party_ledgers for insert
  with check (true);

create policy "party_ledgers_update"
  on public.party_ledgers for update
  using (true)
  with check (true);

-- Realtime: Supabase 대시보드에서 party_ledgers Replication 켜기
-- 또는 (프로젝트에 따라):
-- alter publication supabase_realtime add table public.party_ledgers;
