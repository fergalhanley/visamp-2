use visamp_2::math3::Mat4;
use visamp_2::model::Color;
use visamp_2::scene::*;

fn command(primitive: Primitive) -> DrawCommand {
    DrawCommand {
        key: BatchKey {
            texture: None,
            primitive,
            shading: Shading::Unlit,
            wireframe: false,
            blend: BlendMode::Alpha,
            cull: CullMode::None,
            depth_enabled: true,
            depth_write: true,
            overlay: false,
        },
        model: Mat4::IDENTITY,
        color: Color::new(1.0, 1.0, 1.0, 1.0),
        opacity: 1.0,
    }
}

// ── transform stack ───────────────────────────────────────────────────────

#[test]
fn the_stack_starts_with_one_identity() {
    let scene = Scene::default();
    assert_eq!(scene.stack.len(), 1);
    assert_eq!(scene.top(), Mat4::IDENTITY);
    assert!(scene.check_balanced().is_ok());
}

#[test]
fn push_and_pop_restore_the_previous_transform() {
    let mut scene = Scene::default();
    scene.apply(Mat4::translation(5.0, 0.0, 0.0));

    scene.push().unwrap();
    scene.apply(Mat4::translation(5.0, 0.0, 0.0));
    // Nested, so the inner transform composes with the outer one.
    assert_eq!(scene.top().transform_point([0.0, 0.0, 0.0])[0], 10.0);

    scene.pop().unwrap();
    assert_eq!(scene.top().transform_point([0.0, 0.0, 0.0])[0], 5.0);
}

#[test]
fn popping_an_empty_stack_is_an_error() {
    let mut scene = Scene::default();
    let err = scene.pop().unwrap_err();
    assert!(err.contains("transform::pop with empty stack"), "{err}");
}

#[test]
fn an_unbalanced_stack_is_reported_at_the_end_of_a_frame() {
    let mut scene = Scene::default();
    scene.push().unwrap();
    scene.push().unwrap();

    let err = scene.check_balanced().unwrap_err();
    assert!(err.contains("depth 3, expected 1"), "{err}");
}

#[test]
fn the_stack_has_a_depth_limit() {
    let mut scene = Scene::default();
    for _ in 0..(MAX_STACK_DEPTH - 1) {
        scene.push().expect("should fit");
    }
    let err = scene.push().unwrap_err();
    assert!(err.contains("depth limit exceeded (64)"), "{err}");
}

#[test]
fn identity_resets_only_the_current_level() {
    let mut scene = Scene::default();
    scene.apply(Mat4::translation(5.0, 0.0, 0.0));
    scene.push().unwrap();
    scene.identity();
    assert_eq!(scene.top(), Mat4::IDENTITY);

    scene.pop().unwrap();
    assert_eq!(scene.top().transform_point([0.0, 0.0, 0.0])[0], 5.0);
}

// ── camera ────────────────────────────────────────────────────────────────

#[test]
fn the_default_camera_can_see_a_unit_cube_at_the_origin() {
    // §11.1 — `draw::cube()` with no camera setup must be visible.
    let camera = Camera::default();
    let clip = camera
        .projection_matrix(16.0 / 9.0)
        .mul(&camera.view())
        .transform_point([0.0, 0.0, 0.0]);

    assert!(
        clip[0].abs() <= 1.0 && clip[1].abs() <= 1.0,
        "off screen: {clip:?}"
    );
    assert!(
        clip[2] > -1.0 && clip[2] < 1.0,
        "outside the clip range: {clip:?}"
    );
}

#[test]
fn orbit_places_the_camera_at_the_requested_distance() {
    let mut camera = Camera::default();
    camera.orbit([0.0, 0.0, 0.0], 14.0, 0.0, 0.0);

    let d = visamp_2::math3::length(camera.position);
    assert!((d - 14.0).abs() < 1e-3, "distance {d}");
    assert!(matches!(camera.aim, Aim::Target(t) if t == [0.0, 0.0, 0.0]));
}

