#!/usr/bin/env python3
"""실험 1 민감도 — 어떤 가정이 결과를 좌우하는가 (python3 sensitivity.py)"""
import random
import sim

def run(trials=2000, scan_s=5, n_other=8, n_ec=0, seed=7):
    rng = random.Random(seed)
    seen = ver = 0
    for _ in range(trials):
        t = sim.exp1_trial(rng, scan_s, n_other, n_ec)
        seen += t["seen"]; ver += t["ver"]
    return seen / trials, ver / trials

print("| 바꾼 가정 | 값 | 수신 recall | 최종 recall |")
print("|---|---|---|---|")
base = dict(sim.PARAMS)
for key, vals in (("scan_duty", [0.25, 0.5, 1.0]), ("mfg_table_coverage", [0.6, 0.8, 0.9, 1.0]),
                  ("path_loss_n", [2.0, 2.2, 3.0]), ("shadow_sigma_db", [4.0, 6.0, 9.0])):
    for v in vals:
        sim.PARAMS.update(base); sim.PARAMS[key] = v
        a, b = run()
        print(f"| {key} | {v} | {a:.3f} | {b:.3f} |")
sim.PARAMS.update(base)
print("\n| 광고 간격(전자담배) | 수신 recall | 최종 recall |\n|---|---|---|")
for iv in ([0.1], [0.5], [1.0], [1.28], [2.0]):
    sim.PARAMS["ecig_adv_intervals_s"] = iv
    a, b = run()
    print(f"| {iv[0]} s | {a:.3f} | {b:.3f} |")
sim.PARAMS.update(base)
print("\n| top_k (다중 전자담배 환경, 5 s) | 최종 recall |\n|---|---|")
for k in (1, 3, 5, 8):
    sim.PARAMS["top_k"] = k
    print(f"| {k} | {run(n_other=25, n_ec=5)[1]:.3f} |")
