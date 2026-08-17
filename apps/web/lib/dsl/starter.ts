/**
 * What a brand-new visualisation starts as. Kept deliberately small and
 * definitely valid, so the preview renders the instant the editor opens.
 */
export const STARTER_SOURCE = `prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: 80.0,
    color: $COLOR_TURQUOISE
  )
  draw::rect(
    x: $WIDTH / 2.0 - 40.0,
    y: $HEIGHT / 2.0 - 40.0,
    width: 80.0,
    height: 80.0,
    color: $COLOR_CRIMSON,
    rotate: angle
  )
}
`;
