begin;
create table if not exists dj_private.merch_interest (
 id uuid primary key, actor text not null check(actor ~ '^[0-9a-f]{64}$'),
 collection text not null check(collection in ('original','global-barangay')),
 currency text not null check(currency in ('EUR','USD','GBP','ISK','PHP')),
 choices jsonb not null check(jsonb_typeof(choices)='array' and jsonb_array_length(choices) between 1 and 9),
 test_mode boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists merch_interest_actor_time on dj_private.merch_interest(actor,created_at desc);
create index if not exists merch_interest_test_time on dj_private.merch_interest(test_mode,created_at desc);
alter table dj_private.merch_interest enable row level security;
revoke all on dj_private.merch_interest from public,anon,authenticated;
grant select,insert on dj_private.merch_interest to service_role;
create or replace function public.merch_interest_submit(p_id uuid,p_actor text,p_collection text,p_currency text,p_choices jsonb,p_test boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing dj_private.merch_interest%rowtype; choice jsonb; seen text[]:='{}'; item_key text; amount numeric; maximum numeric;
begin
 if p_id is null or p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_collection is null or p_collection not in ('original','global-barangay') or p_currency is null or p_currency not in ('EUR','USD','GBP','ISK','PHP') or p_test is null or p_choices is null or jsonb_typeof(p_choices)<>'array' then raise exception 'Invalid survey' using errcode='22023';end if;
 if jsonb_array_length(p_choices) not between 1 and 9 then raise exception 'Invalid selections' using errcode='22023';end if;
 maximum:=case p_currency when 'ISK' then 2000000 when 'PHP' then 1000000 else 10000 end;
 for choice in select value from jsonb_array_elements(p_choices) loop
  if jsonb_typeof(choice)<>'object' or not(choice ?& array['design','item','price']) or (choice->>'item') not in ('hoodie','tee','cap','jersey','tote') or (p_collection='original' and (choice->>'design') not in ('dj-buang','phil-ice')) or (p_collection='global-barangay' and (choice->>'design') not in ('night','island-ice')) or (choice->>'item'='tote' and not(p_collection='global-barangay' and choice->>'design'='island-ice')) then raise exception 'Invalid item' using errcode='22023';end if;
  if jsonb_typeof(choice->'design')<>'string' or jsonb_typeof(choice->'item')<>'string' or jsonb_typeof(choice->'price') not in ('number','null') then raise exception 'Invalid item type' using errcode='22023';end if;
  item_key:=(choice->>'design')||':'||(choice->>'item');if item_key=any(seen) then raise exception 'Duplicate selection' using errcode='22023';end if;seen:=array_append(seen,item_key);
  amount:=(choice->>'price')::numeric;if amount<0 or amount>maximum or amount<>round(amount,2) then raise exception 'Invalid price' using errcode='22023';end if;
 end loop;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('merch:'||p_actor,0));
 select * into existing from dj_private.merch_interest where id=p_id;
 if found then
  if existing.actor=p_actor and existing.collection=p_collection and existing.currency=p_currency and existing.choices=p_choices and existing.test_mode=p_test then return jsonb_build_object('success',true);end if;
  raise exception 'Invalid submission' using errcode='22023';
 end if;
 if (select count(*) from dj_private.merch_interest where actor=p_actor and created_at>now()-interval '1 day')>=5 or exists(select 1 from dj_private.merch_interest where actor=p_actor and created_at>now()-interval '30 seconds') then raise exception 'Please wait before submitting again' using errcode='P0001';end if;
 insert into dj_private.merch_interest(id,actor,collection,currency,choices,test_mode) values(p_id,p_actor,p_collection,p_currency,p_choices,p_test);
 return jsonb_build_object('success',true);
end $$;
revoke all on function public.merch_interest_submit(uuid,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.merch_interest_submit(uuid,text,text,text,jsonb,boolean) to service_role;
create or replace function public.merch_interest_summary(p_test boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('totalResponses',(select count(*) from dj_private.merch_interest where test_mode=p_test),'testMode',p_test,'rows',coalesce((
  select jsonb_agg(to_jsonb(g)) from (
   select r.collection,r.currency,c.value->>'design' as design,c.value->>'item' as item,count(*) as responses,count(c.value->>'price') as priced,
    min((c.value->>'price')::numeric) as minimum,max((c.value->>'price')::numeric) as maximum,
    percentile_cont(0.5) within group(order by (c.value->>'price')::numeric) as median,
    percentile_cont(0.25) within group(order by (c.value->>'price')::numeric) as lower_quartile,
    percentile_cont(0.75) within group(order by (c.value->>'price')::numeric) as upper_quartile
   from dj_private.merch_interest r cross join lateral jsonb_array_elements(r.choices) c where r.test_mode=p_test
   group by r.collection,r.currency,c.value->>'design',c.value->>'item'
   order by count(*) desc,r.collection,c.value->>'design',c.value->>'item',r.currency
  ) g
 ),'[]'::jsonb));
$$;
revoke all on function public.merch_interest_summary(boolean) from public,anon,authenticated;
grant execute on function public.merch_interest_summary(boolean) to service_role;
commit;
