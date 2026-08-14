

prop angle = 2.0
prop x = 0.0
prop y = 0.0
prop isBlue = false

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::background(
    color: $BLACK
  )
  let points = [
    [0.0, 100.0],
    [-100.0, -100.0],
    [100.0, -100.0],
  ]
  draw::polygon (
    points: [
      [0.0, 100.0],
      [-100.0, -100.0],
      [100.0, -100.0],
    ],
    color: $RED,
    rotate: angle
  )
}
-----
prop x = 100.0
prop y = 100.0

on_frame {
  x = x + 4.0
  y = y + 1.0
  if x > 800.0 {
    x = 0.0
  }
  if y > 600.0 {
    y = 0.0
  }
}

layer_2d {

  draw::rect(
     x: 0,
     y: 0,
     width: $WIDTH,
     height: $HEIGHT,
     color: color::rgb(transparent:0.97)
  )

  draw::circle(x: x, y: y, radius: 10.0, color: $COLOR_GREEN)
}

----
prop custom_prop_points = 32


layer_2d {

  draw::rect(
     x: 0,
     y: 0,
     width: $WIDTH,
     height: $HEIGHT,
     color: color::rgb( transparent:0.997 )
  )

  let theta = $TIME_MS % $PI * 2
  let ocil = math::sin( radians: $TIME_MS ) * 10
  let max = math::abs( value: custom_prop_points * ocil )

}

