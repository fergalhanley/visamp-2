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
color::rgb(red: 1.0, green: 0.5, blue: 0.0)
color::hsl(hue: 0.5, saturation: 0.8, lightness: 0.5)
```

See [Color Constructors](../drawing/color-constructors.md) for details.

## Function Calls

```
my_func(1.0, 2.0)
```

See [Functions](../programming/functions.md) for details.

## Operator Precedence

From lowest to highest:
1. `||` (or)
2. `&&` (and)
3. `==`, `!=`
4. `<`, `<=`, `>`, `>=`
5. `+`, `-`
6. `*`, `/`, `%`
7. `!`, `-` (unary)
8. `()` (grouping)
