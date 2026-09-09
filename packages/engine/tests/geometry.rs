use visamp_2::geometry::{build, Geometry, VERTEX_FLOATS};
use visamp_2::scene::{MeshData, Primitive};

/// Every vertex position, as triples.
fn positions(g: &Geometry) -> Vec<[f32; 3]> {
    g.vertices
        .chunks_exact(VERTEX_FLOATS)
        .map(|v| [v[0], v[1], v[2]])
        .collect()
}

fn normals(g: &Geometry) -> Vec<[f32; 3]> {
    g.vertices
        .chunks_exact(VERTEX_FLOATS)
        .map(|v| [v[3], v[4], v[5]])
        .collect()
}

/// Every texture coordinate, as pairs.
fn uvs(g: &Geometry) -> Vec<[f32; 2]> {
    g.vertices
        .chunks_exact(VERTEX_FLOATS)
        .map(|v| [v[6], v[7]])
        .collect()
}

#[test]
fn every_primitive_carries_texture_coordinates_in_range() {
    let primitives = [
        Primitive::Cube,
        Primitive::Sphere { resolution: 8 },
        Primitive::Plane { subdivisions: 4 },
        Primitive::Cylinder { segments: 12 },
        Primitive::Cone { segments: 12 },
        Primitive::Torus {
            segments: 12,
            tube_segments: 8,
            tube_ratio: 250,
        },
        Primitive::Sprite,
    ];

    for primitive in primitives {
        let g = build(primitive, &[]);
        let coords = uvs(&g);
        assert_eq!(coords.len(), g.vertex_count(), "{primitive:?}");
        for [u, v] in coords {
            assert!(
                (0.0..=1.0).contains(&u) && (0.0..=1.0).contains(&v),
                "{primitive:?} has a texture coordinate outside 0..1: {u}, {v}"
            );
        }
    }
}

#[test]
fn a_mesh_without_texture_coordinates_samples_the_origin() {
    let mesh = MeshData {
        vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        indices: vec![],
        normals: vec![],
        uvs: vec![],
    };
    let g = build(Primitive::Mesh { id: 0 }, &[mesh]);
    assert_eq!(uvs(&g), vec![[0.0, 0.0]; 3]);
}

#[test]
fn a_mesh_keeps_the_texture_coordinates_it_was_given() {
    let mesh = MeshData {
        vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        indices: vec![],
        normals: vec![],
        uvs: vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
    };
    let g = build(Primitive::Mesh { id: 0 }, &[mesh]);
    assert_eq!(uvs(&g), vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]);
}

fn extent(g: &Geometry) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for p in positions(g) {
        for i in 0..3 {
            min[i] = min[i].min(p[i]);
            max[i] = max[i].max(p[i]);
        }
    }
    (min, max)
}

const ALL: &[Primitive] = &[
    Primitive::Cube,
    Primitive::Sphere { resolution: 16 },
    Primitive::Plane { subdivisions: 4 },
    Primitive::Cylinder { segments: 16 },
    Primitive::Cone { segments: 16 },
    Primitive::Torus {
        segments: 16,
        tube_segments: 8,
        tube_ratio: 300,
    },
    Primitive::Sprite,
];

#[test]
fn every_primitive_produces_geometry() {
    for primitive in ALL {
        let g = build(*primitive, &[]);
        assert!(g.vertex_count() > 0, "{primitive:?} has no vertices");
        assert!(g.triangle_count() > 0, "{primitive:?} has no triangles");
    }
}

#[test]
fn a_torus_tube_is_sized_relative_to_its_ring() {
    // The tube cannot be a scale — one matrix cannot thicken the tube without
    // also widening the ring — so it belongs to the mesh.
    let thin = extent(&build(
        Primitive::Torus {
            segments: 16,
            tube_segments: 8,
            tube_ratio: 100,
        },
        &[],
    ));
    let fat = extent(&build(
        Primitive::Torus {
            segments: 16,
            tube_segments: 8,
            tube_ratio: 600,
        },
        &[],
    ));

    // Ring radius is fixed at 0.5; the tube adds to the outer extent.
    assert!((thin.1[0] - 0.55).abs() < 1e-3, "{thin:?}");
    assert!((fat.1[0] - 0.80).abs() < 1e-3, "{fat:?}");
    // And thickens vertically.
    assert!(fat.1[1] > thin.1[1] * 2.0);
}

#[test]
fn every_primitive_fits_in_a_unit_box() {
    // §6.4 — all unit-sized at the origin, so a bare call renders something
    // the default camera can see, and the size arguments scale from there.
    for primitive in ALL {
        // A torus is the exception: its ring is 0.5 and the tube sits outside
        // that, so its outer extent is legitimately larger.
        let limit = match primitive {
            Primitive::Torus { tube_ratio, .. } => 0.5 + 0.5 * *tube_ratio as f32 / 1000.0,
            _ => 0.5,
        } + 1e-3;

        let (min, max) = extent(&build(*primitive, &[]));
        for i in 0..3 {
            assert!(min[i] >= -limit, "{primitive:?} min {min:?}");
            assert!(max[i] <= limit, "{primitive:?} max {max:?}");
        }
    }
}

