#!/usr/bin/env python3
"""
전자담배 센싱 자동 수집 — 시뮬레이션 (NonsmokingNote / MedIT)

!! 이 코드는 "가정한 생성 모형" 위에서 도는 시뮬레이션입니다. 실기기 측정이 아닙니다.
!! 모든 가정 수치는 PARAMS 에 모아 두었고, 문헌/실측으로 보정하기 전까지는
!! 절대값이 아니라 "설계 선택지끼리의 상대 비교"로만 읽어야 합니다.

표준 라이브러리만 사용합니다 (python3 sim.py [--quick] [--out results.json]).

실험 1  기기 탐색·센싱 판별     5초 BLE 스캔 → 후보 필터 → 상위 3대 GATT 확인(2단계)
실험 2  자동 수집 완전성       링크 끊김/앱 중지/기기 링버퍼/카운터형 기기, 완전성 지표의 신뢰도
실험 3  니코틴 환산·추세 검출   퍼프 수 vs 퍼프 길이 기반 추정, 전주 대비 감소 검출력
"""
import argparse
import json
import math
import random
import statistics as st

SEED = 20261021

# ---------------------------------------------------------------- 가정 모음
PARAMS = {
    # --- 실험 1: 무선 환경 -------------------------------------------------
    "tx_1m_dbm": -59.0,            # 1 m 에서의 수신 세기 (가정)
    "path_loss_n": 2.2,            # 실내 경로손실 지수 (가정, 2~3)
    "shadow_sigma_db": 6.0,        # 가림·사람 몸에 의한 고정 편차 (가정)
    "fading_sigma_db": 3.0,        # 패킷마다 변하는 페이딩 (가정)
    "rx_mid_dbm": -90.0,           # 수신 확률 50% 가 되는 세기 (가정)
    "rx_slope_db": 2.0,
    "scan_duty": 0.5,              # 스캔 창/간격 (안드로이드 균형 모드 정도, 가정)
    "ecig_adv_intervals_s": [0.5, 1.0, 1.28],   # 배터리 절약형 광고 간격 (가정)
    "other_adv_intervals_s": [0.1, 0.25, 0.5, 1.0],
    "target_dist_m": [0.3, 3.0],   # 사용자 본인 기기까지의 거리
    "mfg_table_coverage": 0.90,    # 알려진 제조사 ID 표가 실제 기기를 담는 비율 (가정)
    "collision_rate": 0.02,        # 전자담배가 아닌 기기가 필터를 통과하는 비율 (가정)
    "connect_ok": 0.92,            # GATT 연결 1회 성공률 (가정), 재시도 1회
    "top_k": 3,
    # --- 실험 2/3: 퍼프 생성 ------------------------------------------------
    "occasion_gap_min": 40.0,      # 흡연 기회 사이 중앙 간격 (가정)
    "puffs_per_occasion": 8.0,     # 한 기회의 퍼프 수 중앙값 (가정)
    "inter_puff_s": 20.0,          # 퍼프 사이 중앙 간격 (가정)
    "puff_dur_s": 3.0,             # 퍼프 길이 중앙값 (가정 — 보정 전)
    "puff_dur_sigma": 0.35,
    "user_dur_sigma": 0.25,        # 사용자 간 퍼프 길이 차이 (가정)
    # --- 실험 2: 링크 -------------------------------------------------------
    "oor_per_day": 5.0, "oor_median_min": 25.0, "oor_sigma": 0.8,    # 폰에서 멀어짐
    "rf_per_day": 8.0, "rf_median_s": 45.0, "rf_sigma": 0.7,         # 짧은 무선 끊김
    "bg_kill_per_day": 1.5, "bg_kill_median_min": 15.0, "bg_sigma": 0.8,  # OS 가 앱을 멈춤
    "reconnect_delay_s": [1.0, 30.0],
    "notify_loss": 0.01,
    "rtc_ppm_sigma": 80.0,
    # --- 실험 3: 액상 -------------------------------------------------------
    "liquid_mg_per_s": 0.45,       # 퍼프 1초당 기화되는 액상 질량 (가정 — 기기 출력에 따라 다름)
    "liquid_sigma_puff": 0.30,
    "liquid_sigma_user": 0.20,
    "liquid_density_mg_per_ul": 1.1,
    "conc_mg_ml": 20.0,
    "stream_hz": 2.0,
}
P = PARAMS


