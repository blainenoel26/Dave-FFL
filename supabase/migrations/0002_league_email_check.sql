-- Lets the login screen check that an email belongs to a league owner before sending a code,
-- without exposing the owners table to signed-out visitors.
create function public.is_league_email(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.owners where lower(email) = lower(trim(p_email)))
$$;

revoke all on function public.is_league_email(text) from public;
grant execute on function public.is_league_email(text) to anon, authenticated;
