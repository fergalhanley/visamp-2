use serde_json::json;
use std::cell::RefCell;
use visamp_2::{
    frame_clock::{Calendar, FrameClock},
    interpreter::{interpret_event_block, interpret_render_block, Runtime, Target},
    model::{BlockType, Model, Value},
    modulation::{Config, Polarity, Waveform},
    parser::build_ast,
    scene::Scene,
};
fn config() -> Config {
    Config::parse(&json!({"version":1,"bpm":120,"beatsPerBar":4,
        "lfos":[{"id":"lfo-1","waveform":"sine","barsPerCycle":1,"phase":0,"polarity":"bipolar","enabled":true,"seed":1}],
        "routes":[{"lfoId":"lfo-1","property":"x","min":-10,"max":10,"enabled":true}]
    }).to_string()).unwrap().unwrap()
}
fn model(source: &str) -> Model {
    Model::from_script(&build_ast(source).unwrap())
}
fn draw(m: &mut Model, rt: &Runtime) -> Scene {
    m.prepare_modulation(rt.clock.elapsed_ms).unwrap();
    let scene = RefCell::new(Scene::default());
    for block in &m.blocks {
        if block.block_type == BlockType::OnFrame {
            interpret_event_block(block, &mut m.decels, rt, &m.functions).unwrap();
        } else if block.block_type == BlockType::Render {
            interpret_render_block(
                block,
                &mut m.decels,
                Target::scene(&scene, &RefCell::new(vec![])),
                rt,
                &m.functions,
            )
            .unwrap();
        }
    }
    scene.into_inner()
}
fn x(scene: &Scene) -> f32 {
    scene.commands[0].model.transform_point([0.0, 0.0, 0.0])[0]
}
#[test]
fn rendering_consumes_effective_properties_without_accumulating_into_base() {
    let mut m = model("context 3d prop x=0 fn next() { let n=0 n=x+1 return n } on_frame { x=next() } render { draw::cube(x:x) }");
    m.set_modulation(Some(config()), 500.0).unwrap();
    let mut rt = Runtime::new();
    rt.clock = FrameClock::new(500.0, Calendar::default());
    for i in 1..=3 {
        assert_eq!(x(&draw(&mut m, &rt)), 10.0);
        assert_eq!(m.decels.global("x"), Some(&Value::Integer(i)));
    }
    m.set_modulation(None, 500.0).unwrap();
    assert_eq!(x(&draw(&mut m, &rt)), 4.0);
}
#[test]
fn current_base_changes_are_visible_in_the_same_frame_and_capture_is_independent() {
    let mut m = model("context 3d prop x=0 on_frame { x=2 } render { draw::cube(x:x) }");
    m.set_modulation(Some(config()), 0.0).unwrap();
    let mut rt = Runtime::new();
    rt.clock = FrameClock::new(1500.0, Calendar::default());
    assert_eq!(x(&draw(&mut m, &rt)), -8.0);
    let mut captured = m.clone();
    captured.decels.set("x", Value::Integer(5));
    assert_eq!(captured.decels.effective("x").unwrap(), Value::Float(-5.0));
    assert_eq!(m.decels.global("x"), Some(&Value::Integer(2)));
    let reloaded = model("prop x=7 render {}");
    assert_eq!(reloaded.decels.effective("x").unwrap(), Value::Integer(7));
}
#[test]
fn assignments_can_derive_other_properties_from_effective_values() {
    let mut m = model("context 3d prop x=0 prop derived=0 on_frame { derived=x*2 } render { draw::cube(x:derived) }");
    m.set_modulation(Some(config()), 500.0).unwrap();
    let mut rt = Runtime::new();
    rt.clock = FrameClock::new(500.0, Calendar::default());
    assert_eq!(x(&draw(&mut m, &rt)), 20.0);
    assert_eq!(m.decels.global("x"), Some(&Value::Integer(0)));
}
#[test]
fn function_globals_are_modulated_but_parameters_shadow_them() {
    let mut m = model("context 3d prop x=0 fn show(x:2) { draw::cube(x:x) } fn global() { draw::cube(x:x) } render { show() global() }");
    m.set_modulation(Some(config()), 500.0).unwrap();
    let mut rt = Runtime::new();
    rt.clock = FrameClock::new(500.0, Calendar::default());
    let scene = draw(&mut m, &rt);
    assert_eq!(x(&scene), 2.0);
    assert_eq!(
        scene.commands[1].model.transform_point([0.0, 0.0, 0.0])[0],
        10.0
    );
}
#[test]
fn numeric_only_and_atomic_configuration_with_runtime_type_check() {
    for source in [
        "prop x=true render {}",
        "prop x=[] render {}",
        "prop x=\"text\" render {}",
        "prop y=0 render {}",
    ] {
        assert!(model(source)
            .set_modulation(Some(config()), 0.0)
            .unwrap_err()
            .contains("numeric property"));
    }
    let mut m = model("prop x=0 render {}");
    m.set_modulation(Some(config()), 500.0).unwrap();
    let mut bad = config();
    bad.routes[0].property = "missing".into();
    assert!(m.set_modulation(Some(bad), 500.0).is_err());
    assert_eq!(m.decels.effective("x").unwrap(), Value::Float(10.0));
    m.decels.set("x", Value::Boolean(true));
    assert!(m
        .decels
        .effective("x")
        .unwrap_err()
        .contains("numeric property"));
    m.set_modulation(None, 0.0).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), Value::Boolean(true));
}
#[test]
fn zero_depth_disabled_and_conflicting_routes_have_explicit_semantics() {
    let mut m = model("prop x=50 render {}");
    for mode in 0..3 {
        let mut c = config();
        match mode {
            0 => c.routes[0].enabled = false,
            1 => c.lfos[0].enabled = false,
            _ => {
                c.routes[0].min = 0.0;
                c.routes[0].max = 0.0;
            }
        }
        m.set_modulation(Some(c), 500.0).unwrap();
        assert_eq!(m.decels.effective("x").unwrap(), Value::Integer(50));
    }
    let mut c = config();
    let mut second = c.routes[0].clone();
    second.min = 20.0;
    second.max = 30.0;
    c.routes.push(second);
    assert!(c.validate().unwrap_err().contains("Conflicting"));
    c.routes[1].min = 5.0;
    m.set_modulation(Some(c), 1500.0).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), Value::Float(10.0));
}
#[test]
fn waveforms_divisions_negative_seeks_and_seeded_steps_are_stable() {
    let mut c = config();
    let lfo = &mut c.lfos[0];
    lfo.polarity = Polarity::Unipolar;
    for (wave, at0, atquarter, athalf) in [
        (Waveform::Sine, 0.5, 1.0, 0.5),
        (Waveform::Triangle, 0.0, 0.5, 1.0),
        (Waveform::Square, 1.0, 1.0, 0.0),
        (Waveform::SawUp, 0.0, 0.25, 0.5),
        (Waveform::SawDown, 1.0, 0.75, 0.5),
    ] {
        lfo.waveform = wave;
        for (time, expected) in [(0.0, at0), (500.0, atquarter), (1000.0, athalf)] {
            assert!((lfo.sample(time, 120.0, 4.0).unwrap() - expected).abs() < 1e-12);
        }
    }
    lfo.waveform = Waveform::Sine;
    lfo.bars_per_cycle = 0.5;
    lfo.phase = 0.25;
    assert_eq!(lfo.sample(0.0, 120.0, 4.0).unwrap(), 1.0);
    assert_eq!(lfo.sample(1000.0, 120.0, 4.0).unwrap(), 1.0);
    lfo.waveform = Waveform::SampleHold;
    lfo.bars_per_cycle = 1.0;
    lfo.phase = 0.0;
    assert_eq!(
        lfo.sample(-2000.0, 120.0, 4.0).unwrap(),
        lfo.sample(-1.0, 120.0, 4.0).unwrap()
    );
    assert_eq!(
        lfo.sample(0.0, 120.0, 4.0).unwrap(),
        lfo.sample(1999.0, 120.0, 4.0).unwrap()
    );
    assert_ne!(
        lfo.sample(1999.0, 120.0, 4.0).unwrap(),
        lfo.sample(2000.0, 120.0, 4.0).unwrap()
    );
}
#[test]
fn pause_seek_tempo_and_cadence_use_the_shared_timeline() {
    let mut m = model("prop x=0 render {}");
    m.set_modulation(Some(config()), 0.0).unwrap();
    let mut clock = FrameClock::new(0.0, Calendar::default());
    clock.advance(0.0, Calendar::default());
    clock.advance(500.0, Calendar::default());
    m.prepare_modulation(clock.elapsed_ms).unwrap();
    let peak = m.decels.effective("x").unwrap();
    clock.set_paused(true);
    clock.advance(9000.0, Calendar::default());
    clock.advance(10000.0, Calendar::default());
    m.prepare_modulation(clock.elapsed_ms).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), peak);
    clock.set_time(Some(1500.0)).unwrap();
    clock.advance(11000.0, Calendar::default());
    m.prepare_modulation(clock.elapsed_ms).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), Value::Float(-10.0));
    clock.set_time(Some(500.0)).unwrap();
    clock.advance(12000.0, Calendar::default());
    m.prepare_modulation(clock.elapsed_ms).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), peak);
    let mut c = config();
    c.bpm = 60.0;
    m.set_modulation(Some(c), 1000.0).unwrap();
    assert_eq!(m.decels.effective("x").unwrap(), peak);
    assert!(m.prepare_modulation(f64::MAX).is_err());
    assert_eq!(m.decels.effective("x").unwrap(), Value::Integer(0));
}
#[test]
fn malformed_and_unknown_versions_are_rejected() {
    for payload in [
        "{}",
        "[]",
        "{\"version\":2}",
        "true",
        "{\"version\":1,\"lfos\":null}",
    ] {
        assert!(Config::parse(payload).is_err());
    }
    assert!(Config::parse("null").unwrap().is_none());
    let mut c = config();
    c.lfos.push(c.lfos[0].clone());
    assert!(c.validate().is_err());
}

#[test]
fn all_four_oscillators_can_route_independently() {
    let mut c = config();
    let original = c.lfos[0].clone();
    c.lfos.clear(); c.routes.clear();
    for (i, property) in ["x", "y", "z", "w"].into_iter().enumerate() {
        let mut lfo=original.clone(); lfo.id=format!("lfo-{i}"); lfo.phase=i as f64/4.0;
        c.routes.push(visamp_2::modulation::Route { lfo_id:lfo.id.clone(), property:property.into(), min:-10.0,max:10.0,enabled:true });
        c.lfos.push(lfo);
    }
    let mut m=model("prop x=0 prop y=0 prop z=0 prop w=0 render {}");
    m.set_modulation(Some(c),0.0).unwrap();
    for (name, expected) in [("x",0.0),("y",10.0),("z",0.0),("w",-10.0)] {
        let Value::Float(value)=m.decels.effective(name).unwrap() else { panic!() };
        assert!((value-expected).abs()<1e-12);
    }
}
