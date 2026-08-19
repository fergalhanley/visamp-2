# Expressions

Expressions compute values. Visamp supports a full expression system with arithmetic, comparison, boolean logic, arrays, and function calls.

## Literals

```
42          // Integer
3.14        // Float
"hello"     // String
true        // Boolean
false       // Boolean
```

## Arithmetic

```
1 + 2       // 3
10 - 3      // 7
4 * 5       // 20
10 / 3      // 3.333... (division is always float)
10.0 / 3.0  // 3.333...
10 \ 3      // 3 (integer division)
10 % 3      // 1 (modulus keeps integers)
```

Mixed types are promoted to float:
```
1 + 2.5     // 3.5 (integer promoted to float)
```

### Division always gives a float

`+`, `-` and `*` keep two integers as an integer, but **`/` always produces a
float** — `1 / 2` is `0.5`, not `0`.

This matters because a lot of what you divide is an integer without looking
like one. `$TIME_MS`, `$FRAME_COUNT` and every value in `$FREQUENCY_DATA` and
`$TIME_DOMAIN_DATA` are integers, so under truncating division something like

```
on_frame {
  // Would step 0, 1, 2, 3 … one whole radian every 5 seconds
  angle = math::sin(radians: $TIME_MS / 5000)
}
```

would snap between whole values instead of moving smoothly.

`%` is left alone, because integer modulus is usually what you want:

```
on_frame {
  if $FRAME_COUNT % 60 == 0 {
    flash = true
  }
}
```

### Integer division with `\`

When you want a whole number, use `\`. It divides and throws away the
fraction, always giving an integer:

```
let columns = $WIDTH \ 100     // how many 100px columns fit
let bucket  = i \ 8            // group an index into eights
```

It accepts floats as well as integers — `$WIDTH` and `$HEIGHT` are floats, and
requiring a conversion first would defeat the point:

```
7.5 \ 2     // 3
```

`\` truncates **toward zero**, so `-7 \ 2` is `-3`. If you want it to round
down instead, use `math::floor`:

```
math::floor(value: -7 / 2)    // -4
```

Dividing by zero is an error, the same as with `/`.

## Comparison

```
1 == 1      // true
1 != 2      // true
3 < 5       // true
5 > 3       // true
3 <= 3      // true
5 >= 4      // true
```

## Boolean Logic

```
true && false   // false
true || false   // true
!true           // false
```

`&&` and `||` **short-circuit**: if the left side settles the answer, the right
side is never worked out at all. That is what lets one side guard the other:

```
on_frame {
  // The division only happens when n is non-zero
  if n != 0 && total \ n > 5 {
    flash = true
  }
}
```

Both sides must be booleans. `1 && true` is an error rather than treating
non-zero as true — a number is not a truth value here.

## Bitwise Operators

`&`, `|` and `^` work on the bits of whole numbers:

```
6 & 3       // 2   — bits set in both
6 | 3       // 7   — bits set in either
6 ^ 3       // 5   — bits set in exactly one
```

They are useful for packing several on/off flags into one property, or for
cycling through a power-of-two range:

```
prop flags = 0

on_frame {
  flags = flags | 4          // turn a flag on
  if (flags & 4) > 0 {       // test it — note the parentheses
    pulse = 1.0
  }
}
```

Whole numbers only. `6.5 & 3` is an error rather than a silent truncation,
since a bit pattern is not a meaningful notion for a float — use `\` or
`math::floor` first if you have a fraction.

Note that `&` is a different operator from `&&`, and `|` from `||`. The
doubled forms are the boolean ones.

## String Operations

```
"hello" + " " + "world"   // "hello world"
```

## Arrays

```
[1, 2, 3]
[[100.0, 200.0], [300.0, 400.0]]
```

### Indexing

Read a single element with `[...]`, counting from zero:

```
let first = $FREQUENCY_DATA[0]
let bass  = $FREQUENCY_DATA[4]
```

The index can be any whole-number expression, and indexing chains:

```
let v = $FREQUENCY_DATA[i * 2]
let y = points[1][0]
```

**Reading past the end gives 0** rather than failing. That is deliberate: the
audio arrays are empty whenever nothing is playing, so an error would break
every audio-reactive script the moment it fell silent. A negative index also
reads as 0.

The index must be a whole number — use `\` or `math::floor` if you have a
fraction:

```
let v = $FREQUENCY_DATA[$WIDTH \ 40]
```

## Grouping

Use parentheses to control precedence:

```
(1 + 2) * 3    // 9
1 + (2 * 3)    // 7
```

## Color Constructors

```
color::rgb(r: 1.0, g: 0.5, b: 0.0)
color::hsl(h: 0.5, s: 0.8, l: 0.5)
```

See [Color Constructors](../drawing/color-constructors.md) for details.

## Function Calls

```
my_func(1.0, 2.0)
```

See [Functions](../programming/functions.md) for details.

## Operator Precedence

From lowest to highest. This follows C, which is what most languages use:

1. `||` (logical or)
2. `&&` (logical and)
3. `|` (bitwise or)
4. `^` (bitwise xor)
5. `&` (bitwise and)
6. `==`, `!=`
7. `<`, `<=`, `>`, `>=`
8. `+`, `-`
9. `*`, `/`, `\`, `%`
10. `!`, `-` (unary)
11. `[...]` (indexing)
12. `()` (grouping)

One consequence is worth knowing, because it surprises people in every language
that inherits it: **the bitwise operators bind more loosely than `==`**. So

```
flags & 4 == 4
```

groups as `flags & (4 == 4)`, which is a type error rather than the test you
meant. Parenthesise when you mix them:

```
(flags & 4) == 4
```

Assignment is a statement, not an operator, so it does not appear here. See
[Variables & Assignment](./variables.md) for `=`, the compound forms and `++`.
