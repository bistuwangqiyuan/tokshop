"""敏感性、盈亏平衡曲面、跨选址对比与蒙特卡洛。

为什么把敏感性单独成模块
------------------------
本项目的结论对若干「查不到出处、只能假设」的输入极度敏感，其中最要命的是
年化价格侵蚀率。与其给一个点估计冒充结论，不如把结论写成「在什么条件下成立」
的函数。读者可以替换自己的判断重算，这才是可检验。
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pandas as pd

import capacity as C
import metrics as M
import params as P
import revenue as R
import rolling as RL
import siting as S


def one_factor(profile, econ, scenario) -> pd.DataFrame:
    """单因素敏感性：每次只动一个变量，其余保持基准。"""
    rows = []

    def run(label, value, **kw):
        e = kw.pop("econ", econ)
        pr = kw.pop("profile", profile)
        df = RL.roll(pr, e, scenario, **kw)
        s = M.summarize(df)
        rows.append({
            "因素": label,
            "取值": value,
            "IRR年化": s["irr_annual"],
            "回本月": s["payback_month"],
            "窗口末权益_USD": s["end_equity_usd"],
            "继续经营终值_USD": s["end_equity_going_concern_usd"],
            "峰值资金占用_USD": s["peak_capital_employed_usd"],
            "需追加资金_USD": s["additional_capital_required_usd"],
            "期末节点数": s["end_nodes"],
        })

    for v in (0.0, 0.10, 0.20, 0.30, 0.40):
        run("年化价格侵蚀率", v, price_erosion_annual=v)
    for v in (100_000, 125_000, 150_000, 175_000, 200_000):
        run("月租金_CNY", v, econ=R.base_economics(v))
    for v in (0.65, 0.75, 0.85, 0.89):
        pr = C.RequestProfile(profile.name, profile.input_tokens, profile.output_tokens, v)
        run("缓存命中率", v, profile=pr)
    for v in (6.2, 6.7917, 7.1, 7.5):
        e = replace(econ, usd_cny=v)
        run("汇率_USDCNY", v, econ=e)
    for v in (0.005, 0.010, 0.020, 0.030):
        run("月度中断危险率", v, hazard_monthly=v)
    for v in (0.6, 0.8, 1.0):
        e = R.with_price_multiplier(econ, v)
        run("主动折价系数", v, econ=e)
    for name, pr in C.default_profiles().items():
        run("流量画像", pr.name, profile=pr)
    for v in (12, 36):
        # 租期只影响尾部义务，通过临时改参数实现
        old = P.raw()["assumptions"]["lease_term_months"]["value"]
        P.raw()["assumptions"]["lease_term_months"]["value"] = v
        try:
            run("租约期限_月", v)
        finally:
            P.raw()["assumptions"]["lease_term_months"]["value"] = old

    return pd.DataFrame(rows)


def breakeven_surface(profile) -> pd.DataFrame:
    """售价折扣 x 租金 的盈亏平衡利用率曲面。

    这是全报告最该被反复看的一张表：它把「要不要为抢流量降价」这个决策，
    翻译成「降价后需要多高的持续利用率才能不亏」。
    """
    rows = []
    for rent in (100_000, 125_000, 150_000, 175_000, 200_000, 265_000):
        for mult in (1.0, 0.9, 0.8, 0.7, 0.6, 0.5):
            e = R.with_price_multiplier(R.base_economics(rent), mult)
            be = R.breakeven_utilization(profile, e)
            rows.append({
                "月租金_CNY": rent,
                "售价系数": mult,
                "盈亏平衡利用率": be,
                "可行": be <= 1.0,
            })
    return pd.DataFrame(rows)


def profile_breakeven_matrix() -> pd.DataFrame:
    """四类画像 x 租金档位的盈亏平衡利用率。"""
    rents = {
        "长协3年(中国境内参照)": 108_000,
        "本项目给定": 150_000,
        "Bit Origin马来西亚可比": int(round(22_500 * P.usd_cny())),
        "现货中位(中国境内参照)": 190_000,
        "Qubrid挂牌(美国)": int(round(389_400 / 12 * P.usd_cny())),
    }
    rows = []
    for label, rent in rents.items():
        e = R.base_economics(rent)
        row = {"租金档位": label, "月租金_CNY": rent,
               "USD_per_GPU_hour": P.rent_usd_per_gpu_hour(rent)}
        for _, p in C.default_profiles().items():
            row[p.name] = R.breakeven_utilization(p, e)
        rows.append(row)
    return pd.DataFrame(rows)


def cross_site(profile, scenario) -> pd.DataFrame:
    """各候选国并排，两种注册结构对照。

    必须讲清这张表能说明什么、不能说明什么：

    **不能说明的**：哪个国家租金更便宜。因为 G-1 未取得各国实际报价，模型对所有
    国家用同一份租金。用推算的托管价去反推各国租金，等于把估计误差当成结论。

    **能说明的**：在租金相同的前提下，注册地选择带来的差异有多大。这正是
    「注册地与算力地分离」这条建议的量化依据——同一个算力地，注册在新加坡与
    注册在当地，税负差异是实打实的。
    """
    rows = []
    for code in ("TH", "MY", "ID", "SG"):
        lat = S.ttft_slo_check(code)
        for reg, reg_label in (("SG", "新加坡"), (code, "当地")):
            e = R.base_economics()
            df = RL.roll(profile, e, scenario, jurisdiction=reg, host_country=code)
            s = M.summarize(df)
            rows.append({
                "算力地": P.raw()["countries"][code]["name_cn"],
                "code": code,
                "注册地": reg_label,
                "注册地税率": P.get("siting.corporate_income_tax")[reg],
                "交付前置期_月": P.get("assumptions.provisioning_lag_months")[code],
                "网络增量_ms": lat.get("network_delta_ms"),
                "TTFT均值_ms": lat.get("ttft_mean_ms"),
                "36期累计税_USD": float(df[df["phase"] == "horizon"]["tax_usd"].sum()),
                "IRR年化": s["irr_annual"],
                "窗口末权益_USD": s["end_equity_usd"],
                "继续经营终值_USD": s["end_equity_going_concern_usd"],
                "期末节点数": s["end_nodes"],
            })
    df = pd.DataFrame(rows)
    df["托管价估计_USD_kW_月"] = df["code"].map(_safe_colo)
    return df


def _safe_colo(code: str):
    import rent_validation as RV
    try:
        return RV.colo_usd_kw_month(code)
    except KeyError:
        return None


def monte_carlo(profile, econ, n: int = 2000, seed: int = 42) -> pd.DataFrame:
    """蒙特卡洛：把最不确定的五个输入按区间抽样，输出 IRR 与终值的分布。

    抽样分布一律取均匀分布而非正态——因为我们并不知道这些参数的分布形状，
    假装知道（比如用正态）比承认无知更危险。均匀分布是最少假设的选择。
    """
    rng = np.random.default_rng(seed)
    scen = RL.scenarios()
    rows = []
    for _ in range(n):
        erosion = rng.uniform(0.0, 0.40)
        cache = rng.uniform(0.65, 0.89)
        hazard = rng.uniform(0.005, 0.030)
        mult = rng.uniform(0.6, 1.0)
        # 需求情景按 25/50/25 抽取
        u = rng.random()
        sc = scen["pessimistic"] if u < 0.25 else (
            scen["optimistic"] if u > 0.75 else scen["neutral"])

        pr = C.RequestProfile(profile.name, profile.input_tokens,
                              profile.output_tokens, cache)
        e = R.with_price_multiplier(econ, mult)
        df = RL.roll(pr, e, sc, price_erosion_annual=erosion,
                     hazard_monthly=hazard, with_runoff=True)
        s = M.summarize(df)
        rows.append({
            "erosion": erosion, "cache_hit": cache, "hazard": hazard,
            "price_multiplier": mult, "scenario": sc.name,
            "irr_annual": s["irr_annual"],
            "payback_month": s["payback_month"],
            "end_equity_usd": s["end_equity_usd"],
            "end_equity_going_concern_usd": s["end_equity_going_concern_usd"],
            "end_equity_after_tail_usd": s["end_equity_after_tail_usd"],
            "peak_capital_usd": s["peak_capital_employed_usd"],
            "end_nodes": s["end_nodes"],
        })
    return pd.DataFrame(rows)


def mc_summary(mc: pd.DataFrame) -> dict:
    ok = mc["end_equity_going_concern_usd"] > 0
    irr = mc["irr_annual"].dropna()
    return {
        "n": len(mc),
        "prob_positive_going_concern": float(ok.mean()),
        "prob_payback_within_horizon": float(mc["payback_month"].notna().mean()),
        "irr_p10": float(irr.quantile(0.10)) if len(irr) else float("nan"),
        "irr_p50": float(irr.quantile(0.50)) if len(irr) else float("nan"),
        "irr_p90": float(irr.quantile(0.90)) if len(irr) else float("nan"),
        "equity_p10": float(mc["end_equity_going_concern_usd"].quantile(0.10)),
        "equity_p50": float(mc["end_equity_going_concern_usd"].quantile(0.50)),
        "equity_p90": float(mc["end_equity_going_concern_usd"].quantile(0.90)),
        "worst_stop_case_usd": float(mc["end_equity_after_tail_usd"].min()),
    }
