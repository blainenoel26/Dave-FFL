-- Playoff payouts are fixed dollar amounts per place (not percentages of the pot).
alter table public.seasons add column playoff_payout_cents int[];

update public.seasons
set playoff_payout_cents = '{14000,11000,8000,6000,4000,3000,2000}'
where year = 2026;