#[test]
fn orbit_yaw_swings_around_the_target() {
    let mut camera = Camera::default();
    camera.orbit([0.0, 0.0, 0.0], 10.0, 0.0, 0.0);
    let start = camera.position;

    camera.orbit([0.0, 0.0, 0.0], 10.0, std::f32::consts::FRAC_PI_2, 0.0);
    assert!(
        (camera.position[0] - 10.0).abs() < 1e-3,
        "{:?}",
        camera.position
    );
    assert!(camera.position[2].abs() < 1e-3, "{:?}", camera.position);
    assert!(start != camera.position);
}

#[test]
fn orbit_stops_short_of_the_poles() {
    // Straight overhead makes up parallel to the view direction, and the view
    // matrix degenerate.
    let mut camera = Camera::default();
    camera.orbit([0.0, 0.0, 0.0], 10.0, 0.0, std::f32::consts::PI);

    let view = camera.view();
    assert!(view.as_slice().iter().all(|v| v.is_finite()), "{view:?}");
}

#[test]
fn orbit_respects_the_target() {
    let mut camera = Camera::default();
    camera.orbit([5.0, 1.0, -2.0], 10.0, 0.0, 0.0);
    assert!((camera.position[0] - 5.0).abs() < 1e-3);
    assert!((camera.position[1] - 1.0).abs() < 1e-3);
}

#[test]
fn a_wild_field_of_view_is_clamped_rather_than_degenerate() {
    for fov in [0.0f32, -1.0, 400.0] {
        let camera = Camera {
            projection: Projection::Perspective {
                fov_rad: fov.to_radians(),
                near: 0.1,
                far: 100.0,
            },
            ..Camera::default()
        };
        let m = camera.projection_matrix(1.0);
        assert!(
            m.as_slice().iter().all(|v| v.is_finite()),
            "fov {fov}: {m:?}"
        );
    }
}

#[test]
fn aiming_by_direction_matches_aiming_at_the_point_it_points_to() {
    let by_target = Camera {
        position: [0.0, 0.0, 10.0],
        aim: Aim::Target([0.0, 0.0, 0.0]),
        ..Camera::default()
    };
    let by_direction = Camera {
        position: [0.0, 0.0, 10.0],
        aim: Aim::Direction([0.0, 0.0, -10.0]),
        ..Camera::default()
    };

    assert_eq!(by_target.view(), by_direction.view());
}

// ── lights ────────────────────────────────────────────────────────────────

#[test]
fn shading_defaults_to_unlit_until_a_light_exists() {
    let mut scene = Scene::default();
    assert_eq!(scene.default_shading(), Shading::Unlit);

    scene.lights.ambient = Some(Color::new(0.1, 0.1, 0.1, 1.0));
    assert_eq!(scene.default_shading(), Shading::Lambert);
}

#[test]
fn excess_lights_are_dropped_with_a_warning_rather_than_an_error() {
    // A visualisation adding lights in a loop should degrade, not die.
    let mut scene = Scene::default();
    for _ in 0..20 {
        scene.add_directional(DirectionalLight {
            direction: [0.0, -1.0, 0.0],
            color: Color::new(1.0, 1.0, 1.0, 1.0),
            intensity: 1.0,
        });
    }

    assert_eq!(scene.lights.directional.len(), MAX_DIRECTIONAL_LIGHTS);
    assert_eq!(scene.warnings.len(), 1, "should warn once, not per light");
    assert!(scene.warnings[0].contains("light limit reached"));
}

#[test]
fn point_lights_have_their_own_budget() {
    let mut scene = Scene::default();
    for _ in 0..30 {
        scene.add_point(PointLight {
            position: [0.0, 0.0, 0.0],
            color: Color::new(1.0, 1.0, 1.0, 1.0),
            intensity: 1.0,
            range: 50.0,
        });
    }
    assert_eq!(scene.lights.point.len(), MAX_POINT_LIGHTS);
}

// ── command buffer and batching ───────────────────────────────────────────

#[test]
fn consecutive_matching_draws_coalesce_into_one_batch() {
    // The case worth optimising: a `for` body issuing one cube per iteration.
    let mut scene = Scene::default();
    for _ in 0..128 {
        scene.record(command(Primitive::Cube));
    }

    let batches = scene.batches();
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0].instances.len(), 128);
}

