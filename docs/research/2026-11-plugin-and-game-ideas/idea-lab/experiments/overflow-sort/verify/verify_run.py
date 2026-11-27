"""Independent re-run by the gen-4 verifier.
Re-runs run.job() for selected tiers/indices with the original seeds, writes fresh jsonl here,
and compares record-by-record against the generator's results-*.jsonl.
Usage: python3 -I verify_run.py <tier>:<n> [<tier>:<n> ...]
"""
import sys, os, json, time
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.dirname(HERE)
sys.path.insert(0, EXP)
import run  # noqa: E402
from multiprocessing import Pool

def main():
    specs = [a.split(':') for a in sys.argv[1:]]
    jobs = [(t, i) for t, n in specs for i in range(int(n))]
    t0 = time.time()
    out = os.path.join(HERE, 'rerun.jsonl')
    with Pool(4) as pool, open(out, 'w') as f:
        recs = list(pool.imap_unordered(run.job, jobs, chunksize=4))
        for r in recs:
            f.write(json.dumps(r) + '\n')
    orig = {}
    for p in ('results-tight.jsonl', 'results-easy-medium.jsonl'):
        for l in open(os.path.join(EXP, p)):
            r = json.loads(l); orig[(r['tier'], r['i'])] = r
    same = diff = missing = 0
    diffs = []
    for r in recs:
        o = orig.get((r['tier'], r['i']))
        if o is None:
            missing += 1; continue
        # round-trip through json for fair comparison
        if json.loads(json.dumps(r)) == o:
            same += 1
        else:
            diff += 1; diffs.append((r['tier'], r['i']))
    print(f'rerun {len(recs)} records in {time.time()-t0:.1f}s; identical={same} different={diff} missing_in_orig={missing}')
    if diffs:
        print('first diffs', diffs[:10])

if __name__ == '__main__':
    main()
