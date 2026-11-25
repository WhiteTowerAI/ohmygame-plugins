// Pixel Search's query engine, from src/lib/search/engine.ts of
// https://huggingface.co/spaces/cfahlgren1/pixel-search at commit
// 9687c39d60881ba80208e671ba12ac216019b1d0, released under CC0 1.0.
// Compiled from TypeScript with esbuild and otherwise unchanged.

const STOP_WORDS = new Set("a an the of in on with and to for at by from".split(" "));
const VECTOR_SCALE = 258.15903;
const TOKEN_RE = /[a-z0-9]+(?:['-][a-z0-9]+)*/g;
const LEXICAL_BOOST = 0.04;
const EXACT_SUBJECT_BOOST = 0.12;
const ATTRIBUTE_MIN_SIM = 0.62;
const MAX_SUBJECTS = 520;
const MIN_SUBJECTS = 6;
const FLOOR_SCORE = 0.3;
const RELATIVE_CUT = 0.66;
const FINAL_RELATIVE_CUT = 0.62;
const MIN_ATTRIBUTE_POSTINGS = 258;
const MAX_ATTRIBUTE_POSTINGS = 193500;
const SINGLE_ATTRIBUTE_POSTINGS = 3225;
const SUBJECT_DECAY = 0.03;
const LONGEST_SUBJECT = 512;
const SCORE_BUCKETS = 4096;
const SPRITE_ID_RANGE = 2097152;
function tokenize(text) {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}
function lowerBound(list, key) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (list[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function trigrams(word) {
  const padded = `^${word}$`;
  const out = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}
class SearchEngine {
  dims;
  subjects;
  subjectLower;
  termsA;
  vecA;
  freqA;
  vecS;
  indexA = /* @__PURE__ */ new Map();
  subjectByPhrase = /* @__PURE__ */ new Map();
  termsB = [];
  vecB = new Int8Array(0);
  indexB = /* @__PURE__ */ new Map();
  scores;
  order;
  fuzzyIndex = null;
  semanticTop = 0;
  subjectStart = new Uint32Array(0);
  candidateStamp = new Uint32Array(0);
  candidateSprites = new Uint32Array(0);
  candidateValues = new Float32Array(0);
  generation = 0;
  positionDecay = Float32Array.from({ length: LONGEST_SUBJECT }, (_, k) => SUBJECT_DECAY * Math.log2(1 + k));
  spriteSubject = new Uint16Array(0);
  captionStart = new Uint32Array(0);
  captionTokens = new Uint16Array(0);
  postingStart = new Uint32Array(0);
  postings = new Uint32Array(0);
  /** Weight of caption attribute coverage for multi-term queries; set by the parameter sweep. */
  attributeWeight = 0.6;
  /** A lone word counts as an attribute only when captions use it often, like "red" or "glowing". */
  singleTermWeight(terms) {
    if (terms.length !== 1 || !this.captionStart.length) return 0;
    const postings = this.postingStart[terms[0].tierA + 1] - this.postingStart[terms[0].tierA];
    return postings >= SINGLE_ATTRIBUTE_POSTINGS ? 0.3 : 0;
  }
  /** Per-term similarity to every tier-A word, cached because typing repeats terms. */
  similarityCache = /* @__PURE__ */ new Map();
  constructor(data) {
    this.dims = data.dims;
    this.subjects = data.subjects;
    this.subjectLower = data.subjects.map((s) => s.toLowerCase());
    this.termsA = data.termsA;
    this.vecA = data.vecA;
    this.freqA = data.freqA;
    this.vecS = data.vecS;
    data.termsA.forEach((term, i) => this.indexA.set(term, i));
    this.subjectLower.forEach((subject, i) => this.subjectByPhrase.set(tokenize(subject).join(" "), i));
    this.scores = new Float32Array(data.subjects.length);
    this.order = new Uint32Array(data.subjects.length);
  }
  setGeneralVocabulary(terms, vectors) {
    this.termsB = terms;
    this.vecB = vectors;
    this.indexB.clear();
    terms.forEach((term, i) => this.indexB.set(term, i));
    this.fuzzyIndex = null;
  }
  /** Catalog ids are sorted by subject, so `subjectStart` alone defines every subject's sprites. */
  setCatalog(subjectStart) {
    const count = subjectStart[subjectStart.length - 1];
    const spriteSubject = new Uint16Array(count);
    for (let s = 0; s + 1 < subjectStart.length; s++) spriteSubject.fill(s, subjectStart[s], subjectStart[s + 1]);
    this.subjectStart = subjectStart;
    this.spriteSubject = spriteSubject;
    this.candidateStamp = new Uint32Array(count);
  }
  /** The stream holds one token count per sprite, then all token low bytes, then all high bytes. */
  setCaptions(stream) {
    const count = this.spriteSubject.length;
    const tokenCount = (stream.length - count) / 2;
    const start = new Uint32Array(count + 1);
    const tokens = new Uint16Array(tokenCount);
    const high = count + tokenCount;
    for (let i = 0; i < tokenCount; i++) tokens[i] = stream[count + i] | stream[high + i] << 8;
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      start[i] = cursor;
      cursor += stream[i];
    }
    start[count] = cursor;
    this.captionStart = start;
    this.captionTokens = tokens;
    this.buildPostings();
  }
  buildPostings() {
    const vocabulary = this.termsA.length;
    const start = new Uint32Array(vocabulary + 1);
    for (const token of this.captionTokens) start[token + 1]++;
    for (let t = 0; t < vocabulary; t++) start[t + 1] += start[t];
    const fill = start.slice(0, vocabulary);
    const postings = new Uint32Array(this.captionTokens.length);
    for (let sprite = 0; sprite < this.captionStart.length - 1; sprite++) {
      for (let c = this.captionStart[sprite]; c < this.captionStart[sprite + 1]; c++) {
        postings[fill[this.captionTokens[c]]++] = sprite;
      }
    }
    this.postingStart = start;
    this.postings = postings;
  }
  /** Reconstructs a sprite's caption from its token ids. */
  caption(sprite) {
    if (!this.captionStart.length) return this.subjects[this.spriteSubject[sprite]] ?? "";
    const words = [];
    for (let c = this.captionStart[sprite]; c < this.captionStart[sprite + 1]; c++) {
      words.push(this.termsA[this.captionTokens[c]]);
    }
    return words.join(" ");
  }
  subjectOf(sprite) {
    return this.subjects[this.spriteSubject[sprite]] ?? "";
  }
  /** Index of the sprite order sorted by caption availability; exposed for evaluation. */
  captionTokensOf(sprite) {
    const words = [];
    for (let c = this.captionStart[sprite]; c < this.captionStart[sprite + 1]; c++) {
      words.push(this.termsA[this.captionTokens[c]]);
    }
    return words;
  }
  /** Blend of the most frequent dataset words starting with an unfinished token. */
  prefixCompletions(prefix) {
    const from = lowerBound(this.termsA, prefix);
    const to = lowerBound(this.termsA, `${prefix}\uFFFF`);
    if (from >= to) return [];
    const top = [];
    for (let i = from; i < to; i++) {
      const freq = this.freqA[i];
      if (top.length < 3) {
        top.push({ index: i, freq });
        top.sort((a, b) => b.freq - a.freq);
      } else if (freq > top[2].freq) {
        top[2] = { index: i, freq };
        top.sort((a, b) => b.freq - a.freq);
      }
    }
    const sum = top.reduce((acc, item) => acc + 2 ** (item.freq / 16), 0);
    return top.map((item) => ({ index: item.index, weight: 2 ** (item.freq / 16) / sum }));
  }
  lookup(term) {
    const a = this.indexA.get(term);
    if (a !== void 0) return { source: this.vecA, offset: a * this.dims, tierA: a };
    const b = this.indexB.get(term);
    if (b !== void 0) return { source: this.vecB, offset: b * this.dims, tierA: -1 };
    return null;
  }
  buildFuzzyIndex() {
    const index = /* @__PURE__ */ new Map();
    const addWord = (word, id) => {
      for (const gram of new Set(trigrams(word))) {
        let bucket = index.get(gram);
        if (!bucket) {
          bucket = [];
          index.set(gram, bucket);
        }
        bucket.push(id);
      }
    };
    this.termsA.forEach((word, i) => addWord(word, i));
    this.termsB.forEach((word, i) => addWord(word, i + this.termsA.length));
    return index;
  }
  /** Called during idle time so that the first typo does not pay for index construction. */
  warmFuzzyIndex() {
    if (!this.fuzzyIndex) this.fuzzyIndex = this.buildFuzzyIndex();
  }
  fuzzyMatch(word) {
    if (word.length < 4) return null;
    this.warmFuzzyIndex();
    const index = this.fuzzyIndex;
    const counts = /* @__PURE__ */ new Map();
    const grams = new Set(trigrams(word));
    for (const gram of grams) {
      for (const id of index.get(gram) ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const threshold = 0.5;
    const pick = (from, to) => {
      let best = null;
      let bestScore = threshold;
      for (const [id, shared] of counts) {
        if (id < from || id >= to) continue;
        const candidate = id < this.termsA.length ? this.termsA[id] : this.termsB[id - this.termsA.length];
        const frequency = id < this.termsA.length ? this.freqA[id] : 0;
        const dice = 2 * shared / (grams.size + candidate.length + 1) + frequency / 1200;
        if (dice > bestScore) {
          bestScore = dice;
          best = candidate;
        }
      }
      return best;
    };
    return pick(0, this.termsA.length) ?? pick(this.termsA.length, this.termsA.length + this.termsB.length);
  }
  /** @param partial true when the user is still typing the last token (no trailing space). */
  compile(query, partial = true) {
    const tokens = tokenize(query);
    const terms = [];
    const literals = [];
    const dims = this.dims;
    const vector = new Float32Array(dims);
    let unresolved = tokens.length > 0;
    const addTerm = (text, source, offset, weight, tierA) => {
      for (let d = 0; d < dims; d++) vector[d] += source[offset + d] * weight;
      terms.push({ text, weight, tierA, source, offset });
      unresolved = false;
    };
    let i = 0;
    while (i < tokens.length) {
      const isLast = i === tokens.length - 1;
      let consumed = 0;
      for (let n = Math.min(4, tokens.length - i); n > 1; n--) {
        const subject = this.subjectByPhrase.get(tokens.slice(i, i + n).join(" "));
        if (subject !== void 0) {
          addTerm(this.subjects[subject], this.vecS, subject * dims, 1, -1);
          literals.push(tokens.slice(i, i + n).join(" "));
          consumed = n;
          break;
        }
      }
      if (consumed > 0) {
        i += consumed;
        continue;
      }
      const word = tokens[i];
      i += 1;
      if (STOP_WORDS.has(word) && !(isLast && partial)) continue;
      literals.push(word);
      const exact = this.lookup(word);
      if (exact) {
        addTerm(word, exact.source, exact.offset, 1, exact.tierA);
        continue;
      }
      if (word.endsWith("s") && word.length > 3) {
        const singular = this.lookup(word.slice(0, -1));
        if (singular) {
          addTerm(word.slice(0, -1), singular.source, singular.offset, 1, singular.tierA);
          continue;
        }
      }
      if (isLast && partial) {
        const completions = this.prefixCompletions(word);
        if (completions.length > 0) {
          const confidence = word.length === 1 ? 0.3 : word.length === 2 ? 0.6 : 1;
          for (const { index, weight } of completions) {
            addTerm(this.termsA[index], this.vecA, index * dims, weight * confidence, index);
          }
          continue;
        }
      }
      const fuzzy = this.fuzzyMatch(word);
      if (fuzzy) {
        const hit = this.lookup(fuzzy);
        if (hit) addTerm(fuzzy, hit.source, hit.offset, 0.8, hit.tierA);
        literals[literals.length - 1] = fuzzy;
      } else {
        literals.pop();
      }
    }
    let norm = 0;
    for (let d = 0; d < dims; d++) norm += vector[d] * vector[d];
    if (norm < 1e-6) return { terms, vector: null, literals, unresolved };
    norm = Math.sqrt(norm);
    for (let d = 0; d < dims; d++) vector[d] /= norm * VECTOR_SCALE;
    return { terms, vector, literals, unresolved };
  }
  wordSimilarity(tierAIndex) {
    const cached = this.similarityCache.get(tierAIndex);
    if (cached) return cached;
    const dims = this.dims;
    const vectors = this.vecA;
    const count = this.termsA.length;
    const out = new Float32Array(count);
    const offset = tierAIndex * dims;
    const scale = VECTOR_SCALE * VECTOR_SCALE;
    for (let t = 0, p = 0; t < count; t++) {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += vectors[p + d] * vectors[offset + d];
      p += dims;
      out[t] = dot / scale;
    }
    if (this.similarityCache.size >= 96) this.similarityCache.clear();
    this.similarityCache.set(tierAIndex, out);
    return out;
  }
  /** Score every subject by dot product. Returns false if the query has no vector. */
  scoreSubjects(compiled) {
    const { vector, literals } = compiled;
    const scores = this.scores;
    const subjectCount = this.subjects.length;
    if (!vector) {
      scores.fill(0);
    } else {
      const dims = this.dims;
      const matrix = this.vecS;
      for (let s = 0, p = 0; s < subjectCount; s++) {
        let dot = 0;
        for (let d = 0; d < dims; d++) dot += matrix[p + d] * vector[d];
        p += dims;
        scores[s] = dot;
      }
    }
    const fullQuery = literals.join(" ");
    for (const literal of literals) {
      if (literal.length < 2) continue;
      for (let s = 0; s < subjectCount; s++) {
        const subject = this.subjectLower[s];
        const hit = subject.startsWith(literal) || subject.includes(` ${literal}`) || subject.includes(`-${literal}`);
        if (hit) scores[s] += LEXICAL_BOOST;
      }
    }
    let semanticTop = 0;
    for (let s = 0; s < subjectCount; s++) if (scores[s] > semanticTop) semanticTop = scores[s];
    this.semanticTop = semanticTop;
    if (literals.length > 0) {
      const exact = this.subjectByPhrase.get(fullQuery);
      if (exact !== void 0) scores[exact] += EXACT_SUBJECT_BOOST;
    }
    return !!vector || literals.some((literal) => literal.length >= 2);
  }
  search(query, maxSprites, partial = true) {
    const started = performance.now();
    const trimmed = query.trim();
    if (!trimmed) return { sprites: new Uint32Array(0), matched: 0, subjectCount: 0, computeMs: 0, mode: "empty" };
    const endsWithSpace = /\s$/.test(query);
    const compiled = this.compile(query, partial && !endsWithSpace);
    const usable = this.scoreSubjects(compiled);
    const mode = compiled.vector ? "semantic" : "lexical";
    if (!usable) {
      return { sprites: new Uint32Array(0), matched: 0, subjectCount: 0, computeMs: performance.now() - started, mode };
    }
    const scores = this.scores;
    const subjectCount = this.subjects.length;
    const order = this.order;
    for (let s = 0; s < subjectCount; s++) {
      const q = Math.max(0, Math.min(32767, Math.round(scores[s] * 32767)));
      order[s] = q << 17 | s;
    }
    order.sort();
    if (this.semanticTop <= 0) {
      return { sprites: new Uint32Array(0), matched: 0, subjectCount: 0, computeMs: performance.now() - started, mode };
    }
    const cut = Math.max(FLOOR_SCORE, this.semanticTop * RELATIVE_CUT);
    const selected = [];
    for (let k = subjectCount - 1; k >= 0 && selected.length < MAX_SUBJECTS; k--) {
      const s = order[k] & 131071;
      const value = (order[k] >>> 17) / 32767;
      if (value < cut && selected.length >= MIN_SUBJECTS) break;
      selected.push(s);
    }
    const attributeTerms = compiled.terms.filter((term) => term.tierA >= 0 && term.weight >= 0.5);
    const attributeWeight = attributeTerms.length >= 2 ? this.attributeWeight : this.singleTermWeight(attributeTerms);
    const similarities = attributeTerms.map((term) => this.wordSimilarity(term.tierA));
    const haveCaptions = this.captionStart.length > 0;
    const generation = ++this.generation;
    const stamp = this.candidateStamp;
    let capacity = 0;
    for (const subject of selected) capacity += this.subjectStart[subject + 1] - this.subjectStart[subject];
    const usesPostings = (count) => count >= MIN_ATTRIBUTE_POSTINGS && count <= MAX_ATTRIBUTE_POSTINGS;
    for (const term of attributeTerms) {
      const count = this.postingStart[term.tierA + 1] - this.postingStart[term.tierA];
      if (usesPostings(count)) capacity += count;
    }
    if (this.candidateSprites.length < capacity) {
      this.candidateSprites = new Uint32Array(capacity);
      this.candidateValues = new Float32Array(capacity);
    }
    const candidates = this.candidateSprites;
    const values = this.candidateValues;
    let candidateCount = 0;
    const score = (sprite, subjectScore) => {
      let bonus = 0;
      if (haveCaptions && similarities.length > 0) {
        for (let t = 0; t < similarities.length; t++) {
          const similarity = similarities[t];
          let best2 = 0;
          for (let c = this.captionStart[sprite]; c < this.captionStart[sprite + 1]; c++) {
            if (this.captionTokens[c] === attributeTerms[t].tierA) {
              best2 = 1;
              break;
            }
            const value = similarity[this.captionTokens[c]];
            if (value > best2) best2 = value;
          }
          if (best2 > ATTRIBUTE_MIN_SIM) bonus += (best2 - ATTRIBUTE_MIN_SIM) / (1 - ATTRIBUTE_MIN_SIM);
        }
        bonus /= similarities.length;
      }
      return subjectScore + attributeWeight * bonus * bonus;
    };
    const add = (sprite, subjectScore) => {
      stamp[sprite] = generation;
      candidates[candidateCount] = sprite;
      values[candidateCount++] = score(sprite, subjectScore);
    };
    for (const subject of selected) {
      const subjectScore = scores[subject];
      for (let sprite = this.subjectStart[subject]; sprite < this.subjectStart[subject + 1]; sprite++) add(sprite, subjectScore);
    }
    for (const term of attributeTerms) {
      const start = this.postingStart[term.tierA];
      const end = this.postingStart[term.tierA + 1];
      if (!usesPostings(end - start)) continue;
      for (let p = start; p < end; p++) {
        const sprite = this.postings[p];
        if (stamp[sprite] !== generation) add(sprite, scores[this.spriteSubject[sprite]]);
      }
    }
    let best = 0;
    for (let i = 0; i < candidateCount; i++) if (values[i] > best) best = values[i];
    const finalCut = best * FINAL_RELATIVE_CUT;
    const sprites = this.topSprites(candidateCount, finalCut, maxSprites);
    const subjects = /* @__PURE__ */ new Set();
    for (const sprite of sprites.ids) subjects.add(this.spriteSubject[sprite]);
    return { sprites: sprites.ids, matched: sprites.matched, subjectCount: subjects.size, computeMs: performance.now() - started, mode };
  }
  /** Partial selection: a histogram finds the score floor, so only the winners need a real sort. */
  topSprites(candidateCount, finalCut, limit) {
    const candidates = this.candidateSprites;
    const values = this.candidateValues;
    let matched = 0;
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < candidateCount; i++) {
      if (values[i] < finalCut) continue;
      const sprite = candidates[i];
      const position = sprite - this.subjectStart[this.spriteSubject[sprite]];
      const key = values[i] - this.positionDecay[position];
      candidates[matched] = sprite;
      values[matched++] = key;
      if (key < low) low = key;
      if (key > high) high = key;
    }
    if (matched === 0) return { ids: new Uint32Array(0), matched };
    const scale = (SCORE_BUCKETS - 1) / Math.max(high - low, 1e-6);
    const histogram = new Uint32Array(SCORE_BUCKETS);
    for (let i = 0; i < matched; i++) histogram[(values[i] - low) * scale | 0]++;
    let floorBucket = SCORE_BUCKETS - 1;
    let selected = histogram[floorBucket];
    while (selected < limit && floorBucket > 0) selected += histogram[--floorBucket];
    const keys = new Float64Array(selected);
    let cursor = 0;
    for (let i = 0; i < matched; i++) {
      if (((values[i] - low) * scale | 0) < floorBucket) continue;
      keys[cursor++] = Math.round((values[i] - low) * 1e6) * SPRITE_ID_RANGE + (SPRITE_ID_RANGE - 1 - candidates[i]);
    }
    keys.sort();
    const ids = new Uint32Array(Math.min(limit, selected));
    for (let i = 0; i < ids.length; i++) ids[i] = SPRITE_ID_RANGE - 1 - keys[selected - 1 - i] % SPRITE_ID_RANGE;
    return { ids, matched };
  }
  /** Ranked subject names for a query, used by evaluation. */
  rankSubjects(query, limit, partial = false) {
    const compiled = this.compile(query, partial);
    this.scoreSubjects(compiled);
    const indices = Array.from(this.scores.keys());
    indices.sort((a, b) => this.scores[b] - this.scores[a]);
    return indices.slice(0, limit).map((s) => this.subjects[s]);
  }
}
export {
  STOP_WORDS,
  SearchEngine,
  VECTOR_SCALE,
  tokenize
};
