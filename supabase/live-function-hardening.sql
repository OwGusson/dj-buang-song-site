alter function public.refresh_song_analytics_for_song(text) set search_path = public, pg_temp;
alter function public.handle_song_event_refresh() set search_path = public, pg_temp;
alter function public.refresh_song_analytics(text) set search_path = public, pg_temp;
alter function public.song_events_refresh_trigger() set search_path = public, pg_temp;
revoke execute on function public.refresh_song_analytics_for_song(text) from public, anon, authenticated;
revoke execute on function public.handle_song_event_refresh() from public, anon, authenticated;
revoke truncate, references, trigger on table public.song_requests, public.private_messages, public.song_likes, public.song_analytics, public.song_events, public.songs_backup from anon, authenticated;