def lognorm(rng, median, sigma):
    return math.exp(rng.gauss(math.log(median), sigma))


def logistic(x):
    return 1.0 / (1.0 + math.exp(-x))


def pct(xs, q):
    xs = sorted(xs)
    if not xs:
        return float("nan")
    k = (len(xs) - 1) * q
    f, c = math.floor(k), math.ceil(k)
    return xs[f] if f == c else xs[f] + (xs[c] - xs[f]) * (k - f)


# ================================================================ 실험 1
EC_CLASSES = ["sensing_full", "sensing_mfgonly", "nonsensing_ble", "no_ad"]
EC_WEIGHTS = [0.40, 0.25, 0.25, 0.10]   # 주변 "다른" 전자담배 기기의 구성 (가정)


def rssi_static(rng, dist):
    return (P["tx_1m_dbm"] - 10 * P["path_loss_n"] * math.log10(max(dist, 0.1))
            + rng.gauss(0, P["shadow_sigma_db"]))


def heard(rng, rssi0, adv_interval, scan_s):
    """스캔 scan_s 동안 한 번이라도 수신하는가 + 평균 RSSI"""
    n_ev = int(scan_s / adv_interval + rng.random())
    got = []
    for _ in range(n_ev):
        r = rssi0 + rng.gauss(0, P["fading_sigma_db"])
        p = logistic((r - P["rx_mid_dbm"]) / P["rx_slope_db"]) * P["scan_duty"]
        if rng.random() < p:
            got.append(r)
    return (True, sum(got) / len(got)) if got else (False, None)


def exp1_trial(rng, scan_s, n_other, n_other_ecig):
    """한 번의 탐색. 반환: 목표 기기 플래그들 + 라벨 집계"""
    # 목표: 사용자 본인 기기 (센싱 가능). full 60% / mfgonly 40%
    tclass = "sensing_full" if rng.random() < 0.6 else "sensing_mfgonly"
    devs = [dict(cls=tclass, target=True,
                 dist=rng.uniform(*P["target_dist_m"]),
                 adv=rng.choice(P["ecig_adv_intervals_s"]))]
    for _ in range(n_other_ecig):          # 이웃·가족의 다른 전자담배
        c = rng.choices(EC_CLASSES, EC_WEIGHTS)[0]
        devs.append(dict(cls=c, target=False, dist=rng.uniform(1.0, 10.0),
                         adv=rng.choice(P["ecig_adv_intervals_s"])))
    for _ in range(n_other):               # 폰·이어폰·워치·TV 등
        devs.append(dict(cls="other", target=False, dist=rng.uniform(0.5, 15.0),
                         adv=rng.choice(P["other_adv_intervals_s"])))
    seen = []
    for d in devs:
        if d["cls"] == "no_ad":
            continue
        ok, r = heard(rng, rssi_static(rng, d["dist"]), d["adv"], scan_s)
        if ok:
            d["rssi"] = r
            seen.append(d)
    tgt_seen = any(d["target"] for d in seen)

    # 1단계 필터: 서비스 UUID(full) 또는 제조사 ID 표(mfgonly / nonsensing 은 같은 제조사 ID)
    cands = []
    for d in seen:
        if d["cls"] == "sensing_full":
            cands.append(d)
        elif d["cls"] in ("sensing_mfgonly", "nonsensing_ble"):
            if rng.random() < P["mfg_table_coverage"]:
                cands.append(d)
        elif d["cls"] == "other" and rng.random() < P["collision_rate"]:
            cands.append(d)
    tgt_cand = any(d["target"] for d in cands)

    # 1단계만으로 "센싱 가능"이라 라벨링 (UUID 가 안 보여도 제조사 ID 면 센싱이라고 추정)
    stage1_labeled = cands
    s1_tp = sum(1 for d in stage1_labeled if d["cls"] in ("sensing_full", "sensing_mfgonly"))
    s1_n = len(stage1_labeled)

    # 2단계: 신호 상위 top_k 만 GATT 연결 후 센싱 서비스 확인
    top = sorted(cands, key=lambda d: -d["rssi"])[:P["top_k"]]
    tgt_top = any(d["target"] for d in top)
    verified = []
    for d in top:
        conn = rng.random() < P["connect_ok"] or rng.random() < P["connect_ok"]
        if conn and d["cls"] in ("sensing_full", "sensing_mfgonly"):
            verified.append(d)
    s2_tp = sum(1 for d in verified)           # 서비스가 있어야만 라벨 → 정의상 센싱 기기
    s2_n = len(verified)
    tgt_ver = any(d["target"] for d in verified)
    return dict(seen=tgt_seen, cand=tgt_cand, top=tgt_top, ver=tgt_ver,
                s1_tp=s1_tp, s1_n=s1_n, s2_tp=s2_tp, s2_n=s2_n)


