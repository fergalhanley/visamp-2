-- M1 marketplace licensing: spend existing prepaid Visamp credits atomically,
-- snapshot the licence terms/customisation and record the creator earning.

create table public.visual_marketplace_settings (
  singleton boolean primary key default true check (singleton),
  platform_fee_bps integer not null default 3000
    check (platform_fee_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into public.visual_marketplace_settings (singleton) values (true);

create table public.visual_licences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  track_id uuid not null references public.tracks(id),
  visualisation_id uuid not null references public.visualisations(id),
  creator_id uuid not null references public.profiles(id),
  price_credits integer not null check (price_credits > 0),
  creator_credits integer not null check (creator_credits >= 0),
  visamp_credits integer not null check (visamp_credits >= 0),
  control_values jsonb not null default '{}'::jsonb
    check (jsonb_typeof(control_values) = 'object'),
  created_at timestamptz not null default now(),
  constraint visual_licence_split check (
    creator_credits + visamp_credits = price_credits
  ),
  constraint visual_licence_once unique (user_id, track_id, visualisation_id)
);

create table public.visual_licence_credit_debits (
  licence_id uuid not null references public.visual_licences(id),
  allocation_id uuid not null references public.ai_credit_allocations(id),
  amount integer not null check (amount > 0),
  primary key (licence_id, allocation_id)
);

create table public.visual_creator_earnings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id),
  visual_licence_id uuid not null unique references public.visual_licences(id),
  amount_credits integer not null check (amount_credits >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index visual_licences_user_idx
  on public.visual_licences (user_id, created_at desc);
create index visual_creator_earnings_creator_idx
  on public.visual_creator_earnings (creator_id, created_at desc);

alter table public.visual_marketplace_settings enable row level security;
alter table public.visual_licences enable row level security;
alter table public.visual_licence_credit_debits enable row level security;
alter table public.visual_creator_earnings enable row level security;

revoke all on public.visual_marketplace_settings,
  public.visual_licences,
  public.visual_licence_credit_debits,
  public.visual_creator_earnings
  from public, anon, authenticated;

grant all on public.visual_marketplace_settings,
  public.visual_licences,
  public.visual_licence_credit_debits,
  public.visual_creator_earnings
  to service_role;

create function public.purchase_visual_licence(
  p_user_id uuid,
  p_track_id uuid,
  p_visualisation_id uuid,
  p_control_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.visual_licences%rowtype;
  visual public.visualisations%rowtype;
  price integer;
  fee_bps integer;
  creator_amount integer;
  platform_amount integer;
  available bigint;
  needed integer;
  allocation record;
  take integer;
  new_id uuid;
begin
  if p_user_id is null or p_track_id is null or p_visualisation_id is null
     or p_control_values is null or jsonb_typeof(p_control_values) <> 'object' then
    raise exception 'Invalid visual licence request';
  end if;

  -- Same lock used by AI credit reservations/settlement. Marketplace purchases
  -- therefore cannot race another consumer of the same prepaid balance.
  perform pg_advisory_xact_lock(
    hashtextextended('ai-user:' || p_user_id::text, 0)
  );

  select * into existing
  from public.visual_licences
  where user_id = p_user_id
    and track_id = p_track_id
    and visualisation_id = p_visualisation_id
  for update;

  if found then
    return jsonb_build_object(
      'status', 'existing',
      'licenceId', existing.id,
      'chargedCredits', 0,
      'priceCredits', existing.price_credits,
      'creatorCredits', existing.creator_credits,
      'visampCredits', existing.visamp_credits
    );
  end if;

  -- Buying a visual for a track is only allowed for the user who currently
  -- controls the track's artist identity.
  if not exists (
    select 1
    from public.tracks t
    join public.music_artists a on a.id = t.music_artist_id
    where t.id = p_track_id
      and t.status = 'live'
      and a.claimed_by = p_user_id
  ) then
    raise exception 'Track is not available for this artist';
  end if;

  select * into visual
  from public.visualisations
  where id = p_visualisation_id
    and visibility = 'public'
    and marketplace_listed = true
    and marketplace_price_credits is not null
  for share;

  if not found then
    raise exception 'Visual is not listed';
  end if;

  price := visual.marketplace_price_credits;

  -- Stored overrides may only target controls explicitly exposed by the
  -- creator, and their JSON primitive type must match the control kind.
  if exists (
    select 1
    from jsonb_each(p_control_values) supplied
    left join lateral (
      select control
      from jsonb_array_elements(visual.marketplace_controls) control
      where control->>'prop' = supplied.key
      limit 1
    ) allowed on true
    where allowed.control is null
       or case allowed.control->>'kind'
            when 'number' then jsonb_typeof(supplied.value) <> 'number'
            when 'boolean' then jsonb_typeof(supplied.value) <> 'boolean'
            when 'colour' then jsonb_typeof(supplied.value) <> 'string'
            when 'text' then jsonb_typeof(supplied.value) <> 'string'
            else true
          end
  ) then
    raise exception 'Invalid marketplace customisation';
  end if;

  select platform_fee_bps into fee_bps
  from public.visual_marketplace_settings
  where singleton;
  if fee_bps is null then
    raise exception 'Marketplace settings are missing';
  end if;

  select public.ai_available_credits(p_user_id) into available;
  if available < price then
    return jsonb_build_object(
      'status', 'insufficient_credit',
      'requiredCredits', price,
      'availableCredits', greatest(available, 0)
    );
  end if;

  creator_amount := floor(
    price::numeric * (10000 - fee_bps)::numeric / 10000
  )::integer;
  platform_amount := price - creator_amount;

  insert into public.visual_licences (
    user_id,
    track_id,
    visualisation_id,
    creator_id,
    price_credits,
    creator_credits,
    visamp_credits,
    control_values
  ) values (
    p_user_id,
    p_track_id,
    p_visualisation_id,
    visual.owner_id,
    price,
    creator_amount,
    platform_amount,
    p_control_values
  )
  returning id into new_id;

  needed := price;
  for allocation in
    select
      a.*,
      a.remaining - coalesce((
        select sum(r.amount)
        from public.ai_credit_reservations r
        join public.ai_generation_requests q on q.id = r.request_id
        where r.allocation_id = a.id
          and q.status = 'running'
          and q.created_at > now() - interval '10 minutes'
      ), 0) as available
    from public.ai_credit_allocations a
    where a.user_id = p_user_id
      and (a.expires_at is null or a.expires_at > now())
    order by
      a.expires_at asc nulls last,
      (a.source = 'purchase'),
      a.created_at,
      a.id
    for update of a
  loop
    exit when needed = 0;
    take := least(needed, greatest(0, allocation.available));
    if take > 0 then
      update public.ai_credit_allocations
      set remaining = remaining - take
      where id = allocation.id
        and remaining >= take;
      if not found then
        raise exception 'Credit allocation unavailable';
      end if;

      insert into public.visual_licence_credit_debits (
        licence_id,
        allocation_id,
        amount
      ) values (new_id, allocation.id, take);

      needed := needed - take;
    end if;
  end loop;

  if needed <> 0 then
    raise exception 'Marketplace credit debit failed';
  end if;

  insert into public.visual_creator_earnings (
    creator_id,
    visual_licence_id,
    amount_credits
  ) values (
    visual.owner_id,
    new_id,
    creator_amount
  );

  return jsonb_build_object(
    'status', 'purchased',
    'licenceId', new_id,
    'chargedCredits', price,
    'priceCredits', price,
    'creatorCredits', creator_amount,
    'visampCredits', platform_amount,
    'availableCredits', public.ai_available_credits(p_user_id)
  );
end;
$$;

revoke all on function public.purchase_visual_licence(
  uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.purchase_visual_licence(
  uuid, uuid, uuid, jsonb
) to service_role;

notify pgrst, 'reload schema';
