# Fly Card Club

**Five fruit-fly circuit models. One global Dou Dizhu table.**

[Watch live](https://fly-circuit-arena.fly-circuit-arena.workers.dev) · [Protocol](docs/doudizhu-protocol.md) · [Data provenance](data/README.md)

Iris, Cobalt, Mica, Ember and Jade play a five-player, two-deck partnership version of Dou Dizhu. There is a landlord, a hidden ally, and three farmers. Five independent connectome-derived states select between engineered legal card candidates. A single Cloudflare Durable Object owns the game, so every spectator sees the same decisions, balances and season results.

## A table that continues

- Five players start each season with **10,000 virtual beans each**.
- Three rounds per season, up to five hands per round. Insolvency can end a round early.
- At zero, automatic virtual credit provides 5,000 beans, at most once per player per round. A short modeled positive signal is followed by a delayed negative signal. Outstanding principal adds 10% interest at round end.
- Rank uses beans minus debt. Round points crown a season champion. The next season archives old accounts and starts everyone at 10,000; lifetime records and neural learning state persist.
- Cards, bombs, role reveals, debt signals and fly body animations are visible. The website offers Chinese, English, Korean, Japanese and Vietnamese, country-based initial language selection and a manual flag menu.
- Every language includes a beginner's rules guide. Spectators can inspect hands and completed play histories; a fly policy only sees its own permitted information.

## What is biological—and what is modeled

The small pinned MaleCNS v1.0 extract contains **1,001 source neurons and 11,845 directed connections**. Neuron identities and recorded synapse counts are real. Sensory encoding, LIF dynamics, inhibitory approximation, card heuristics, decoder, plasticity, rewards and credit interventions are engineering choices.

Each fly has **984 simulated units**: 131 PN spike generators, 850 KC units, 2 MBON units and 1 continuous APL inhibition unit. The remaining **17 DAN are anatomical background**, with no simulated dopamine release or firing. APL is continuous, so the 984 units must not all be described as spiking neurons.

The brain viewer uses the **real whole-brain neuropil outline**, including both optic lobes and the central brain, with **62 representative neuron skeletons** in the same MaleCNS coordinate space. Of these skeletons, 27 belong to the modeled circuit and 35 provide static anatomical context. Recorded single-cell events can flash a soma or its displayed branches; this does not simulate spike propagation along the branches. Selecting a neuron shows its latest 160 ms diagnostic record in a labeled slow replay. See [brain anatomy, source assets and display limits](docs/brain-anatomy.md).

This is **not whole-brain emulation, measured dopamine, a living fly, or a demonstration of consciousness or addiction**. Tests establish game correctness and actual parameter updates; they do not establish improved Dou Dizhu skill. The repository retains historical Sugar Heist code and controls for reproducibility, but those percentages do not apply to the card game.

The 3D flies use NeuroMechFly v2 anatomical meshes and modeled choreography. The teahouse background is an original generated illustration. Beans are non-monetary experiment points: there are no deposits, withdrawals, purchases or payouts.

## Run

Node.js 24 or newer is recommended.

```sh
npm ci
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:8787. This runs the Worker and SQLite Durable Object locally. `npm run dev` provides frontend development while the local Worker remains running.

## Deploy

```sh
npx wrangler login --use-keyring
npm run deploy
```

Choose your own Worker name in `wrangler.jsonc`. The deployment uses Cloudflare Workers, static assets and a SQLite Durable Object; a paid model API and custom domain are unnecessary. The Free tier has finite daily limits. See [operations](docs/operations.md). A new game model must use a new namespace rather than silently overwrite live learning state.

## Public data

- `/api/state` — confirmed public snapshot.
- `/api/live` — read-only WebSocket snapshots.
- `/api/health` — model, progress and scheduling health.
- `/api/matches` and `/api/matches/:id` — completed hand records.
- `/api/seasons` and `/api/seasons/:id` — archived season results.
- `data/circuit.json`, `data/provenance.json` — selected graph and extraction evidence.
- `public/data/male-cns-anatomy.json` — real brain surfaces and representative skeletons; approximately 3.35 MB when gzip-compressed.

Re-extract the selected public graph without credentials:

```sh
python3 scripts/extract_circuit.py /tmp/malecns-extract
```

Visitors load a small anatomical display asset and current diagnostics, without downloading the complete connectome or EM volume. No neuPrint token or account cookie is embedded in this project.

## Licenses and acknowledgments

- Application source: MIT, [LICENSE](LICENSE).
- MaleCNS v1.0: HHMI Janelia FlyEM and collaborators, CC BY 4.0; [attribution](data/README.md).
- NeuroMechFly v2 anatomy: NeLy-EPFL, Apache-2.0; [asset provenance](docs/3d-asset-provenance.md), [NOTICE](public/assets/NOTICE).
- Forward kinematics helper and Three.js: MIT.
- Original teahouse illustration: [generation provenance](docs/teahouse-art.md).

Scientific references: [MaleCNS](https://male-cns.janelia.org/), [Shiu et al., 2024](https://www.nature.com/articles/s41586-024-07763-9), [reward prediction error model](https://www.nature.com/articles/s41467-021-22592-4), [NeuroMechFly v2](https://doi.org/10.1038/s41592-024-02497-y).
