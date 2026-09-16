-- VIS-112: private drawing and time samples for Visript 5.1+.
-- Set sample_owner below. Re-running skips existing IDs; edited scripts are preserved.
begin;
do $import$
declare sample_owner uuid := auth.uid();
begin
if sample_owner is null or not exists(select 1 from public.profiles where id=sample_owner) then raise exception 'Set sample_owner to your profile UUID'; end if;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('eea0f920-0126-59fc-9e72-7a1f9b490cd2',sample_owner,'Drawing test 01 Calendar Clock','Visript 5.1 live validation sample',$source$// Local clock rings: hour, minute, weekday and month. Frame pulse resets on load.
prop phase = 0.0
on_frame { phase = math::wrap(value: phase + $DELTA_SEC * 30, min: 0, max: 360) }
render {
  draw::background(color: color::rgb(r: 0.015, g: 0.025, b: 0.055))
  let unit = $HEIGHT / 10
  transform::translate(x: $WIDTH / 2, y: $HEIGHT / 2)
  for i in 0..4 {
    let values = [$TIME_HOUR / 24, $TIME_MINUTE / 60, $TIME_DAY / 7, $TIME_MONTH / 12]
    draw::arc(radius: unit * (1 + i * 0.6), start_deg: -90, sweep_deg: 359.9,
      stroke_width: unit * 0.14, color: color::rgb(r: 0.07, g: 0.10, b: 0.16))
    if values[i] > 0 {
      draw::arc(radius: unit * (1 + i * 0.6), start_deg: -90, sweep_deg: values[i] * 360,
        stroke_width: unit * 0.14, line_cap: "round", color: color::hsl(h: i * 0.18, s: 0.8, l: 0.65))
    }
  }
  draw::circle(radius: unit * (0.22 + ($FRAME_INDEX % 60) / 300), color: $COLOR_CORAL)
  transform::rotate_z(deg: phase)
  draw::rect(x: -unit * 0.7, y: -unit * 0.7, width: unit * 1.4, height: unit * 1.4,
    corner_radius: unit * 0.2, stroke: true, stroke_width: 2, stroke_color: $COLOR_WHITE)
  transform::identity()
  draw::text(content: "LOCAL HOUR / MINUTE / WEEKDAY / MONTH", x: 24, y: 36, size: 18, color: $COLOR_WHITE)
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('66a26e82-f1b4-5c5d-a085-aa3c825064d8',sample_owner,'Drawing test 02 Transform Mandala','Visript 5.1 live validation sample',$source$render {
  draw::background(color: color::rgb(r: 0.01, g: 0.01, b: 0.03))
  transform::translate(x: $WIDTH / 2, y: $HEIGHT / 2)
  gfx::blend(mode: "additive")
  for i in 0..24 {
    transform::push()
    transform::rotate_z(deg: i * 15 + $TIME_SEC * 10)
    let radius = $HEIGHT * (0.13 + math::noise(x: i * 0.2, y: $TIME_SEC * 0.2, seed: 7) * 0.15)
    draw::rect(x: radius, y: -$HEIGHT * 0.05, width: $HEIGHT * 0.16, height: $HEIGHT * 0.1,
      corner_radius: $HEIGHT * 0.04, color: color::hsl(h: i / 24, s: 0.75, l: 0.5, a: 0.4))
    transform::pop()
  }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('9f21493a-fe7a-5c7c-95c6-234e7fd3bca1',sample_owner,'Drawing test 03 Connected Waveform','Visript 5.1 live validation sample',$source$prop points = []
on_init { points = array::filled(count: 128, value: [0.0, 0.0]) }
on_frame {
  let wave = audio::detect::get_waveform()
  for i in 0..128 {
    let index = (i * array::length(value: wave)) \ 128
    points[i][0] = math::map(value: i, input_min: 0, input_max: 127, output_min: $WIDTH * 0.05, output_max: $WIDTH * 0.95)
    points[i][1] = $HEIGHT / 2 + wave[index] * $HEIGHT * 0.35 + math::sin(rad: i * 0.1 + $TIME_SEC) * $HEIGHT * 0.04
  }
}
render {
  draw::background(color: color::rgb(r: 0.025, g: 0.02, b: 0.06))
  draw::polyline(points: points, stroke_width: 4, line_join: "round", color: $COLOR_TURQUOISE)
  draw::bezier(points: [[$WIDTH * 0.1,$HEIGHT * 0.8],[$WIDTH * 0.3,$HEIGHT * 0.1],[$WIDTH * 0.7,$HEIGHT * 0.9],[$WIDTH * 0.9,$HEIGHT * 0.2]],
    stroke_width: 2, color: color::mix(a: $COLOR_CORAL, b: $COLOR_VIOLET, amount: math::noise(x: $TIME_SEC * 0.2)))
}
$source$,'private',true) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('7c1a0893-1bc9-5f73-9706-f53f81f2846f',sample_owner,'Drawing test 04 Image Halo','Visript 5.1 live validation sample',$source$// Uses the sprite asset supplied for Skullman; its permissions must allow viewing.
render {
  draw::background(color: $COLOR_BLACK)
  let radius = $HEIGHT * 0.45
  let glow = color::radial_gradient(x: $WIDTH / 2, y: $HEIGHT / 2, radius: radius,
    color_stops: [[0, $COLOR_VIOLET], [0.4, color::rgb(r: 0.1, g: 0.04, b: 0.2)], [1, $COLOR_BLACK]])
  draw::circle(x: $WIDTH / 2, y: $HEIGHT / 2, radius: radius, gradient: glow)
  transform::translate(x: $WIDTH / 2, y: $HEIGHT / 2)
  transform::rotate_z(deg: $TIME_SEC * 12)
  for i in 0..12 {
    transform::push()
    transform::rotate_z(deg: i * 30)
    draw::image(asset: asset::bitmap(id: "081c271e-67d9-4a75-aff2-5a1bb88e4daa"),
      x: radius * 0.5, y: -radius * 0.1, width: radius * 0.2, height: radius * 0.2, opacity: 0.8)
    transform::pop()
  }
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('62a7c28a-4741-5c36-b842-3f5aa632679b',sample_owner,'Drawing test 05 World Ribbons','Visript 5.1 live validation sample',$source$context 3d
prop points = []
on_init { points = array::filled(count: 96, value: [0.0,0.0,0.0]) }
on_frame {
  for i in 0..96 {
    let angle = i * 0.18 + $TIME_SEC * 0.2
    points[i][0] = math::cos(rad: angle) * 2
    points[i][1] = (i / 95 - 0.5) * 5
    points[i][2] = math::sin(rad: angle) * 2
  }
}
render {
  draw::background(color: color::rgb(r: 0.015,g: 0.025,b: 0.05))
  camera::orbit(distance: 10, yaw_deg: $TIME_SEC * 8, pitch_deg: 15)
  draw::polyline(points: points, stroke_width: 0.07, line_join: "round", line_cap: "round", color: $COLOR_TURQUOISE)
  draw::rect(x: -0.6,y: -0.6,width: 1.2,height: 1.2,corner_radius: 0.2,color: $COLOR_CORAL,rotation_y_deg: $TIME_SEC * 30)
  gfx::overlay(enabled: true)
  draw::text(content: "WORLD RIBBON / SCREEN OVERLAY",x: 24,y: 38,size: 20,color: $COLOR_WHITE)
  draw::arc(x: $WIDTH - 55,y: 55,radius: 25,sweep_deg: ($FRAME_INDEX % 360),stroke_width: 4,color: $COLOR_CORAL)
}
$source$,'private',false) on conflict(id) do nothing;

insert into public.visualisations (id,owner_id,title,description,source,visibility,uses_audio) values ('0df6a1f2-5ddd-5756-9d52-c7cd5fba9aae',sample_owner,'Drawing test 06 Seeded Fields','Visript 5.1 live validation sample',$source$context 3d
render {
  draw::background(color: color::rgb(r: 0.01,g: 0.015,b: 0.04))
  camera::orbit(distance: 12,yaw_deg: $TIME_SEC * 4,pitch_deg: 30)
  draw::grid(columns: 64,rows: 64,
    x: ($GRID_COLUMN / 63 - 0.5) * 10,
    z: ($GRID_ROW / 63 - 0.5) * 10,
    y: math::noise(x: $GRID_COLUMN * 0.08,y: $GRID_ROW * 0.08,z: $TIME_SEC * 0.15,seed: 42) * 2 - 1,
    color: color::mix(a: $COLOR_NAVY,b: $COLOR_TURQUOISE,amount: math::noise(x: $GRID_COLUMN * 0.08,y: $GRID_ROW * 0.08,z: $TIME_SEC * 0.15,seed: 42)))
  draw::point_cloud(count: 512,
    x: math::random(seed: 1,index: $POINT_INDEX) * 10 - 5,
    y: 2 + math::random(seed: 2,index: $POINT_INDEX) * 3,
    z: math::random(seed: 3,index: $POINT_INDEX) * 10 - 5,
    size: 2,color: $COLOR_CORAL)
}
$source$,'private',false) on conflict(id) do nothing;

end
$import$;
commit;
