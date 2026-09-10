use std::cell::RefCell;
use visamp_2::{
    interpreter::{interpret_render_block, Runtime, Target},
    model::{BlockType, Model},
    parser::build_ast,
    scramble::{self, Scramble, PRESETS},
};

#[test]
fn documented_examples_compile() {
    let docs = include_str!("../../../apps/docs/src/effects/scramble.md");
    for example in docs.split("```vdsl\n").skip(1) {
        let code = example.split("```").next().unwrap();
        let code = if code.starts_with("effect::") {
            format!("render {{\n{code}\n}}\n")
        } else {
            code.to_string()
        };
        build_ast(&code).unwrap_or_else(|e| panic!("documented example: {e}"));
    }
}

fn evaluate(context: &str, body: &str) -> Result<Option<Scramble>, String> {
    let script = build_ast(&format!("context {context}\nrender {{\n{body}\n}}\n"))?;
    let mut model = Model::from_script(&script);
    let effect = RefCell::new(None);
    for block in model
        .blocks
        .iter()
        .filter(|b| b.block_type == BlockType::Render)
    {
        interpret_render_block(
            block,
            &mut model.decels,
            Target {
                scramble: Some(&effect),
                ..Target::none()
            },
            &Runtime::new(),
            &model.functions,
        )?;
    }
    Ok(effect.into_inner())
}

#[test]
fn shared_defaults_colours_and_last_call_wins() {
    for context in ["2d", "3d"] {
        assert_eq!(
            evaluate(context, "effect::scramble()").unwrap(),
            Some(Scramble::default())
        );
        for kind in 1..=40 {
            let effect = evaluate(context, &format!("effect::scramble()\neffect::scramble(type: {kind}, refresh_color: color::rgb(b: 0.2, transparent: 0.93))")).unwrap().unwrap();
            assert_eq!(effect.kind, kind);
            assert!((effect.refresh.a - 0.07).abs() < 1e-12);
            assert_eq!(effect.refresh.b, 0.2);
        }
    }
}

#[test]
fn bad_types_colours_and_argument_names_fail() {
    for kind in ["0", "41", "-1", "1.0", "1.5", "true", "\"1\""] {
        assert!(evaluate("2d", &format!("effect::scramble(type: {kind})"))
            .unwrap_err()
            .contains("integer from 1 to 40"));
    }
    assert!(evaluate("3d", "effect::scramble(refresh_color: 2)").is_err());
    assert!(evaluate("2d", "effect::scramble(typo: 1)")
        .unwrap_err()
        .contains("unknown argument"));
    assert!(evaluate("2d", "effect::scrambl()")
        .unwrap_err()
        .contains("unknown builtin"));
}

#[test]
fn backend_detection_handles_nested_and_function_calls() {
    let script =
        build_ast("fn trail() {\n if true {\n effect::scramble()\n }\n}\nrender {\n trail()\n}\n")
            .unwrap();
    assert!(scramble::uses_scramble(&script));
    let script = build_ast("// effect::scramble()\nrender {\n draw::clear()\n}\n").unwrap();
    assert!(!scramble::uses_scramble(&script));
}

#[test]
fn fade_duration_is_independent_of_refresh_rate() {
    for fps in [30, 60, 120, 144] {
        let mut remainder = 0.0;
        let ticks: u32 = (0..fps)
            .map(|_| scramble::refresh_steps(&mut remainder, 1.0 / fps as f64))
            .sum();
        assert_eq!(ticks, 60);
        assert!(remainder < 1e-6);
    }
    let mut remainder = 0.0;
    assert_eq!(scramble::refresh_steps(&mut remainder, 1.0 / 120.0), 0);
    assert_eq!(scramble::refresh_steps(&mut remainder, 1.0 / 120.0), 1);
    assert_eq!(scramble::refresh_steps(&mut remainder, 600.0), 256);
}

#[test]
fn dependency_maps_match_sequential_byte_writes_including_tiny_canvases() {
    for width in [1, 2, 6, 8, 24, 25, 26, 27, 128] {
        for height in [1, 3, 25, 40] {
            let original: Vec<u8> = (0..width * height * 4)
                .map(|i| ((i * 113 + i / 4 * 3) % 256) as u8)
                .collect();
            for kind in 1..=17 {
                let p = PRESETS[kind as usize - 1];
                let w = width as i32 * 4 - 4;
                let end = original.len() as i32 - width as i32 * 4 * p[4];
                let mut expected = original.clone();
                for i in (w..end).step_by(4) {
                    for c in 0..4 {
                        let address = i + w + p[c];
                        expected[i as usize + c] =
                            expected.get(address as usize).copied().unwrap_or(0);
                    }
                }
                let map = scramble::narrow_source_map(width, height, kind);
                let actual: Vec<u8> = map
                    .iter()
                    .map(|&i| original.get(i as usize).copied().unwrap_or(0))
                    .collect();
                assert_eq!(actual, expected, "{width}x{height}, type {kind}");
                if width >= 27 {
                    let mut independent = original.clone();
                    for i in (w..end).step_by(4) {
                        for c in 0..4 {
                            independent[i as usize + c] =
                                original.get((i + w + p[c]) as usize).copied().unwrap_or(0);
                        }
                    }
                    assert_eq!(independent, expected, "independent sampling threshold");
                }
            }
        }
    }
}
