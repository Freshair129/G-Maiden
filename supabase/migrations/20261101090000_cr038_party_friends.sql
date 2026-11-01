-- CR-038: only the broker's restricted runtime can invoke these transactions.
create schema social_private;
revoke all on schema social_private from public, anon, authenticated;
alter default privileges in schema social_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema social_private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema social_private revoke all on sequences from public, anon, authenticated;
create table social_private.settings(user_id uuid primary key references auth.users on delete cascade,presence_visible boolean not null default false,allow_friend_requests boolean not null default true,allow_invites boolean not null default true);
create table social_private.friendships(a uuid references auth.users on delete cascade,b uuid references auth.users on delete cascade,primary key(a,b),check(a<b));
create table social_private.requests(id uuid primary key default gen_random_uuid(),sender uuid not null references auth.users on delete cascade,recipient uuid not null references auth.users on delete cascade,expires_at timestamptz not null,check(sender<>recipient));
create unique index requests_pair on social_private.requests(least(sender,recipient),greatest(sender,recipient));
create table social_private.blocks(blocker uuid references auth.users on delete cascade,blocked uuid references auth.users on delete cascade,primary key(blocker,blocked),check(blocker<>blocked));
create table social_private.presence(user_id uuid references auth.users on delete cascade,session_id uuid references auth.sessions on delete cascade,expires_at timestamptz not null,primary key(user_id,session_id));
create table social_private.binding_sessions(user_id uuid not null references auth.users on delete cascade,session_id uuid primary key references auth.sessions on delete cascade,revision bigint not null default 0 check(revision>=0));
create table social_private.room_bindings(user_id uuid references auth.users on delete cascade,session_id uuid references auth.sessions on delete cascade,relay_origin text not null,room_id text not null,member_id text not null,generation bigint not null check(generation>0),expires_at timestamptz not null,primary key(user_id,session_id),unique(relay_origin,room_id,member_id));
create table social_private.challenges(hash text primary key check(hash~'^[0-9a-f]{64}$'),user_id uuid not null references auth.users on delete cascade,session_id uuid not null references auth.sessions on delete cascade,relay_origin text not null,purpose text not null check(purpose in('link','roster','invite')),recipient uuid references auth.users on delete cascade,revision bigint,expires_at timestamptz not null);
create table social_private.invites(id uuid primary key default gen_random_uuid(),sender uuid not null references auth.users on delete cascade,sender_session uuid not null references auth.sessions on delete cascade,recipient uuid not null references auth.users on delete cascade,recipient_session uuid references auth.sessions on delete cascade,relay_origin text not null,room_id text not null,owner_id text not null,member_id text not null,generation bigint not null check(generation>0),status text not null default 'pending' check(status in('pending','accepted')),expires_at timestamptz not null,check(sender<>recipient));
create table social_private.join_tickets(hash text primary key check(hash~'^[0-9a-f]{64}$'),invite_id uuid unique not null references social_private.invites on delete cascade,expires_at timestamptz not null);
create sequence social_private.redeem_rate_slot;
create sequence social_private.redeem_nonce_slot;
create table social_private.rate_limits(subject text,category text,window_start timestamptz not null,count integer not null,slot integer not null default 0,primary key(subject,category,slot));
create table social_private.redeem_nonces(slot integer primary key,hash text unique not null check(hash~'^[0-9a-f]{64}$'),relay_origin text not null,expires_at timestamptz not null);
create index requests_recipient on social_private.requests(recipient);
create index friendships_b on social_private.friendships(b);
create index invites_recipient on social_private.invites(recipient);
create index challenges_session on social_private.challenges(session_id);
create index room_bindings_room on social_private.room_bindings(relay_origin,room_id,generation);
create index presence_expiry on social_private.presence(expires_at);
create index challenges_expiry on social_private.challenges(expires_at);
create index invites_expiry on social_private.invites(expires_at);
create index requests_expiry on social_private.requests(expires_at);
create index tickets_expiry on social_private.join_tickets(expires_at);
create index bindings_expiry on social_private.room_bindings(expires_at);
create index nonces_expiry on social_private.redeem_nonces(expires_at);
create index rates_expiry on social_private.rate_limits(window_start);
do $$ declare t text; begin foreach t in array array['settings','friendships','requests','blocks','presence','binding_sessions','room_bindings','challenges','invites','join_tickets','rate_limits','redeem_nonces'] loop execute format('alter table social_private.%I enable row level security',t); end loop; end $$;

