use visamp_2::{
    frame_clock::{Calendar, FrameClock},
    interpreter::{interpret_event_block, Runtime},
    model::{Model, Value},
    oscillator::evaluate,
    parser::build_ast,
};
fn args(values: &[(&str, f64)]) -> Vec<(String, Value)> {
    values
        .iter()
        .map(|(k, v)| (k.to_string(), Value::Float(*v)))
        .collect()
}
fn near(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-12, "{a} != {b}");
}
#[test]
fn reference_samples_and_defaults() {
    let a = args(&[("min", -1.0), ("max", 1.0), ("period", 5.0)]);
    for (i, expected) in [
        [0., 1., -1., -1., 1.],
        [1., 0., -0.5, 0., 1.],
        [0., -1., 0., 1., -1.],
        [-1., 0., 0.5, 0., -1.],
        [0., 1., -1., -1., 1.],
    ]
    .iter()
    .enumerate()
    {
        for (name, value) in visamp_2::oscillator::NAMES.iter().zip(expected) {
            near(evaluate(name, &a, i as f64 * 1.25).unwrap(), *value);
        }
    }
    for (name, value) in [
        ("sin", 0.5),
        ("cos", 1.),
        ("saw", 0.),
        ("triangle", 0.),
        ("square", 1.),
    ] {
        near(evaluate(name, &[], 0.).unwrap(), value);
    }
}
#[test]
fn discontinuities_are_exact_not_tolerance_shifted() {
    let before = f64::from_bits(1.0f64.to_bits() - 1);
    let after = f64::from_bits(1.0f64.to_bits() + 1);
    assert_eq!(evaluate("saw", &[], before).unwrap(), before);
    assert_eq!(evaluate("saw", &[], 1.).unwrap(), 0.);
    assert_eq!(evaluate("saw", &[], after).unwrap(), after - 1.);
    let before = f64::from_bits(0.5f64.to_bits() - 1);
    let after = f64::from_bits(0.5f64.to_bits() + 1);
    assert_eq!(evaluate("square", &[], before).unwrap(), 1.);
    assert_eq!(evaluate("square", &[], 0.5).unwrap(), 0.);
    assert_eq!(evaluate("square", &[], after).unwrap(), 0.);
    for duty in [0., 1.] {
        for t in [-0.1, 0., 0.5, 1., 1.25] {
            assert_eq!(
                evaluate("square", &args(&[("duty", duty)]), t).unwrap(),
                duty
            );
        }
    }
}
#[test]
fn phases_extreme_bounds_and_invalid_values() {
    for t in [-5., -0.125, 0., 0.25, 1.75, 8.] {
        near(
            evaluate("sin", &args(&[("phase", 0.25)]), t).unwrap(),
            evaluate("cos", &[], t).unwrap(),
        );
        near(
            evaluate("saw", &args(&[("phase", -0.25)]), t).unwrap(),
            evaluate("saw", &args(&[("phase", 2.75)]), t).unwrap(),
        );
    }
    assert_eq!(
        evaluate("sin", &args(&[("min", -f64::MAX), ("max", f64::MAX)]), 0.).unwrap(),
        0.
    );
    for name in visamp_2::oscillator::NAMES {
        assert_eq!(
            evaluate(name, &args(&[("min", -3.), ("max", -3.)]), 8.).unwrap(),
            -3.
        );
        for (key, value) in [
            ("period", 0.),
            ("period", -1.),
            ("min", 2.),
            ("max", -1.),
            ("phase", f64::INFINITY),
            ("min", f64::NAN),
        ] {
            assert!(
                evaluate(name, &args(&[(key, value)]), 0.).is_err(),
                "{name} {key}"
            );
        }
        assert!(evaluate(name, &args(&[("min", 1.), ("max", 1.), ("period", 0.)]), 0.).is_err());
        assert!(evaluate(name, &[], f64::NAN).is_err());
    }
    assert!(evaluate("square", &args(&[("duty", 1.01)]), 0.).is_err());
    assert!(evaluate("sin", &[("period".into(), Value::Boolean(true))], 0.).is_err());
}
fn sample(rt: &Runtime, model: &mut Model) -> Result<f64, String> {
    interpret_event_block(&model.blocks[0], &mut model.decels, rt, &model.functions)?;
    Ok(model.decels.get("value").unwrap().as_f64().unwrap())
}
#[test]
fn actual_program_dynamic_arguments_clock_pause_seek_and_capture_snapshot() {
    let script=build_ast("prop value = 0.0 prop speed = 2 on_frame { value = oscillator::saw(phase: -0.25, max: 2, period: speed + 2, min: -2) } render {}").unwrap();
    let mut model = Model::from_script(&script);
    let mut rt = Runtime::new();
    rt.clock = FrameClock::new(0., Calendar::default());
    rt.clock.advance(100., Calendar::default());
    rt.clock.advance(1100., Calendar::default());
    near(sample(&rt, &mut model).unwrap(), -2.);
    rt.clock.set_paused(true);
    rt.clock.advance(10000., Calendar::default());
    near(sample(&rt, &mut model).unwrap(), -2.);
    rt.clock.set_paused(false);
    rt.clock.advance(20000., Calendar::default());
    rt.clock.advance(21000., Calendar::default());
    near(sample(&rt, &mut model).unwrap(), -1.);
    for time in [3000., 0., 1000., 2000., 3000.] {
        rt.clock.set_time(Some(time)).unwrap();
        rt.clock.advance(30000., Calendar::default());
        near(
            sample(&rt, &mut model).unwrap(),
            evaluate(
                "saw",
                &args(&[("phase", -0.25), ("max", 2.), ("min", -2.), ("period", 4.)]),
                time / 1000.,
            )
            .unwrap(),
        );
        let snapshot = rt.clock.clone();
        near(
            sample(&rt, &mut model).unwrap(),
            sample(&rt, &mut model).unwrap(),
        );
        assert_eq!(rt.clock.elapsed_ms, snapshot.elapsed_ms);
    }
    model.decels.set("speed", Value::Integer(-4));
    let err = sample(&rt, &mut model).unwrap_err();
    assert!(
        err.contains("oscillator::saw") && err.contains("period"),
        "{err}"
    );
}
#[test]
fn validator_and_execution_agree() {
    for name in visamp_2::oscillator::NAMES {
        for call in [
            format!("oscillator::{name}()"),
            format!("oscillator::{name}(phase: 1 + 2, min: -2, period: 4, max: -1)"),
        ] {
            let script = build_ast(&format!(
                "prop value=0.0 on_frame {{ value={call} }} render {{}}"
            ))
            .unwrap();
            assert!(sample(&Runtime::new(), &mut Model::from_script(&script)).is_ok());
        }
    }
    for call in [
        "sin(period: 0)",
        "cos(period: -1)",
        "saw(min: 2)",
        "triangle(max: -1)",
        "square(duty: 2)",
        "sin(duty: 0.5)",
        "sin(interval: 1)",
        "sin(phase: 0, phase: 1)",
        "sin(period: true)",
        "sin(min: [])",
        "sin(phase: \"x\")",
        "boomerang()",
        "sin(period: 1 - 1)",
    ] {
        let err = build_ast(&format!("render {{ let a=oscillator::{call} }}")).unwrap_err();
        assert!(err.contains("oscillator::"), "{call}: {err}");
    }
}

