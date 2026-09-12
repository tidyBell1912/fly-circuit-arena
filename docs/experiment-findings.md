# Independent model validation — 2026-09-12

Reproduce with `npm run experiment`. The script snapshots the current source, constructs its null graph in a temporary directory and runs offline. The complete output is `public/results/experiments.json`. It does not request network data or mutate the live arena.

## Design and outcome

20 paired seeds per condition;800 rounds per model run;last200 rounds scored. Two graph conditions ×four tasks ×20pairs ×two learning conditions =256000 decisions. Zero failed runs. Every frozen run preserved its gain arrays exactly. All task cues used completed-round history; current opponent choices were withheld.

| Wiring / task | Learning mean | Frozen mean | Paired difference (95% t interval) |
| --- | ---: | ---: | --- |
| Biased opponent (70/30) | 68.05% | 57.67% | 10.38 pp [8.62 pp, 12.13 pp] |
| Alternating opponent | 86.23% | 51.25% | 34.97 pp [33.68 pp, 36.27 pp] |
| Contingency reversal (85/15 → 15/85) | 82.23% | 40.48% | 41.75 pp [39.60 pp, 43.90 pp] |
| Fair random opponent | 48.55% | 50.22% | -1.68 pp [-3.77 pp, 0.42 pp] |
| Shuffled wiring · Biased opponent (70/30) | 68.05% | 54.18% | 13.87 pp [11.99 pp, 15.76 pp] |
| Shuffled wiring · Alternating opponent | 87.72% | 48.63% | 39.10 pp [37.32 pp, 40.88 pp] |
| Shuffled wiring · Contingency reversal (85/15 → 15/85) | 82.30% | 43.45% | 38.85 pp [36.73 pp, 40.97 pp] |
| Shuffled wiring · Fair random opponent | 49.45% | 50.18% | -0.72 pp [-3.29 pp, 1.84 pp] |

## Scientific interpretation

The enabled engineering rule learned exploitable regularity. Against the70/30 opponent, its68.05% score approaches the68.4% expected ceiling imposed by the4% exploration floor. After reversal,82.225% likewise approaches the82.2% expected ceiling for an85/15 opponent. Finite-sample scores can slightly exceed an expected ceiling.

Adaptation after reversal was slow: accuracy averaged22.15% during the first100 post-reversal rounds, then recovered. Across50-round windows, it was19.2%,25.1%,51.7%,70.2%,79.5%,82.8%,83.0%,83.6% after the switch. At30seconds per round, the initial100-round loss period would last50minutes. This transient failure should accompany any recovery claim.

The real-wiring fair random result was48.55%, with95% CI covering50%; learning did not beat unpredictability. The shuffled graph learned similarly, and did slightly better on alternation in this one graph realization. The experiment does not show that specific recorded anatomy is necessary or superior. These are tests of an engineered seeker policy, not measurements of a real fruit fly or of live Mica betting accuracy.

## Wiring null

Bipartite equal-weight/equal-presynaptic-transmitter edge swaps preserve every PN out-degree and synaptic strength, every KC in-degree and synaptic strength, the full edge-weight histogram, and incoming KC strength separated by neurotransmitter.43730 swaps were accepted;638 of4373 original PN→KC pairs remained. All invariant assertions passed. Nodes, stimulus encoding, KC→MBON, APL and DAN wiring were unchanged. Only one shuffled graph was tested;20neural seeds do not constitute20random graph samples.

## Recorded learning minus shuffled learning

- biased: 0.00 pp,95% CI[0.00 pp,0.00 pp].
- alternation: -1.50 pp,95% CI[-2.75 pp,-0.25 pp].
- reversal: -0.08 pp,95% CI[-0.46 pp,0.31 pp].
- random: -0.90 pp,95% CI[-1.79 pp,-0.01 pp].

## Suggested publication wording

“In20paired-seed controls, enabling the model’s engineered plasticity improved final-window performance against biased, alternating and reversed contingencies. Fair-coin play remained at chance. A degree-and-strength-preserving shuffled circuit also learned, so these results validate the update rule in this task setting; they do not establish an advantage of the particular biological wiring.”

Chinese: “在20组配对随机种子的对照中，开启工程化可塑性提高了模型对偏置、交替及规则反转对手的最终阶段表现；面对独立随机选择，表现仍接近50%。保持连接度数与突触总强度的打乱回路也能学习，因此目前结果支持该任务中的更新规则有效，尚不能证明特定生物接线具有优势。”

## Provenance

- Brain SHA256: 4325db86ec46b4b271c8cfd2622c885f6f38f57f8c548c78384dfeee81ad1752
- Recorded graph SHA256: 68803bce9e136cdbdc07ecd50873044bab85ef931adbcdc0007ad127fd46cbcf
- Shuffled graph SHA256: bdb48d80e5c4d8a66d5f03db66223eaab50015ca2e50479f913a17444da46e07
- Script SHA256: 19e136f95a8bf9ea6c037427219232a324f6b6f41a23e4fa51d60567766008d2

The full report contains parameters, all seeds, every run, failures, final-window intervals,50-round trajectories and shuffle assertions. KC Hz diagnostics use rounded10ms display bins and are approximate.
