use visamp_2::math3::*;

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < 1e-4
}

fn point_close(a: Vec3, b: Vec3) -> bool {
    close(a[0], b[0]) && close(a[1], b[1]) && close(a[2], b[2])
}

#[test]
fn identity_leaves_a_point_alone() {
    assert!(point_close(
        Mat4::IDENTITY.transform_point([1.0, 2.0, 3.0]),
        [1.0, 2.0, 3.0]
    ));
}

#[test]
fn multiplication_applies_the_right_hand_side_first() {
    // `translate * scale` must scale then move, which is what `parent * child`
    // means when walking a transform stack.
    let m = Mat4::translation(10.0, 0.0, 0.0).mul(&Mat4::scaling(2.0, 2.0, 2.0));
    assert!(point_close(
        m.transform_point([1.0, 0.0, 0.0]),
        [12.0, 0.0, 0.0]
    ));

    // The other order moves then scales, and the two must differ.
    let n = Mat4::scaling(2.0, 2.0, 2.0).mul(&Mat4::translation(10.0, 0.0, 0.0));
    assert!(point_close(
        n.transform_point([1.0, 0.0, 0.0]),
        [22.0, 0.0, 0.0]
    ));
}

#[test]
fn rotations_turn_the_right_way() {
    // Right-handed, +Y up: a quarter turn about Y sends +X to -Z.
    let m = Mat4::rotation_y(std::f32::consts::FRAC_PI_2);
    assert!(point_close(
        m.transform_point([1.0, 0.0, 0.0]),
        [0.0, 0.0, -1.0]
    ));

    // About X, +Y goes to +Z.
    let m = Mat4::rotation_x(std::f32::consts::FRAC_PI_2);
    assert!(point_close(
        m.transform_point([0.0, 1.0, 0.0]),
        [0.0, 0.0, 1.0]
    ));

    // About Z, +X goes to +Y.
    let m = Mat4::rotation_z(std::f32::consts::FRAC_PI_2);
    assert!(point_close(
        m.transform_point([1.0, 0.0, 0.0]),
        [0.0, 1.0, 0.0]
    ));
}

#[test]
fn a_full_turn_returns_where_it_started() {
    let m = Mat4::rotation_y(std::f32::consts::TAU);
    assert!(point_close(
        m.transform_point([1.0, 2.0, 3.0]),
        [1.0, 2.0, 3.0]
    ));
}

#[test]
fn the_default_camera_puts_the_origin_in_front_of_it() {
    // Position (0,0,10) looking at the origin: the origin should land 10 units
    // down -Z in view space, which is what "in front" means here.
    let view = Mat4::look_at([0.0, 0.0, 10.0], [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]);
    assert!(point_close(
        view.transform_point([0.0, 0.0, 0.0]),
        [0.0, 0.0, -10.0]
    ));
}

#[test]
fn the_view_matrix_keeps_up_pointing_up() {
    let view = Mat4::look_at([0.0, 0.0, 10.0], [0.0, 0.0, 0.0], [0.0, 1.0, 0.0]);
    let above = view.transform_point([0.0, 1.0, 0.0]);
    assert!(above[1] > 0.0, "up should stay up, got {above:?}");
}

#[test]
fn a_degenerate_camera_does_not_produce_nan() {
    // Looking at your own position, and a zero up vector: both are script
    // mistakes that must not poison every later matrix with NaN.
    let view = Mat4::look_at([1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [0.0, 1.0, 0.0]);
    assert!(view.as_slice().iter().all(|v| v.is_finite()), "{view:?}");

    let view = Mat4::look_at([0.0, 0.0, 5.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]);
    assert!(view.as_slice().iter().all(|v| v.is_finite()), "{view:?}");
}

#[test]
fn perspective_puts_the_near_plane_at_minus_one() {
    let p = Mat4::perspective(std::f32::consts::FRAC_PI_3, 1.0, 0.1, 100.0);
    // A point on the near plane maps to z = -1 in clip space (GL convention).
    let near = p.transform_point([0.0, 0.0, -0.1]);
    assert!(close(near[2], -1.0), "near mapped to {}", near[2]);

    let far = p.transform_point([0.0, 0.0, -100.0]);
    assert!(close(far[2], 1.0), "far mapped to {}", far[2]);
}

#[test]
fn perspective_makes_distant_things_smaller() {
    let p = Mat4::perspective(std::f32::consts::FRAC_PI_3, 1.0, 0.1, 100.0);
    let near = p.transform_point([1.0, 0.0, -2.0]);
    let far = p.transform_point([1.0, 0.0, -20.0]);
    assert!(far[0].abs() < near[0].abs(), "near {near:?} far {far:?}");
}

#[test]
fn aspect_ratio_stretches_x_not_y() {
    let square = Mat4::perspective(std::f32::consts::FRAC_PI_3, 1.0, 0.1, 100.0);
    let wide = Mat4::perspective(std::f32::consts::FRAC_PI_3, 2.0, 0.1, 100.0);

    let a = square.transform_point([1.0, 1.0, -5.0]);
    let b = wide.transform_point([1.0, 1.0, -5.0]);

    assert!(b[0].abs() < a[0].abs(), "a wider canvas should compress x");
    assert!(close(a[1], b[1]), "y must not move with aspect");
}

#[test]
fn a_nonsense_aspect_does_not_produce_nan() {
    // The canvas can be zero-sized for a frame during layout.
    let p = Mat4::perspective(std::f32::consts::FRAC_PI_3, 0.0, 0.1, 100.0);
    assert!(p.as_slice().iter().all(|v| v.is_finite()));

    let p = Mat4::perspective(std::f32::consts::FRAC_PI_3, f32::NAN, 0.1, 100.0);
    assert!(p.as_slice().iter().all(|v| v.is_finite()));
}

#[test]
fn orthographic_keeps_size_with_distance() {
    let o = Mat4::orthographic(10.0, 1.0, 0.1, 100.0);
    let near = o.transform_point([1.0, 0.0, -2.0]);
    let far = o.transform_point([1.0, 0.0, -20.0]);
    assert!(close(near[0], far[0]), "near {near:?} far {far:?}");
}

#[test]
fn the_normal_matrix_survives_a_non_uniform_scale() {
    // A cube squashed in Y must still light as if its faces pointed outward.
    // Under the plain model matrix the normal would tilt; the inverse-transpose
    // is what keeps it perpendicular.
    let model = Mat4::scaling(1.0, 0.25, 1.0);
    let n = model.normal_matrix();

    // The +Y face normal stays along +Y, and lengthens rather than shortening.
    let ny = [n[3], n[4], n[5]];
    assert!(close(ny[0], 0.0) && close(ny[2], 0.0), "{ny:?}");
    assert!(ny[1] > 1.0, "expected the Y normal to grow, got {ny:?}");
}

#[test]
fn a_singular_model_matrix_does_not_produce_nan() {
    // `transform::scale(all: 0.0)` is legal to write.
    let n = Mat4::scaling(0.0, 0.0, 0.0).normal_matrix();
    assert!(n.iter().all(|v| v.is_finite()), "{n:?}");
}

#[test]
fn normalising_a_zero_vector_falls_back() {
    assert_eq!(
        normalise_or([0.0, 0.0, 0.0], [0.0, 1.0, 0.0]),
        [0.0, 1.0, 0.0]
    );
    assert!(point_close(
        normalise_or([0.0, 5.0, 0.0], [1.0, 0.0, 0.0]),
        [0.0, 1.0, 0.0]
    ));
}
