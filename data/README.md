# Data attribution

Source: **MaleCNS v1.0**, HHMI Janelia FlyEM, Cambridge collaborators and Google Research.

- Project: https://male-cns.janelia.org/
- Query service: https://neuprint.janelia.org/
- Dataset: `male-cns:v1.0`
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Retrieved: 2026-09-12. Exact query, dataset UUID, source metadata and response hashes are in `provenance.json` and `circuit.json`.
- Shipped graph SHA-256: `68803bce9e136cdbdc07ecd50873044bab85ef931adbcdc0007ad127fd46cbcf`

Changes: selected a left mushroom-body circuit; converted source rows into a compact JSON graph; assigned application role labels. `public/data/circuit-view.json` retains recorded soma positions and samples every twentieth source edge for display. Display lines are schematic and are not neuron skeletons. No missing connections were invented.

Selection: 131 PNs, 850 KCs, MBON07_L (18603), MBON11_L (10704), APL_L (10977), and 17 dopamine-associated inputs. The 31 KCs without PN input in this extract remain without PN input. All 850 selected KCs have raw `predictedNt=dopamine` but curated `consensusNt=acetylcholine`; the model uses the consensus field. Glutamate/GABA inhibitory signs are model assumptions, not receptor measurements.

This project is an independent demonstration and does not imply endorsement by the data authors or institutions.