def exp1(rng, trials):
    scenarios = {"집(주변 8대)": (8, 0), "카페(주변 40대 + 타인 전자담배 1대)": (40, 1),
                 "다중 전자담배(주변 25대 + 5대)": (25, 5)}
    scans = [1, 2, 3, 5, 8, 10]
    out = {}
    for name, (n_other, n_ec) in scenarios.items():
        rows = []
        for s in scans:
            acc = dict(seen=0, cand=0, top=0, ver=0, s1_tp=0, s1_n=0, s2_tp=0, s2_n=0)
            for _ in range(trials):
                t = exp1_trial(rng, s, n_other, n_ec)
                for k in acc:
                    acc[k] += t[k]
            rows.append(dict(scan_s=s,
                             recall_scan=acc["seen"] / trials,
                             recall_candidate=acc["cand"] / trials,
                             recall_top3=acc["top"] / trials,
                             recall_final=acc["ver"] / trials,
                             precision_1stage=(acc["s1_tp"] / acc["s1_n"]) if acc["s1_n"] else float("nan"),
                             precision_2stage=(acc["s2_tp"] / acc["s2_n"]) if acc["s2_n"] else float("nan")))
        out[name] = rows
    return out


# ================================================================ 퍼프 생성
def gen_day_puffs(rng, dur_scale=1.0, thin=1.0):
    """하루(07~23시) 퍼프 [(시작초, 길이초)]. thin<1 이면 흡연 기회를 줄임(감소 시나리오)"""
    t = 7 * 3600.0
    end = 23 * 3600.0
    puffs = []
    while True:
        t += lognorm(rng, P["occasion_gap_min"] * 60, 0.6)
        if t >= end:
            break
        n = max(1, int(lognorm(rng, P["puffs_per_occasion"], 0.5)))
        tt = t
        keep = rng.random() < thin
        for _ in range(n):
            d = min(10.0, max(0.5, lognorm(rng, P["puff_dur_s"] * dur_scale, P["puff_dur_sigma"])))
            if keep and tt < end:
                puffs.append((tt, d))
            tt += d + lognorm(rng, P["inter_puff_s"], 0.6)
        t = tt
    return puffs


def poisson(rng, lam):
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def gen_disconnects(rng, bg_kill=True):
    """끊긴 구간 [(시작, 끝)] 합집합 (하루 0~86400초)"""
    iv = []
    for _ in range(poisson(rng, P["oor_per_day"])):
        s = rng.uniform(6 * 3600, 23 * 3600)
        iv.append((s, s + lognorm(rng, P["oor_median_min"] * 60, P["oor_sigma"])))
    for _ in range(poisson(rng, P["rf_per_day"])):
        s = rng.uniform(6 * 3600, 23 * 3600)
        iv.append((s, s + lognorm(rng, P["rf_median_s"], P["rf_sigma"])))
    if bg_kill:
        for _ in range(poisson(rng, P["bg_kill_per_day"])):
            s = rng.uniform(6 * 3600, 23 * 3600)
            iv.append((s, s + lognorm(rng, P["bg_kill_median_min"] * 60, P["bg_sigma"])))
    iv.sort()
    merged = []
    for s, e in iv:
        e += rng.uniform(*P["reconnect_delay_s"])      # 복구 뒤 재연결까지 지연
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def interval_of(t, merged):
    for s, e in merged:
        if s <= t < e:
            return (s, e)
        if s > t:
            break
    return None


