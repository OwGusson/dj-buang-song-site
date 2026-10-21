-- Run ONLY when the verified conversation flow is ready for production.
-- Preserve administrator access and all historical submissions.
begin;
drop policy if exists public_submit_request on public.song_requests;
drop policy if exists public_submit_message on public.private_messages;
revoke insert on public.song_requests,public.private_messages from anon;
revoke insert(requester_name,song_name,details,email,notify,delivery,linked_song_id,status) on public.song_requests from anon,authenticated;
revoke insert(sender_name,sender_email,message,status) on public.private_messages from anon,authenticated;
-- Full authenticated grants remain constrained by the existing MFA admin policy.
commit;
