use visamp_2::model::{Color, Model, Value};
use visamp_2::parser::build_ast;

fn model() -> Model {
    let script = build_ast(
        r#"
        prop gain = 0.5
        prop count = 3
        prop enabled = true
        prop label = "hello"
        prop tint = $COLOR_RED

        render {}
        "#,
    )
    .expect("valid script");
    Model::from_script(&script)
}

#[test]
fn external_controls_update_supported_property_types() {
    let mut model = model();

    model.set_property_json("gain", "0.75").unwrap();
    model.set_property_json("count", "8").unwrap();
    model.set_property_json("enabled", "false").unwrap();
    model.set_property_json("label", r#""world""#).unwrap();
    model.set_property_json("tint", r##""#336699""##).unwrap();

    assert_eq!(model.decels.global("gain"), Some(&Value::Float(0.75)));
    assert_eq!(model.decels.global("count"), Some(&Value::Integer(8)));
    assert_eq!(model.decels.global("enabled"), Some(&Value::Boolean(false)));
    assert_eq!(
        model.decels.global("label"),
        Some(&Value::String("world".to_string()))
    );

    match model.decels.global("tint") {
        Some(Value::Color(Color { r, g, b, a })) => {
            assert!((*r - 0.2).abs() < 0.001);
            assert!((*g - 0.4).abs() < 0.001);
            assert!((*b - 0.6).abs() < 0.001);
            assert!((*a - 1.0).abs() < f64::EPSILON);
        }
        other => panic!("expected colour, got {other:?}"),
    }
}

#[test]
fn rejected_control_value_leaves_property_unchanged() {
    let mut model = model();

    let error = model.set_property_json("gain", r#""loud""#).unwrap_err();

    assert!(error.contains("finite number"));
    assert_eq!(model.decels.global("gain"), Some(&Value::Float(0.5)));
}

#[test]
fn controls_cannot_create_undeclared_properties() {
    let mut model = model();

    let error = model.set_property_json("missing", "1").unwrap_err();

    assert!(error.contains("Unknown property"));
    assert!(model.decels.global("missing").is_none());
}

#[test]
fn colour_control_can_supply_alpha() {
    let mut model = model();

    model
        .set_property_json("tint", r##""#ff000080""##)
        .unwrap();

    match model.decels.global("tint") {
        Some(Value::Color(Color { a, .. })) => {
            assert!((*a - 128.0 / 255.0).abs() < 0.001);
        }
        other => panic!("expected colour, got {other:?}"),
    }
}
