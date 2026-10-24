begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dj-buang-voices','dj-buang-voices',false,10485760,array['audio/wav','audio/mpeg','audio/mp4']);
-- Keep this bucket inaccessible through browser Storage APIs, even if a broader policy is added later.
create policy "voice_bucket_no_browser_access" on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'dj-buang-voices') with check(bucket_id<>'dj-buang-voices');
create extension if not exists pg_net;
do $$ declare token text;begin
 token=encode(extensions.gen_random_bytes(32),'hex');
 perform vault.create_secret(token,'dj_buang_voice_cleanup','Private token for voice expiry maintenance');
 insert into dj_private.voice_job_auth(id,token_hash) values(true,encode(sha256(convert_to(token,'UTF8')),'hex'));
end $$;
select cron.schedule('dj-buang-voice-retention','*/15 * * * *',$job$
select net.http_post(
 url:='https://oktnfawoyexhplbsjpzb.supabase.co/functions/v1/voice-cleanup',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='dj_buang_voice_cleanup')),
 body:='{}'::jsonb,timeout_milliseconds:=60000);
$job$);
commit;
