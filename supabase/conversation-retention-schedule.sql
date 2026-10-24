-- Enable the supported Postgres scheduler; no HTTP secrets or public endpoint.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('dj-buang-conversation-retention','17 * * * *','select dj_private.expire_contact_conversations();');
