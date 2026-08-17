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
10 / 3      // 3 (integer division)
10.0 / 3.0  // 3.333... (float division)
10 % 3      // 1 (modulus)
```

Mixed types are promoted to float:
```
1 + 2.5     // 3.5 (integer promoted to float)
```

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
