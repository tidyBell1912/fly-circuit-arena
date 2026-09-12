/** Five-player, two-deck (108-card) Dou Dizhu rules. */
const TYPES = new Set([
  'single', 'pair', 'triple', 'triple-single', 'triple-pair', 'straight',
  'pair-straight', 'airplane', 'airplane-single', 'airplane-pair',
  'four-two-single', 'four-two-pair', 'bomb', 'rocket',
]);
const SUITS = ['♣', '♦', '♥', '♠'];
const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
const MAX_CANDIDATES = 2000;
const MAX_WING_VARIANTS = 96;

export const RULES_NOTES = Object.freeze([
  '五人双副牌，共 108 张；每人先发 20 张，地主再拿 8 张底牌。',
  '普通点数的四至八张同点牌均为炸弹，张数多者更大，同张数比较点数。',
  '四张王共同组成最大的火箭；一大一小两张王不是火箭，同点数的两张王可以组成对子。',
  '顺子、连对和飞机主干只能使用 3 至 A，不能包含 2 或大小王。',
  '飞机主干每个点数必须恰好三张；有歧义时优先识别纯飞机。',
  '飞机单翼按单张数量计算，允许重复点数，但不得含主干点数，也不得同时含大小王。',
  '飞机对翼必须是不同点数的对子，且不得含主干点数。',
  '四带二单允许同点数的对子，但不得同时带大小王；四带二对必须带不同点数的两对。',
  '炸弹压过普通牌型，火箭压过炸弹；普通牌必须牌型、张数和主干长度相同才能比较。',
]);

function validCards(cards) {
  return Array.isArray(cards) && [...cards].every(card => Number.isInteger(card) && card >= 0 && card < 108)
    && new Set(cards).size === cards.length;
}

export function rankOf(card) {
  if (!Number.isInteger(card) || card < 0 || card >= 108) throw new RangeError('Card ID must be an integer from 0 through 107.');
  const base = card % 54;
  return base < 52 ? Math.floor(base / 4) + 3 : base - 36;
}

export function cardDeck(card) {
  rankOf(card);
  return Math.floor(card / 54);
}

export function cardSuit(card) {
  return rankOf(card) > 15 ? null : SUITS[(card % 54) % 4];
}

export function cardLabel(card) {
  const rank = rankOf(card);
  return rank > 15 ? (rank === 16 ? '小王' : '大王') : `${RANK_LABELS[rank] ?? rank}${cardSuit(card)}`;
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => rankOf(a) - rankOf(b) || a - b);
}

function bucketsOf(cards) {
  const buckets = new Map();
  for (const card of sortCards(cards)) {
    const rank = rankOf(card);
    if (!buckets.has(rank)) buckets.set(rank, []);
    buckets.get(rank).push(card);
  }
  return buckets;
}

function pattern(type, size, mainRank, chainLength = 1) {
  return { type, size, mainRank, chainLength, bomb: type === 'bomb', rocket: type === 'rocket' };
}

function consecutive(ranks) {
  return ranks.at(-1) <= 14 && ranks.every((rank, i) => i === 0 || rank === ranks[i - 1] + 1);
}