#[test]
fn literal_calls_are_resampled_and_order_independent() {
    let ast = build_ast(
        "prop value=0.0 on_frame { let other=oscillator::cos() value=oscillator::sin() } render {}",
    )
    .unwrap();
    let mut model = Model::from_script(&ast);
    let mut rt = Runtime::new();
    for time in [0., 250., 125., 750., 250., 1000., 500.] {
        rt.clock.begin_frame(time, Calendar::default());
        near(
            sample(&rt, &mut model).unwrap(),
            evaluate("sin", &[], time / 1000.).unwrap(),
        );
    }
}
#[test]
fn documentation_example_parses() {
    let docs = include_str!("../../../apps/docs/src/programming/oscillators.md");
    let example = docs
        .split("```visript")
        .nth(2)
        .unwrap()
        .split("```")
        .next()
        .unwrap();
    build_ast(example).unwrap();
}

#[test]
fn dynamic_invalid_values_are_runtime_diagnostics() {
    let script=build_ast("prop value=0.0 prop parameter=1.0 on_frame { value=oscillator::sin(period: parameter) } render {}").unwrap();
    let mut model = Model::from_script(&script);
    let rt = Runtime::new();
    for value in [
        Value::Float(f64::NAN),
        Value::Float(f64::INFINITY),
        Value::Float(-1.),
        Value::Integer(0),
        Value::Boolean(true),
        Value::String("x".into()),
    ] {
        model.decels.set("parameter", value);
        let e = sample(&rt, &mut model).unwrap_err();
        assert!(
            e.contains("oscillator::sin") && e.contains("period") && e.contains("--> 1:"),
            "{e}"
        );
    }
}
