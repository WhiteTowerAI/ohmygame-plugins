"""Verifier: (1) independent re-implementation of rules classic/O1/O2 written from the text of
gen-4 games proposal sec 1.1, compared with sortsolver.moves() on random reachable states;
(2) fresh-seed out-of-sample slice of the tight tiers; (3) actual pipe counts.
Usage: python3 -I verify_rule.py"""
import sys, os, json, random, statistics as st
HERE = os.path.dirname(os.path.abspath(__file__)); EXP = os.path.dirname(HERE)
sys.path.insert(0, EXP)
from sortsolver import moves, analyse, random_level, random_pipes
from multiprocessing import Pool
C = 4

def my_moves(state, pipes, rule):
    res = set()
    N = len(state)
    for a in range(N):
        A = list(state[a])
        if not A: continue
        x = A[-1]; run = 0
        while run < len(A) and A[-1-run] == x: run += 1
        if run == C: continue  # completed bottle cannot be poured from
        for b in range(N):
            if b == a: continue
            B = list(state[b])
            if B and B[-1] != x: continue           # mouth colour check (all rules)
            bot = [list(s) for s in state]
            if rule == 'classic' or b not in pipes:
                if len(B) >= C: continue
                k = min(run, C - len(B))
                del bot[a][-k:]; bot[b] += [x]*k
                res.add(tuple(''.join(s) for s in bot)); continue
            # pipe bottle: whole run forced in
            del bot[a][-run:]; bot[b] += [x]*run
            cur, legal = b, True
            visited = 0
            while len(bot[cur]) > C:
                excess = bot[cur][C:]
                assert all(c == x for c in excess), 'excess not x'
                if cur not in pipes: legal = False; break
                t = pipes[cur]
                if rule == 'O2' and bot[t] and bot[t][-1] != x: legal = False; break
                bot[cur] = bot[cur][:C]; bot[t] += excess; cur = t
                visited += 1; assert visited <= N, 'cycle'
            if legal: res.add(tuple(''.join(s) for s in bot))
    return res

def check_rules(n=3000, seed=7):
    rng = random.Random(seed); bad = 0; tested = 0
    for _ in range(n):
        k = rng.choice([4,5,6,8]); e = rng.choice([1,2]); p = rng.choice([1,2,3])
        s = random_level(k, e, C, rng); pipes = random_pipes(len(s), p, rng)
        # random walk under O1 to reach mid-game states
        for _ in range(rng.randint(0, 12)):
            ch = moves(s, C, pipes, 'O1')
            if not ch: break
            s = rng.choice(ch)[0]
        for rule in ('classic', 'O1', 'O2'):
            a = set(c for c, _ in moves(s, C, pipes, rule)); b = my_moves(s, pipes, rule)
            tested += 1
            if a != b: bad += 1
    return tested, bad

def fresh(args):
    tier, i = args
    k, e, p = {'tight': (6,1,2), 'tight8': (8,1,3)}[tier]
    rng = random.Random(f'VERIFY-{tier}-{i}')
    deal = random_level(k, e, C, rng); pipes = random_pipes(len(deal), p, rng)
    out = {'tier': tier, 'npipes': len(pipes)}
    for rule in ('classic', 'O1', 'O2'):
        out[rule] = analyse(deal, C, pipes, rule, cap=2_000_000, rng=random.Random(i))
    return out

if __name__ == '__main__':
    t, b = check_rules()
    print(f'rule cross-check: {t} (state,rule) successor sets compared, mismatches={b}')
    # pipe counts in original data
    from collections import Counter
    for fn in ('results-tight.jsonl', 'results-easy-medium.jsonl'):
        cnt = Counter()
        for l in open(os.path.join(EXP, fn)):
            r = json.loads(l); cnt[(r['tier'], len(r['pipes']))] += 1
        print('actual pipe counts', fn, dict(cnt))
    jobs = [('tight', i) for i in range(1000)] + [('tight8', i) for i in range(1500)]
    with Pool(4) as pool: R = pool.map(fresh, jobs, chunksize=8)
    for tier in ('tight', 'tight8'):
        T = [r for r in R if r['tier'] == tier]
        sc = sum(r['classic']['solvable'] for r in T)/len(T)
        s1 = sum(r['O1']['solvable'] for r in T)/len(T)
        s2 = sum(r['O2']['solvable'] for r in T)/len(T)
        uns = [r for r in T if not r['classic']['solvable']]
        sol = [r for r in T if r['classic']['solvable']]
        resc = [r for r in uns if r['O1']['solvable']]
        kill = sum(not r['O1']['solvable'] for r in sol)
        pair = [r for r in sol if r['O1']['solvable']]
        m = lambda xs: sum(xs)/len(xs)
        print(f"\n[{tier}] fresh n={len(T)} classic={sc:.1%} O1={s1:.1%} O2={s2:.1%} rescued={len(resc)}/{len(uns)} ({len(resc)/len(uns):.1%}) killed={kill}/{len(sol)}")
        print(f"  paired n={len(pair)}: opt {m([r['classic']['opt'] for r in pair]):.2f}->{m([r['O1']['opt'] for r in pair]):.2f}; shorter={sum(r['O1']['opt']<r['classic']['opt'] for r in pair)}; "
              f"random_win {m([r['classic']['random_win'] for r in pair]):.1%}->{m([r['O1']['random_win'] for r in pair]):.1%}; dead {m([r['classic']['dead_ratio'] for r in pair]):.1%}->{m([r['O1']['dead_ratio'] for r in pair]):.1%}; "
              f"opt uses overflow {m([1-r['O1']['opt_no_overflow_frac'] for r in pair]):.1%}; must-overflow {m([r['O1']['opt_no_overflow_frac']==0 for r in pair]):.1%}")
        print(f"  rescued: opt {m([r['O1']['opt'] for r in resc]):.2f} dead {m([r['O1']['dead_ratio'] for r in resc]):.1%} random_win mean {m([r['O1']['random_win'] for r in resc]):.1%} median {st.median([r['O1']['random_win'] for r in resc]):.1%} ovf/sol {m([r['O1']['opt_avg_overflow_moves'] for r in resc]):.2f}")
        print(f"  classic-solvable: opt {m([r['classic']['opt'] for r in sol]):.2f} dead {m([r['classic']['dead_ratio'] for r in sol]):.1%} random_win median {st.median([r['classic']['random_win'] for r in sol]):.1%}")
        o2same = sum(r['O2']['solvable'] == r['classic']['solvable'] for r in T)
        print(f"  O2 solvability identical to classic in {o2same}/{len(T)} deals; actual pipes {Counter(r['npipes'] for r in T)}")