/** Returns null for invalid cards or a non-pattern. Pure chains precede wing interpretations. */
export function classifyMove(cards) {
  if (!validCards(cards) || cards.length === 0) return null;
  const size = cards.length;
  const buckets = bucketsOf(cards);
  const ranks = [...buckets.keys()];
  const count = rank => buckets.get(rank)?.length ?? 0;
  const all = n => ranks.every(rank => count(rank) === n);
  if (size === 1) return pattern('single', size, ranks[0]);
  if (size === 4 && count(16) === 2 && count(17) === 2) return pattern('rocket', size, 17);
  if (ranks.length === 1) {
    if (size >= 4 && size <= 8 && ranks[0] <= 15) return pattern('bomb', size, ranks[0]);
    const type = ({ 2: 'pair', 3: 'triple' })[size];
    return type ? pattern(type, size, ranks[0]) : null;
  }
  if (size === 4 || size === 5) {
    const triple = ranks.find(rank => count(rank) === 3);
    if (triple !== undefined && (size === 4 || (ranks.length === 2 && ranks.some(rank => count(rank) === 2)))) {
      return pattern(size === 4 ? 'triple-single' : 'triple-pair', size, triple);
    }
  }
  if (size >= 5 && all(1) && consecutive(ranks)) return pattern('straight', size, ranks.at(-1), ranks.length);
  if (size >= 6 && all(2) && consecutive(ranks)) return pattern('pair-straight', size, ranks.at(-1), ranks.length);
  if (size >= 6 && all(3) && consecutive(ranks)) return pattern('airplane', size, ranks.at(-1), ranks.length);

  if (size === 6 || size === 8) {
    const quad = ranks.find(rank => count(rank) === 4);
    if (quad !== undefined) {
      const wings = ranks.filter(rank => rank !== quad);
      if (size === 6 && !(count(16) && count(17))) return pattern('four-two-single', size, quad);
      if (size === 8 && wings.length === 2 && wings.every(rank => count(rank) === 2)) {
        return pattern('four-two-pair', size, quad);
      }
    }
  }

  // Highest valid body resolves the remaining ambiguity between winged airplanes.
  for (const [type, divisor] of [['airplane-single', 4], ['airplane-pair', 5]]) {
    const length = size / divisor;
    if (!Number.isInteger(length) || length < 2 || length > 12) continue;
    for (let end = 14; end >= 3 + length - 1; end--) {
      const body = Array.from({ length }, (_, i) => end - length + 1 + i);
      if (!body.every(rank => count(rank) === 3)) continue;
      const bodySet = new Set(body);
      const wings = ranks.filter(rank => !bodySet.has(rank));
      if (type === 'airplane-single') {
        if (!(count(16) && count(17))) return pattern(type, size, end, length);
      } else if (wings.length === length && wings.every(rank => count(rank) === 2)) {
        return pattern(type, size, end, length);
      }
    }
  }
  return null;
}

export function beats(move, lastMove) {
  if (!move || !TYPES.has(move.type)) return false;
  if (!lastMove) return true;
  if (!TYPES.has(lastMove.type) || lastMove.type === 'rocket') return false;
  if (move.type === 'rocket') return true;
  if (move.type === 'bomb' && lastMove.type !== 'bomb') return true;
  if (lastMove.type === 'bomb' && move.type !== 'bomb') return false;
  if (move.type === 'bomb' && lastMove.type === 'bomb') {
    return move.size > lastMove.size || (move.size === lastMove.size && move.mainRank > lastMove.mainRank);
  }
  return move.type === lastMove.type && move.size === lastMove.size
    && move.chainLength === lastMove.chainLength && move.mainRank > lastMove.mainRank;
}

/**
 * Enumerates rank-distinct choices; equivalent suits use the lowest card IDs.
 * Wing combinations are bounded per body, with at most 2,000 raw candidates.
 * Passing is represented by the caller, not by an entry in this list.
 */
