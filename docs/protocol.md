# Protocol v1.0

## Scope and source

The graph is a reproducible extract from a single adult male Drosophila specimen. It contains 1,001 source nodes and 11,845 edges. The active decision pathways are 4,373 PN → KC plus 1,700 KC → MBON edges. APL inhibition uses 850 KC → APL and 850 APL → KC connections. The 4,048 DAN → KC and 24 DAN → MBON connections document anatomical context; they do not directly produce a dopamine concentration in the model.

Output channels are MBON07_L and MBON11_L. Both receive every selected KC. This selection is chosen for a tractable educational demonstration; it is not an unbiased sample of a full brain or evidence of an optimal task circuit.

## Neural episode

- Episode: 160 time steps of 1 ms.
- PN Poisson rate: 8–73 Hz from an eight-channel engineered history encoding. PN identity hashes select a channel; alternating cells receive its complement. This assignment is not an experimentally established odor code.
- Each KC's PN input is normalized by its total extracted structural synapse count. Consensus acetylcholine is treated as excitatory; GABA/glutamate signs are assumed inhibitory in this model.
- KC voltage leak factor 0.9512 per ms; threshold 2.2; reset 0; refractory counter 5 ms.
- APL activity is an exponentially filtered scalar from weighted KC firing, with a 0.035 inhibition factor and structural APL output normalization. This is not a validated biophysical APL model.
- Each MBON receives normalized structural weight × exp(learned log-gain). Its displayed spiking model uses leak 0.95, threshold 0.1 and a refractory counter of 8 ms.
- The action decoder uses KC episode counts normalized by mean count, integrated over the same weighted KC → MBON edges. The two logits enter a logistic policy with scale 3, clipped to [0.04, 0.96]. Displayed MBON spike counts are not the direct action selector; a subthreshold MBON episode can still have a usable rate readout. Complete KC silence raises a visible computation error.

The plotted KC series is the rounded population-average firing rate in 10-ms bins. Hot circuit-view points are the top 32 active KCs from Iris's last revealed episode. Points use recorded soma positions in 8-nm voxels; display scale and orientation are changed. Pulsing is illustrative.

## Learning

For reward r ∈ {−1,+1}, δ = r − b, where b is the agent's expected reward. Each existing KC → MBON log-gain receives:

```
g[a,k] = clip(0.9995*g[a,k] + 0.065*delta*(1[a=chosen] - p[a])*min(4, activity[k]), -1.5, 1.5)
b = 0.95*b + 0.05*r
```

This is an engineered heuristic, not an exact policy-gradient derivation or a reconstruction of receptor-specific dopamine plasticity. In the frozen control, both the update and decay are disabled; the expectation still tracks reward. Every agent has independent gains, expectation and seeded PRNG state.

## Evaluation

The reproducible study compares enabled and frozen learning with paired starting neural random states and identical externally generated opponent sequences. It includes biased, alternating, reversal and independent random opponents. We report the predeclared final window, complete per-seed results, run failures and reversal transients.

A shuffle control performs bipartite PN → KC double-edge swaps within equal synapse-count and transmitter-sign strata. It preserves source/target degree and weighted strength; it changes the actual partner identities. A single shuffled graph is a diagnostic, not an estimate of the entire null distribution. It does not scramble every pathway. Any similar performance after shuffling must be reported rather than omitted.

These tasks test the engineered learning system. No result establishes intelligence in a living fly or validates a complete brain. There is no reason to expect a predictor to exceed 50% against genuinely independent fair choices. Live matching-pennies outcomes alone are not a controlled learning study.

## Reproducibility and live timing

The full private state is checkpointed before an event is broadcast. SQLite stores one row per completed round and match. Repeated alarms cannot settle a round twice. Mica computes before actors; all three receive completed history only. Roles alternate per five-round match. Restarting an isolate restores state rather than restarting learning.

The server advances one phase per due alarm. A long scheduling gap remains observable; it is not filled with invented live activity. Rounds can run longer than 30 seconds under delay. Spectator browser rendering, frame rate and camera position have no effect on outcomes.
