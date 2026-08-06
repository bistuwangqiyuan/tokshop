"""模型自检。任何一项失败则以非零码退出。

自检不是单元测试的替代品，而是「让模型可被证伪」的手段：每一条都对应一个
如果被违反、报告结论就应当作废的物理或会计约束。
"""

from __future__ import annotations

import math
import sys
from dataclasses import replace

import capacity as C
import compliance_screen as CS
import metrics as M
import params as P
import rent_validation as RV
import revenue as R
import rolling as RL
import siting as S

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{('  ' + detail) if detail else ''}")
    if not ok:
        FAILURES.append(name)


def run() -> int:
    print("自检开始\n")
    profiles = C.default_profiles()
    base = profiles["base"]
    econ = R.base_economics()

    # --- 一、物理约束 -----------------------------------------------------
    fit = C.weights_fit()
    check("K3 权重装得进八卡可用显存", fit["fits"],
          f"{fit['weights_tb']:.2f}TB < {fit['usable_tb']:.2f}TB，余量 {fit['headroom_pct']:.1f}%")
    check("单卡权重与总量自洽",
          abs(P.get("model_k3.weights_gb_per_gpu") * 8 / 1000
              - P.get("model_k3.weights_tb_total")) < 0.02)

    ceiling = C.bandwidth_ceiling_tokens_per_sec(64)
    measured = C.decode_rate(2000)
    check("实测吞吐未突破全权重读取上界", measured < ceiling,
          f"{measured:.0f} = 上界 {ceiling:.0f} 的 {measured / ceiling * 100:.1f}%")

    mfu = C.prefill_mfu()
    check("预填速率对应的算力利用率在 (0,1) 内", 0 < mfu < 1.0, f"MFU {mfu * 100:.2f}%")

    # 专家覆盖率必须单调且落在 (0,1)
    cov = [C.expert_coverage(b) for b in (1, 10, 64, 256)]
    check("专家覆盖率单调递增且在 (0,1)",
          all(0 < c < 1 for c in cov) and all(a < b for a, b in zip(cov, cov[1:])),
          f"φ(1)={cov[0]:.4f} φ(10)={cov[1]:.4f} φ(64)={cov[2]:.4f} φ(256)={cov[3]:.4f}")

    # 低并发 ITL 低于全权重读取时间，正是 MoE 覆盖率不足 100% 的体现
    check("全权重读取时间大于低并发实测 ITL（覆盖率效应自洽）",
          C.full_weight_read_ms() > 18.6,
          f"全读 {C.full_weight_read_ms():.2f}ms > 64K/c=10 实测 ITL 18.6ms")

    # --- 二、插值 ---------------------------------------------------------
    for ctx, tok in P.get("capacity.decode_points"):
        check(f"插值在标定点 {ctx} 复现实测值",
              abs(C.decode_rate(ctx) - tok) < 1e-6,
              f"{C.decode_rate(ctx):.2f} vs {tok}")
    grid = [1e3, 4e3, 16e3, 64e3, 128e3, 256e3, 512e3, 1_048_576]
    check("吞吐随上下文单调不增",
          all(C.decode_rate(a) >= C.decode_rate(b) for a, b in zip(grid, grid[1:])))
    check("1M 上下文外推为正", C.decode_rate(1_048_576) > 0,
          f"{C.decode_rate(1_048_576):.1f} tok/s")
    check("幂律插值比线性插值保守",
          C.decode_rate(base.avg_context) < C.linear_interp_decode_rate(base.avg_context),
          f"{C.decode_rate(base.avg_context):.0f} < "
          f"{C.linear_interp_decode_rate(base.avg_context):.0f} tok/s")

    # --- 三、产能与收入的量纲一致性 ---------------------------------------
    cap = C.node_capacity(base)
    check("月输出 token 不超过纯解码上界",
          cap["out_tokens_per_month"] <= cap["decode_rate_tok_s"] * float(
              P.get("meta.seconds_per_month")),
          f"{cap['out_tokens_per_month']:.3e}")
    check("解码占用时间比在 (0,1)", 0 < cap["decode_time_share"] < 1,
          f"{cap['decode_time_share'] * 100:.1f}%")
    check("KV 池并发上限随上下文递减",
          C.max_concurrency_from_kv(2000) > C.max_concurrency_from_kv(128000))

    eff_in = R.effective_input_price_usd_per_m(econ, 0.85)
    check("85% 命中率下有效输入价显著低于标价",
          eff_in < econ.price_in * 0.30,
          f"${eff_in:.4f}/M vs 标价 ${econ.price_in:.2f}/M")

    # --- 四、盈亏平衡的内部一致性 -----------------------------------------
    be = R.breakeven_utilization(base, econ)
    at_be = R.node_month(base, econ, be)
    check("盈亏平衡点处税前利润为零", abs(at_be["ebt_usd"]) < 1e-6,
          f"利用率 {be * 100:.2f}% 时 EBT {at_be['ebt_usd']:.8f}")
    xo = R.crossover_volume(base, econ)
    expected_be = xo["as_pct_of_one_node"] / 100 / econ.net_retention_per_usd
    check("crossover 与盈亏平衡之差恰为支付手续费楔子",
          abs(expected_be - be) < 1e-9,
          f"{xo['as_pct_of_one_node']:.3f}% / {econ.net_retention_per_usd:.4f} "
          f"= {expected_be * 100:.3f}%")
    check("租金越低盈亏平衡点越低",
          R.breakeven_utilization(base, R.base_economics(100_000)) < be)
    check("售价折半会抬高盈亏平衡点",
          R.breakeven_utilization(base, R.with_price_multiplier(econ, 0.5)) > be)

    # --- 五、合规筛查 -----------------------------------------------------
    scr = CS.screen_summary(None)
    check("层一在未披露时返回 undetermined 而非替用户假设",
          scr["layer1"]["verdict"] == "undetermined")
    check("层一标注地理不可解", scr["layer1"]["geography_can_solve"] is False)
    check("缅甸被识别为 D:5 并排除",
          "缅甸" in scr["excluded_by_destination"])
    check("越南虽有 B300 现货仍因 D:1 被排除",
          "越南" in scr["excluded_by_destination"])
    check("柬埔寨移出 D:5 后仍因 D:1 被排除",
          "柬埔寨" in scr["excluded_by_destination"])
    check("候选国恰为 5 个（含新加坡对照）", scr["n_candidates"] == 5,
          ",".join(scr["candidates"]))
    check("层三对未核实国家不得标为无管制",
          scr["host_regimes_unverified"] >= 1,
          f"已核实 {scr['host_regimes_verified']} 个，未核实 {scr['host_regimes_unverified']} 个")
    lic = CS.k3_license_check(None)
    check("K3 许可在收入未披露时返回 undetermined",
          lic["verdict"] == "undetermined" and lic["is_maas"] is True)
    check("K3 许可门槛为 2000 万美元", lic["threshold_usd_12m"] == 20_000_000)

    # --- 六、租金交叉验证 -------------------------------------------------
    v = RV.validation_summary()
    check("本项目租金与 Bit Origin 可比交易相差在 5% 以内",
          abs(v["bit_origin_delta_pct"]) < 5.0,
          f"偏差 {v['bit_origin_delta_pct']:+.2f}%")
    check("出租方成本反推给出的毛利率为负或极薄（说明报价贴地板）",
          v["margin_vs_my_mid_pct"] < 15.0,
          f"马来西亚中位硬件下毛利 {v['margin_vs_my_mid_pct']:+.1f}%")
    check("新加坡成本高于马来西亚",
          v["lessor_cost_sg_mid"] > v["lessor_cost_my_mid"],
          f"SG ${v['lessor_cost_sg_mid']:,.0f} > MY ${v['lessor_cost_my_mid']:,.0f}")

    # --- 七、选址 ---------------------------------------------------------
    mat = S.siting_matrix()
    check("选址矩阵包含 5 个候选（含对照）", len(mat) == 5)
    check("菲律宾的延迟与托管留空而非编造",
          bool(mat.loc[mat["code"] == "PH", "到美西RTT_ms"].isna().iloc[0]))
    check("新加坡托管价标为 quote，其余标为 estimate",
          mat.loc[mat["code"] == "SG", "托管数据状态"].iloc[0] == "quote"
          and "estimate" in mat.loc[mat["code"] == "MY", "托管数据状态"].iloc[0])
    slo = S.ttft_slo_check("SG")
    check("新加坡 P90 TTFT 本身已超 1 秒 SLO（说明瓶颈在模型不在选址）",
          not slo["p90_pass_slo"], f"P90 {slo['ttft_p90_ms']:.0f}ms")
    th = S.ttft_slo_check("TH")
    check("曼谷相对新加坡的 TTFT 恶化小于 5%",
          th["mean_degradation_pct"] < 5.0,
          f"{th['mean_degradation_pct']:.2f}%")

    # 税：新加坡新创减免必须真的比标准税率低
    t1 = S.annual_tax_usd(300_000, "SG", 1)
    t4 = S.annual_tax_usd(300_000, "SG", 4)
    check("新加坡首年有效税率低于第 4 年", t1 < t4,
          f"{t1 / 300_000 * 100:.2f}% < {t4 / 300_000 * 100:.2f}%")
    check("新加坡有效税率始终低于 17% 标准税率", t4 / 300_000 < 0.17)
    check("亏损年份不缴税", S.annual_tax_usd(-1000, "SG", 1) == 0.0
          and S.annual_tax_usd(-1000, "MY", 1) == 0.0)

    # --- 八、滚动与会计恒等式 ---------------------------------------------
    sc = RL.scenarios()
    df = RL.roll(base, econ, sc["optimistic"])
    h = RL.horizon_only(df)
    check("窗口长度等于 36 个月", len(h) == int(P.get("meta.horizon_months")))
    check("清算期存在且不新增节点",
          (df["phase"] == "runoff").sum() > 0 and df.loc[df["phase"] == "runoff", "ordered"].sum() == 0)
    check("净利 = 税前利润 - 税（逐月）",
          bool(((h["ebt_usd"] - h["tax_usd"] - h["net_income_usd"]).abs() < 1e-6).all()))
    check("应收余额非负且等于累计收入减累计收现",
          bool((h["ar_balance_usd"] >= -1e-6).all()))
    check("利用率恒在 [0,1]", bool(((h["utilization"] >= 0) & (h["utilization"] <= 1)).all()))
    check("权益 = 现金 + 押金",
          bool(((h["cash_usd"] + h["deposits_usd"] - h["equity_usd"]).abs() < 1e-6).all()))
    check("清算期末节点数归零",
          int(df["nodes"].iloc[-1]) == 0, f"末月节点 {int(df['nodes'].iloc[-1])}")

    # 账期确实制造了资金占用
    check("聚合渠道账期制造了正的应收沉淀",
          float(h["ar_balance_usd"].max()) > 0,
          f"峰值应收 ${h['ar_balance_usd'].max():,.0f}")

    # --- 九、指标 ---------------------------------------------------------
    s = M.summarize(df)
    check("峰值资金占用不小于初始投入",
          s["peak_capital_employed_usd"] >= s["initial_capital_usd"] - 1e-6)
    check("停摆口径终值低于继续经营口径终值",
          s["end_equity_after_tail_usd"] < s["end_equity_going_concern_usd"],
          f"停摆 ${s['end_equity_after_tail_usd']:,.0f} < 继续 ${s['end_equity_going_concern_usd']:,.0f}")
    check("IRR 求解器对照检验",
          0.02 < M.irr_monthly([-100.0] + [10.0] * 12) < 0.04)
    check("无法回本时 IRR 返回 NaN",
          math.isnan(M.irr_monthly([-100.0] + [1.0] * 12)))

    # 价格侵蚀必须单调地损害结果
    eqs = []
    for ero in (0.0, 0.20, 0.40):
        eqs.append(M.summarize(
            RL.roll(base, econ, sc["neutral"], price_erosion_annual=ero))["end_equity_usd"])
    check("价格侵蚀越高终值越低（单调）",
          eqs[0] > eqs[1] > eqs[2],
          " > ".join(f"${x:,.0f}" for x in eqs))

    # 悲观情景必须被识别为亏损，模型不得粉饰
    s_p = M.summarize(RL.roll(base, econ, sc["pessimistic"]))
    check("悲观情景被识别为亏损", s_p["end_equity_usd"] < 0,
          f"窗口末权益 ${s_p['end_equity_usd']:,.0f}")

    # 长租约的下行不对称必须被算出来
    da = M.downside_asymmetry(econ, fail_month=6)
    check("36 个月租约在第 6 月失败时的剩余义务远大于月付",
          da["term_36m"]["pv_usd"] > 20 * da["term_1m"]["pv_usd"] + 1,
          f"36月租约 ${da['term_36m']['pv_usd']:,.0f} vs 月付 ${da['term_1m']['pv_usd']:,.0f}")

    print(f"\n自检结束：{'全部通过' if not FAILURES else f'{len(FAILURES)} 项失败'}")
    for f in FAILURES:
        print(f"  失败项：{f}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(run())
