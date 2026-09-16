use std::cell::RefCell;
use visamp_2::{
    filters::{Filter, Kind},
    interpreter::{interpret_render_block, Runtime, Target},
    model::Model,
    parser::build_ast,
};
fn run(source: &str) -> Result<Vec<Filter>, String> {
    let script = build_ast(source)?;
    let mut model = Model::from_script(&script);
    let out = RefCell::new(Vec::new());
    interpret_render_block(
        &model.blocks[0],
        &mut model.decels,
        Target {
            filter: Some(&out),
            ..Target::none()
        },
        &Runtime::new(),
        &model.functions,
    )?;
    Ok(out.into_inner())
}
#[test]
fn defaults_and_mixed_call_order() {
    let ops = run(
        "render {effect::pixelate() effect::bloom() effect::filter::invert() effect::mirror()}",
    )
    .unwrap();
    assert_eq!(
        ops.iter().map(|f| f.kind).collect::<Vec<_>>(),
        vec![Kind::PixelateRect, Kind::Bloom, Kind::Invert, Kind::Mirror]
    );
    assert_eq!(ops[0].params[..4], [10.0, 10.0, 0.0, 0.0]);
    assert_eq!(ops[1].params[..2], [1.2, 12.0]);
}
#[test]
fn all_effects_compile_in_both_contexts_and_overlay() {
    let calls = [
        "kaleidoscope()",
        "swirl()",
        "pixelate()",
        "pixelate_rect()",
        "pixelate_circle()",
        "pixelate_triangle()",
        "pixelate_pentagon()",
        "pixelate_hexagon()",
        "pixelate_pentagram()",
        "pixelate_hexagram()",
        "mirror()",
        "posterize()",
        "chromatic_aberration()",
        "vignette()",
        "ripple()",
        "scanlines()",
        "bloom()",
        "displace(map: asset::bitmap(id: \"map\"))",
    ];
    for context in [
        "context 2d render {",
        "context 3d render {",
        "context 3d render {gfx::overlay(enabled: true)",
    ] {
        for call in calls {
            build_ast(&format!("{context} effect::{call} }}")).unwrap();
        }
    }
}
#[test]
fn literal_contracts_report_locations() {
    for call in [
        "kaleidoscope(segments: 1)",
        "kaleidoscope(segments: 8.0)",
        "kaleidoscope(branches: 7)",
        "pixelate(size: 0)",
        "pixelate_rect(height: -1)",
        "pixelate_circle(gap: -1)",
        "swirl(rad: 1,deg: 2)",
        "swirl(radians: 1)",
        "mirror(axis: \"z\")",
        "posterize(levels: 1)",
        "bloom(threshold: 2)",
        "vignette(softness: 0)",
        "displace()",
        "scanlines(spacing: 0)",
    ] {
        let error = build_ast(&format!("render {{effect::{call}}}")).unwrap_err();
        assert!(error.contains(" -->"), "{call}: {error}");
    }
}
#[test]
fn computed_contracts_report_locations() {
    for call in [
        "pixelate(size: n)",
        "kaleidoscope(segments: n)",
        "bloom(intensity: n)",
        "pixelate(gap: n)",
        "vignette(amount: n)",
        "ripple(wavelength: n)",
    ] {
        let error = run(&format!("prop n = -2 render {{effect::{call}}}")).unwrap_err();
        assert!(error.contains("Runtime error:  -->"), "{call}: {error}");
    }
    for call in ["mirror(axis: n)", "pixelate(size: n)", "swirl(rad: n)"] {
        assert!(run(&format!("prop n = true render {{effect::{call}}}")).is_err());
    }
    assert!(run("render {effect::swirl(rad: math::sqrt(value: -1))}").is_err());
}
#[test]
fn swirl_preserves_negative_and_multiple_turns() {
    let ops = run("render {effect::swirl(deg: -720) effect::swirl(rad: -4 * $PI)}").unwrap();
    assert!((ops[0].params[3] + 4.0 * std::f32::consts::PI).abs() < 1e-5);
    assert!((ops[0].params[3] - ops[1].params[3]).abs() < 1e-5);
}
#[test]
fn effect_budget_includes_filters() {
    let error = run(
        "render {for i in 0..16 {effect::posterize() effect::filter::invert()} effect::pixelate()}",
    )
    .unwrap_err();
    assert!(error.contains("32 per frame"));
}
#[test]
fn displacement_requires_loaded_bitmap_and_store_epoch_changes() {
    assert!(run("render {effect::displace(map: asset::model(id: \"m\"))}").is_err());
    assert!(
        run("render {effect::displace(map: asset::bitmap(id: \"m\"))}")
            .unwrap_err()
            .contains("not loaded")
    );
    visamp_2::assets::with_store_mut(|s| s.set_texture("m", 1, 1, vec![128, 128, 0, 255]));
    assert_eq!(
        run("render {effect::displace(map: asset::bitmap(id: \"m\"))}").unwrap()[0]
            .asset
            .as_deref(),
        Some("m")
    );
    visamp_2::assets::with_store_mut(|s| {
        let epoch = s.epoch();
        s.clear();
        assert_ne!(epoch, s.epoch());
    });
}
