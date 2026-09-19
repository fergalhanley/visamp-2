-- VIS-137: authoritative names and canonical addresses for every creation path.
-- Apply independently: historical hosted migration tracking is incomplete.
begin;
lock table public.visualisations in share row exclusive mode;
create extension if not exists unaccent with schema extensions;

create function public.visualisation_title(p_title text)
returns text language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(normalize(p_title, NFKC), '[[:space:]]+', ' ', 'g'));
$$;

create function public.visualisation_title_key(p_title text)
returns text language sql immutable strict set search_path = '' as $$
  select lower(public.visualisation_title(p_title));
$$;

-- Refuse collisions before touching any existing display titles.
create unique index visualisations_title_key_unique
  on public.visualisations(public.visualisation_title_key(title));

create function public.visualisation_name_words(p_kind text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_kind
    when 'visual' then array['Prism','Pulse','Wave','Orbit','Spiral','Bloom','Glow','Shimmer','Ripple','Beam','Flare','Spark','Echo','Flux','Halo','Pixel','Pattern','Rhythm','Spectrum','Vortex','Aurora','Mirage','Fractal','Lattice','Mosaic','Ribbon','Tunnel','Portal','Ring','Arc','Ray','Mist','Drift','Flow','Trace','Swirl','Flash','Flicker','Glint','Gleam','Haze','Lens','Loop','Mesh','Motion','Phase','Radiance','Reflection','Refraction','Resonance','Shadow','Silhouette','Strobe','Streak','Surge','Trail','Twist','Veil','Warp','Weave','Zoom','Cascade','Dither','Diffraction']
    when 'adjective' then array['Amber','Azure','Blue','Bronze','Coral','Crimson','Cyan','Golden','Green','Indigo','Ivory','Jade','Lilac','Lime','Magenta','Mauve','Olive','Orange','Peach','Pink','Purple','Red','Rose','Ruby','Sable','Scarlet','Silver','Teal','Turquoise','Violet','White','Yellow','Agile','Airy','Ample','Ancient','Arctic','Astral','Autumn','Balanced','Blazing','Bold','Bouncy','Brave','Breezy','Bright','Brisk','Broad','Calm','Candid','Careful','Cheerful','Chilly','Clever','Cloudy','Cold','Comfy','Cosmic','Cozy','Crisp','Curious','Dainty','Dapper','Daring','Dawn','Deep','Delicate','Dewy','Dim','Distant','Dreamy','Dry','Dusk','Dusty','Eager','Early','Earthy','Easy','Electric','Elegant','Emerald','Empty','Endless','Even','Fancy','Fast','Feral','Fierce','Fiery','Fine','Floral','Fluffy','Flying','Foggy','Forest','Free','Fresh','Friendly','Frosty','Full','Gentle','Giant','Giddy','Glad','Glassy','Gleaming','Gliding','Glowing','Graceful','Grand','Grassy','Great','Happy','Hazy','Hidden','Hollow','Honest','Honey','Humble','Hushed','Icy','Idle','Inner','Iridescent','Jolly','Joyful','Juicy','Keen','Kind','Kinetic','Large','Late','Leafy','Light','Lively','Lofty','Lonely','Long','Loose','Loud','Lovely','Low','Lucky','Lunar','Lush','Magic','Merry','Metallic','Midnight','Mild','Misty','Modern','Molten','Mossy','Muted','Mystic','Narrow','Neat','Neon','New','Nimble','Noble','Noisy','Northern','Odd','Old','Opal','Open','Outer','Pale','Patient','Peaceful','Pearly','Petite','Plain','Playful','Plucky','Plush','Polished','Poppy','Proud','Quick','Quiet','Radiant','Rainy','Rapid','Rare','Ready','Regal','Restless','Rich','Rigid','Rising','Rocky','Rosy','Round','Royal','Rustic','Sandy','Satin','Secret','Serene','Shady','Sharp','Shiny','Short','Shy','Silent','Silky','Silvery','Simple','Slow','Small','Smart','Smooth','Snowy','Soft','Solar','Solid','Sonic','Southern','Sparkly','Speedy','Spicy','Spiral','Splendid','Spring','Spry','Square','Starry','Steady','Stellar','Still','Stormy','Striped','Strong','Summer','Sunny','Super','Sweet','Swift','Tall','Tangy','Tender','Tiny','Toasty','Tough','Tranquil','True','Twinkly','Vast','Velvet','Vivid','Warm','Wavy','Wild']
    when 'noun' then array['Otter','Fox','Owl','Lynx','Wolf','Bear','Hare','Deer','Elk','Moose','Panda','Koala','Tiger','Lion','Zebra','Giraffe','Badger','Beaver','Bison','Buffalo','Camel','Cheetah','Cougar','Coyote','Dingo','Donkey','Ferret','Gazelle','Gecko','Gibbon','Goat','Gorilla','Hamster','Hedgehog','Hippo','Horse','Hyena','Iguana','Jaguar','Kangaroo','Lemur','Leopard','Lizard','Llama','Marmot','Meerkat','Mink','Mole','Monkey','Mouse','Newt','Ocelot','Okapi','Opossum','Ox','Panther','Platypus','Pony','Porcupine','Possum','Puma','Rabbit','Raccoon','Rat','Reindeer','Rhino','Seal','Sheep','Shrew','Skunk','Sloth','Squirrel','Stoat','Tapir','Tortoise','Turtle','Vole','Wallaby','Walrus','Wombat','Albatross','Blackbird','Bluebird','Canary','Condor','Crane','Crow','Dove','Duck','Eagle','Egret','Falcon','Finch','Flamingo','Goose','Gull','Hawk','Heron','Ibis','Jay','Kestrel','Kingfisher','Kiwi','Lark','Macaw','Magpie','Osprey','Ostrich','Parrot','Peacock','Pelican','Penguin','Pheasant','Pigeon','Puffin','Quail','Raven','Robin','Rook','Sandpiper','Sparrow','Starling','Stork','Swallow','Swan','Swift','Toucan','Wren','Anchovy','Angelfish','Bass','Betta','Carp','Catfish','Clownfish','Cod','Dolphin','Eel','Flounder','Goldfish','Grouper','Guppy','Haddock','Halibut','Herring','Humpback','Jellyfish','Koi','Lobster','Mackerel','Manta','Marlin','Minnow','Narwhal','Octopus','Orca','Perch','Pike','Prawn','Salmon','Sardine','Seahorse','Shark','Shrimp','Snapper','Squid','Starfish','Stingray','Sunfish','Swordfish','Tetra','Trout','Tuna','Urchin','Wahoo','Whale','Acorn','Alder','Apple','Ash','Aspen','Bamboo','Birch','Blossom','Cedar','Cherry','Chestnut','Clover','Cypress','Daisy','Dandelion','Elm','Fern','Fig','Fir','Hazel','Heather','Holly','Iris','Ivy','Jasmine','Juniper','Laurel','Lavender','Lily','Lotus','Magnolia','Maple','Marigold','Mint','Moss','Oak','Orchid','Palm','Peach','Pear','Peony','Pine','Poppy','Reed','Rose','Sage','Spruce','Willow','Agate','Amethyst','Boulder','Canyon','Cavern','Cliff','Comet','Coral','Crystal','Dune','Glacier','Granite','Island','Lagoon','Marble','Meadow','Meteor','Moon','Mountain','Nebula','Ocean','Pebble','Planet','Quartz','Reef','River','Sapphire','Shore','Stone','Summit','Valley','Volcano']
  end;
$$;

create function public.visualisation_random_words(p_fork boolean)
returns text language plpgsql volatile set search_path = '' as $$
declare
  v_visual text[] := public.visualisation_name_words('visual');
  v_adjective text[] := public.visualisation_name_words('adjective');
  v_noun text[] := public.visualisation_name_words('noun');
begin
  return case when p_fork then '' else v_visual[1+floor(random()*64)::int]||' ' end
    ||v_adjective[1+floor(random()*256)::int]||' '||v_noun[1+floor(random()*256)::int];
end;
$$;

create function public.visualisation_slug_base(p_title text)
returns text language sql stable strict set search_path = '' as $$
  select coalesce(nullif(btrim(left(btrim(regexp_replace(
    lower(extensions.unaccent(public.visualisation_title(p_title))),
    '[^a-z0-9]+', '-', 'g'), '-'), 70), '-'), ''), 'visualisation');
$$;

alter table public.visualisations
  add column slug text,
  add column slug_published boolean not null default false,
  add column lineage_title text;
alter table public.visualisations alter column title set default '';

-- Private registry: addresses are never reused, even after their work is deleted.
-- Deliberately no FK/cascade: this is also the tombstone for deleted addresses.
create table public.visualisation_slug_reservations (
  slug text primary key,
  visualisation_id uuid not null
);
alter table public.visualisation_slug_reservations enable row level security;
revoke all on public.visualisation_slug_reservations from public, anon, authenticated;

-- Claim names atomically so generated collisions can retry inside the trigger.
-- This avoids serializing unrelated saves or holding a global lock while a
-- fork's counter trigger updates its parent.
create table public.visualisation_title_claims (
  title_key text primary key,
  visualisation_id uuid not null
);
create index visualisation_title_claims_vis_idx on public.visualisation_title_claims(visualisation_id);
alter table public.visualisation_title_claims enable row level security;
revoke all on public.visualisation_title_claims from public, anon, authenticated;
insert into public.visualisation_title_claims(title_key,visualisation_id)
  select public.visualisation_title_key(title),id from public.visualisations;

create function public.assign_visualisation_name()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_base text;
  v_suffix text;
  v_slug text;
  v_number integer := 1;
  v_reserved uuid;
  v_key text;
  -- Untitled and explicit fork labels keep the currently deployed client compatible.
  v_generate boolean := tg_op='INSERT' and (new.forked_from_id is not null
    or new.title is null or new.title in ('', 'Untitled'));
begin
  -- Source/thumbnail/counter-only writes should not contend for the name lock.
  if tg_op='UPDATE' and new.title=old.title and new.visibility=old.visibility
     and old.slug is not null then
    new.slug := old.slug;
    new.slug_published := old.slug_published;
    new.lineage_title := old.lineage_title;
    return new;
  end if;

  if v_generate then
    if new.forked_from_id is not null then
      select coalesce(lineage_title,title) into v_base from public.visualisations
      where id=new.forked_from_id
        and (visibility='public' or owner_id=new.owner_id);
      if v_base is null then
        raise exception 'Could not fork this visualisation.' using errcode='check_violation';
      end if;
    end if;
    for attempt in 1..100 loop
      v_suffix := public.visualisation_random_words(v_base is not null);
      new.title := case when v_base is null then v_suffix
        else rtrim(left(v_base,120-3-length(v_suffix)))||' — '||v_suffix end;
      v_key := public.visualisation_title_key(new.title);
      insert into public.visualisation_title_claims(title_key,visualisation_id)
        values(v_key,new.id) on conflict do nothing;
      select visualisation_id into v_reserved from public.visualisation_title_claims where title_key=v_key;
      exit when v_reserved=new.id;
      if attempt=100 then
        raise exception 'Could not find an unused title. Please try again.' using errcode='check_violation';
      end if;
    end loop;
    new.lineage_title := coalesce(v_base,new.title);
  else
    -- Reject rather than silently strip line breaks, C0/C1 controls and bidi controls.
    if new.title is null or new.title ~ '[[:cntrl:]]'
      or new.title ~ U&'[\0080-\009F\2028-\202E\2066-\2069]' then
      raise exception 'Titles cannot contain line breaks or control characters.' using errcode='check_violation';
    end if;
    new.title := public.visualisation_title(new.title);
    if length(new.title) not between 1 and 120 then
      raise exception 'Enter a title of 1 to 120 characters.' using errcode='check_violation';
    end if;
    v_key := public.visualisation_title_key(new.title);
    insert into public.visualisation_title_claims(title_key,visualisation_id)
      values(v_key,new.id) on conflict do nothing;
    select visualisation_id into v_reserved from public.visualisation_title_claims where title_key=v_key;
    if v_reserved<>new.id then
      raise exception 'That title is already taken. Choose another name.'
        using errcode='unique_violation', constraint='visualisations_title_key_unique';
    end if;
    -- An intentional rename starts a new naming base for subsequent forks.
    new.lineage_title := case when tg_op='UPDATE' and new.title=old.title
      then coalesce(old.lineage_title,new.title) else new.title end;
  end if;

  delete from public.visualisation_title_claims where visualisation_id=new.id and title_key<>v_key;

  if tg_op='UPDATE' and old.slug_published then
    new.slug := old.slug;
    new.slug_published := true;
    return new;
  end if;
  v_base := public.visualisation_slug_base(new.title);
  -- UUID-shaped titles must not overlap the legacy-ID route namespace.
  if v_base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_base := 'vis-'||v_base;
  end if;
  loop
    v_slug := v_base||case when v_number=1 then '' else '-'||v_number::text end;
    insert into public.visualisation_slug_reservations(slug,visualisation_id)
      values(v_slug,new.id) on conflict do nothing;
    select visualisation_id into v_reserved from public.visualisation_slug_reservations where slug=v_slug;
    exit when v_reserved=new.id;
    v_number := v_number+1;
  end loop;
  new.slug := v_slug;
  new.slug_published := new.visibility='public';
  return new;
end;
$$;
revoke all on function public.assign_visualisation_name() from public,anon,authenticated;
create trigger visualisations_assign_name before insert or update on public.visualisations
  for each row execute function public.assign_visualisation_name();

create function public.release_visualisation_title()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.visualisation_title_claims where visualisation_id=old.id;
  return old;
end;
$$;
revoke all on function public.release_visualisation_title() from public,anon,authenticated;
create trigger visualisations_release_title after delete on public.visualisations
  for each row execute function public.release_visualisation_title();

-- Existing names retain their wording. Allocate deterministically by creation/id.
do $$
declare v_id uuid;
begin
  for v_id in select id from public.visualisations order by created_at,id loop
    update public.visualisations set title=title where id=v_id;
  end loop;
end;
$$;
alter table public.visualisations alter column slug set not null;
alter table public.visualisations alter column lineage_title set not null;
create unique index visualisations_slug_unique on public.visualisations(slug);
notify pgrst, 'reload schema';
commit;
