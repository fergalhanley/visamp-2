# Your First Script

Let's walk through creating a simple animated scene.

## Step 1: Background

Every scene starts with a background:

```visript
render {
  draw::background(color: $COLOR_NAVY)
}
```

## Step 2: Add a Shape

Let's add a circle:

```visript
render {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: $WIDTH / 2, y: 300.0, radius: 50.0, color: $COLOR_GOLD)
}
```

## Step 3: Animate It

To animate, we use `prop` for state and `on_frame` to update it:

```visript
prop y = 100.0

on_frame {
  y = y + 120.0 * $DELTA_SEC
}

render {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: $WIDTH / 2, y: y, radius: 50.0, color: $COLOR_GOLD)
}
```

The circle falls at 120 pixels per second, using `$DELTA_SEC` to account for frame time. But it goes off the edge. Let's use a system value:

```visript
prop y = 100.0

on_frame {
  y = y + 120.0 * $DELTA_SEC
  if y > $HEIGHT {
    y = 0.0
  }
}

render {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: $WIDTH / 2, y: y, radius: 50.0, color: $COLOR_GOLD)
}
```

## Step 4: Add Rotation

Let's add a rotating rectangle:

```visript
prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

render {
  draw::background(color: $COLOR_BLACK)
  draw::rect(
    x: 350.0, y: 250.0,
    width: 100.0, height: 100.0,
    color: $COLOR_CORAL,
    rotation_rad: angle
  )
}
```

## Next Steps

- Read about [Drawing Primitives](../drawing/primitives.md)
- Explore [Colors](../drawing/colors.md)
- Learn about [Control Flow](../programming/control-flow.md)