create function social_private.active(u uuid,s uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select iam_private.session_is_active(u,s) and exists(select from auth.users where id=u and (raw_app_meta_data->>'provider'='google' or raw_app_meta_data->'providers' ? 'google'));
$$;
create function social_private.person(u uuid) returns jsonb language sql stable security definer set search_path='' as $$
 -- Match ECMAScript String.trim exactly; PostgreSQL's default trim only removes
 -- ASCII space. UTF-8 text length counts Unicode scalars, including non-BMP names.
 select jsonb_build_object('gid',gid_code,'displayName',
   case when length(projected_name) between 1 and 32
     and projected_name !~ U&'[\0001-\001F\007F-\009F]'
   then projected_name else gid_code end)
 from (
   select gid_code, btrim(display_name,
     U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') as projected_name
   from public.profiles where id=u
 ) profile;
$$;
create function social_private.blocked(u uuid,v uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select from social_private.blocks where (blocker=u and blocked=v) or(blocker=v and blocked=u)) $$;
create function social_private.friends(u uuid,v uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select from social_private.friendships where a=least(u,v) and b=greatest(u,v)) $$;
create function social_private.charge(s text,c text,maximum integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare n integer; t timestamptz:=clock_timestamp(); begin
 if c='redeem' then
 insert into social_private.rate_limits(subject,category,window_start,count,slot) values(s,c,date_trunc('minute',t),1,(nextval('social_private.redeem_rate_slot')%60)::integer) on conflict(subject,category,slot) do update set window_start=excluded.window_start,count=1 where social_private.rate_limits.window_start<excluded.window_start returning count into n;
 return n is not null;
 end if;
 insert into social_private.rate_limits(subject,category,window_start,count) values(s,c,t,1) on conflict(subject,category,slot) do update set window_start=case when social_private.rate_limits.window_start<=t-interval '1 minute' then t else social_private.rate_limits.window_start end,count=case when social_private.rate_limits.window_start<=t-interval '1 minute' then 1 else least(social_private.rate_limits.count+1,maximum+1) end returning count into n; return n<=maximum; end $$;
create function social_private.lock_accounts(u uuid,v uuid) returns void language plpgsql security definer set search_path='' as $$ declare x uuid; begin for x in select distinct z from unnest(array[u,v]) z where z is not null order by z loop perform pg_advisory_xact_lock(hashtextextended(x::text,38038)); end loop; end $$;

create function social_private.action(p_user uuid,p_session uuid,p_body jsonb,p_origin text,p_proof jsonb default null,p_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare act text:=p_body->>'action'; target uuid; other_session uuid; r social_private.requests%rowtype; i social_private.invites%rowtype; ch social_private.challenges%rowtype; binding social_private.room_bindings%rowtype; t timestamptz; expiry timestamptz; rev bigint; item jsonb; result jsonb; category text; maximum integer;
begin
 if act is null or act not in('state','settings','heartbeat','request','request_accept','request_decline','request_cancel','remove','block','unblock','challenge','link','unlink','roster','invite','invite_accept','invite_decline','invite_revoke') then return '{"error":"invalid_request"}'; end if;
 -- Provisional reads discover every session/account needed; all data is re-read after locks.
 if act in('request','remove','block','unblock') then select id into target from public.profiles where gid_code=p_body->>'gid';
 elsif act like 'request_%' then select * into r from social_private.requests where id=(p_body->>'requestId')::uuid; target:=case when r.sender=p_user then r.recipient else r.sender end;
 elsif act like 'invite_%' then select * into i from social_private.invites where id=(p_body->>'inviteId')::uuid; target:=case when i.sender=p_user then i.recipient else i.sender end; other_session:=i.sender_session;
 elsif act='challenge' then select id into target from public.profiles where gid_code=p_body->>'recipientGid';
 elsif act in('link','roster','invite') then select * into ch from social_private.challenges where hash=p_hash; target:=ch.recipient;
 end if;
 -- FOR SHARE conflicts with provider deletion and UPDATE revocation, held through commit.
 perform id from auth.sessions where id=any(array[p_session,other_session]) order by id for share;
 if not social_private.active(p_user,p_session) then return '{"error":"invalid_session"}'; end if;
 perform social_private.lock_accounts(p_user,target);
 t:=clock_timestamp();
 category:=case when act='state' then 'state' when act='heartbeat' then 'heartbeat' when act='request' then 'request' when act='challenge' then 'challenge' else 'mutation' end;
 maximum:=case category when 'state' then 12 when 'heartbeat' then 6 when 'request' then 10 when 'challenge' then 12 else 30 end;
 if act not in('link','roster','invite') and not social_private.charge(p_user::text,category,maximum) then return '{"error":"rate_limited"}'; end if;
 insert into social_private.settings(user_id) values(p_user) on conflict do nothing;
 insert into social_private.binding_sessions(user_id,session_id) values(p_user,p_session) on conflict do nothing;
 select revision into rev from social_private.binding_sessions where session_id=p_session;
 if act='state' then
 select jsonb_build_object('presenceVisible',presence_visible,'allowFriendRequests',allow_friend_requests,'allowInvites',allow_invites) into item from social_private.settings where user_id=p_user;
 result:=jsonb_build_object('self',social_private.person(p_user),'settings',item,'bindingRevision',rev,'serverNowMs',floor(extract(epoch from t)*1000),'relayOrigin',p_origin);
 select coalesce(jsonb_agg(social_private.person(f.other)||jsonb_build_object('online',coalesce(p.expires_at>t,false),'onlineForMs',case when p.expires_at>t then least(60000,floor(extract(epoch from(p.expires_at-t))*1000)) else 0 end)),'[]') into item from (select case when a=p_user then b else a end other from social_private.friendships where a=p_user or b=p_user limit 200) f left join lateral(select max(expires_at) expires_at from social_private.presence x join social_private.settings st on st.user_id=x.user_id where x.user_id=f.other and st.presence_visible and social_private.active(x.user_id,x.session_id)) p on true where not social_private.blocked(p_user,f.other);
 result:=result||jsonb_build_object('friends',item);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'person',social_private.person(case when sender=p_user then recipient else sender end),'direction',case when sender=p_user then 'outgoing' else 'incoming' end,'expiresAtMs',floor(extract(epoch from expires_at)*1000))),'[]') into item from (select * from social_private.requests where (sender=p_user or recipient=p_user) and expires_at>t limit 50) q;
 result:=result||jsonb_build_object('requests',item);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'person',social_private.person(case when sender=p_user then recipient else sender end),'direction',case when sender=p_user then 'outgoing' else 'incoming' end,'status',status,'expiresAtMs',floor(extract(epoch from expires_at)*1000))),'[]') into item from (select * from social_private.invites where(sender=p_user or recipient=p_user) and expires_at>t and social_private.active(sender,sender_session) limit 100) q;
 result:=result||jsonb_build_object('invites',item);
 select coalesce(jsonb_agg(social_private.person(blocked)),'[]') into item from(select blocked from social_private.blocks where blocker=p_user limit 500) q;
 return result||jsonb_build_object('blocked',item);
 elsif act='settings' then
 update social_private.settings set presence_visible=(p_body->>'presenceVisible')::boolean,allow_friend_requests=(p_body->>'allowFriendRequests')::boolean,allow_invites=(p_body->>'allowInvites')::boolean where user_id=p_user;
 if not(p_body->>'presenceVisible')::boolean then delete from social_private.presence where user_id=p_user; end if;
 if not(p_body->>'allowInvites')::boolean then delete from social_private.invites where recipient=p_user; end if;
 elsif act='heartbeat' then
 if(select presence_visible from social_private.settings where user_id=p_user) then insert into social_private.presence values(p_user,p_session,t+interval '60 seconds') on conflict(user_id,session_id) do update set expires_at=excluded.expires_at; end if;
 elsif act in('request','remove','block','unblock') then
 if target is null then return '{"error":"unavailable"}'; end if;
 if target=p_user then return '{"error":"invalid_request"}'; end if;
 if act='request' then
 if social_private.blocked(p_user,target) or not coalesce((select allow_friend_requests from social_private.settings where user_id=target),true) then return '{"error":"unavailable"}'; end if;
 if social_private.friends(p_user,target) then return '{"ok":true}'; end if;
 delete from social_private.requests where least(sender,recipient)=least(p_user,target) and greatest(sender,recipient)=greatest(p_user,target) and expires_at<=t;
 if exists(select from social_private.requests where least(sender,recipient)=least(p_user,target) and greatest(sender,recipient)=greatest(p_user,target)) then return '{"ok":true}'; end if;
 if (select count(*) from social_private.requests where(sender=p_user or recipient=p_user) and expires_at>t)>=50 or (select count(*) from social_private.requests where(sender=target or recipient=target) and expires_at>t)>=50 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.requests(sender,recipient,expires_at) values(p_user,target,t+interval '30 days');
 elsif act='unblock' then delete from social_private.blocks where blocker=p_user and blocked=target;
 else
 if act='block' and not exists(select from social_private.blocks where blocker=p_user and blocked=target) then
 if(select count(*) from social_private.blocks where blocker=p_user)>=500 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.blocks values(p_user,target);
 end if;
 delete from social_private.friendships where a=least(p_user,target) and b=greatest(p_user,target);
 delete from social_private.requests where least(sender,recipient)=least(p_user,target) and greatest(sender,recipient)=greatest(p_user,target);
 delete from social_private.invites where least(sender,recipient)=least(p_user,target) and greatest(sender,recipient)=greatest(p_user,target);
 end if;
 elsif act like 'request_%' then
 select * into r from social_private.requests where id=(p_body->>'requestId')::uuid;
 if r.id is null then return '{"ok":true}'; end if;
 if (act='request_cancel' and r.sender<>p_user) or(act<>'request_cancel' and r.recipient<>p_user) then return '{"error":"forbidden"}'; end if;
 if r.expires_at<=t or social_private.blocked(r.sender,r.recipient) then return '{"error":"unavailable"}'; end if;
 if act='request_accept' then
 if(select count(*) from social_private.friendships where a=r.sender or b=r.sender)>=200 or(select count(*) from social_private.friendships where a=r.recipient or b=r.recipient)>=200 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.friendships values(least(r.sender,r.recipient),greatest(r.sender,r.recipient)) on conflict do nothing;
 end if;
 delete from social_private.requests where id=r.id;
 elsif act='unlink' then
 update social_private.binding_sessions set revision=revision+1 where session_id=p_session;
 delete from social_private.room_bindings where user_id=p_user and session_id=p_session;
 delete from social_private.challenges where session_id=p_session and purpose='link';
 elsif act='challenge' then
 if p_origin is null then return '{"error":"social_unavailable"}'; end if;
 if p_body->>'purpose'='link' and (p_body->>'bindingRevision')::bigint is distinct from rev then return '{"error":"conflict"}'; end if;
 if p_body->>'purpose'='invite' and(target is null or not social_private.friends(p_user,target) or social_private.blocked(p_user,target) or not coalesce((select allow_invites from social_private.settings where user_id=target),true)) then return '{"error":"unavailable"}'; end if;
 if(select count(*) from social_private.challenges where session_id=p_session and expires_at>t)>=4 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.challenges values(p_hash,p_user,p_session,p_origin,p_body->>'purpose',target,(p_body->>'bindingRevision')::bigint,t+interval '60 seconds');
 return jsonb_build_object('expiresAtMs',floor(extract(epoch from(t+interval '60 seconds'))*1000));
 elsif act in('link','roster','invite') then
 select * into ch from social_private.challenges where hash=p_hash for update;
 if ch.hash is null or ch.user_id<>p_user or ch.session_id<>p_session or ch.purpose<>act or ch.relay_origin is distinct from p_origin or ch.expires_at<=t or (p_proof->>'expiresAtMs')::numeric<=extract(epoch from t)*1000 then return '{"error":"unavailable"}'; end if;
 -- Consumption and its authorized operation commit together; expected denials still burn the challenge.
 delete from social_private.challenges where hash=p_hash;
 if act='link' then
 if ch.revision is distinct from rev or (p_body->>'bindingRevision')::bigint is distinct from rev then return '{"error":"conflict"}'; end if;
 select * into binding from social_private.room_bindings where user_id=p_user and session_id=p_session;
 if not(p_body->>'consent')::boolean and(binding.user_id is null or binding.expires_at<=t or binding.relay_origin<>p_origin or binding.room_id<>p_proof->>'roomId' or binding.member_id<>p_proof->>'memberId' or binding.generation<>(p_proof->>'generation')::bigint) then return '{"error":"consent_required"}'; end if;
 -- Serialize a member's unique label without taking a global lock.
 perform pg_advisory_xact_lock(hashtextextended(p_origin||(p_proof->>'roomId')||(p_proof->>'memberId'),38039));
 t:=clock_timestamp();
 if ch.expires_at<=t or (p_proof->>'expiresAtMs')::numeric<=extract(epoch from t)*1000 then return '{"error":"unavailable"}'; end if;
 if not(p_body->>'consent')::boolean and binding.expires_at<=t then return '{"error":"consent_required"}'; end if;
 delete from social_private.room_bindings where relay_origin=p_origin and room_id=p_proof->>'roomId' and member_id=p_proof->>'memberId' and expires_at<=t;
 if exists(select from social_private.room_bindings where relay_origin=p_origin and room_id=p_proof->>'roomId' and member_id=p_proof->>'memberId' and (user_id<>p_user or session_id<>p_session)) then return '{"error":"conflict"}'; end if;
 insert into social_private.room_bindings values(p_user,p_session,p_origin,p_proof->>'roomId',p_proof->>'memberId',(p_proof->>'generation')::bigint,t+interval '60 seconds') on conflict(user_id,session_id) do update set relay_origin=excluded.relay_origin,room_id=excluded.room_id,member_id=excluded.member_id,generation=excluded.generation,expires_at=excluded.expires_at;
 elsif act='roster' then
 select coalesce(jsonb_agg(jsonb_build_object('memberId',member_id,'person',social_private.person(user_id),'expiresAtMs',floor(extract(epoch from expires_at)*1000))),'[]') into item from(select * from social_private.room_bindings where relay_origin=p_origin and room_id=p_proof->>'roomId' and generation=(p_proof->>'generation')::bigint and (p_proof->'memberIds') ? member_id and expires_at>t and social_private.active(user_id,session_id) and not social_private.blocked(p_user,user_id) limit 5) q;
 return jsonb_build_object('roomId',p_proof->>'roomId','generation',(p_proof->>'generation')::bigint,'bindings',item,'serverNowMs',floor(extract(epoch from t)*1000));
 else
 if p_proof->>'memberId'<>p_proof->>'ownerId' then return '{"error":"forbidden"}'; end if;
 if not social_private.friends(p_user,target) or social_private.blocked(p_user,target) or not coalesce((select allow_invites from social_private.settings where user_id=target),true) then return '{"error":"unavailable"}'; end if;
 if exists(select from social_private.invites where sender=p_user and recipient=target and relay_origin=p_origin and room_id=p_proof->>'roomId' and owner_id=p_proof->>'ownerId' and generation=(p_proof->>'generation')::bigint and expires_at>t) then return '{"ok":true}'; end if;
 if(select count(*) from social_private.invites where sender=p_user and expires_at>t)>=50 or(select count(*) from social_private.invites where recipient=target and expires_at>t)>=50 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.invites(sender,sender_session,recipient,relay_origin,room_id,owner_id,member_id,generation,expires_at) values(p_user,p_session,target,p_origin,p_proof->>'roomId',p_proof->>'ownerId',p_proof->>'memberId',(p_proof->>'generation')::bigint,t+interval '300 seconds');
 end if;
 elsif act like 'invite_%' then
 select * into i from social_private.invites where id=(p_body->>'inviteId')::uuid for update;
 if i.id is null then return '{"error":"unavailable"}'; end if;
 if(act='invite_revoke' and i.sender<>p_user) or(act<>'invite_revoke' and i.recipient<>p_user) then return '{"error":"forbidden"}'; end if;
 if act='invite_accept' then
 if not(p_body->>'consent')::boolean then return '{"error":"consent_required"}'; end if;
 if p_origin is distinct from i.relay_origin or i.expires_at<=t or not social_private.active(i.sender,i.sender_session) or not social_private.friends(i.sender,i.recipient) or social_private.blocked(i.sender,i.recipient) or not coalesce((select allow_invites from social_private.settings where user_id=p_user),true) then return '{"error":"unavailable"}'; end if;
 expiry:=least(t+interval '60 seconds',i.expires_at);
 update social_private.invites set status='accepted',recipient_session=p_session where id=i.id;
 delete from social_private.join_tickets where invite_id=i.id;
 insert into social_private.join_tickets values(p_hash,i.id,expiry);
 return jsonb_build_object('relayOrigin',i.relay_origin,'roomId',i.room_id,'expiresAtMs',floor(extract(epoch from expiry)*1000));
 else delete from social_private.invites where id=i.id; end if;
 else return '{"error":"invalid_request"}'; end if;
 return '{"ok":true}';