# ================================================================ 실험 2
def exp2_day(rng, mode, K=64, bg_kill=True, counter_dt=1.0, tail_cutoff=86400.0):
    puffs = gen_day_puffs(rng)
    disc = gen_disconnects(rng, bg_kill)
    n_true = len(puffs)
    ppm = rng.gauss(0, P["rtc_ppm_sigma"]) * 1e-6
    delivered = 0
    stale = 0           # 하루 끝(자정)까지 아직 도착하지 않은 것
    ts_err = []
    per_iv = {}
    for (t, d) in puffs:
        iv = interval_of(t, disc)
        if iv is None:
            if mode == "live":
                if rng.random() >= P["notify_loss"]:
                    delivered += 1
            else:
                delivered += 1        # 연결 중에는 실시간 수신 (유실분은 seq 간격으로 재동기화)
        else:
            per_iv.setdefault(iv, []).append((t, d))
    if mode == "live":
        pass                           # 끊긴 구간의 퍼프는 영구 유실
    elif mode == "ring":
        for iv, lst in per_iv.items():
            kept = lst[-K:] if len(lst) > K else lst   # FIFO: 가득 차면 옛것부터 덮어씀
            if iv[1] > tail_cutoff:
                stale += len(kept)
            else:
                delivered += len(kept)
                for (t, _) in kept:
                    ts_err.append(abs(ppm) * (iv[1] - t))
    elif mode == "counter":
        # 카운터형: 개수는 보존, 시각은 못 얻음. 끊긴 구간의 퍼프는 구간 끝에 몰아서 한 번에 증가
        for iv, lst in per_iv.items():
            if iv[1] > tail_cutoff:
                stale += len(lst)
            else:
                delivered += len(lst)
    return dict(n_true=n_true, delivered=delivered, stale=stale, ts_err=ts_err)