#[test]
fn a_change_of_primitive_or_state_starts_a_new_batch() {
    let mut scene = Scene::default();
    scene.record(command(Primitive::Cube));
    scene.record(command(Primitive::Sphere { resolution: 24 }));
    scene.record(command(Primitive::Cube));

    assert_eq!(scene.batches().len(), 3);

    let mut scene = Scene::default();
    scene.record(command(Primitive::Cube));
    let mut lit = command(Primitive::Cube);
    lit.key.shading = Shading::Lambert;
    scene.record(lit);
    assert_eq!(scene.batches().len(), 2);
}

#[test]
fn spheres_of_different_resolutions_do_not_share_a_batch() {
    // They cannot share a vertex buffer, so they must not share a draw call.
    let mut scene = Scene::default();
    scene.record(command(Primitive::Sphere { resolution: 12 }));
    scene.record(command(Primitive::Sphere { resolution: 24 }));
    assert_eq!(scene.batches().len(), 2);
}

#[test]
fn batching_never_reorders_draws() {
    // With alpha blending the issue order is the draw order. Sorting by key to
    // get bigger batches would quietly change what the author sees.
    let mut scene = Scene::default();
    scene.record(command(Primitive::Cube));
    scene.record(command(Primitive::Sprite));
    scene.record(command(Primitive::Cube));

    let batches = scene.batches();
    assert_eq!(batches.len(), 3);
    assert_eq!(batches[0].key.primitive, Primitive::Cube);
    assert_eq!(batches[1].key.primitive, Primitive::Sprite);
    assert_eq!(batches[2].key.primitive, Primitive::Cube);
}

#[test]
fn the_draw_command_budget_drops_the_rest_of_the_frame() {
    let mut scene = Scene::default();
    for _ in 0..(MAX_DRAW_COMMANDS + 50) {
        scene.record(command(Primitive::Sprite));
    }

    assert_eq!(scene.commands.len(), MAX_DRAW_COMMANDS);
    assert_eq!(
        scene.warnings.len(),
        1,
        "should warn once, not per dropped draw"
    );
    assert!(scene.warnings[0].contains("draw command limit"));
}

#[test]
fn the_triangle_budget_drops_the_rest_of_the_frame() {
    let mut scene = Scene::default();
    // A high-resolution sphere is ~5000 triangles, so a few hundred exhausts
    // the budget well before the command limit.
    for _ in 0..MAX_DRAW_COMMANDS {
        scene.record(command(Primitive::Sphere { resolution: 50 }));
    }

    assert!(scene.triangles() <= MAX_TRIANGLES);
    assert!(scene.commands.len() < MAX_DRAW_COMMANDS);
    assert!(scene.warnings.iter().any(|w| w.contains("triangle limit")));
}

#[test]
fn an_oversized_mesh_is_rejected() {
    let mut scene = Scene::default();
    let mesh = MeshData {
        vertices: vec![[0.0, 0.0, 0.0]; MAX_MESH_VERTICES + 1],
        ..MeshData::default()
    };
    let err = scene.add_mesh(mesh).unwrap_err();
    assert!(err.contains("vertex count exceeds 65536"), "{err}");
}

#[test]
fn resetting_clears_everything_a_frame_touched() {
    // §9.1 — no state may leak into the next frame, which is what makes live
    // editing predictable.
    let mut scene = Scene::default();
    scene.record(command(Primitive::Cube));
    scene.push().unwrap();
    scene.gfx.blend = BlendMode::Additive;
    scene.camera.position = [1.0, 2.0, 3.0];
    scene.lights.ambient = Some(Color::new(1.0, 1.0, 1.0, 1.0));

    scene.reset();

    assert!(scene.commands.is_empty());
    assert_eq!(scene.stack.len(), 1);
    assert_eq!(scene.gfx, GfxState::default());
    assert_eq!(scene.camera, Camera::default());
    assert!(scene.lights.is_empty());
    assert!(scene.warnings.is_empty());
    assert_eq!(scene.triangles(), 0);
}

#[test]
fn the_default_render_state_matches_the_spec() {
    let gfx = GfxState::default();
    assert!(gfx.depth_enabled && gfx.depth_write);
    assert_eq!(gfx.blend, BlendMode::Alpha);
    // Deliberate: a plane viewed from below should be visible, not missing.
    assert_eq!(gfx.cull, CullMode::None);
    assert!(!gfx.overlay);
    assert!(gfx.clear.is_none());
}
