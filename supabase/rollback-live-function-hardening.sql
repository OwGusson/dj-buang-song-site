-- Restore the original configuration only in an emergency; it reopens security findings.
alter function public.refresh_song_analytics_for_song(text) reset search_path;
alter function public.handle_song_event_refresh() reset search_path;
alter function public.refresh_song_analytics(text) reset search_path;
alter function public.song_events_refresh_trigger() reset search_path;
grant execute on function public.refresh_song_analytics_for_song(text) to public, anon, authenticated;
grant execute on function public.handle_song_event_refresh() to public, anon, authenticated;
grant truncate, references, trigger on table public.song_requests, public.private_messages, public.song_likes, public.song_analytics, public.song_events, public.songs_backup to anon, authenticated;