def exp2_counter_binning(rng, dt, days):
    """카운터형: dt 초마다 읽은 값의 차분으로 센다.
    - 연결 중: 같은 dt 칸에 든 둘 이상의 퍼프는 1회로 합쳐짐
    - 끊긴 구간: 개수는 남지만 시각은 모름 → 구간이 끝난 시각(재연결)에 몰아 배정
    반환: 총개수 오차율, 시간대(1h)별 |추정-진짜| 합 / 진짜 합"""
    tot_true = tot_est = hr_abs = 0
    for _ in range(days):
        puffs = gen_day_puffs(rng)
        disc = gen_disconnects(rng, True)
        true_h = [0] * 24
        est_h = [0] * 24
        seen_slots = set()
        for (t, _) in puffs:
            true_h[int(t // 3600)] += 1
            if interval_of(t, disc) is None:
                slot = int(t // dt)
                if slot not in seen_slots:             # 같은 칸의 둘째 퍼프는 합쳐져 사라짐
                    seen_slots.add(slot)
                    est_h[int(t // 3600)] += 1
        for (s_, e_) in disc:
            n = sum(1 for (t, _) in puffs if s_ <= t < e_)
            if n and e_ < 86400:
                est_h[min(23, int(e_ // 3600))] += n
        tot_true += sum(true_h)
        tot_est += sum(est_h)
        hr_abs += sum(abs(x - y) for x, y in zip(true_h, est_h))
    return dict(count_err=(tot_est - tot_true) / tot_true, hourly_abs_err_frac=hr_abs / tot_true)


def exp2(rng, days):
    res = {}
    cfgs = [("실시간만 (기기 저장 없음)", "live", None),
            ("링버퍼 16건", "ring", 16), ("링버퍼 64건", "ring", 64), ("링버퍼 256건", "ring", 256),
            ("카운터형 기기 (IQOS 류, 개수만)", "counter", None)]
    for bg in (True, False):
        key = "OS 가 앱을 멈추는 폰(백그라운드 제한)" if bg else "포그라운드 서비스 유지"
        rows = []
        for name, mode, K in cfgs:
            comp_mid, comp_next, errs, stale_f = [], [], [], []
            for _ in range(days):
                r = exp2_day(rng, mode, K=K or 0, bg_kill=bg, tail_cutoff=86400.0)
                comp_mid.append(r["delivered"] / r["n_true"])
                comp_next.append((r["delivered"] + r["stale"]) / r["n_true"])
                errs += r["ts_err"]
            rows.append(dict(config=name,
                             completeness_midnight_mean=st.mean(comp_mid),
                             completeness_midnight_p05=pct(comp_mid, 0.05),
                             completeness_after_resync_mean=st.mean(comp_next),
                             ts_err_p99_s=pct(errs, 0.99) if errs else None))
        res[key] = rows
    # 앱이 보여 주는 완전성(%) 은 믿을 만한가 — 하루 중 임의 시각(앱을 여는 순간)에서 비교.
    # 앱이 아는 것: 받은 seq 의 최대값. 끊겨 있는 동안 생긴 퍼프는 아직 모름.
    gaps, over5, disc_now_n, disc_now_over5 = [], 0, 0, 0
    snaps = 0
    for _ in range(days):
        puffs = gen_day_puffs(rng)
        disc = gen_disconnects(rng, True)
        K = 16
        T = rng.uniform(8 * 3600, 23 * 3600)
        happened = [(i, t) for i, (t, d) in enumerate(puffs) if t < T]
        if len(happened) < 5:
            continue
        got = []
        per = {}
        for i, t in happened:
            iv = interval_of(t, disc)
            if iv is None:
                got.append(i)
            else:
                per.setdefault(iv, []).append(i)
        for iv, idx in per.items():
            if iv[1] <= T:                      # 이미 재연결해서 읽어 옴
                got += idx[-K:]
        if not got:
            continue
        got = sorted(got)
        app_est = len(got) / (got[-1] + 1)
        true_comp = len(got) / len(happened)
        gap = app_est - true_comp
        gaps.append(gap)
        snaps += 1
        now_disc = interval_of(T, disc) is not None
        if now_disc:
            disc_now_n += 1
            if gap > 0.05:
                disc_now_over5 += 1
        if gap > 0.05:
            over5 += 1
    res["_snapshot_completeness_gap"] = dict(
        snapshots=snaps, mean_overestimate=st.mean(gaps), p95_overestimate=pct(gaps, 0.95),
        frac_over_5pp=over5 / snaps, snapshots_while_disconnected=disc_now_n / snaps,
        frac_over_5pp_while_disconnected=(disc_now_over5 / disc_now_n) if disc_now_n else None)
    # 카운터형 시간 해상도
    res["_counter_binning"] = {f"읽기 {dt}s": exp2_counter_binning(rng, dt, max(50, days // 4)) for dt in (1.0, 5.0, 30.0)}
    # 퍼프 길이 측정: 스트림 2 Hz 로부터 vs 기기 요약
    errs_stream, errs_dev = [], []
    for _ in range(20000):
        d = min(10.0, max(0.5, lognorm(rng, P["puff_dur_s"], P["puff_dur_sigma"])))
        n = int(d * P["stream_hz"] + rng.random())
        errs_stream.append(abs(max(1, n) / P["stream_hz"] - d) / d)
    res["_duration_from_2Hz_stream_rel_err_mean"] = st.mean(errs_stream)
    res["_duration_from_2Hz_stream_rel_err_p95"] = pct(errs_stream, 0.95)
    return res


# ================================================================ 실험 3
def nicotine_day(rng, user, thin=1.0):
    puffs = gen_day_puffs(rng, dur_scale=user["dur_scale"], thin=thin)
    k_user = user["k"]
    truth = 0.0
    sum_d = 0.0
    sum_d_stream = 0.0
    for (_, d) in puffs:
        k = k_user * math.exp(rng.gauss(0, P["liquid_sigma_puff"]))
        ul = k * d / P["liquid_density_mg_per_ul"]
        truth += P["conc_mg_ml"] * ul / 1000.0
        sum_d += d
        n = int(d * P["stream_hz"] + rng.random())
        sum_d_stream += max(1, n) / P["stream_hz"]
    return dict(n=len(puffs), truth=truth, sum_d=sum_d, sum_d_stream=sum_d_stream)


def estimators(day):
    k0 = P["liquid_mg_per_s"]
    per_s = P["conc_mg_ml"] * k0 / P["liquid_density_mg_per_ul"] / 1000.0   # mg / (퍼프 초)
    return {"E1 퍼프 수 × 고정 평균": day["n"] * P["puff_dur_s"] * per_s,
            "E2 기기가 보낸 퍼프 길이": day["sum_d"] * per_s,
            "E3 2 Hz 스트림에서 잰 길이": day["sum_d_stream"] * per_s}


def new_user(rng):
    return dict(dur_scale=math.exp(rng.gauss(0, P["user_dur_sigma"])),
                k=P["liquid_mg_per_s"] * math.exp(rng.gauss(0, P["liquid_sigma_user"])))


def exp3_accuracy(rng, users):
    errs = {k: [] for k in ("E1 퍼프 수 × 고정 평균", "E2 기기가 보낸 퍼프 길이", "E3 2 Hz 스트림에서 잰 길이")}
    cors = {k: ([], []) for k in errs}
    for _ in range(users):
        u = new_user(rng)
        for _ in range(7):
            day = nicotine_day(rng, u)
            for name, est in estimators(day).items():
                errs[name].append(abs(est - day["truth"]) / day["truth"])
                cors[name][0].append(est)
                cors[name][1].append(day["truth"])
    rows = []
    for name in errs:
        rows.append(dict(estimator=name, abs_rel_err_median=pct(errs[name], 0.5),
                         abs_rel_err_p90=pct(errs[name], 0.9),
                         within_25pct=sum(1 for e in errs[name] if e <= 0.25) / len(errs[name])))
    return rows


def week_total(rng, user, thin, comp_mean, correct, est_name):
    tot_est = 0.0
    for _ in range(7):
        day = nicotine_day(rng, user, thin)
        est = estimators(day)[est_name]
        if comp_mean >= 1.0:
            c = 1.0
        else:
            k = 20.0                                  # 일 완전성의 흩어짐 (가정)
            c = rng.betavariate(comp_mean * k, (1 - comp_mean) * k)
        got = est * c
        tot_est += got / c if correct else got        # 보정: 앱이 seq 로 안 완전성으로 나눔
    return tot_est


def exp3_trend(rng, users):
    """전주 대비 변화 검출.
    시나리오 A: 두 주의 평균 완전성이 같음(무작위 손실)
    시나리오 B: 2주차 완전성이 0.15 낮음(폰 설정 변경·기기 교체처럼 체계적 변화), 실제 변화는 없음"""
    est_name = "E3 2 Hz 스트림에서 잰 길이"
    rows = []
    for scen, comp1, comp2 in (("A 무작위 손실", 1.0, 1.0), ("A 무작위 손실", 0.90, 0.90), ("A 무작위 손실", 0.80, 0.80),
                               ("B 2주차 -0.15 체계적", 0.95, 0.80), ("B 2주차 -0.15 체계적", 0.85, 0.70)):
        for correct in (False, True):
            if comp1 == 1.0 and correct:
                continue
            fa = det = 0
            r_same, r_cut = [], []
            for _ in range(users):
                u = new_user(rng)
                w1 = week_total(rng, u, 1.0, comp1, correct, est_name)
                w2_same = week_total(rng, u, 1.0, comp2, correct, est_name)
                w2_cut = week_total(rng, u, 0.8, comp2, correct, est_name)
                r_same.append(w2_same / w1)
                r_cut.append(w2_cut / w1)
            rows.append(dict(scenario=scen, comp_week1=comp1, comp_week2=comp2, corrected=correct,
                             false_alarm_10=sum(r <= 0.90 for r in r_same) / users,
                             detect_10=sum(r <= 0.90 for r in r_cut) / users,
                             false_alarm_20=sum(r <= 0.80 for r in r_same) / users,
                             detect_20=sum(r <= 0.80 for r in r_cut) / users,
                             ratio_same_sd=st.pstdev(r_same)))
    return rows


# ================================================================ 실행
def fmt(x, nd=3):
    return "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{nd}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--out", default="results.json")
    a = ap.parse_args()
    f = 0.1 if a.quick else 1.0
    rng = random.Random(SEED)
    res = {"params": PARAMS, "seed": SEED}
    res["exp1"] = exp1(random.Random(SEED + 1), int(3000 * f))
    res["exp2"] = exp2(random.Random(SEED + 2), int(1500 * f))
    res["exp3_accuracy"] = exp3_accuracy(random.Random(SEED + 3), int(600 * f))
    res["exp3_trend"] = exp3_trend(random.Random(SEED + 4), int(600 * f))
    with open(a.out, "w", encoding="utf8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=2)

    print("## 실험 1 — 탐색·판별")
    for sc, rows in res["exp1"].items():
        print(f"\n[{sc}]")
        print("| 스캔(s) | 수신 | 후보 | 상위3 | 최종 recall | precision 1단계 | precision 2단계 |")
        print("|---|---|---|---|---|---|---|")
        for r in rows:
            print(f"| {r['scan_s']} | {fmt(r['recall_scan'])} | {fmt(r['recall_candidate'])} | {fmt(r['recall_top3'])} | "
                  f"{fmt(r['recall_final'])} | {fmt(r['precision_1stage'])} | {fmt(r['precision_2stage'])} |")
    print("\n## 실험 2 — 수집 완전성")
    for key, rows in res["exp2"].items():
        if key.startswith("_"):
            continue
        print(f"\n[{key}]")
        print("| 구성 | 자정 완전성(평균) | 하위 5% | 재동기화 뒤(평균) | 시각 오차 p99(s) |")
        print("|---|---|---|---|---|")
        for r in rows:
            print(f"| {r['config']} | {fmt(r['completeness_midnight_mean'])} | {fmt(r['completeness_midnight_p05'])} | "
                  f"{fmt(r['completeness_after_resync_mean'])} | {fmt(r['ts_err_p99_s'], 2)} |")
    for k, v in res["exp2"].items():
        if k.startswith("_"):
            print(k, json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else fmt(v, 4))
    print("\n## 실험 3 — 정확도")
    print("| 추정기 | |오차| 중앙값 | p90 | ±25% 안 |")
    print("|---|---|---|---|")
    for r in res["exp3_accuracy"]:
        print(f"| {r['estimator']} | {fmt(r['abs_rel_err_median'])} | {fmt(r['abs_rel_err_p90'])} | {fmt(r['within_25pct'])} |")
    print("\n## 실험 3 — 전주 대비 감소 검출 (진짜 20% 감소를 문턱 10% / 20% 로 검출)")
    print("| 시나리오 | 1주차 | 2주차 | 보정 | 거짓경보@10% | 검출@10% | 거짓경보@20% | 검출@20% | 비율 sd |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in res["exp3_trend"]:
        print(f"| {r['scenario']} | {r['comp_week1']:.2f} | {r['comp_week2']:.2f} | {'예' if r['corrected'] else '아니오'} | "
              f"{fmt(r['false_alarm_10'])} | {fmt(r['detect_10'])} | {fmt(r['false_alarm_20'])} | {fmt(r['detect_20'])} | {fmt(r['ratio_same_sd'])} |")

if __name__ == "__main__":
    main()
