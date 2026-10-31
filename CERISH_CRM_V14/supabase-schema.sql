-- ============================================================
-- CERISH CRM V14 — Supabase (PostgreSQL) backend
-- ------------------------------------------------------------
-- CÁCH DÙNG (chỉ chạy 1 lần):
--   1) Mở Supabase project -> menu SQL Editor -> New query
--   2) Dán TOÀN BỘ file này vào -> bấm Run
--   3) Vào Settings -> API, copy "Project URL" và "anon public key"
--      gửi cho Claude để gắn vào web.
--
-- Tài khoản quản trị khởi tạo: admin@cerish.local / Cerish@2026Demo!
-- (ĐỔI MẬT KHẨU NGAY trong app sau lần đăng nhập đầu tiên)
--
-- BẢO MẬT:
--   - Mật khẩu băm bằng bcrypt (pgcrypto), không lưu dạng thô.
--   - 3 bảng dữ liệu bật RLS và KHÔNG mở policy nào -> khóa anon key
--     không đọc/ghi trực tiếp được. Mọi thao tác đi qua hàm RPC
--     SECURITY DEFINER có kiểm tra phiên đăng nhập + vai trò.
--   - Vì vậy anon key dán lên web là AN TOÀN (chỉ gọi được các hàm này).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Bảng ----------
create table if not exists cerish_users (
  id            bigint primary key,
  email         text unique not null,
  name          text not null,
  role          text not null default 'staff',   -- admin | manager | staff
  active        int  not null default 1,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists cerish_sessions (
  token      text primary key,
  user_id    bigint not null references cerish_users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists idx_cerish_sessions_user on cerish_sessions(user_id);

create table if not exists cerish_records (
  table_name text   not null,     -- partners, bookings, products, ...
  id         bigint not null,
  data       jsonb  not null,      -- toàn bộ bản ghi (gồm cả id)
  updated_at timestamptz not null default now(),
  primary key (table_name, id)
);
create index if not exists idx_cerish_records_table on cerish_records(table_name);

-- ---------- Bật RLS, không mở policy (khóa truy cập trực tiếp) ----------
alter table cerish_users    enable row level security;
alter table cerish_sessions enable row level security;
alter table cerish_records  enable row level security;

-- ---------- Danh sách phân hệ hợp lệ ----------
create or replace function cerish_is_table(p_table text)
returns boolean language sql immutable as $$
  select p_table in ('partners','bookings','products','campaigns','samples',
                     'videos','lives','tasks','customers','audit_logs');
$$;

-- ---------- Giải phiên đăng nhập ----------
create or replace function cerish_session_user(p_token text)
returns cerish_users language plpgsql security definer set search_path = public as $$
declare u cerish_users;
begin
  select cu.* into u
  from cerish_users cu
  join cerish_sessions s on s.user_id = cu.id
  where s.token = p_token and s.expires_at > now() and cu.active = 1
  limit 1;
  return u;
end; $$;

-- ---------- Đăng nhập / phiên ----------
create or replace function cerish_login(p_email text, p_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users; tok text;
begin
  select * into u from cerish_users
   where lower(email) = lower(trim(p_email)) and active = 1 limit 1;
  if u.id is null or u.password_hash <> crypt(p_password, u.password_hash) then
    return jsonb_build_object('ok', false, 'code', 401, 'error', 'Email hoặc mật khẩu chưa đúng');
  end if;
  -- dọn phiên hết hạn của chính user này
  delete from cerish_sessions where user_id = u.id and expires_at < now();
  tok := encode(gen_random_bytes(24), 'hex');
  insert into cerish_sessions(token, user_id, expires_at) values (tok, u.id, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', tok, 'user', jsonb_build_object(
    'id', u.id, 'email', u.email, 'name', u.name, 'role', u.role, 'active', u.active, 'created_at', u.created_at));
end; $$;

create or replace function cerish_logout(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from cerish_sessions where token = p_token;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function cerish_me(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token);
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  update cerish_sessions set expires_at = now() + interval '12 hours' where token = p_token;
  return jsonb_build_object('ok', true, 'user', jsonb_build_object(
    'id', u.id, 'email', u.email, 'name', u.name, 'role', u.role, 'active', u.active, 'created_at', u.created_at));
end; $$;

-- ---------- Nạp toàn bộ dữ liệu ----------
create or replace function cerish_dump(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token); result jsonb;
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  select coalesce(jsonb_object_agg(t.table_name, t.rows), '{}'::jsonb) into result
  from (select table_name, jsonb_agg(data order by id) as rows from cerish_records group by table_name) t;
  result := result || jsonb_build_object('users', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'name', name, 'role', role, 'active', active, 'created_at', created_at
    ) order by id), '[]'::jsonb) from cerish_users));
  return jsonb_build_object('ok', true, 'tables', result);
end; $$;

-- ---------- Ghi / xóa bản ghi ----------
create or replace function cerish_put(p_token text, p_table text, p_record jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token); rid bigint;
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  if not cerish_is_table(p_table) then return jsonb_build_object('ok', false, 'code', 404, 'error', 'Không tìm thấy phân hệ'); end if;
  if p_record->>'id' is null then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Thiếu dữ liệu bản ghi'); end if;
  rid := (p_record->>'id')::bigint;
  insert into cerish_records(table_name, id, data, updated_at) values (p_table, rid, p_record, now())
    on conflict (table_name, id) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true, 'id', rid);
end; $$;