#[test]
fn every_index_points_at_a_real_vertex() {
    // An out-of-range index is a GPU crash or silent garbage, not an error.
    for primitive in ALL {
        let g = build(*primitive, &[]);
        let count = g.vertex_count() as u32;
        for index in &g.indices {
            assert!(*index < count, "{primitive:?}: index {index} of {count}");
        }
    }
}

#[test]
fn every_index_list_is_whole_triangles() {
    for primitive in ALL {
        let g = build(*primitive, &[]);
        assert_eq!(g.indices.len() % 3, 0, "{primitive:?}");
    }
}

#[test]
fn all_normals_are_unit_length() {
    // A normal that is not normalised makes a surface read as brighter or
    // darker than its neighbours for no visible reason.
    for primitive in ALL {
        for n in normals(&build(*primitive, &[])) {
            let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            assert!(
                (len - 1.0).abs() < 1e-3,
                "{primitive:?}: {n:?} has length {len}"
            );
        }
    }
}

#[test]
fn nothing_is_nan() {
    for primitive in ALL {
        let g = build(*primitive, &[]);
        assert!(g.vertices.iter().all(|v| v.is_finite()), "{primitive:?}");
    }
}

#[test]
fn a_cube_has_six_flat_faces() {
    let g = build(Primitive::Cube, &[]);
    assert_eq!(g.triangle_count(), 12);

    // Corners are not shared between faces: sharing would average the normals
    // and light a cube like a ball.
    assert_eq!(g.vertex_count(), 24);

    let mut distinct: Vec<[f32; 3]> = Vec::new();
    for n in normals(&g) {
        if !distinct.iter().any(|d| *d == n) {
            distinct.push(n);
        }
    }
    assert_eq!(
        distinct.len(),
        6,
        "expected one normal per face: {distinct:?}"
    );
}

#[test]
fn a_sphere_has_outward_normals() {
    // For a sphere centred on the origin the normal is the position direction.
    let g = build(Primitive::Sphere { resolution: 8 }, &[]);
    for (p, n) in positions(&g).iter().zip(normals(&g)) {
        let dot = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
        assert!(dot > 0.0, "inward-facing normal at {p:?}");
    }
}

#[test]
fn a_plane_lies_flat_and_faces_up() {
    // §6.4 — the XZ plane facing +Y, so it reads as a floor.
    let g = build(Primitive::Plane { subdivisions: 2 }, &[]);
    for p in positions(&g) {
        assert_eq!(p[1], 0.0, "plane should be flat in Y");
    }
    for n in normals(&g) {
        assert_eq!(n, [0.0, 1.0, 0.0]);
    }
}

#[test]
fn resolution_changes_the_triangle_count() {
    let coarse = build(Primitive::Sphere { resolution: 8 }, &[]).triangle_count();
    let fine = build(Primitive::Sphere { resolution: 32 }, &[]).triangle_count();
    assert!(fine > coarse * 4, "coarse {coarse}, fine {fine}");
}

#[test]
fn a_degenerate_resolution_is_clamped_rather_than_producing_nothing() {
    // Segment counts can be driven by audio and dip to zero.
    for primitive in [
        Primitive::Sphere { resolution: 0 },
        Primitive::Plane { subdivisions: 0 },
        Primitive::Cylinder { segments: 0 },
        Primitive::Cone { segments: 1 },
        Primitive::Torus {
            segments: 0,
            tube_segments: 0,
            tube_ratio: 300,
        },
    ] {
        let g = build(primitive, &[]);
        assert!(g.triangle_count() > 0, "{primitive:?} produced nothing");
    }
}

#[test]
fn wireframe_edges_are_pairs_covering_every_triangle() {
    let g = build(Primitive::Cube, &[]);
    let edges = g.edges();
    assert_eq!(edges.len(), g.triangle_count() * 6);
    assert_eq!(edges.len() % 2, 0);

    let count = g.vertex_count() as u32;
    assert!(edges.iter().all(|i| *i < count));
}

#[test]
fn a_script_supplied_mesh_is_used_as_given() {
    let mesh = MeshData {
        vertices: vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        ..MeshData::default()
    };
    let g = build(Primitive::Mesh { id: 0 }, &[mesh]);

    assert_eq!(g.triangle_count(), 1);
    // No normals given, so one is computed for the face — pointing +Z for a
    // counter-clockwise winding in the XY plane.
    let n = normals(&g)[0];
    assert!((n[2] - 1.0).abs() < 1e-4, "{n:?}");
}

#[test]
fn a_mesh_with_indices_expands_them() {
    let mesh = MeshData {
        vertices: vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [1.0, 1.0, 0.0],
        ],
        indices: vec![0, 1, 2, 1, 3, 2],
        ..MeshData::default()
    };
    assert_eq!(
        build(Primitive::Mesh { id: 0 }, &[mesh]).triangle_count(),
        2
    );
}

#[test]
fn a_missing_mesh_is_empty_rather_than_a_panic() {
    let g = build(Primitive::Mesh { id: 7 }, &[]);
    assert_eq!(g.triangle_count(), 0);
}
