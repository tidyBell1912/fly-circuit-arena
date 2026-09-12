# NeuroMechFly v2 browser asset

`neuromechfly.glb` is a 2,074,064-byte glTF 2.0 binary assembled from NeLy-EPFL's simplified NeuroMechFly v2 STL meshes. It contains 69 named, separately transformable anatomical segments and 115,158 triangles. Mesh vertices are indexed with averaged vertex normals. Colors and neutral joint pose come from the source model. The only geometry changes are unit conversion, right-side mirroring, indexed vertex welding, normals, and GLB packaging; there is no anatomy synthesis.

## Integration

Load using Three.js GLTFLoader. The root `NeuroMechFly` converts the original model's Z-up convention to glTF/Three.js Y-up. In the loaded scene X is forward, Y is up, and Z is right. Model units are millimetres, so body length is approximately 3.8 scene units including antennae and folded wings. Neutral-pose bounds in original coordinates are min [-2.42119032,-1.50517544,-0.09223154], max [1.37523824,1.50517544,1.74382647]. After root conversion, minimum Y is -0.09223154; position scene/group at Y = 0.09223154 to place lowest feet on ground. Scale parent uniformly to arena design.

Every segment is a sibling under `NeuroMechFly` with a full neutral pose transform. For proper articulated animation, load `public/assets/fly-rig.json` and import `segmentTransforms`/`neutralPoseRad` from `src/fly-fk.js`. Start at neutral pose; modify selected angles in radians; calculate transforms; for every segment use `node.matrix.set(...transforms[name])` and set `matrixAutoUpdate = false`. These row-major full transforms are correct under the provided root coordinate rotation; leave that root unchanged. FK validation against source reference returned max coordinate error 4.86e-10 mm.

A simple walking display can alternate front/hind left + middle right with front/hind right + middle left, perturbing coxa, femur and tibia DOFs. Such procedural animation would be an illustration, not a claim of a neural simulation. Names such as `c_thorax-lf_coxa-pitch`, `lf_coxa-lf_trochanterfemur-pitch`, and `lf_trochanterfemur-lf_tibia-pitch` are available in fly-rig.json. Wings are `l_wing` and `r_wing`; eyes are `l_eye`, `r_eye`.

## Source and license

Meshes and derived rig: Apache License 2.0. Include `NOTICE` and `LICENSE-APACHE-2.0` when distributing. fk.js/stl.js helpers: MIT; retain `LICENSE-MIT` if using them.

Source repository: https://github.com/NeLy-EPFL/fly-svg-maker
Pinned source: https://github.com/NeLy-EPFL/fly-svg-maker/tree/152506d3471646f009480c81f34aefbaec29a6e5
Explicit asset notice: https://github.com/NeLy-EPFL/fly-svg-maker/blob/152506d3471646f009480c81f34aefbaec29a6e5/assets/NOTICE
Upstream model: https://github.com/NeLy-EPFL/flygym
Upstream license: https://github.com/NeLy-EPFL/flygym/blob/38c8ec61034cd59bc5ba0de20688d4a3c0000d60/LICENSE
Model paper: Wang-Chen et al. (2024), NeuroMechFly v2, Nature Methods. https://doi.org/10.1038/s41592-024-02497-y

Suggested visible attribution: “3D anatomy: NeuroMechFly v2 / NeLy-EPFL (Apache-2.0).”

Conversion changes by Codex for this project, 2026-09-12: STL-to-GLB packaging, vertex welding and smooth normals, materials, neutral transforms, and coordinate orientation. This is a visual body asset only; it does not include a connectome or physics/control system.
