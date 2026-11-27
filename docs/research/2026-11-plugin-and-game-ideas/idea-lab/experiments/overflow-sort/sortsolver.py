"""Water sort solver: classic rule vs. overflow-pipe rules (G3-07 experiment).

State: tuple of strings, one per bottle, bottom -> top, one char per unit of colour.
Bottle identity matters (pipes are attached to fixed positions), so no symmetry reduction
is applied to ANY rule; state counts are comparable across rules.

Rules (capacity C, colour of the top run of A = x, its length = run):
  classic : pour A->B legal iff A not empty, A not a completed bottle, len(B) < C and
            (B empty or top(B) == x). Amount = min(run, C - len(B)).
  O1      : "colour-blind pipe" (the G3-07 proposal made precise).
            Some bottles have ONE outgoing pipe to an adjacent bottle (acyclic).
            Pour into a bottle WITHOUT pipe = classic.
            Pour into a bottle B WITH pipe: mouth check still applies (B empty or top(B) == x),
            B may already be full (pass-through). The WHOLE top run is poured (forced, cannot
            pour part). Excess above C leaves through the pipe to T = pipe(B) and lands on T
            regardless of T's top colour. If T is then over capacity, the excess continues
            through pipe(T). If liquid reaches an over-full bottle that has no pipe, the pour is
            illegal (nothing may spill on the table). One pour = one move, however long the chain.
  O2      : "colour-checked pipe". Same as O1, but liquid arriving through a pipe needs
            T empty or top(T) == x at every hop, else the pour is illegal.
Goal: every bottle empty or holding C units of one colour.
"""
from collections import deque
import random

def top_run(s):
    x = s[-1]
    n = 1
    while n < len(s) and s[-1 - n] == x:
        n += 1
    return x, n

def is_goal(state, C):
    for s in state:
        if s and (len(s) != C or s.count(s[0]) != C):
            return False
    return True

def moves(state, C, pipes, rule):
    """Yield (child_state, used_overflow) for every legal pour."""
    N = len(state)
    out = []
    for a in range(N):
        sa = state[a]
        if not sa:
            continue
        x, run = top_run(sa)
        if run == C:  # completed bottle: never poured from
            continue
        for b in range(N):
            if b == a:
                continue
            sb = state[b]
            if sb and sb[-1] != x:
                continue
            has_pipe = rule != 'classic' and b in pipes
            if not has_pipe:
                if len(sb) >= C:
                    continue
                k = min(run, C - len(sb))
                st = list(state)
                st[a] = sa[:-k]
                st[b] = sb + x * k
                out.append((tuple(st), False))
                continue
            # overflow bottle: forced full run, then propagate
            st = list(state)
            st[a] = sa[:-run]
            st[b] = sb + x * run
            cur = b
            used = False
            ok = True
            while len(st[cur]) > C:
                e = len(st[cur]) - C
                t = pipes.get(cur)
                if t is None:
                    ok = False
                    break
                if rule == 'O2' and st[t] and st[t][-1] != x:
                    ok = False
                    break
                st[cur] = st[cur][:C]
                st[t] = st[t] + x * e
                cur = t
                used = True
            if ok:
                out.append((tuple(st), used))
    return out

