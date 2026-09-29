-- M1 Studio distribution model.
--
-- public    = source-visible, forkable, free commercial video use
-- protected = discoverable/usable, not source-visible or forkable by others
-- product   = protected semantics plus paid licence before final use
-- private   = creator only

drop policy if exists "Readable when public or owned" on public.visualisations;
drop index if exists public.visualisations_public_created_idx;
drop index if exists public.visualisations_marketplace_idx;
drop trigger if exists visualisations_sync_vis_count on public.visualisations;

alter table public.visualisations alter column visibility drop default;

alter type public.visibility rename to visibility_old;
create type public.visibility as enum ('private', 'public', 'protected', 'product');

alter table public.visualisations
  alter column visibility type public.visibility
  using visibility::text::public.visibility;

drop type public.visibility_old;

alter table public.visualisations
  alter column visibility set default 'private';

-- The explicit listing bit/control metadata belonged to the first marketplace
-- spike. Distribution class + Visript params are now the source of truth.
alter table public.visualisations
  drop column if exists marketplace_listed,
  drop column if exists marketplace_controls;

create index visualisations_public_created_idx
  on public.visualisations (created_at desc)
  where visibility = 'public';

create index visualisations_product_idx
  on public.visualisations (updated_at desc)
  where visibility = 'product' and marketplace_price_credits is not null;

-- Raw visualisation rows include source, so direct browser reads stay limited
-- to source-visible public work or the owner. Protected/product discovery and
-- execution go through the Studio service boundary.
create policy "Readable when public or owned"
  on public.visualisations
  for select
  using (
    visibility = 'public'
    or owner_id = (select auth.uid())
  );

create or replace function public.sync_vis_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_visible boolean := false;
  new_visible boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_visible := old.visibility in ('public', 'protected', 'product');
  end if;
  if tg_op <> 'DELETE' then
    new_visible := new.visibility in ('public', 'protected', 'product');
  end if;

  if tg_op = 'INSERT' and new_visible then
    update public.profiles set vis_count = vis_count + 1 where id = new.owner_id;
  elsif tg_op = 'DELETE' and old_visible then
    update public.profiles set vis_count = greatest(0, vis_count - 1) where id = old.owner_id;
  elsif tg_op = 'UPDATE' and old.owner_id = new.owner_id then
    if old_visible and not new_visible then
      update public.profiles set vis_count = greatest(0, vis_count - 1) where id = new.owner_id;
    elsif not old_visible and new_visible then
      update public.profiles set vis_count = vis_count + 1 where id = new.owner_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger visualisations_sync_vis_count
  after insert or delete or update of visibility on public.visualisations
  for each row execute function public.sync_vis_count();

-- Cross-user forks are a privilege of public/source-visible work only.
create function public.enforce_visualisation_fork_distribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_owner uuid;
  source_visibility public.visibility;
begin
  if new.forked_from_id is null then
    return new;
  end if;

  select owner_id, visibility
    into source_owner, source_visibility
  from public.visualisations
  where id = new.forked_from_id;

  if not found then
    raise exception 'Source visualisation not found';
  end if;

  if source_owner <> new.owner_id and source_visibility <> 'public' then
    raise exception 'Only public visualisations can be forked';
  end if;

  return new;
end;
$$;

drop trigger if exists visualisations_enforce_fork_distribution on public.visualisations;
create trigger visualisations_enforce_fork_distribution
  before insert on public.visualisations
  for each row execute function public.enforce_visualisation_fork_distribution();

-- Rename the first-spike language from generic controls to the Visript concept.
alter table public.visual_licences
  rename column control_values to param_values;

drop function if exists public.purchase_visual_licence(uuid, uuid, uuid, jsonb);

create function public.purchase_visual_licence(
  p_user_id uuid,
  p_track_id uuid,
  p_visualisation_id uuid,
  p_param_values jsonb default '{}'::jsonb
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
     or p_param_values is null or jsonb_typeof(p_param_values) <> 'object' then
    raise exception 'Invalid visual licence request';
  end if;

  -- Param names use the same uppercase immutable namespace as Visript.
  if exists (
    select 1
    from jsonb_each(p_param_values) supplied
    where supplied.key !~ '^[A-Z][A-Z0-9_]*$'
       or jsonb_typeof(supplied.value) not in ('string', 'number', 'boolean')
  ) then
    raise exception 'Invalid visual param values';
  end if;

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
    and visibility = 'product'
    and marketplace_price_credits is not null
  for share;

  if not found then
    raise exception 'Visual is not a product';
  end if;

  price := visual.marketplace_price_credits;

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
    param_values
  ) values (
    p_user_id,
    p_track_id,
    p_visualisation_id,
    visual.owner_id,
    price,
    creator_amount,
    platform_amount,
    p_param_values
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