create or replace function cerish_del(p_token text, p_table text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token);
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  if not cerish_is_table(p_table) then return jsonb_build_object('ok', false, 'code', 404, 'error', 'Không tìm thấy phân hệ'); end if;
  if p_table <> 'audit_logs' and u.role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 403, 'error', 'Chỉ quản trị viên được xóa');
  end if;
  delete from cerish_records where table_name = p_table and id = p_id;
  return jsonb_build_object('ok', true);
end; $$;

-- ---------- Đổi mật khẩu ----------
create or replace function cerish_password(p_token text, p_current_password text, p_new_password text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token);
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  if length(coalesce(p_new_password,'')) < 10 then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Mật khẩu phải có từ 10 đến 128 ký tự'); end if;
  if u.password_hash <> crypt(coalesce(p_current_password,''), u.password_hash) then
    return jsonb_build_object('ok', false, 'code', 403, 'error', 'Mật khẩu hiện tại chưa đúng');
  end if;
  update cerish_users set password_hash = crypt(p_new_password, gen_salt('bf')) where id = u.id;
  return jsonb_build_object('ok', true);
end; $$;

-- ---------- Quản lý nhân sự (chỉ admin) ----------
create or replace function cerish_user_create(p_token text, p_name text, p_email text, p_password text, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token); nid bigint; em text := lower(trim(p_email)); nm text := trim(p_name);
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  if u.role <> 'admin' then return jsonb_build_object('ok', false, 'code', 403, 'error', 'Chỉ quản trị viên có quyền'); end if;
  if nm = '' or length(nm) > 120 or position('@' in em) = 0 or length(em) > 200 then
    return jsonb_build_object('ok', false, 'code', 422, 'error', 'Tên hoặc email chưa hợp lệ'); end if;
  if p_role not in ('admin','manager','staff') then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Vai trò không hợp lệ'); end if;
  if length(coalesce(p_password,'')) < 10 then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Mật khẩu phải có từ 10 đến 128 ký tự'); end if;
  if exists (select 1 from cerish_users where lower(email) = em) then return jsonb_build_object('ok', false, 'code', 409, 'error', 'Email đã có trong hệ thống'); end if;
  nid := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  insert into cerish_users(id, email, name, role, active, password_hash, created_at)
    values (nid, em, nm, p_role, 1, crypt(p_password, gen_salt('bf')), now());
  return jsonb_build_object('ok', true, 'id', nid, 'user', jsonb_build_object(
    'id', nid, 'email', em, 'name', nm, 'role', p_role, 'active', 1, 'created_at', now()));
end; $$;

create or replace function cerish_user_update(p_token text, p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u cerish_users := cerish_session_user(p_token); t cerish_users;
begin
  if u.id is null then return jsonb_build_object('ok', false, 'code', 401, 'error', 'Phiên đăng nhập đã hết hạn'); end if;
  if u.role <> 'admin' then return jsonb_build_object('ok', false, 'code', 403, 'error', 'Chỉ quản trị viên có quyền'); end if;
  select * into t from cerish_users where id = p_id;
  if t.id is null then return jsonb_build_object('ok', false, 'code', 404, 'error', 'Không có tài khoản'); end if;
  if (p_data ? 'role') and (p_data->>'role') not in ('admin','manager','staff') then
    return jsonb_build_object('ok', false, 'code', 422, 'error', 'Vai trò không hợp lệ'); end if;
  if t.id = u.id and (((p_data ? 'active') and (p_data->>'active') in ('0','false')) or ((p_data ? 'role') and (p_data->>'role') <> 'admin')) then
    return jsonb_build_object('ok', false, 'code', 409, 'error', 'Không thể tự tắt hoặc tự hạ quyền quản trị'); end if;
  if p_data ? 'name' then
    if trim(p_data->>'name') = '' or length(p_data->>'name') > 120 then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Họ tên chưa hợp lệ'); end if;
    update cerish_users set name = trim(p_data->>'name') where id = p_id;
  end if;
  if p_data ? 'role'   then update cerish_users set role = p_data->>'role' where id = p_id; end if;
  if p_data ? 'active' then update cerish_users set active = case when (p_data->>'active') in ('0','false') then 0 else 1 end where id = p_id; end if;
  if (p_data ? 'password') and coalesce(p_data->>'password','') <> '' then
    if length(p_data->>'password') < 10 then return jsonb_build_object('ok', false, 'code', 422, 'error', 'Mật khẩu phải có từ 10 đến 128 ký tự'); end if;
    update cerish_users set password_hash = crypt(p_data->>'password', gen_salt('bf')) where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ---------- Tài khoản quản trị khởi tạo ----------
insert into cerish_users(id, email, name, role, active, password_hash, created_at)
select 1, 'admin@cerish.local', 'Quản trị CERISH', 'admin', 1, crypt('Cerish@2026Demo!', gen_salt('bf')), now()
where not exists (select 1 from cerish_users);

-- ---------- Cấp quyền gọi hàm cho anon key (và người đã đăng nhập) ----------
grant execute on function
  cerish_login(text,text), cerish_logout(text), cerish_me(text), cerish_dump(text),
  cerish_put(text,text,jsonb), cerish_del(text,text,bigint), cerish_password(text,text,text),
  cerish_user_create(text,text,text,text,text), cerish_user_update(text,bigint,jsonb)
to anon, authenticated;

-- Không cấp quyền bảng cho anon/authenticated -> chỉ gọi được qua hàm RPC ở trên.
