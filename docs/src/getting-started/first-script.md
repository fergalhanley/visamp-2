# Your First Script

Let's walk through creating a simple animated scene.

## Step 1: Background

Every scene starts with a background:

```
layer_2d {
  draw::background(color: $COLOR_NAVY)
}
```

## Step 2: Add a Shape

Let's add a circle:

```
layer_2d {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_GOLD)
}
```

## Step 3: Animate It

To animate, we use `prop` for state and `on_frame` to update it:

```
prop y = 100.0

on_frame {
  y = y + 2.0
}

layer_2d {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: 400.0, y: y, radius: 50.0, color: $COLOR_GOLD)
}
```

The circle falls down the screen! But it goes off the edge. Let's use a system value:

```
prop y = 100.0

on_frame {
  y = y + 2.0
  if y > $HEIGHT {
    y = 0.0
  }
}

layer_2d {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: 400.0, y: y, radius: 50.0, color: $COLOR_GOLD)
}
```

## Step 4: Add Rotation

Let's add a rotating rectangle:

```
prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  draw::rect(
    x: 350.0, y: 250.0,
    width: 100.0, height: 100.0,
    color: $COLOR_CORAL,
    rotate: angle
  )
}
```

## Next Steps

- Read about [Drawing Primitives](../drawing/primitives.md)
- Explore [Colors](../drawing/colors.md)
- Learn about [Control Flow](../programming/control-flow.md)
