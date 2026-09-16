# Input detection

Visript 5.0 separates persistent **state** from the **event** being handled.
Getters are expressions and all arguments are named. Input needs an interactive
host: the editor preview and main player enable it; decorative previews do not.
Click or Tab into the canvas to focus it. Escape or Tab out to release control.

## Pointer

Mouse, touch and pen use one active pointer. Multitouch and pressure are deferred.

| Expression | Result |
|---|---|
| `input::pointer::state::get_x()` / `get_y()` | Float, canvas layout pixels |
| `input::pointer::state::is_inside()` | Boolean |
| `input::pointer::state::is_button_down(button: "primary")` | Boolean |
| `input::pointer::event::get_x()` / `get_y()` | Float, coordinates of this event |
| `input::pointer::event::get_button()` | String, button whose state changed |

Buttons: `"primary"`, `"secondary"`, `"auxiliary"`, `"back"`, `"forward"`.
Primary is the user's main button/contact, independent of handedness.

Handlers: `on_input_pointer_move`, `on_input_pointer_down`,
`on_input_pointer_up`, `on_input_pointer_cancel`, `on_input_pointer_click`,
`on_input_pointer_enter`, `on_input_pointer_leave`.

Coordinates share `$WIDTH`/`$HEIGHT` units: origin top-left, positive right/down,
including in `context 3d` (convert to world coordinates explicitly).
Dragging captures the pointer: coordinates may go negative or beyond the canvas,
and releasing outside still sends `up`. A click is a completed primary press and
release inside, moving at most 5 CSS pixels throughout; a drag/cancel is not a click.
`get_button()` is valid only in down, up and click handlers. Coordinates are
available in all pointer handlers. Cancellation has no individual changed button.

```
prop x = 0.0
prop y = 0.0
on_input_pointer_move {
  if input::pointer::state::is_button_down(button: "primary") {
    x = input::pointer::event::get_x()
    y = input::pointer::event::get_y()
  }
}
render { draw::circle(x: x, y: y, radius: 30, color: $COLOR_CORAL) }
```

## Keyboard

| Expression | Result |
|---|---|
| `input::keyboard::state::is_key_down(key: "Shift")` | Boolean, semantic key |
| `input::keyboard::state::is_code_down(code: "KeyW")` | Boolean, physical key |
| `input::keyboard::event::get_key()` | String |
| `input::keyboard::event::get_code()` | String |
| `input::keyboard::event::is_repeat()` | Boolean, native repeated keydown |

Handlers: `on_input_key_down`, `on_input_key_up`.
Use browser key/code spelling: `"a"`, `"A"`, `"Shift"`, `"Enter"`, `" "`;
physical codes `"KeyW"`, `"ShiftLeft"`, `"ArrowUp"`. Key names are case sensitive;
codes are best for movement. Releasing a key clears its physical entry even if
Shift changed its text in the meantime. Modifier key queries aggregate left/right
and use modifier flags from the latest event. Before any input all keys are up.

Keyboard input reaches only the focused canvas, never the editor or text fields.
Escape releases focus, Tab navigates, function keys and Control/Meta/Alt shortcuts
remain with the browser. IME composition is excluded. Space/arrows/navigation keys
prevent page scrolling when keyboard interaction is active. These are controls,
not a text-entry API. OS-reserved combinations may never reach the page.

## Scroll

`on_input_scroll` reads `input::scroll::event::get_delta_x()` and `get_delta_y()`.
Positive means right/down. Values are CSS pixels: line-mode deltas multiply by 16;
page-mode deltas multiply by canvas width/height. These are event deltas, not held
state. The focused canvas consumes wheel events only if the script uses scroll.
Control/Meta wheel remains a browser zoom gesture.

## Ordering and lifetime

1. Browser transitions queue until the next rendered frame.
2. Each event updates state, then its handlers execute in source order.
3. `on_frame` runs, then `render`, both seeing the same latest input state.

Quick down/up transitions between frames both run. Adjacent pointer moves with
identical buttons/modifiers/inside state coalesce to the latest position. This API
is for visual interaction, not lossless pen-stroke recording. Each frame has the
existing shared execution budget. After a handler error remaining state transitions
are still applied, but further handlers in that batch are skipped.

The queue holds at most 256 events. Overflow reports an error and cancels interaction.
Up to 128 physical keys can be held. Blur, hidden documents, lost pointer capture,
and teardown cancel the pointer and release held keys; cancel handlers can clear
drag properties. Cancellation events are delivered on the next rendered frame.
Successful script activation starts neutral state and discards old queued input.
`on_init` consequently sees zero coordinates, outside, and no held keys/buttons.

State getters work throughout the script, including frame-constant GPU point fields.
Event getters work only during a matching handler, including helper functions it
calls. Direct misuse is a compile error; indirect misuse reports a located runtime
error. Drawing/graphics calls in input handlers are rejected. Store event values
in properties if later rendering needs them. Thumbnail capture reads the current
state snapshot and never dispatches or replays queued input.

## Host policy

`VisampCanvas interactive` opts a host into input. The compiler identifies actual
input syntax, ignoring strings/comments. Scripts without input keep existing player
click/fullscreen behavior. Interactive scripts consume canvas clicks (focus), and
pointer scripts suppress its context menu and touch gestures; controls outside the
canvas remain available. Every listener is detached when the script/host changes.
The WASM host API is `input_capabilities(source)` (pointer=1, keyboard=2, scroll=4),
`queue_input(json)` and `clear_input()`. Packets are validated, bounded and contain
no browser object references. Future channels are tracked in VIS-110.
