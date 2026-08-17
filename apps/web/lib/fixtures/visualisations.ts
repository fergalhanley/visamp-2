import type { Artist, Visualisation } from "@/lib/types";

/**
 * Stand-in data until Supabase lands. Every `source` below is real DSL that the
 * current engine parses and renders — these are what you actually see on screen,
 * not placeholder text.
 */

const nova: Artist = {
  username: "nova",
  displayName: "Nova",
  visCount: 3,
  totalViews: 18420,
};

const kestrel: Artist = {
  username: "kestrel",
  displayName: "Kestrel",
  visCount: 2,
  totalViews: 7310,
};

export const VISUALISATIONS: Visualisation[] = [
  {
    id: "rotating-trinity",
    title: "Rotating Trinity",
    description: "Three primitives sharing one angle.",
    artist: nova,
    usesAudio: false,
    likeCount: 214,
    commentCount: 12,
    forkCount: 31,
    viewCount: 9840,
    source: `prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  draw::rect(
    x: $WIDTH / 2.0 - 90.0,
    y: $HEIGHT / 2.0 - 90.0,
    width: 180.0,
    height: 180.0,
    color: $COLOR_INDIGO,
    rotate: angle
  )
  draw::polygon(
    points: [
      [$WIDTH / 2.0, $HEIGHT / 2.0 - 150.0],
      [$WIDTH / 2.0 + 130.0, $HEIGHT / 2.0 + 80.0],
      [$WIDTH / 2.0 - 130.0, $HEIGHT / 2.0 + 80.0]
    ],
    color: $COLOR_TEAL,
    rotate: angle * -0.6
  )
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: 46.0,
    color: $COLOR_CRIMSON
  )
}
`,
  },
  {
    id: "comet-trails",
    title: "Comet Trails",
    description: "A drifting point over a barely-clearing canvas.",
    artist: nova,
    // Fixture data only — the badge needs a real signal, which waits on audio
    // bindings in the DSL. Set here so E3.6's badge is actually exercised.
    usesAudio: true,
    likeCount: 508,
    commentCount: 41,
    forkCount: 88,
    viewCount: 21200,
    source: `prop x = 120.0
prop y = 90.0
prop dx = 3.4
prop dy = 2.1

on_frame {
  x = x + dx
  y = y + dy
  if x > $WIDTH {
    x = 0.0
  }
  if y > $HEIGHT {
    y = 0.0
  }
}

layer_2d {
  draw::rect(
    x: 0,
    y: 0,
    width: $WIDTH,
    height: $HEIGHT,
    color: color::rgb(transparent: 0.93)
  )
  draw::circle(x: x, y: y, radius: 16.0, color: $COLOR_CYAN)
  draw::circle(x: x, y: y, radius: 6.0, color: $COLOR_WHITE)
}
`,
  },
  {
    id: "orbit-ring",
    title: "Orbit Ring",
    description: "Eight satellites on a shared clock.",
    artist: kestrel,
    usesAudio: false,
    likeCount: 96,
    commentCount: 4,
    forkCount: 9,
    viewCount: 3120,
    source: `prop t = 0.0

on_frame {
  t = $TIME_SEC
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  for i in [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0] {
    let a = t + i * $PI / 4.0
    let r = 190.0 + math::sin(radians: t * 2.0 + i) * 40.0
    draw::circle(
      x: $WIDTH / 2.0 + math::cos(radians: a) * r,
      y: $HEIGHT / 2.0 + math::sin(radians: a) * r,
      radius: 13.0,
      color: $COLOR_AMBER
    )
  }
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: 30.0,
    color: $COLOR_VIOLET
  )
}
`,
  },
  {
    id: "breathing-bars",
    title: "Breathing Bars",
    description: "A row of columns easing out of phase.",
    artist: kestrel,
    usesAudio: true,
    likeCount: 143,
    commentCount: 7,
    forkCount: 16,
    viewCount: 5190,
    source: `prop t = 0.0

on_frame {
  t = $TIME_SEC
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  for i in [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0] {
    let h = math::abs(value: math::sin(radians: t * 1.5 + i * 0.4)) * $HEIGHT * 0.6
    draw::rect(
      x: $WIDTH / 2.0 - 300.0 + i * 52.0,
      y: $HEIGHT / 2.0 - h / 2.0,
      width: 34.0,
      height: h,
      color: $COLOR_TURQUOISE
    )
  }
}
`,
  },
  {
    id: "cursor-bloom",
    title: "Cursor Bloom",
    description: "Follows the pointer. Move the mouse over the canvas.",
    artist: nova,
    usesAudio: false,
    likeCount: 327,
    commentCount: 22,
    forkCount: 54,
    viewCount: 12760,
    source: `prop t = 0.0

on_frame {
  t = $TIME_SEC
}

layer_2d {
  draw::rect(
    x: 0,
    y: 0,
    width: $WIDTH,
    height: $HEIGHT,
    color: color::rgb(transparent: 0.88)
  )
  for i in [1.0, 2.0, 3.0, 4.0, 5.0] {
    draw::circle(
      x: $MOUSE_X + math::cos(radians: t * 2.0 + i) * i * 26.0,
      y: $MOUSE_Y + math::sin(radians: t * 2.0 + i) * i * 26.0,
      radius: 22.0 - i * 3.0,
      color: color::hsl(hue: i / 5.0, saturation: 0.7, lightness: 0.55)
    )
  }
}
`,
  },
];

export const ARTISTS: Artist[] = [nova, kestrel];

export function findVisualisation(id: string): Visualisation | undefined {
  return VISUALISATIONS.find((v) => v.id === id);
}

export const DEFAULT_VISUALISATION = VISUALISATIONS[0]!;