export function legalMoves(hand, tableMove = null) {
  if (!validCards(hand) || hand.length === 0 || tableMove?.type === 'rocket') return [];
  const buckets = bucketsOf(hand);
  const ranks = [...buckets.keys()];
  const result = [];
  const seen = new Set();
  let rawCandidates = 0;
  const count = rank => buckets.get(rank)?.length ?? 0;
  const take = (rank, n) => buckets.get(rank).slice(0, n);
  const wants = type => !tableMove || tableMove.type === type;
  const add = cards => {
    if (rawCandidates >= MAX_CANDIDATES) return false;
    const sorted = sortCards(cards);
    const key = sorted.join(',');
    if (seen.has(key)) return true;
    seen.add(key);
    rawCandidates++;
    const classified = classifyMove(sorted);
    if (classified && beats(classified, tableMove)) result.push({ cards: sorted, pattern: classified });
    return rawCandidates < MAX_CANDIDATES;
  };

  // A legal immediate finish must remain available even if wing enumeration is capped.
  add(hand);
  for (const rank of ranks) {
    if (rank > 15) continue;
    for (let n = 4; n <= count(rank); n++) add(take(rank, n));
  }
  if (count(16) === 2 && count(17) === 2) add([52, 53, 106, 107]);
  for (const [type, n] of [['single', 1], ['pair', 2], ['triple', 3]]) {
    if (wants(type)) for (const rank of ranks) if (count(rank) >= n) add(take(rank, n));
  }
  if (wants('triple-single') || wants('triple-pair')) {
    for (const rank of ranks) {
      if (count(rank) < 3) continue;
      for (const wing of ranks) {
        if (wing === rank) continue;
        if (wants('triple-single')) add([...take(rank, 3), ...take(wing, 1)]);
        if (wants('triple-pair') && count(wing) >= 2) add([...take(rank, 3), ...take(wing, 2)]);
      }
    }
  }

  const airplaneBodies = [];
  for (const [type, multiplicity, minimum] of [['straight', 1, 5], ['pair-straight', 2, 3], ['airplane', 3, 2]]) {
    const needWings = type === 'airplane' && (wants('airplane-single') || wants('airplane-pair'));
    if (!wants(type) && !needWings) continue;
    for (let start = 3; start <= 14; start++) {
      const body = [];
      const bodyRanks = [];
      for (let end = start; end <= 14 && count(end) >= multiplicity; end++) {
        body.push(...take(end, multiplicity));
        bodyRanks.push(end);
        if (bodyRanks.length < minimum) continue;
        if (wants(type)) add(body);
        if (needWings) airplaneBodies.push({ cards: [...body], ranks: [...bodyRanks] });
      }
    }
  }

  // Pick bounded multisets of single cards, or distinct pairs, outside body ranks.
  const addWings = (body, excluded, required, pairs, limit = MAX_WING_VARIANTS) => {
    if (rawCandidates >= MAX_CANDIDATES || required < 1) return;
    const eligible = ranks.filter(rank => !excluded.has(rank) && (!pairs || count(rank) >= 2));
    const capacities = eligible.map(rank => pairs ? 1 : count(rank));
    const remaining = Array(eligible.length + 1).fill(0);
    for (let i = eligible.length - 1; i >= 0; i--) remaining[i] = remaining[i + 1] + capacities[i];
    if (remaining[0] < required) return;
    let variants = 0;
    const chosen = [];
    const visit = (index, needed, smallJoker) => {
      if (variants >= limit || rawCandidates >= MAX_CANDIDATES) return;
      if (needed === 0) {
        variants++;
        add([...body, ...chosen]);
        return;
      }
      if (index >= eligible.length || remaining[index] < needed) return;
      const rank = eligible[index];
      const maximum = Math.min(capacities[index], needed);
      for (let n = maximum; n >= 0; n--) {
        if (!pairs && rank === 17 && n > 0 && smallJoker) continue;
        if (remaining[index + 1] < needed - n) continue;
        const originalLength = chosen.length;
        if (n) chosen.push(...take(rank, pairs ? 2 : n));
        visit(index + 1, needed - n, smallJoker || (rank === 16 && n > 0));
        chosen.length = originalLength;
        if (variants >= limit || rawCandidates >= MAX_CANDIDATES) return;
      }
    };
    visit(0, required, false);
  };

  const wingTasks = [];
  for (const rank of ranks) {
    if (rank > 15 || count(rank) < 4) continue;
    const excluded = new Set([rank]);
    if (wants('four-two-single')) wingTasks.push([take(rank, 4), excluded, 2, false]);
    if (wants('four-two-pair')) wingTasks.push([take(rank, 4), excluded, 2, true]);
  }
  for (const body of airplaneBodies) {
    const excluded = new Set(body.ranks);
    if (wants('airplane-single')) wingTasks.push([body.cards, excluded, body.ranks.length, false]);
    if (wants('airplane-pair')) wingTasks.push([body.cards, excluded, body.ranks.length, true]);
  }
  // Give every possible body a representative before spending the budget on alternatives.
  for (const task of wingTasks) addWings(...task, 1);
  for (const task of wingTasks) addWings(...task);
  return result;
}

export function makeDeck() {
  return Array.from({ length: 108 }, (_, card) => card);
}

/** Fisher-Yates shuffle with a supplied RNG, or a reproducible numeric/string seed. */
export function shuffleDeck(seedOrRng = Math.random) {
  let rng = seedOrRng;
  if (typeof rng !== 'function') {
    let state = 2166136261;
    for (const char of String(seedOrRng)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    rng = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let n = Math.imul(state ^ state >>> 15, state | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new RangeError('RNG must return a number in [0, 1).');
    const j = Math.floor(random * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
