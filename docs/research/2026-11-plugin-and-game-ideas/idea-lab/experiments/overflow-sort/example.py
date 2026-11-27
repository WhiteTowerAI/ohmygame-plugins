"""Print one 'rescued' level (classic unsolvable, O1 solvable) with its shortest O1 solution,
replaying every pour so the rule can be checked by hand. Also prints distribution stats."""
import json, statistics as st
from collections import deque
from sortsolver import moves, is_goal

C = 4
recs = [json.loads(l) for l in open('results-tight.jsonl')]

def solve(start, pipes, rule):
    par = {start: None}; q = deque([start])
    while q:
        s = q.popleft()
        if is_goal(s, C):
            path = []
            while s is not None:
                path.append(s); s = par[s] and par[s][0]
            return path[::-1]
        for c, used in moves(s, C, pipes, rule):
            if c not in par:
                par[c] = (s, used); q.append(c)
    return None

def qs(xs):
    xs = sorted(xs); n = len(xs)
    return f"P25={xs[n//4]:.3f} 中位={st.median(xs):.3f} P75={xs[3*n//4]:.3f}"

for tier in ('tight', 'tight8'):
    R = [r for r in recs if r['tier'] == tier]
    cl = [r['res']['classic']['random_win'] for r in R if r['res']['classic']['solvable']]
    rs = [r['res']['O1']['random_win'] for r in R if not r['res']['classic']['solvable'] and r['res']['O1']['solvable']]
    print(tier, '经典可解关 随机通关率', qs(cl), '| 救活关', qs(rs))
    med = st.median(cl)
    print('  救活关中随机通关率低于经典中位数的比例', sum(x < med for x in rs) / len(rs))
    allo = [r['res']['O1']['opt_avg_overflow_moves'] for r in R if not r['res']['classic']['solvable'] and r['res']['O1']['solvable']]
    print('  救活关最短解溢流次数分布', {k: sum(1 for x in allo if round(x) == k) for k in range(0, 6)})

# pick a short rescued tight level as an example
cand = sorted([r for r in recs if r['tier'] == 'tight' and not r['res']['classic']['solvable']
               and r['res']['O1']['solvable'] and r['res']['O1']['opt_avg_overflow_moves'] >= 2],
              key=lambda r: r['res']['O1']['opt'])
r = cand[0]
deal = tuple(r['deal']); pipes = {int(k): v for k, v in r['pipes'].items()}
print('\n例子：', r['tier'], r['i'], '管道（源瓶→目标瓶）', pipes, 'O1 最短解', r['res']['O1']['opt'], '步')
path = solve(deal, pipes, 'O1')
def show(s): return ' '.join(f'[{b or "-"}]' for b in s)
print(' 0', show(path[0]))
for i in range(1, len(path)):
    a, b = path[i - 1], path[i]
    print(f'{i:2d}', show(b))
