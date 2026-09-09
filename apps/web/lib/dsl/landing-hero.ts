/**
 * The script the landing hero renders.
 *
 * Hardcoded rather than fetched: the hero is the first thing painted, and it
 * must not wait on a request, a session, or a row that could be edited or made
 * private out from under the front page.
 *
 * It runs with no audio. The script reads `$FREQUENCY_DATA` but never uses the
 * value, so silence renders exactly what sound would — worth knowing before
 * swapping in a script where that is not true, which would show a still frame.
 *
 * Taken from the "Visamp logo" visualisation. To change what the hero shows,
 * replace this string; nothing else needs touching.
 */
export const LANDING_HERO_SOURCE = `prop hue = 0.0
prop size = 0.0
prop zoom = 1.0

on_frame {
  let a = math::sin( radians: $TIME_MS / 5500 )
  let b = math::sin( radians: $TIME_MS / 7000 )
  zoom = ((b + a) + 8.0) / 24
}
 on_init {
  size = math::min( a: $WIDTH, b: $HEIGHT )
}

on_resize {
  size = math::min( a: $WIDTH, b: $HEIGHT )
}

render {

  effect::filter::contrast( amount: 3.0 )
  
  draw::rect(x: 0, y: 0, width: $WIDTH, height: $HEIGHT, color: color::rgb())
  
  let EDGES = [
    [-0.5, -0.5,  0.0,  0.5],
    [ 0.0,  0.5,  0.5, -0.5],
    [-0.5,  0.5,  0.0, -0.5],
    [ 0.0, -0.5,  0.5,  0.5],
  ]

  let r = size / 2

  let xoff = $WIDTH / 2
  let yoff = $HEIGHT / 2

  for i in 0..4 {
    let edge = EDGES[i]

    for i in 0..1024 step 32 {

      let o = $FREQUENCY_DATA[i] / 256

      let x1 = 2 * zoom * (edge[0] / 1024 * i) * r + xoff
      let y1 = 2 * zoom * (edge[1] / 1024 * i ) * r + yoff
      let x2 = 2 * zoom * (edge[2] / 1024 * i) * r + xoff
      let y2 = 2 * zoom * (edge[3] / 1024 * i) * r + yoff

      draw::line(
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        color: color::hsl( h: y2, s: 1.0, l: 0.5 ),
        stroke_weight: 2.0
      )
    }
  }
}
`;
