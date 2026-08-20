//! Measures the engine's per-frame cost the way the frame loop drives it.
//!
//! Runs natively: `on_frame` needs no canvas, so the interpreter's hot paths —
//! expression evaluation, scope handling, system-value materialisation — are
//! all reachable without a browser.

use std::time::Instant;

use visamp_2::interpreter::{interpret_event_block, Runtime};
use visamp_2::model::{BlockType, Model};
use visamp_2::parser::build_ast;

/// Shaped like a spectrum visualiser: reads the audio arrays and loops.
const AUDIO_SCRIPT: &str = r#"
prop total = 0.0
prop peak = 0.0

on_frame {
  total = 0.0
  peak = 0.0
  for i in 0..256 {
    let v = $FREQUENCY_DATA[i * 4]
    total = total + v
    if v > peak {
      peak = v
    }
  }
}
"#;

/// A script with a lot of statements, to expose per-frame AST copying.
fn wide_script() -> String {
    let mut s = String::from("prop a = 0.0\n\non_frame {\n");
    for i in 0..200 {
        s.push_str(&format!("  a = a + {i}.0\n"));
    }
    s.push_str("}\n");
    s
}

/// Times one repeat of `frames` frames.
fn once(source: &str, frames: u32) -> f64 {
    let script = build_ast(source).expect("parse");
    let mut model = Model::from_script(&script);

    let mut runtime = Runtime::new();
    runtime.time_domain = std::rc::Rc::new((0..2048).map(|i| (i % 256) as u8).collect());
    runtime.frequency = std::rc::Rc::new((0..1024).map(|i| (i % 256) as u8).collect());

    let start = Instant::now();
    for _ in 0..frames {
        // Mirrors the frame loop in lib.rs, which borrows the AST apart rather
        // than cloning it.
        let Model {
            blocks,
            functions,
            decels,
            ..
        } = &mut model;

        for block in blocks.iter().filter(|b| b.block_type == BlockType::OnFrame) {
            interpret_event_block(block, decels, &runtime, functions).unwrap();
        }
    }
    start.elapsed().as_secs_f64() * 1000.0 / frames as f64
}

/// Reports the best of several repeats.
///
/// This machine drifts enough that a single run varies by 2x, and a mean just
/// averages in whatever else was competing for the CPU. The minimum is the
/// closest thing to the cost with nothing in the way.
fn bench(name: &str, source: &str, frames: u32) {
    once(source, frames / 4); // warm up
    let best = (0..7)
        .map(|_| once(source, frames))
        .fold(f64::INFINITY, f64::min);
    println!("{name:22}  {best:7.3} ms/frame");
}

/// The published "Epicycloid Alpha", with the two `draw::line` calls replaced
/// by assignments so the same expressions are still evaluated.
///
/// Isolates interpreter throughput from canvas cost: everything the script
/// computes is here, none of what it paints.
const EPICYCLOID_MATHS: &str = r#"
prop custom_prop_points = 32
prop line_width = 1
prop zoom = 0.5
prop sink = 0.0
// Pinned rather than derived from sin(time): at t=0 the real script's `ocil`
// is 0, which makes `max` 0 and skips the loop entirely. 10 is its peak, so
// this measures the worst frame — the one that decides whether it stutters.
prop ocil = 10.0

on_frame {
  let cx = $WIDTH / 2
  let cy = $HEIGHT / 2
  let deg = 2 * $PI / custom_prop_points
  let t = $TIME_MS * 0.0001
  let theta = t % $PI * 2
  let max = math::abs( value: custom_prop_points * ocil )
  let r = math::min( a: $WIDTH, b: $HEIGHT )

  let i = 0
  while i < max {
    let x1 = r * zoom * math::cos( radians: deg * i + theta ) + cx
    let y1 = r * zoom * math::sin( radians: deg * i + theta) + cy
    let x2 = r * zoom * math::cos( radians: deg / ocil * i + theta) + cx
    let y2 = r * zoom * math::sin( radians: deg / ocil * i + theta) + cy

    sink = sink + x1 + y1 + x2 + y2 + line_width * zoom + y1 / $HEIGHT + x1 / $WIDTH + i / max

    x2 = cx + (r * zoom * 4 * math::cos( radians: deg * i))
    y2 = cy + (r * zoom * 4 * math::sin( radians: deg * i))
    sink = sink + x2 + y2 + y1 / $HEIGHT + x1 / $WIDTH + i / max

    i = i + 1
  }
}
"#;

/// 300 iterations declaring four locals each — the shape of the epicycloid's
/// inner loop.
const WITH_LETS: &str = r#"
prop sink = 0.0
on_frame {
  let i = 0
  while i < 300 {
    let a = i * 2
    let b = i * 3
    let c = i * 4
    let d = i * 5
    sink = sink + a + b + c + d
    i = i + 1
  }
}
"#;

/// The same arithmetic with no `let` at all, so the difference is the cost of
/// declaring and scoping.
const WITHOUT_LETS: &str = r#"
prop sink = 0.0
prop a = 0
prop b = 0
prop c = 0
prop d = 0
on_frame {
  let i = 0
  while i < 300 {
    a = i * 2
    b = i * 3
    c = i * 4
    d = i * 5
    sink = sink + a + b + c + d
    i = i + 1
  }
}
"#;

fn main() {
    bench("epicycloid maths", EPICYCLOID_MATHS, 120);
    bench("loop with lets", WITH_LETS, 120);
    bench("loop without lets", WITHOUT_LETS, 120);
    bench("audio-reactive", AUDIO_SCRIPT, 300);
    bench("many statements", &wide_script(), 300);
}
