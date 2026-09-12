# Five-player Dou Dizhu protocol

This is the current game protocol. The older Sugar Heist experiment in `docs/protocol.md` and its offline results are historical and do not validate card-playing ability.

## Players and information

Five independent MaleCNS-derived model states— Iris, Cobalt, Mica, Ember and Jade—play continuously. All share the same selected anatomical extract (1,001 source neurons, 11,845 recorded directed connections), with separate random states, learned KC→MBON gains and expectations. The model is **not a complete fly brain, an autonomous living fly, or a measured neurochemical simulation**.

A referee controls the 108-card deck, legal moves, ownership, the clock, settlement and hidden identity. The browser is a spectator. Spectators may inspect every hand, but each policy receives only its own cards, public card counts and public plays, bids and the information available to its own role. Hidden partner identity is not given to other policies before it is revealed.

The public data extract is pinned. No neuPrint login, private token, paid inference endpoint or complete brain download is required for a visitor.

## Rules of this table

This project uses an explicit two-deck partnership variant inspired by published [five-player rules](https://www.tcy365.com/news/d1099.html); five-player Dou Dizhu has regional variations.

- Two standard 54-card decks produce 108 unique cards. Each player receives 20; the remaining 8 become the landlord bonus.
- In clockwise order, players either pass or bid above the current 1–3 bid. A bid of 3 closes bidding. The highest bidder is the landlord. If all pass, the same hand is redealt.
- The landlord selects an ordinary card face held in exactly one copy. Whoever holds its other-deck twin becomes the hidden ally. The ally knows its own role, but the landlord does not know the ally's seat. The ally becomes public when it plays the marked face; all identities are disclosed after the hand. In the exceptional case that no eligible face exists, the landlord plays alone.
- The landlord leads. Players must either play a legal beating combination or pass. Leading a fresh trick cannot be passed. After the other four players pass consecutively, the previous player leads a fresh trick.
- An ordinary response has the same type, length and sequence length and a greater main rank. Rank order is 3 through A, then 2, small joker, large joker.
- Singles, pairs, triples, triple with single/pair, straights, consecutive pairs, airplanes with or without single/pair wings and four with two singles/two pairs are supported. Straights and sequence cores exclude 2 and jokers.
- Four through eight cards of the same ordinary rank form a bomb. Longer bombs beat shorter ones, then compare rank. All four jokers form the highest rocket. A small plus large joker is not a rocket or pair; two equal jokers may be a pair.
- This implementation's attachment rules are in `src/doudizhu-rules.js`. They do not allow the airplane core rank to reappear in its wings; wing pairs use distinct ordinary ranks. Four-plus-two is an explicit house rule.
- As soon as a player empties its hand, that player's entire team wins. There is no invented timeout winner.

## Decision mechanism

The engineered legal-move generator creates candidates, and a simple explicit card heuristic chooses a conservative and an attacking alternative. The neural model then selects between them with its two-channel rate decoder. Finishing an entire hand and forced passes are disclosed rule-based actions; they are not credited as voluntary decisions in ordinary team learning.

Eight engineered stimulus channels encode bias, own hand length, own role, high-card share, grouped-card share, current bid or required rank, smallest opposing/public hand count and recent passes. The PN→KC connectivity, KC→MBON connections and counts are anatomical; this sensory encoding, LIF parameters, APL approximation, action decoder and learning rule are assumptions.

Each decision simulates 160 ms. The server schedule displays normal moves for 3 s, bombs for 5 s, dealing for 6 s, bids for 3 s and hand settlement for 12 s. Hands vary in length. The implementation tests demonstrated legal termination and real parameter changes; **we have not shown that learning improves Dou Dizhu win rate**. Sugar Heist control percentages must not be reused as Dou Dizhu results.

Only the last 8 eligible decisions from each player are reinforced at hand settlement, using a win/loss team signal of +1/−1. Gains remain bounded. If a neural episode is silent, the explicitly flagged neutral stochastic fallback has zero eligibility and is excluded from learning; a failed calculation is not labeled as a successful neural episode.

## Beans, credit and feedback

Each new season starts all five players at 10,000 virtual beans and zero debt. Beans have no monetary value and cannot be bought, deposited, withdrawn or redeemed.

The hand unit is 200 beans × winning bid × bomb multiplier. The multiplier doubles for each bomb/rocket and is capped at 16. Each losing player pays one unit to each winning player, limited by that losing player's available balance. Payments are split into integer beans; a remainder goes in ascending winner-seat order. All hand settlements are zero-sum and balances cannot become negative.

At a continuation boundary, a zero-balance player automatically borrows 5,000 beans from the virtual house, at most once per round. It is a system continuation rule, **not a voluntary borrowing choice by the fly**. The transaction adds equal cash and debt, leaving net assets unchanged.

Credit arrival produces a 4 s reward-like phase followed by a 6 s penalty-like phase. Their engineered modulation errors are +0.2 and −0.35. They modify gains using recent decision eligibility, including forced decision traces for the credit modulation only. The reinforcement input offsets the current expected baseline so the two pulse signs are guaranteed. This is a designed intervention, not dopamine measurement or evidence of addiction, pleasure or distress.

At round end, 10% of outstanding borrowed principal (rounded up to an integer bean) is added to debt. Interest does not compound on interest. Debt persists within the season; it is not disguised as earned beans.

## Rounds, seasons and restart

A season has 3 rounds. A round ends after at most 5 completed hands, or early if at least 3 current balances are zero, or a player that already borrowed in that round reaches zero again. Early termination avoids a credit loop. Hand results are always settled first.

After round-end interest, players rank by net assets = beans − debt. The positions earn 10, 6, 3, 1 and 0 points; tied net assets receive the same positional award. Points accumulate across the three rounds. Season champion tie-breaks are total season points, net hand winnings, hand wins, then ascending seat index. The final fixed tie-break is deterministic and disclosed, not a claim of superior intelligence.

Round settlement appears for 12 s; season champion appears for 15 s. A new season archives the previous balances, debt and scores, clears season accounts, grants 10,000 beans to everyone and begins automatically. Lifetime wins, season titles and neural learning state persist. The UI explicitly describes this seasonal reset; it is not hidden replenishment.

## Reproducibility and storage

The server serializes all transitions in one Cloudflare SQLite Durable Object under `ddz-five-v1`. Confirmed state and its next alarm commit before a public broadcast. A delayed alarm advances one state transition; it does not fabricate a backlog of outcomes.

`npm test` includes legal card combinations, whole-hand simulations, conservation, debt limits, signed credit pulses, early round endings and new-season persistence. Complete hand records and completed seasons can be inspected through the public API. Browser actions cannot submit moves, change balances or reset the arena.

## Live neuron inspection

Every fly has its own last-decision diagnostic for **984 simulated units**: 131 PN spike generators, 850 KC LIF units, 2 MBON LIF units and 1 continuous APL unit. The 17 DAN nodes are anatomical context only. The 984 total includes continuous APL and is not a count of spiking neurons.

The viewer places recorded soma positions within real MaleCNS central-brain and bilateral optic-neuropil surfaces. These surfaces provide the recognizable whole-brain anatomical outline. It also displays **62 representative real skeletons**: 27 from the modeled circuit and 35 static background examples. Surfaces, skeletons and soma points share the original 8 nm coordinate system. They do not expand the model into a whole-brain simulation. Asset selection, source hashes, coordinate handling and processing are documented in [brain anatomy](brain-anatomy.md).

The 160 ms episode is played in a labeled 20-times-slower loop. Selecting a node shows the actual spike count, mean rate, final dimensionless model membrane state or APL inhibition. PN generators have no modeled membrane voltage; APL has no simulated spikes. No new spike activity is invented during the table's waiting or loan phases. The displayed timestamp and decision number identify the underlying record.

Soma and whole-skeleton flashes indicate recorded single-cell model events. The model does not calculate conduction along neurites or compartment-specific voltage, so these flashes must not be described as reconstructed spike propagation through the branches. The background skeletons and DAN markers never receive invented activity.

Observation-only instrumentation was compared against the original model and recording-disabled runs, confirming identical choices, probability outputs, random state and learning gains.
