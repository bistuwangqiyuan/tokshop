"""资金收益率与资金使用效率。

为什么这两组指标必须一起看
--------------------------
经营性租赁的资金占用分母很小（押金 + 缓冲 + 应收），会让收益率的绝对值显得
很漂亮。但分母小是双向的：好情景 ROIC 高，坏情景亏损相对本金放大得同样快。
只报 IRR 而不报峰值资金占用与追加资金需求，是对读者的误导。

口径一律公开，任何人可用 outputs/ 的逐月表复算：
  - 股权现金流 = 期初投入（负）+ 各月净利（税后）
  - 峰值资金占用 = max(初始投入, 初始投入 + 累计现金缺口)
  - 资金周转次数 = 年化收入 / 平均资金占用
  - 现金转换周期 CCC = 应收天数 - 应付天数（本业务无存货、无应付账期，租金预付）
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

import params as P


def irr_monthly(cashflows: list[float]) -> float:
    """月度 IRR，二分法求 NPV 为零的贴现率。cashflows[0] 为期初投入（负）。"""
    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** i for i, cf in enumerate(cashflows))

    if npv(0.0) <= 0:
        return float("nan")
    lo, hi = 0.0, 1.0
    while npv(hi) > 0 and hi < 100:
        hi *= 2
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def summarize(df_full: pd.DataFrame) -> dict:
    """把逐月表压成投资指标。

    输入是含清算期的完整表；窗口内指标一律基于 phase=='horizon' 的切片，
    清算期只贡献一个终值项 runoff_pv，两者不混算。
    """
    from rolling import solvency, horizon_only

    df = horizon_only(df_full) if "phase" in df_full.columns else df_full
    c0 = df.attrs["initial_capital"]
    tail = df.attrs["tail_lease"]
    runoff_pv = df.attrs.get("runoff_pv_usd", 0.0)
    months = len(df)

    flows = [-c0] + df["net_income_usd"].tolist()
    m_irr = irr_monthly(flows)

    cum = df["net_income_usd"].cumsum()
    payback = next((int(m) for m, v in zip(df["month"], cum) if v >= c0), None)

    # 资金占用：初始投入 + 后续追加的节点启动资金 + 应收沉淀
    invested = c0 + (df["ordered"].cumsum().shift(1).fillna(0) * df.attrs["startup_per_node"])
    capital_employed = np.maximum(invested, df["capital_employed_usd"])
    peak_capital = float(capital_employed.max())

    total_ni = float(df["net_income_usd"].sum())
    end_equity = float(df["equity_usd"].iloc[-1])
    total_rev = float(df["revenue_usd"].sum())
    sol = solvency(df)

    # 两个口径，必须并列呈现，只报一个都是失真：
    #   继续经营：窗口末权益 + 清算期净现金流现值（已含窗口外租金）
    #   业务停摆：窗口末权益 - 剩余租约义务现值（收入归零但租金照付）
    end_equity_going_concern = end_equity + runoff_pv
    end_equity_after_tail = end_equity - tail["pv_usd"]

    monthly_roic = (df["net_income_usd"] / capital_employed).replace(
        [np.inf, -np.inf], np.nan)

    ar_days = float(P.get("assumptions.ar_days_aggregator"))
    agg_share = float(P.get("assumptions.aggregator_revenue_share"))

    return {
        **sol,
        "initial_capital_usd": c0,
        "peak_capital_employed_usd": peak_capital,
        "months": months,
        "total_revenue_usd": total_rev,
        "total_net_income_usd": total_ni,
        "end_cash_usd": float(df["cash_usd"].iloc[-1]),
        "end_equity_usd": end_equity,
        "tail_lease_pv_usd": tail["pv_usd"],
        "tail_lease_nominal_usd": tail["nominal_usd"],
        "tail_lease_node_months": tail["remaining_node_months"],
        "runoff_pv_usd": runoff_pv,
        "runoff_months": df.attrs.get("runoff_months", 0),
        "end_equity_going_concern_usd": end_equity_going_concern,
        "end_equity_after_tail_usd": end_equity_after_tail,
        "end_nodes": int(df["nodes"].iloc[-1]),
        "moic": end_equity / c0 if c0 else float("nan"),
        "moic_going_concern": end_equity_going_concern / c0 if c0 else float("nan"),
        "moic_after_tail": end_equity_after_tail / c0 if c0 else float("nan"),
        "irr_monthly": m_irr,
        "irr_annual": (1 + m_irr) ** 12 - 1 if not math.isnan(m_irr) else float("nan"),
        "payback_month": payback,
        "mean_monthly_roic": float(monthly_roic.mean()),
        "capital_turns_per_year": (total_rev / months * 12) / peak_capital
        if peak_capital > 0 else float("nan"),
        "revenue_per_usd_capital": total_rev / peak_capital if peak_capital > 0 else float("nan"),
        "out_tokens_total": float(df["out_tokens"].sum()),
        "out_tokens_per_usd_capital": float(df["out_tokens"].sum()) / peak_capital
        if peak_capital > 0 else float("nan"),
        "ccc_days": ar_days * agg_share,
        "avg_utilisation": float(df["utilization"].mean()),
        "months_capital_bound": int((df["binding_constraint"] == "资金").sum()),
        "months_demand_bound": int((df["binding_constraint"] == "需求").sum()),
        "months_supply_bound": int((df["binding_constraint"] == "供给").sum()),
        "expected_net_income_usd": float(df["expected_net_income_usd"].sum()),
    }


def downside_asymmetry(econ, fail_month: int, horizon: int | None = None) -> dict:
    """长租约的下行不对称：业务在第 fail_month 个月失败时，剩余租约义务有多大。

    这是「用长约换低价」的真实代价，也是本报告要求把提前终止条款列为谈判必争项
    的量化依据。
    """
    horizon = int(P.get("meta.horizon_months")) if horizon is None else horizon
    r = float(P.get("assumptions.discount_rate_annual")) / 12.0
    out = {}
    for term in (1, 12, 36):
        rem = max(0, term - fail_month)
        pv = sum(econ.rent_usd / (1 + r) ** j for j in range(1, rem + 1))
        out[f"term_{term}m"] = {
            "remaining_months": rem,
            "nominal_usd": rem * econ.rent_usd,
            "pv_usd": pv,
        }
    return {"fail_month": fail_month, **out}