end $$;

create function social_private.redeem(p_ticket_hash text,p_nonce_hash text,p_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i social_private.invites%rowtype; ticket social_private.join_tickets%rowtype; t timestamptz;
begin
 -- Sequence-selected bounded slots avoid a global row lock across unrelated admissions.
 -- Slot contention can occur only after the configured minute/capacity budget is exhausted.
 if not social_private.charge(p_origin,'redeem',60) then return '{"error":"rate_limited"}'; end if;
 t:=clock_timestamp();
 delete from social_private.redeem_nonces where relay_origin=p_origin and expires_at<=t;
 if exists(select from social_private.redeem_nonces where hash=p_nonce_hash) then return '{"error":"unavailable"}'; end if;
 if(select count(*) from social_private.redeem_nonces where relay_origin=p_origin)>=120 then return '{"error":"limit_reached"}'; end if;
 insert into social_private.redeem_nonces values((nextval('social_private.redeem_nonce_slot')%120)::integer,p_nonce_hash,p_origin,t+interval '120 seconds') on conflict do nothing;
 if not found then return '{"error":"unavailable"}'; end if;
 select v.* into i from social_private.invites v join social_private.join_tickets j on j.invite_id=v.id where j.hash=p_ticket_hash;
 if i.id is null then return '{"error":"unavailable"}'; end if;
 perform id from auth.sessions where id=any(array[i.sender_session,i.recipient_session]) order by id for share;
 perform social_private.lock_accounts(i.sender,i.recipient);
 select * into i from social_private.invites where id=i.id for update;
 select * into ticket from social_private.join_tickets where hash=p_ticket_hash for update;
 t:=clock_timestamp();
 if i.id is null or ticket.hash is null or i.relay_origin<>p_origin or i.status<>'accepted' or i.expires_at<=t or ticket.expires_at<=t or not social_private.active(i.sender,i.sender_session) or not social_private.active(i.recipient,i.recipient_session) or not social_private.friends(i.sender,i.recipient) or social_private.blocked(i.sender,i.recipient) or not coalesce((select allow_invites from social_private.settings where user_id=i.recipient),true) then return '{"error":"unavailable"}'; end if;
 delete from social_private.invites where id=i.id;
 return jsonb_build_object('roomId',i.room_id,'ownerId',i.owner_id,'generation',i.generation);
end $$;

create function social_private.cleanup() returns integer language plpgsql security definer set search_path='' as $$
declare tbl text; n integer; total integer:=0; begin
 foreach tbl in array array['requests','presence','room_bindings','challenges','invites','join_tickets','redeem_nonces'] loop
 execute format('delete from social_private.%I where ctid in(select ctid from social_private.%I where expires_at<=clock_timestamp() limit 1000)',tbl,tbl); get diagnostics n=row_count; total:=total+n; end loop;
 delete from social_private.rate_limits where ctid in(select ctid from social_private.rate_limits where window_start<=clock_timestamp()-interval '1 minute' limit 1000); get diagnostics n=row_count; return total+n; end $$;
create function social_private.revoke_relay(p_origin text) returns void language plpgsql security definer set search_path='' as $$ begin
 delete from social_private.invites where relay_origin=p_origin;
 delete from social_private.challenges where relay_origin=p_origin;
 delete from social_private.room_bindings where relay_origin=p_origin;
 end $$;
revoke all on all tables in schema social_private from public,anon,authenticated,gmaiden_iam_runtime;
revoke all on all sequences in schema social_private from public,anon,authenticated,gmaiden_iam_runtime;
revoke execute on all functions in schema social_private from public,anon,authenticated,gmaiden_iam_runtime;
grant usage on schema social_private to gmaiden_iam_runtime;
grant execute on function social_private.action(uuid,uuid,jsonb,text,jsonb,text),social_private.redeem(text,text,text) to gmaiden_iam_runtime;
comment on function social_private.cleanup() is 'Operator must schedule at least daily; each call deletes at most 1000 rows per expiring table. Repeat until zero. No runtime grant.';