def analyse(start, C, pipes, rule, cap=400_000, rollouts=200, rollout_len=150, rng=None):
    """Full reachable-graph analysis. Returns dict of metrics (or capped=True)."""
    ids = {start: 0}
    states = [start]
    adj = []          # list of list of (child_id, used_overflow)
    depth = [0]
    q = deque([0])
    capped = False
    while q:
        u = q.popleft()
        while len(adj) <= u:
            adj.append(None)
        lst = []
        for child, used in moves(states[u], C, pipes, rule):
            v = ids.get(child)
            if v is None:
                if len(states) >= cap:
                    capped = True
                    continue
                v = len(states)
                ids[child] = v
                states.append(child)
                depth.append(depth[u] + 1)
                q.append(v)
            lst.append((v, used))
        adj[u] = lst
    n = len(states)
    del ids
    if capped:
        return {'capped': True, 'states': n}
    goal = [is_goal(s, C) for s in states]
    del states  # free memory before building the reverse graph
    # reverse BFS from goals -> distance to goal
    radj = [[] for _ in range(n)]
    for u in range(n):
        for v, _ in adj[u]:
            radj[v].append(u)
    INF = 10**9
    dg = [INF] * n
    q = deque()
    for i in range(n):
        if goal[i]:
            dg[i] = 0
            q.append(i)
    while q:
        v = q.popleft()
        for u in radj[v]:
            if dg[u] == INF:
                dg[u] = dg[v] + 1
                q.append(u)
    solvable = dg[0] < INF
    nongoal = [i for i in range(n) if not goal[i]]
    dead = sum(1 for i in nongoal if dg[i] == INF)
    branching = sum(len(adj[i]) for i in nongoal) / max(1, len(nongoal))
    res = {
        'capped': False, 'states': n, 'solvable': solvable,
        'dead_ratio': dead / max(1, len(nongoal)),
        'branching': branching,
        'start_moves': len(adj[0]),
        'start_trap': (sum(1 for v, _ in adj[0] if dg[v] == INF) / len(adj[0])) if adj[0] else 0.0,
        'overflow_edges_frac': (sum(1 for i in nongoal for _, us in adj[i] if us) /
                                max(1, sum(len(adj[i]) for i in nongoal))),
    }
    if not solvable:
        return res
    L = dg[0]
    res['opt'] = L
    # count shortest solutions (move sequences), those w/o overflow, and avg overflow moves
    order = sorted(range(n), key=lambda i: depth[i])
    cnt = [0] * n; cnt_no = [0] * n; ovsum = [0] * n
    cnt[0] = 1; cnt_no[0] = 1
    total = total_no = total_ov = 0
    for u in order:
        if cnt[u] == 0 or depth[u] + dg[u] != L:
            continue
        if dg[u] == 0:
            total += cnt[u]; total_no += cnt_no[u]; total_ov += ovsum[u]
            continue
        for v, used in adj[u]:
            if depth[v] == depth[u] + 1 and dg[v] == dg[u] - 1:
                cnt[v] += cnt[u]
                ovsum[v] += ovsum[u] + (cnt[u] if used else 0)
                if not used:
                    cnt_no[v] += cnt_no[u]
    res['n_opt'] = total
    res['opt_no_overflow_frac'] = total_no / total
    res['opt_avg_overflow_moves'] = total_ov / total
    # random player: uniform legal move, avoid undoing the previous move when possible
    rng = rng or random.Random(0)
    wins = 0
    for _ in range(rollouts):
        u, prev = 0, -1
        for _step in range(rollout_len):
            if goal[u]:
                break
            opts = [v for v, _ in adj[u] if v != prev] or [v for v, _ in adj[u]]
            if not opts:
                break
            prev, u = u, rng.choice(opts)
        if goal[u]:
            wins += 1
    res['random_win'] = wins / rollouts if rollouts else None
    return res

def random_level(k, empties, C, rng):
    units = [chr(ord('a') + i) for i in range(k) for _ in range(C)]
    while True:
        rng.shuffle(units)
        bottles = [''.join(units[i * C:(i + 1) * C]) for i in range(k)]
        if any(b.count(b[0]) == C for b in bottles):
            continue  # reject deals with an already-finished bottle
        bottles += [''] * empties
        rng.shuffle(bottles)
        return tuple(bottles)

def random_pipes(N, p, rng):
    """p pipes between adjacent bottles (row layout), random direction, no 2-cycles,
    at most one outgoing pipe per bottle."""
    pairs = list(range(N - 1))
    rng.shuffle(pairs)
    pipes = {}
    for i in pairs[:p]:
        src, dst = (i, i + 1) if rng.random() < 0.5 else (i + 1, i)
        if src in pipes:
            src, dst = dst, src
            if src in pipes:
                continue
        pipes[src] = dst
    return pipes
