# Comments

Anything after `//` on a line is ignored.

```
// A note to yourself
prop angle = 0.0   // and one at the end of a line

on_frame {
  // Explain the tricky bit
  angle = $TIME_SEC
}
```

Comments can go anywhere whitespace can — between arguments, inside a block,
on their own line, or at the very end of a file.

```
render {
  draw::circle(
    x: $WIDTH / 2.0,     // centre
    y: $HEIGHT / 2.0,
    radius: $HEIGHT / 8.0,
    color: $COLOR_TURQUOISE
  )
}
```

There is no block comment form — `//` to the end of the line is the only kind.

## `//` and division

Two slashes always start a comment. Division is a single `/`, and integer
division is `\` — neither collides with a comment:

```
let a = 10 / 4    // 2.5
let b = 10 \ 4    // 2, integer division
let c = 10        // everything after // is a comment
```

Inside a string, `//` is just text:

```
render {
  draw::text(
    content: "https://visamp.io",
    x: 20.0,
    y: 40.0,
    size: 16.0,
    color: $COLOR_WHITE
  )
}
```
