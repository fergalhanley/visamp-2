-- VIS-115: 21 private effect samples for Visript 5.2+.
-- Set sample_owner to your profile UUID. Re-importing preserves existing scripts.
begin;
do $import$
declare sample_owner uuid := '1958b5c4-9bb0-472d-9892-0d49c5061e5b'::uuid; -- REPLACE null WITH 'your-profile-uuid'::uuid
begin
if sample_owner is null or not exists(select 1 from public.profiles where id=sample_owner) then raise exception 'Set sample_owner to your profile UUID'; end if;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('90b3a52e-43d0-52ab-8ddb-db1a3690b238',sample_owner,'Effects 01 Kaleidoscope','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop segments = 8
prop branches = 1
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::kaleidoscope(segments: segments, branches: branches, deg: $TIME_SEC * 8) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('0b34f26f-4f96-5940-a898-bef0e910c1a0',sample_owner,'Effects 02 Swirl','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop strength = 3.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::swirl(radius: $HEIGHT * 0.6, rad: math::sin(rad: $TIME_SEC * 0.3) * strength) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('464d7a3b-d291-5d03-993b-f449d4a45d5d',sample_owner,'Effects 03 Pixelate','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop size = 18.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate(size: size) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('ab21ac1f-c1cf-5a82-aee1-3376e6ef31f2',sample_owner,'Effects 04 Pixelate Rect','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop width = 14.0
prop height = 28.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_rect(width: width, height: height, deg: 12) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('ad812a20-ee4f-5b3e-a451-e3b0fea2794c',sample_owner,'Effects 05 Pixelate Circle','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop size = 16.0
prop gap = 4.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_circle(size: size, gap: gap, gap_color: color::rgb(r: 0.02,g: 0.02,b: 0.08)) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('3fb34978-009e-5f28-a952-8a22e233cdc0',sample_owner,'Effects 06 Pixelate Triangle','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop side_length = 28.0
prop gap = 2.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_triangle(side_length: side_length, gap: gap, deg: $TIME_SEC * 3) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('69de36d0-40f3-5604-89e0-1437baa1c970',sample_owner,'Effects 07 Pixelate Pentagon','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop side_length = 16.0
prop gap = 2.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_pentagon(side_length: side_length, gap: gap, deg: $TIME_SEC * 3) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('41b4e6b4-8ec8-519c-94a6-b8fb0d03b39c',sample_owner,'Effects 08 Pixelate Hexagon','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop side_length = 16.0
prop gap = 2.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_hexagon(side_length: side_length, gap: gap, deg: $TIME_SEC * 3) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('402774b1-b0b9-5647-96eb-27c990d1393c',sample_owner,'Effects 09 Pixelate Pentagram','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop size = 30.0
prop gap = 3.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_pentagram(size: size, gap: gap, deg: $TIME_SEC * 3) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('7e790e75-bd67-5e56-8996-339df6304600',sample_owner,'Effects 10 Pixelate Hexagram','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop size = 30.0
prop gap = 3.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::pixelate_hexagram(size: size, gap: gap, deg: $TIME_SEC * 3) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('b74c40d0-e643-562c-8991-0d65d00030f1',sample_owner,'Effects 11 Mirror','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop axis = "both"
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::mirror(axis: axis) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('aaf60684-6150-5c52-bf03-f465c34a7629',sample_owner,'Effects 12 Posterize','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop levels = 4
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::posterize(levels: levels) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('09a6b881-b99e-5a38-b27b-fe149806d06c',sample_owner,'Effects 13 Chromatic Aberration','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop amount = 10.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::chromatic_aberration(amount: amount, deg: $TIME_SEC * 20) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('a50261b5-7c4f-5254-8cda-c8ca41ecf6f0',sample_owner,'Effects 14 Vignette','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop amount = 0.8
prop softness = 0.7
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::vignette(amount: amount, softness: softness) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('98a4bcb6-1a0a-52ca-b1ac-e2ae36776993',sample_owner,'Effects 15 Ripple','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop wavelength = 55.0
prop amplitude = 12.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::ripple(wavelength: wavelength, amplitude: amplitude, phase: $TIME_SEC * 0.2) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('5faa032c-ff18-5049-88cf-aa5552e4a316',sample_owner,'Effects 16 Scanlines','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop spacing = 5.0
prop amount = 0.6
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::scanlines(spacing: spacing, amount: amount) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('938af31d-b5f4-5923-88e0-0812837d8228',sample_owner,'Effects 17 Bloom','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
prop threshold = 0.5
prop intensity = 2.0
prop radius = 18.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::bloom(threshold: threshold, intensity: intensity, radius: radius) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('522bb564-5b0b-582e-a3c0-38f44e1930a9',sample_owner,'Effects 18 Displace','Visript 5.2 effect validation sample',$source$// Toggle enabled to compare with the original image.
prop enabled = true
// Uses the existing Skullman bitmap. Optionally upload displacement-map.png and replace this ID.
prop amount = 40.0
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  if enabled { effect::displace(map: asset::bitmap(id: "081c271e-67d9-4a75-aff2-5a1bb88e4daa"), amount: amount) }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('8680e399-11ef-5f14-9caa-d74c890ece80',sample_owner,'Effects 19 Crystal Bloom','Visript 5.2 effect validation sample',$source$prop branches = 3
prop segments = 12
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.06))
  for i in 0..18 {
    let phase = i * 0.35 + $TIME_SEC * 0.3
    let x = $WIDTH * (0.5 + math::cos(rad: phase) * (0.1 + i * 0.019))
    let y = $HEIGHT * (0.5 + math::sin(rad: phase * 1.3) * 0.4)
    draw::circle(x: x, y: y, radius: 8 + i * 2, color: color::hsl(h: i / 18, s: 0.85, l: 0.58))
    draw::rect(x: i * $WIDTH / 18, y: $HEIGHT * 0.8, width: $WIDTH / 36, height: $HEIGHT * 0.2, color: color::hsl(h: i / 18, s: 0.8, l: 0.5))
  }
  draw::circle(x: $WIDTH * 0.65, y: $HEIGHT * 0.3, radius: $HEIGHT * 0.05, color: $COLOR_WHITE)
  effect::kaleidoscope(segments: segments, branches: branches, deg: $TIME_SEC * 6)
  effect::chromatic_aberration(amount: 3, deg: $TIME_SEC * 12)
  effect::bloom(threshold: 0.6, intensity: 1.6, radius: 10)
  effect::vignette(amount: 0.5)
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('7da1602e-fb71-5b2f-8d8b-341d7c87616f',sample_owner,'Effects 20 Orbit Mosaic 3D','Visript 5.2 effect validation sample',$source$context 3d
prop side_length = 8.0
prop gap = 1.0
render {
  draw::background(color: color::rgb(r: 0.01,g: 0.02,b: 0.04))
  camera::orbit(distance: 10,yaw_deg: $TIME_SEC * 12,pitch_deg: 20)
  light::ambient(color: color::rgb(r: 0.6,g: 0.6,b: 0.6))
  light::directional(x: 1,y: 2,z: 3,intensity: 0.8)
  for i in 0..8 {
    let angle = i * $PI / 4
    draw::cube(x: math::cos(rad: angle) * 2.5, y: math::sin(rad: angle) * 2.5,
      size: 0.85, rotation_x_deg: $TIME_SEC * 20, rotation_y_deg: i * 30,
      color: color::hsl(h: i / 8, s: 0.9, l: 0.65), shading: "lambert")
  }
  gfx::overlay(enabled: true)
  draw::text(content: "ORBIT MOSAIC",x: 24,y: 42,size: 28,color: $COLOR_WHITE)
  effect::pixelate_hexagon(side_length: side_length,gap: gap)
  effect::bloom(threshold: 0.6,intensity: 1.2,radius: 7)
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('b0d7b203-052c-5bcd-94b7-dc5240f955df',sample_owner,'Effects 21 Neon Feedback','Visript 5.2 effect validation sample',$source$render {
  effect::scramble(type: 21,refresh_color: color::rgb(a: 0.06))
  let angle = $TIME_SEC * 1.3
  for i in 0..6 {
    let phase = angle + i * $PI / 3
    draw::circle(x: $WIDTH * (0.5 + math::cos(rad: phase) * 0.3),
      y: $HEIGHT * (0.5 + math::sin(rad: phase * 1.7) * 0.3),
      radius: 8,color: color::hsl(h: i / 6,s: 0.9,l: 0.7))
  }
  effect::ripple(wavelength: 80,amplitude: 5,phase: $TIME_SEC * 0.1)
  effect::bloom(threshold: 0.3,intensity: 1.8,radius: 8)
  effect::scanlines(spacing: 4,amount: 0.15)
}
$source$,'private',false) on conflict(id) do nothing;
end;
$import$;
commit;
