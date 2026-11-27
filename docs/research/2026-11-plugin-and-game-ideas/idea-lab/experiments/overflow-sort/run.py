"""Batch experiment: classic vs overflow rules on the same random deals.

Usage: python3 run.py [out.jsonl]
Tiers (capacity 4 everywhere):
  easy   : 4 colours + 2 empty bottles (6 bottles), 2 pipes
  medium : 5 colours + 2 empty bottles (7 bottles), 2 pipes
  tight  : 6 colours + 1 empty bottle  (7 bottles), 2 pipes
  tight8 : 8 colours + 1 empty bottle  (9 bottles), 3 pipes
For the tight tiers we also try BEST_OF random pipe layouts per deal and keep the
O1-solvable layout with the lowest random-player win rate ("generator picks pipes").
"""
import json, random, sys
from multiprocessing import Pool
from sortsolver import analyse, random_level, random_pipes

C = 4
TIERS = {
    'easy':   dict(k=4, e=2, p=2, n=200, cap=2_000_000, best_of=0),
    'medium': dict(k=5, e=2, p=2, n=80,  cap=2_000_000, best_of=0),
    'tight':  dict(k=6, e=1, p=2, n=600, cap=2_000_000, best_of=8),
    'tight8': dict(k=8, e=1, p=3, n=1500, cap=2_000_000, best_of=8),
}
RULES = ('classic', 'O1', 'O2')

def job(args):
    tier, i = args
    t = TIERS[tier]
    rng = random.Random(f'{tier}-{i}')
    deal = random_level(t['k'], t['e'], C, rng)
    pipes = random_pipes(len(deal), t['p'], rng)
    rec = {'tier': tier, 'i': i, 'deal': deal, 'pipes': pipes, 'res': {}}
    for rule in RULES:
        rec['res'][rule] = analyse(deal, C, pipes, rule, cap=t['cap'], rng=random.Random(i))
    if t['best_of'] and rec['res']['classic'].get('solvable'):
        best = None
        for j in range(t['best_of']):
            pp = random_pipes(len(deal), t['p'], random.Random(f'{tier}-{i}-pipes-{j}'))
            r = analyse(deal, C, pp, 'O1', cap=t['cap'], rng=random.Random(i))
            if r.get('solvable') and (best is None or r['random_win'] < best[1]['random_win']):
                best = (pp, r)
        if best:
            rec['best_O1'] = {'pipes': best[0], 'res': best[1]}
    rec['pipes'] = {str(k): v for k, v in pipes.items()}
    if 'best_O1' in rec:
        rec['best_O1']['pipes'] = {str(k): v for k, v in rec['best_O1']['pipes'].items()}
    return rec

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'results.jsonl'
    tiers = sys.argv[2].split(',') if len(sys.argv) > 2 else list(TIERS)
    jobs = [(tier, i) for tier in tiers for i in range(TIERS[tier]['n'])]
    with Pool(4) as pool, open(out, 'w') as f:
        for n, rec in enumerate(pool.imap_unordered(job, jobs, chunksize=4)):
            f.write(json.dumps(rec) + '\n')
            if n % 100 == 0:
                print(n, 'done', flush=True)
