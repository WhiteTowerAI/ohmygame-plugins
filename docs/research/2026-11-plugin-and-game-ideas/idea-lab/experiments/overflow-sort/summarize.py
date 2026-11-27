"""Summarise results*.jsonl into markdown tables (printed to stdout)."""
import json, sys, glob, statistics as st

recs = []
for p in sorted(glob.glob('results-*.jsonl')):
    recs += [json.loads(l) for l in open(p)]
TIER_ORDER = ['easy', 'medium', 'tight', 'tight8']
TIER_DESC = {'easy': '4 色 + 2 空瓶（6 瓶），2 根管', 'medium': '5 色 + 2 空瓶（7 瓶），2 根管',
             'tight': '6 色 + 1 空瓶（7 瓶），2 根管', 'tight8': '8 色 + 1 空瓶（9 瓶），3 根管'}

def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else float('nan')

def med(xs):
    xs = list(xs)
    return st.median(xs) if xs else float('nan')

def pct(x):
    return f'{100 * x:.1f}%'

def f2(x):
    return f'{x:.2f}'

print('## 表 1：可解率（同一批随机牌局，三种规则）\n')
print('| 档位 | 牌局数 | 超出状态上限 | 经典 可解 | O1 色盲溢流 可解 | O2 验色溢流 可解 | 经典不可解→O1 可解（"救活"） | 经典可解→O1 不可解（"卡死"） |')
print('|---|---|---|---|---|---|---|---|')
for t in TIER_ORDER:
    R = [r for r in recs if r['tier'] == t]
    if not R:
        continue
    ok = [r for r in R if not any(r['res'][x].get('capped') for x in r['res'])]
    capped = len(R) - len(ok)
    sol = {x: mean(r['res'][x]['solvable'] for r in ok) for x in ('classic', 'O1', 'O2')}
    uns = [r for r in ok if not r['res']['classic']['solvable']]
    solv = [r for r in ok if r['res']['classic']['solvable']]
    rescue = mean(r['res']['O1']['solvable'] for r in uns) if uns else float('nan')
    kill = mean(not r['res']['O1']['solvable'] for r in solv) if solv else float('nan')
    print(f"| {t}：{TIER_DESC[t]} | {len(R)} | {capped} | {pct(sol['classic'])} | {pct(sol['O1'])} | {pct(sol['O2'])} | "
          f"{pct(rescue)}（{sum(r['res']['O1']['solvable'] for r in uns)}/{len(uns)}） | {pct(kill)}（{sum(not r['res']['O1']['solvable'] for r in solv)}/{len(solv)}） |")

def block(rows, label, get):
    """rows: list of (classic_res, other_res)."""
    c = [a for a, _ in rows]; o = [b for _, b in rows]
    return [
        label, str(len(rows)),
        f"{f2(mean(x['opt'] for x in c))} → {f2(mean(x['opt'] for x in o))}",
        f"{pct(mean(b['opt'] < a['opt'] for a, b in rows))} / {pct(mean(b['opt'] == a['opt'] for a, b in rows))} / {pct(mean(b['opt'] > a['opt'] for a, b in rows))}",
        f"{med(x['n_opt'] for x in c):.0f} → {med(x['n_opt'] for x in o):.0f}",
        f"{f2(mean(x['branching'] for x in c))} → {f2(mean(x['branching'] for x in o))}",
        f"{pct(mean(x['dead_ratio'] for x in c))} → {pct(mean(x['dead_ratio'] for x in o))}",
        f"{pct(mean(x['start_trap'] for x in c))} → {pct(mean(x['start_trap'] for x in o))}",
        f"{pct(mean(x['random_win'] for x in c))} → {pct(mean(x['random_win'] for x in o))}",
        f"{pct(mean(1 - x['opt_no_overflow_frac'] for x in o))}",
        f"{pct(mean(x['opt_no_overflow_frac'] == 0 for x in o))}",
        f"{f2(mean(x['opt_avg_overflow_moves'] for x in o))}",
    ]

print('\n## 表 2：两种规则都可解的同一批牌局，配对比较（箭头左边 = 经典，右边 = 溢流）\n')
print('| 档位 / 规则 | 配对关数 | 最短解步数（均值） | 最短解 变短 / 相同 / 变长 | 最短解条数（中位） | 平均分支数 | 死路状态占比 | 开局第一步踩坑率 | 随机玩家通关率 | 最短解中用到溢流的比例 | 必须用溢流的关（所有最短解都用） | 每条最短解平均溢流次数 |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for t in TIER_ORDER:
    R = [r for r in recs if r['tier'] == t and not any(r['res'][x].get('capped') for x in r['res'])]
    if not R:
        continue
    for rule in ('O1', 'O2'):
        rows = [(r['res']['classic'], r['res'][rule]) for r in R
                if r['res']['classic']['solvable'] and r['res'][rule]['solvable']]
        print('| ' + ' | '.join(block(rows, f'{t} / {rule}', None)) + ' |')
    best = [(r['res']['classic'], r['best_O1']['res']) for r in R if 'best_O1' in r]
    if best:
        print('| ' + ' | '.join(block(best, f'{t} / O1 生成器挑管（8 选 1，取随机通关率最低）', None)) + ' |')

print('\n## 表 3："救活"的关（经典不可解、O1 可解）长什么样\n')
print('| 档位 | 关数 | 最短解步数（均值） | 死路状态占比 | 开局第一步踩坑率 | 随机玩家通关率 | 每条最短解平均溢流次数 |')
print('|---|---|---|---|---|---|---|')
for t in TIER_ORDER:
    R = [r for r in recs if r['tier'] == t and not any(r['res'][x].get('capped') for x in r['res'])
         and not r['res']['classic']['solvable'] and r['res']['O1']['solvable']]
    if not R:
        continue
    o = [r['res']['O1'] for r in R]
    print(f"| {t} | {len(R)} | {f2(mean(x['opt'] for x in o))} | {pct(mean(x['dead_ratio'] for x in o))} | "
          f"{pct(mean(x['start_trap'] for x in o))} | {pct(mean(x['random_win'] for x in o))} | {f2(mean(x['opt_avg_overflow_moves'] for x in o))} |")

print('\n## 表 4：状态空间大小（可达状态数，均值；不做瓶子对称约简）\n')
print('| 档位 | 经典 | O1 | O2 |')
print('|---|---|---|---|')
for t in TIER_ORDER:
    R = [r for r in recs if r['tier'] == t and not any(r['res'][x].get('capped') for x in r['res'])]
    if not R:
        continue
    print(f"| {t} | " + ' | '.join(f"{mean(r['res'][x]['states'] for r in R):,.0f}" for x in ('classic', 'O1', 'O2')) + ' |')
