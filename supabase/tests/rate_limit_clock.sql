begin;
do $$
declare identity text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'); delay integer;
begin
 assert public.consume_api_rate_limit('vis141-clock-check',identity,2,60)=0, 'First request admitted';
 assert public.consume_api_rate_limit('vis141-clock-check',identity,2,60)=0, 'Second request admitted';
 delay:=public.consume_api_rate_limit('vis141-clock-check',identity,2,60);
 assert delay between 1 and 60, 'Limited request returns bounded delay';
 assert (select window_started_at > now()-interval '60 seconds' from public.api_rate_limit_state where bucket='vis141-clock-check' and identity_hash=identity), 'Window uses date and time';
 update public.api_rate_limit_state set window_started_at=now()-interval '2 minutes' where bucket='vis141-clock-check' and identity_hash=identity;
 assert public.consume_api_rate_limit('vis141-clock-check',identity,2,60)=0, 'Expired window resets';
end $$;
rollback;
