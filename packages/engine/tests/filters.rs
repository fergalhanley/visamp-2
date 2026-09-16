use std::cell::RefCell;
use visamp_2::{
    filters::{self, Filter, Kind},
    interpreter::{interpret_render_block, Runtime, Target},
    model::Model,
    parser::build_ast,
};
fn filters(body: &str) -> Result<Vec<Filter>, String> {
    let s = build_ast(&format!("render {{{body}}}"))?;
    let mut m = Model::from_script(&s);
    let out = RefCell::new(Vec::new());
    interpret_render_block(
        &m.blocks[0],
        &mut m.decels,
        Target {
            filter: Some(&out),
            ..Target::none()
        },
        &Runtime::new(),
        &m.functions,
    )?;
    Ok(out.into_inner())
}
#[test]
fn preserve_order_defaults_and_clamping() {
    let actual = filters("effect::filter::invert(amount: 2) effect::filter::brightness(amount: -1) effect::filter::blur(radius: -4) effect::filter::contrast() effect::filter::opacity(amount: -1)").unwrap();
    let expected = vec![
        Filter::new(Kind::Invert, 1.0),
        Filter::new(Kind::Brightness, 0.0),
        Filter::new(Kind::Blur, 0.0),
        Filter::new(Kind::Contrast, 1.0),
        Filter::new(Kind::Opacity, 0.0),
    ];
    assert_eq!(actual, expected);
}
#[test]
fn invalid_values_and_budget_have_locations() {
    for body in [
        "effect::filter::blur(radius: math::sqrt(value: -1))",
        "for i in 0..33 {effect::filter::brightness(amount: 1)}",
    ] {
        let e = filters(body).unwrap_err();
        assert!(e.contains("Runtime error:  -->"), "{e}");
    }
}
#[test]
fn detects_filters_in_functions_and_branches() {
    for source in [
        "render {if false {effect::filter::blur()}}",
        "fn f(){effect::filter::invert()} render {f()}",
    ] {
        assert!(filters::uses_filters(&build_ast(source).unwrap()));
    }
    assert!(!filters::uses_filters(
        &build_ast("render {draw::clear()}").unwrap()
    ));
}
#[test]
fn degree_and_radian_hue_agree() {
    let a = filters("effect::filter::hue_rotate(deg: 90)").unwrap();
    let b = filters("effect::filter::hue_rotate(rad: $PI / 2)").unwrap();
    assert!((a[0].amount - b[0].amount).abs() < 1e-6);
}
