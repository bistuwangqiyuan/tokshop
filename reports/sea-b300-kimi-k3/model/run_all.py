"""一键复现：生成 outputs/ 下的全部表与图，以及供报告正文引用的 facts.json。

    python run_all.py --selftest   # 只跑自检
    python run_all.py              # 自检 + 重新生成全部产物
    python run_all.py --fast       # 自检 + 产物，蒙特卡洛降到 300 次

报告正文里的每一个数字都必须能在 outputs/ 里找到出处，不允许手写。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import capacity as C
import compliance_screen as CS
import metrics as M
import params as P
import rent_validation as RV
import revenue as R
import rolling as RL
import sensitivity as SENS
import siting as S
import test_model

OUT = Path(__file__).resolve().parent.parent / "outputs"
ENC = "utf-8-sig"


def _w(df: pd.DataFrame, name: str) -> None:
    df.to_csv(OUT / name, index=False, encoding=ENC)


def generate(mc_n: int = 2000) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    facts: dict = {}
    profiles = C.default_profiles()
    base = profiles["base"]
    econ = R.base_economics()
    scen = RL.scenarios()

    # ---- 01 三层合规筛查 ------------------------------------------------
    scr = CS.screen_summary(None)
    _w(scr["layer2"], "01_screen_layer2_destination.csv")
    _w(scr["layer3"], "01_screen_layer3_host.csv")
    _w(CS.structure_recommendation(), "01_structure_recommendation.csv")
    facts["excluded_by_destination"] = scr["excluded_by_destination"]
    facts["candidates"] = scr["candidates"]
    facts["host_regimes_unverified"] = scr["host_regimes_unverified"]

    # ---- 02 租金交叉验证 ------------------------------------------------
    _w(RV.compare_to_given(), "02_rent_benchmarks.csv")
    _w(RV.buildup_table(), "02_lessor_cost_buildup.csv")
    cond = RV.conditional_buildup_table()
    _w(cond, "02_lessor_cost_by_country.csv")
    for cc in ("MY", "TH", "ID", "SG"):
        r = cond[(cond["国家"] == cc) & (cond["情形"] == "硬件中位")].iloc[0]
        facts[f"lessor_mid_{cc}"] = float(r["合计成本_USD"])
        facts[f"lessor_mid_sustainable_{cc}"] = bool(r["对出租方可持续"])
    v = RV.validation_summary()
    facts.update({
        "rent_usd_per_month": v["given_rent_usd"],
        "rent_usd_per_gpu_hour": v["given_usd_per_gpu_hour"],
        "bit_origin_rent_usd": v["bit_origin_rent_usd"],
        "bit_origin_delta_pct": v["bit_origin_delta_pct"],
        "bit_origin_capex_per_server": v["bit_origin_capex_per_server"],
        "bit_origin_gross_yield_annual": v["bit_origin_gross_yield_annual"],
        "lessor_cost_my_mid": v["lessor_cost_my_mid"],
        "lessor_cost_sg_mid": v["lessor_cost_sg_mid"],
        "margin_vs_my_mid_pct": v["margin_vs_my_mid_pct"],
        "margin_vs_sg_mid_pct": v["margin_vs_sg_mid_pct"],
    })
    bl = RV.buildup_table()
    facts["margin_my_low_hw_pct"] = float(
        bl.loc[bl["情形"] == "MY 硬件低位", "出租方毛利率"].iloc[0] * 100)
    facts["margin_sg_low_hw_pct"] = float(
        bl.loc[bl["情形"] == "SG 硬件低位", "出租方毛利率"].iloc[0] * 100)

    # ---- 03 选址矩阵 ----------------------------------------------------
    _w(S.siting_matrix(), "03_siting_matrix.csv")
    _w(S.negotiating_power(), "03_negotiating_power.csv")
    _w(S.structure_comparison(), "03_structure_tax.csv")
    slo_rows = [S.ttft_slo_check(c) for c in ("SG", "MY", "ID", "TH", "PH")]
    _w(pd.DataFrame(slo_rows), "03_latency_slo.csv")
    facts["ttft_p90_sg_ms"] = S.ttft_slo_check("SG")["ttft_p90_ms"]
    facts["ttft_degradation_bangkok_pct"] = S.ttft_slo_check("TH")["mean_degradation_pct"]
    facts["colo_sg_usd_kw"] = RV.colo_usd_kw_month("SG")
    facts["colo_my_usd_kw"] = RV.colo_usd_kw_month("MY")
    facts["colo_th_usd_kw"] = RV.colo_usd_kw_month("TH")
    facts["colo_id_usd_kw"] = RV.colo_usd_kw_month("ID")

    # ---- 04 产能 --------------------------------------------------------
    cap_rows = []
    for p in profiles.values():
        c = C.node_capacity(p)
        c["revenue_usd_per_req"] = R.revenue_per_request_usd(p, econ)
        c["full_load_revenue_usd_month"] = c["req_per_month"] * c["revenue_usd_per_req"]
        c["full_load_revenue_usd_node_hour"] = (
            c["full_load_revenue_usd_month"] / float(P.get("meta.hours_per_month")))
        c["breakeven_util"] = R.breakeven_utilization(p, econ)
        cap_rows.append(c)
    cap_df = pd.DataFrame(cap_rows)
    _w(cap_df, "04_capacity_by_profile.csv")

    bcap = C.node_capacity(base)
    facts.update({
        "base_decode_rate": bcap["decode_rate_tok_s"],
        "base_req_per_month": bcap["req_per_month"],
        "base_out_tokens_per_month": bcap["out_tokens_per_month"],
        "base_decode_time_share": bcap["decode_time_share"],
        "base_kv_max_concurrency": bcap["kv_max_concurrency"],
        "base_full_revenue_usd": float(
            cap_df.loc[cap_df["profile"] == base.name, "full_load_revenue_usd_month"].iloc[0]),
        "base_breakeven_util": R.breakeven_utilization(base, econ),
        "weights_fit": C.weights_fit(),
        "full_weight_read_ms": C.full_weight_read_ms(),
        "bandwidth_ceiling_c64": C.bandwidth_ceiling_tokens_per_sec(64),
        "measured_vs_ceiling_pct": C.decode_rate(2000) / C.bandwidth_ceiling_tokens_per_sec(64) * 100,
        "prefill_mfu_pct": C.prefill_mfu() * 100,
        "expert_coverage_c10": C.expert_coverage(10),
        "expert_coverage_c64": C.expert_coverage(64),
        "effective_input_price": R.effective_input_price_usd_per_m(econ, 0.85),
        "kv_bytes_per_token": C.kv_bytes_per_token(),
    })
    for k, p in profiles.items():
        facts[f"breakeven_{k}"] = R.breakeven_utilization(p, econ)
        facts[f"full_rev_hour_{k}"] = float(
            cap_df.loc[cap_df["profile"] == p.name, "full_load_revenue_usd_node_hour"].iloc[0])

    # ---- 05 盈亏平衡与自建/采购 ------------------------------------------
    _w(SENS.profile_breakeven_matrix(), "05_breakeven_by_rent.csv")
    _w(SENS.breakeven_surface(base), "05_breakeven_surface.csv")
    xo_df = pd.DataFrame([R.crossover_volume(p, econ) for p in profiles.values()])
    _w(xo_df, "05_crossover.csv")
    uc = pd.DataFrame([R.unit_cost_vs_buy(base, econ, u)
                       for u in (0.2, 0.4, 0.6, 0.8, 1.0)])
    _w(uc, "05_unit_cost.csv")
    facts["crossover_requests_month"] = R.crossover_volume(base, econ)["requests_per_month"]
    facts["crossover_out_tokens_month"] = R.crossover_volume(base, econ)["out_tokens_per_month"]
    facts["selfhost_saving_at_full_pct"] = float(uc.iloc[-1]["saving_pct"])

    surf = SENS.breakeven_surface(base)
    at150 = surf[surf["月租金_CNY"] == 150_000]
    facts["breakeven_at_full_price"] = float(
        at150.loc[at150["售价系数"] == 1.0, "盈亏平衡利用率"].iloc[0])
    facts["breakeven_at_half_price"] = float(
        at150.loc[at150["售价系数"] == 0.5, "盈亏平衡利用率"].iloc[0])
    facts["min_price_multiplier_feasible"] = float(
        at150.loc[at150["可行"], "售价系数"].min())

    # ---- 06 滚动复利 ----------------------------------------------------
    summaries = []
    for ero in (0.0, 0.20, 0.40):
        for key, sc in scen.items():
            df = RL.roll(base, econ, sc, price_erosion_annual=ero)
            _w(df, f"06_roll_{key}_ero{int(ero * 100)}.csv")
            s = M.summarize(df)
            s["scenario"] = sc.name
            s["price_erosion"] = ero
            summaries.append(s)
    roll_sum = pd.DataFrame(summaries)
    cols = ["scenario", "price_erosion", "irr_annual", "payback_month",
            "initial_capital_usd", "peak_capital_employed_usd",
            "end_equity_usd", "runoff_pv_usd", "end_equity_going_concern_usd",
            "end_equity_after_tail_usd", "moic", "moic_going_concern",
            "end_nodes", "avg_utilisation", "insolvent", "insolvent_month",
            "additional_capital_required_usd", "mean_monthly_roic",
            "capital_turns_per_year", "ccc_days", "tail_lease_pv_usd",
            "months_capital_bound", "months_demand_bound", "months_supply_bound",
            "total_revenue_usd", "total_net_income_usd", "expected_net_income_usd"]
    _w(roll_sum[cols], "06_roll_summary.csv")

    def pick(scn: str, ero: float, field: str):
        r = roll_sum[(roll_sum["scenario"] == scn) & (roll_sum["price_erosion"] == ero)]
        return float(r[field].iloc[0]) if len(r) else float("nan")

    for scn, tag in (("悲观", "pess"), ("中性", "neutral"), ("乐观", "optim")):
        for ero, etag in ((0.0, "e0"), (0.20, "e20"), (0.40, "e40")):
            facts[f"irr_{tag}_{etag}"] = pick(scn, ero, "irr_annual")
            facts[f"equity_gc_{tag}_{etag}"] = pick(scn, ero, "end_equity_going_concern_usd")
            facts[f"nodes_{tag}_{etag}"] = pick(scn, ero, "end_nodes")
    facts["peak_capital_optim"] = pick("乐观", 0.20, "peak_capital_employed_usd")
    facts["initial_capital"] = pick("中性", 0.20, "initial_capital_usd")
    facts["ccc_days"] = pick("中性", 0.20, "ccc_days")
    facts["stop_case_optim_e20"] = pick("乐观", 0.20, "end_equity_after_tail_usd")

    # ---- 07 敏感性 ------------------------------------------------------
    _w(SENS.one_factor(base, econ, scen["neutral"]), "07_sensitivity_neutral.csv")
    _w(SENS.one_factor(base, econ, scen["optimistic"]), "07_sensitivity_optimistic.csv")
    _w(SENS.cross_site(base, scen["neutral"]), "07_cross_site.csv")

    da = [M.downside_asymmetry(econ, m) for m in (3, 6, 12, 24)]
    da_rows = []
    for d in da:
        for term in (1, 12, 36):
            k = f"term_{term}m"
            da_rows.append({
                "失败月": d["fail_month"], "租约期限_月": term,
                "剩余月数": d[k]["remaining_months"],
                "名义义务_USD": d[k]["nominal_usd"],
                "义务现值_USD": d[k]["pv_usd"],
            })
    _w(pd.DataFrame(da_rows), "07_downside_asymmetry.csv")
    facts["downside_36m_fail6_pv"] = da[1]["term_36m"]["pv_usd"]
    facts["downside_12m_fail6_pv"] = da[1]["term_12m"]["pv_usd"]

    # ---- 08 蒙特卡洛 ----------------------------------------------------
    mc = SENS.monte_carlo(base, econ, n=mc_n)
    _w(mc, "08_monte_carlo.csv")
    mcs = SENS.mc_summary(mc)
    _w(pd.DataFrame([mcs]), "08_monte_carlo_summary.csv")
    facts.update({f"mc_{k}": v for k, v in mcs.items()})

    with open(OUT / "facts.json", "w", encoding="utf-8") as f:
        json.dump(facts, f, ensure_ascii=False, indent=2, default=float)
    return facts


def charts() -> None:
    """图表一律用英文标签：Windows 环境缺中文字体会渲染成方块，解读留在正文。"""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.dpi": 130, "font.size": 9, "axes.grid": True,
                         "grid.alpha": 0.3, "axes.spines.top": False,
                         "axes.spines.right": False})
    profiles = C.default_profiles()
    base = profiles["base"]
    econ = R.base_economics()

    # 图 1 吞吐随上下文衰减
    fig, ax = plt.subplots(figsize=(6.6, 4))
    xs = np.logspace(np.log10(1500), np.log10(1_048_576), 200)
    ax.plot(xs, [C.decode_rate(x) for x in xs], lw=2, label="Model (piecewise power law)")
    pts = P.get("capacity.decode_points")
    ax.scatter([p[0] for p in pts], [p[1] for p in pts], s=55, color="crimson",
               zorder=5, label="Measured (3rd-party)")
    for cx, t in pts:
        ax.annotate(f"{t:.0f}", (cx, t), textcoords="offset points", xytext=(6, 6),
                    color="crimson")
    for p in profiles.values():
        ax.axvline(p.avg_context, ls=":", lw=0.8, color="gray")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_xlabel("Average context length (tokens)")
    ax.set_ylabel("Aggregate decode throughput (tok/s)")
    ax.set_title("Kimi K3 on 8x B300: throughput collapses with context length")
    ax.legend(); fig.tight_layout()
    fig.savefig(OUT / "fig1_throughput_vs_context.png"); plt.close(fig)

    # 图 2 盈亏平衡曲面：售价系数 x 租金
    surf = pd.read_csv(OUT / "05_breakeven_surface.csv")
    piv = surf.pivot(index="售价系数", columns="月租金_CNY", values="盈亏平衡利用率")
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    im = ax.imshow(piv.values * 100, aspect="auto", origin="lower", cmap="RdYlGn_r",
                   vmin=20, vmax=140)
    ax.set_xticks(range(len(piv.columns)))
    ax.set_xticklabels([f"{c/1000:.0f}k" for c in piv.columns])
    ax.set_yticks(range(len(piv.index)))
    ax.set_yticklabels([f"{i:.0%}" for i in piv.index])
    for i in range(piv.shape[0]):
        for j in range(piv.shape[1]):
            v = piv.values[i, j] * 100
            ax.text(j, i, f"{v:.0f}" if v <= 999 else ">999", ha="center", va="center",
                    fontsize=8, color="black" if v < 100 else "white")
    ax.set_xlabel("Monthly rent per node (CNY)")
    ax.set_ylabel("Price multiplier (1.0 = official list price)")
    ax.set_title("Break-even utilisation (%). Cells >100 cannot break even at any demand")
    fig.colorbar(im, ax=ax, label="Break-even utilisation (%)")
    fig.tight_layout(); fig.savefig(OUT / "fig2_breakeven_surface.png"); plt.close(fig)

    # 图 3 现金曲线：三情景 x 三侵蚀率
    fig, ax = plt.subplots(figsize=(7.2, 4.4))
    styles = {0.0: "-", 0.20: "--", 0.40: ":"}
    colors = {"pessimistic": "tab:red", "neutral": "tab:orange", "optimistic": "tab:green"}
    for key in ("pessimistic", "neutral", "optimistic"):
        for ero in (0.0, 0.20, 0.40):
            d = pd.read_csv(OUT / f"06_roll_{key}_ero{int(ero*100)}.csv")
            d = d[d["phase"] == "horizon"]
            ax.plot(d["month"], d["cash_usd"] / 1000, styles[ero], lw=1.5,
                    color=colors[key], label=f"{key[:4]} @ ero {ero:.0%}")
    ax.axhline(0, color="black", lw=1.2)
    ax.set_xlabel("Month"); ax.set_ylabel("Cash balance (USD k)")
    ax.set_title("Cash runway over the 36-month horizon")
    ax.legend(fontsize=7, ncol=3); fig.tight_layout()
    fig.savefig(OUT / "fig3_cash_runway.png"); plt.close(fig)

    # 图 4 出租方成本反推 vs 本项目租金
    bl = pd.read_csv(OUT / "02_lessor_cost_buildup.csv")
    fig, ax = plt.subplots(figsize=(7.4, 4.2))
    labels = bl["情形"].tolist()
    x = np.arange(len(labels))
    bottom = np.zeros(len(labels))
    for col, name in (("amortisation_usd", "Hardware amortisation"),
                      ("colo_usd", "Colocation"),
                      ("energy_usd", "Energy"),
                      ("network_usd", "Network")):
        ax.bar(x, bl[col], bottom=bottom, label=name)
        bottom += bl[col].to_numpy()
    ax.axhline(P.rent_usd_per_month(), color="crimson", lw=2,
               label=f"Project rent ${P.rent_usd_per_month():,.0f}/mo")
    ax.set_xticks(x)
    ax.set_xticklabels([l.replace("硬件", " HW ").replace("低位", "low")
                        .replace("中位", "mid").replace("高位", "high") for l in labels],
                       rotation=20, ha="right", fontsize=8)
    ax.set_ylabel("Lessor monthly cost (USD)")
    ax.set_title("Reverse-engineered lessor cost vs the quoted rent")
    ax.legend(fontsize=8); fig.tight_layout()
    fig.savefig(OUT / "fig4_lessor_cost.png"); plt.close(fig)

    # 图 5 蒙特卡洛终值分布
    mc = pd.read_csv(OUT / "08_monte_carlo.csv")
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 3.9))
    axes[0].hist(mc["end_equity_going_concern_usd"] / 1000, bins=60, color="tab:blue")
    axes[0].axvline(0, color="crimson", lw=1.6)
    axes[0].set_xlabel("Terminal equity, going concern (USD k)")
    axes[0].set_ylabel("Runs")
    axes[0].set_title("Terminal equity distribution")
    irr = mc["irr_annual"].dropna() * 100
    axes[1].hist(irr.clip(upper=400), bins=60, color="tab:green")
    axes[1].set_xlabel("Annualised IRR (%), clipped at 400")
    axes[1].set_title(f"IRR distribution ({len(irr)}/{len(mc)} runs recover capital)")
    fig.tight_layout(); fig.savefig(OUT / "fig5_monte_carlo.png"); plt.close(fig)

    # 图 6 长租约的下行不对称
    da = pd.read_csv(OUT / "07_downside_asymmetry.csv")
    fig, ax = plt.subplots(figsize=(6.6, 4))
    for term, style in ((1, "o-"), (12, "s--"), (36, "^-")):
        d = da[da["租约期限_月"] == term]
        ax.plot(d["失败月"], d["义务现值_USD"] / 1000, style, lw=1.8,
                label=f"{term}-month lease")
    ax.set_xlabel("Month the business stops")
    ax.set_ylabel("PV of remaining rent obligation (USD k)")
    ax.set_title("What a long lease costs if the business fails early")
    ax.legend(); fig.tight_layout()
    fig.savefig(OUT / "fig6_downside_asymmetry.png"); plt.close(fig)

    print(f"  图表已写入 {OUT}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--fast", action="store_true")
    args = ap.parse_args()

    rc = test_model.run()
    if rc != 0:
        sys.exit(rc)
    if args.selftest:
        return

    if args.fast:
        print("\n注意：--fast 只跑 300 次蒙特卡洛，写出的 facts.json 与报告正文引用的\n"
              "     2000 次结果不一致，verify.py 会拦截。定稿前请重跑不带 --fast 的版本。\n")
    facts = generate(mc_n=300 if args.fast else 2000)
    charts()

    print("\n关键结果")
    print(f"  月租金                    ${facts['rent_usd_per_month']:,.0f} "
          f"= ${facts['rent_usd_per_gpu_hour']:.4f}/GPU-小时")
    print(f"  Bit Origin 可比价         ${facts['bit_origin_rent_usd']:,.0f}"
          f"（偏差 {facts['bit_origin_delta_pct']:+.2f}%）")
    print(f"  马来西亚出租方成本中位     ${facts['lessor_cost_my_mid']:,.0f}"
          f"（毛利 {facts['margin_vs_my_mid_pct']:+.1f}%）")
    print(f"  基准画像满载月收入         ${facts['base_full_revenue_usd']:,.0f}")
    print(f"  基准画像盈亏平衡利用率     {facts['base_breakeven_util'] * 100:.1f}%")
    print(f"  售价折半后平衡利用率       {facts['breakeven_at_half_price'] * 100:.1f}%")
    print(f"  中性+20%侵蚀 IRR          {facts['irr_neutral_e20']}")
    print(f"  乐观+20%侵蚀 IRR          {facts['irr_optim_e20']:.1%}"
          if facts['irr_optim_e20'] == facts['irr_optim_e20'] else "  乐观 IRR 无解")
    print(f"  蒙特卡洛正收益概率         {facts['mc_prob_positive_going_concern']:.1%}")
    print(f"  36月租约第6月失败的义务现值 ${facts['downside_36m_fail6_pv']:,.0f}")
    print(f"\n产出目录：{OUT}")


if __name__ == "__main__":
    main()
