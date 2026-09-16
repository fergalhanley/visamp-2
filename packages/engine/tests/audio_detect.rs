use std::{cell::RefCell, rc::Rc};
use visamp_2::{
    audio::{AudioState, Snapshot},
    interpreter::{interpret_event_block, interpret_render_block, Runtime, Target},
    model::{BlockType, Model, Value},
    parser::build_ast,
    scene::Scene,
};

#[test]
fn events_latch_and_snapshots_remain_shared_until_the_next_frame() {
    let mut state = AudioState::default();
    state.push(Snapshot::new(&[-1.0, 0.5], &[0.5, 1.0], 48000.0, 0.5, true, true, 0.7).unwrap());
    assert!(!state.current.beat);
    state.push(Snapshot::new(&[0.0], &[0.0, 0.0], 48000.0, 0.0, false, false, 0.1).unwrap());
    state.begin_frame();
    assert!(state.current.beat && state.current.onset);
    assert_eq!(state.current.onset_strength, 0.7);
    let saved = Rc::clone(&state.current.waveform);
    state.push(Snapshot::new(&[1.0], &[1.0], 44100.0, 1.0, false, false, 0.0).unwrap());
    assert!(Rc::ptr_eq(&saved, &state.current.waveform));
    state.begin_frame();
    assert!(!state.current.beat && !state.current.onset);
    assert_eq!(*saved, vec![0.0]);
    state.begin_frame();
    assert_eq!(state.current.onset_strength, 0.0);
}

#[test]
fn band_levels_use_actual_sample_rate_fractional_bins_and_validated_bounds() {
    let s = Snapshot::new(&[], &[0.0, 0.5, 1.0, 0.0], 8000.0, 0.0, false, false, 0.0).unwrap();
    assert_eq!(s.band(1000.0, 2000.0).unwrap(), 0.5);
    assert!((s.band(1500.0, 2500.0).unwrap() - (0.625_f64).sqrt()).abs() < 1e-12);
    assert_eq!(s.band(5000.0, 6000.0).unwrap(), 0.0);
    for (a, b) in [(-1.0, 10.0), (1.0, 1.0), (2.0, 1.0), (0.0, f64::NAN)] {
        assert!(s.band(a, b).is_err());
    }
    assert!(Snapshot::new(&[], &[], 48000.0, 0.0, false, false, 0.0).is_err());
}

#[test]
fn getters_are_typed_shared_expressions_and_work_in_loops_and_gpu_fields() {
    let source = r#"context 3d
prop first = []
prop second = []
prop total = 0.0
on_frame {
 first = audio::detect::get_spectrum()
 second = audio::detect::get_spectrum()
 for value in audio::detect::get_waveform() { total += value }
}
render {
 let bass = audio::detect::get_bass()
 let mid = audio::detect::get_mid()
 let treble = audio::detect::get_treble()
 let band = audio::detect::get_band_level(low_hz: 20, high_hz: 250)
 let level = audio::detect::get_level()
 if audio::detect::get_onset() && audio::detect::get_beat() { let strength = audio::detect::get_onset_strength() }
 draw::point_cloud(count: 2, y: audio::detect::get_spectrum()[$POINT_INDEX])
}"#;
    let script = build_ast(source).unwrap();
    let mut model = Model::from_script(&script);
    let mut runtime = Runtime::new();
    runtime
        .audio
        .push(Snapshot::new(&[-0.5, 1.0], &[0.25, 0.75], 48000.0, 0.5, true, true, 0.8).unwrap());
    runtime.audio.begin_frame();
    let scene = RefCell::new(Scene::default());
    for block in &model.blocks {
        if block.block_type == BlockType::OnFrame {
            interpret_event_block(block, &mut model.decels, &runtime, &model.functions).unwrap();
        } else {
            interpret_render_block(
                block,
                &mut model.decels,
                Target::scene(&scene, &RefCell::new(String::new())),
                &runtime,
                &model.functions,
            )
            .unwrap();
        }
    }
    assert_eq!(scene.borrow().point_clouds.len(), 1);
    // Saved references are the same backing buffer, not per-call array copies.
    let get = |name| model.decels.get(name).unwrap();
    if let (Value::Samples(a), Value::Samples(b)) = (get("first"), get("second")) {
        assert!(Rc::ptr_eq(&a, &b));
    } else {
        panic!("expected shared sample arrays")
    }
    assert_eq!(get("total"), &Value::Float(0.5));
}

#[test]
fn invalid_names_arguments_and_statement_use_have_compile_diagnostics() {
    for expression in [
        "get_unknown()",
        "get_level(value: 1)",
        "get_band_level(low_hz: 20)",
        "get_band_level(low_hz: 20, low_hz: 30, high_hz: 200)",
    ] {
        let err =
            build_ast(&format!("render {{ let x = audio::detect::{expression} }}")).unwrap_err();
        assert!(err.contains("-->"), "{err}");
    }
    assert!(build_ast("render { audio::detect::get_level() }")
        .unwrap_err()
        .contains("expressions"));
}

#[test]
fn removed_audio_globals_fail_at_compile_time_with_replacements() {
    for (old, new) in [
        ("$FREQUENCY_DATA", "get_spectrum"),
        ("$TIME_DOMAIN_DATA", "get_waveform"),
        ("$BEAT", "get_beat"),
    ] {
        let error = visamp_2::parser::build_ast(&format!(
            "render {{\n  if false {{ let value = {old} }}\n}}"
        ))
        .unwrap_err();
        assert!(error.contains("2:"), "{error}");
        assert!(
            error.contains("removed in Visript 4.0") && error.contains(new),
            "{error}"
        );
        assert!(visamp_2::parser::build_ast(&format!(
            "// {old}\nprop note = \"{old}\"\nrender {{}}"
        ))
        .is_ok());
    }
}
