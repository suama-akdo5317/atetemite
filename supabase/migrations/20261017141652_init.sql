-- カテゴリとお題（設計書 2.1）
create table public.categories (
  id           smallint generated always as identity primary key,
  slug         text not null unique,
  name         text not null,
  sort_order   smallint not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.topics (
  id              bigint generated always as identity primary key,
  category_id     smallint not null references public.categories(id) on delete cascade,
  text            text not null check (char_length(text) between 1 and 20),
  text_normalized text not null,
  is_published    boolean not null default true,
  generated_by    text not null,
  created_at      timestamptz not null default now(),
  unique (category_id, text_normalized)
);

create index topics_published_category_idx on public.topics (category_id) where is_published;

-- RLS（設計書 2.2）: anon は公開行の読み取りのみ。書き込みは service_role（バッチ）だけ
alter table public.categories enable row level security;
alter table public.topics     enable row level security;

create policy "公開カテゴリは誰でも読める" on public.categories
  for select to anon using (is_published);
create policy "公開お題は誰でも読める" on public.topics
  for select to anon using (is_published);

-- 新しいテーブルには Data API 用の権限が自動で付かないため、必要な分だけ明示的に付ける
grant select on public.categories, public.topics to anon;
grant select, insert, update, delete on public.categories, public.topics to service_role;
revoke truncate on public.categories, public.topics from anon, authenticated, service_role;
