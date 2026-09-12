# Real MaleCNS anatomy in the live viewer

The viewer combines three real neuropil surfaces with a small sample of real neuron centerlines. All assets come from **MaleCNS v1.0 in its original EM coordinate space**. No FlyWire, FAFB, mirrored specimen or template-space geometry is mixed into this display.

This is a whole-brain **anatomical backdrop**, not a simulation of the whole brain. The selected circuit remains the previously documented 1,001-node source extract: 984 modeled units and 17 DAN used only as anatomical context. The surfaces describe neuropil compartments; they are not a cell-body envelope or a reconstruction of every neuronal membrane.

## Public sources and license

The [official MaleCNS download page](https://male-cns.janelia.org/download/) documents the public skeleton directories, native 8 nm coordinate units and CC BY license. The [neuPrint client documentation](https://connectome-neuprint.github.io/neuprint-python/docs/client.html#neuprint.client.Client.fetch_roi_mesh) describes OBJ ROI meshes and explicitly limits them to visualization.

The three surfaces are available without authentication:

| Region | Public OBJ | Vertices | Triangles |
|---|---|---:|---:|
| Central brain | [CentralBrain](https://neuprint.janelia.org/api/roimeshes/mesh/male-cns:v1.0/CentralBrain) | 59,215 | 118,478 |
| Left optic neuropil | [Optic(L)](https://neuprint.janelia.org/api/roimeshes/mesh/male-cns:v1.0/Optic%28L%29) | 30,817 | 61,694 |
| Right optic neuropil | [Optic(R)](https://neuprint.janelia.org/api/roimeshes/mesh/male-cns:v1.0/Optic%28R%29) | 30,191 | 60,472 |

Each SWC uses this public URL pattern:

```text
https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/{bodyId}.swc
```

For example, [MBON07 / 18603](https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/18603.swc) is the same neuron ID used by the model. Raw source data is credited to **FlyEM (HHMI Janelia), University of Cambridge, MRC Laboratory of Molecular Biology, and Google Research**, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This project converts formats, rounds display coordinates and simplifies skeleton polylines as described below.

## Coordinate registration and viewing direction

Both the neuPrint OBJ files and these SWCs are expressed in **8 nm voxel units**, matching `somaVoxel` and the positions in `circuit-view.json`. The conversion applies no registration transform. To display micrometers, multiply every asset and every soma coordinate by `0.008`.

The 256 nm value reported for the underlying ROI segmentation is its voxel resolution. **Do not multiply these OBJ vertices by 256.** A cross-check against the official AME(L) precomputed mesh found its nanometer-space bounds approximately eight times the corresponding neuPrint OBJ bounds, with less than 0.16% disagreement from differing surface simplification. The [Neuroglancer legacy mesh specification](https://github.com/google/neuroglancer/blob/master/src/datasource/precomputed/meshes.md) defines that format's mesh vertex coordinates in nanometers.

Combined source bounds in 8 nm units:

```text
min = [2169, 4603, 7934]
max = [93825, 54173, 51841]
center = [47997, 29388, 29887.5]
```

The **X / −Y projection**, viewed along the original Z axis, presents the recognizable rounded bilateral optic lobes and central brain. The X / −Z projection looks flatter and more like a top view. These alternatives were checked by rendering all three real surfaces in the three coordinate planes. A suitable initial viewer mapping is `(x − centerX, −(y − centerY), z − centerZ)`, with the camera on positive scene Z. Apply the same mapping to surfaces, skeletons, soma points and activity markers. Viewing rotations are presentation choices and do not change the source coordinates.

## Exact display scope

The surface asset contains **120,223 vertices and 240,644 triangles**. All original triangles and vertices remain; no mesh decimation, synthetic lobes or procedural spheres are used. Positions are rounded to the nearest 8 nm voxel, giving at most 4 nm error per axis. VNC and the cervical connective are excluded.

The skeleton sample contains **62 neurons**:

- 27 model-circuit neurons: 9 PN, 15 KC across five annotated types, 2 MBON and 1 APL.
- 35 additional anatomical examples from both sides, including central-complex, visual, bilateral optic, MBON and ALPN classes. They are static context and do not receive modeled activity.

The sample was chosen for readable anatomical coverage, not as a statistically representative neuron sample. Fixed body IDs and annotation snapshots are embedded in the rebuild script. The 27 circuit IDs are checked against the circuit extract during asset validation.

Centerlines follow original SWC parent links. Ramer–Douglas–Peucker simplification is applied separately to each maximal unbranched chain with a 32-voxel / 256 nm tolerance. All branch points and terminals remain. Coordinates are rounded to the nearest voxel. Disconnected fragments are retained separately: there is no fragment healing, cross-neurite connection or random line thinning. The resulting sample contains 175,251 points and 175,178 line segments.

`simulated: true` is restricted to selected PN, KC, MBON and APL model cells. APL has a continuous inhibition state, not simulated spikes. This morphology sample contains **no DAN skeletons**; the circuit's 17 DAN remain anatomy-only markers, with no fabricated voltage, firing rate or spike train. The builder's activity whitelist would also mark a DAN sample `simulated: false`.

Any glow along a whole neuron is an illustration of its recorded model event. The model uses one state per cell; it does not calculate spike conduction or compartment-specific voltage along the reconstructed neurites.

## Rebuild and integration

Requirements: Python 3.10+ and `curl`; no token and no additional Python packages.

```bash
python3 scripts/build-brain-anatomy.py --output-dir artifacts/brain-anatomy
```

The script retrieves only 62 SWCs and three ROI meshes, approximately 28.8 MB of decoded source data. Cached files are reused. SHA-256 values for all 65 source files are pinned; an upstream change or failed retrieval stops the build for inspection. It does not download synapses, image volumes, the entire connectivity graph or the complete skeleton collection.

Outputs:

- `male-cns-anatomy.json`: the viewer asset, approximately 11.14 MB uncompressed / **3.35 MB gzip**.
- `male-cns-brain-surfaces.glb`: complete three-region surfaces, approximately **4.34 MB**. Normals are omitted; a lit renderer may calculate them from the preserved triangle indices.
- `anatomy-manifest.json` and `skeleton-provenance.json`: counts, exact source URLs, checksums, bounds and processing details.

The JSON interface is:

```text
{
  coordinateSpace: "MaleCNS EM 8nm",
  bounds: { min: [x,y,z], max: [x,y,z] },
  regions: [{ name, positions: [x,y,z,...], indices: [a,b,c,...] }],
  skeletons: [{ id, bodyId, type, role, simulated, soma,
               positions: [x,y,z,...], edges: [a,b,...] }],
  provenance: { ... }
}
```

The deployed front end loads `public/data/male-cns-anatomy.json`, served at `/data/male-cns-anatomy.json`. After rebuilding, copy only the combined JSON into that public path:

```bash
cp artifacts/brain-anatomy/male-cns-anatomy.json public/data/male-cns-anatomy.json
```

The GLB is an optional export produced by the same script; the current viewer does not load or require it. Raw OBJ/SWC caches and the `.json.gz` companion are build outputs, not additional viewer requests. Source hashes are deterministic; output file hashes can differ when the generation timestamp changes.

The three pinned OBJ SHA-256 values are:

```text
CentralBrain 32ff845c59e71282e42a8eeb5114820f8d985e014516663b86e1833c57ecf60e
Optic(L)     53aa38a1412f03aeb55f6cf0df0705de03edf0483de4dcb98398ee18dc7135f3
Optic(R)     7dad4d5316a1134df4d4ca916c294db179478fa29b76db0154f1607ed5668b47
```
