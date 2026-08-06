"""按月滚动与复利再投资引擎。

这是用户明确要求的核心：按月支付租金、按月滚动、利润复利再投资。

比「天真复利」多建模的四件事
----------------------------
1. 三重约束同时生效，并记录每个月是哪一条在卡脖子。
   - 资金约束：现金够不够开下一台
   - 供给约束：B300 仍属配额供应，每季度最多加一台，且有交付前置期
   - 需求约束：需求吃不下就加租，等于白付租金
   只看资金约束的模型会把扩张画得太快。

2. 应收账期造成的营运资金缺口。聚合平台按月开票结算，假设账期 45 天；租金却
   要按月预付。稳态下会沉淀约 1.5 个月的聚合渠道收入在应收里，这笔钱是真实的
   资金占用，不计入就会高估资金使用效率。

3. 逐年计税。新加坡主体适用新创减免与 YA2026 回扣，前三年有效税率显著低于 17%。

4. 尾部租约义务。第 30 个月新开的节点若签 36 个月租约，会在测算窗口之外留下
   29 个月的付款义务。不计入等于把成本藏到窗口外面——这是同类测算最常见的
   粉饰手法，本模型明确折现计入。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd

import params as P
import siting
from capacity import RequestProfile
from revenue import Economics, node_month


@dataclass(frozen=True)
class DemandScenario:
    name: str
    month_to_first_node_full: float
    plateau_nodes: float
    growth_after_plateau: float = 0.0


def scenarios() -> dict[str, DemandScenario]:
    d = P.get("assumptions.demand_scenarios")
    out = {}
    for k in ("pessimistic", "neutral", "optimistic"):
        cfg = d[k]
        out[k] = DemandScenario(
            name={"pessimistic": "悲观", "neutral": "中性", "optimistic": "乐观"}[k],
            month_to_first_node_full=float(cfg["month_to_first_node_full"]),
            plateau_nodes=float(cfg["plateau_nodes"]),
            growth_after_plateau=float(cfg.get("growth_after_plateau", 0.0)),
        )
    return out


def demand_curve(sc: DemandScenario, months: int) -> np.ndarray:
    out = []
    for m in range(1, months + 1):
        d = min(m / sc.month_to_first_node_full, sc.plateau_nodes)
        if d >= sc.plateau_nodes and sc.growth_after_plateau > 0:
            over = max(m - sc.month_to_first_node_full * sc.plateau_nodes, 0)
            d = sc.plateau_nodes * (1 + sc.growth_after_plateau) ** over
        out.append(d)
    return np.array(out)


def node_startup_capital_usd(econ: Economics) -> float:
    """开一台节点占用的资金：押金 + 首月租金 + 安全垫。

    口径按用户确认：初始自有资金 = 首月租金 + 3 个月安全垫，另加押金。
    这里不存在「租金重复计算」的问题——这笔现金正是用来逐月支付租金的，
    它是占用而非费用。
    """
    dep = float(P.get("assumptions.deposit_months"))
    buf = float(P.get("assumptions.opex_buffer_months"))
    return econ.rent_usd * (dep + 1.0 + buf)


def deposit_usd(econ: Economics) -> float:
    return econ.rent_usd * float(P.get("assumptions.deposit_months"))


def _collection_weights() -> tuple[int, float]:
    """把账期折算成「滞后整月数 + 小数权重」。45 天 -> 滞后 1 月与 2 月各半。"""
    lag = float(P.get("assumptions.ar_days_aggregator")) / 30.0
    floor = int(math.floor(lag))
    return floor, lag - floor


def lease_end_month(start: int, term: int, horizon: int) -> int:
    """节点的租约实际结束月。

    关键假设：**窗口内租约自动续期**。一份 12 个月的租约不意味着业务在第 12 个月
    停业，而意味着每 12 个月续签一次。因此节点持续运营到"覆盖测算窗口的那个租约
    周期"结束为止。

    不这样建模会得出一个荒谬结论：租期越短终值越低（因为节点提前退出、收入归零）。
    租期的真实影响只有一个——**剩余义务的大小**，也就是你想停的时候还要付多久。
    """
    if start > horizon:
        return start + term - 1
    cycles = math.ceil((horizon - start + 1) / term)
    return start + cycles * term - 1


def tail_lease_obligation_usd(node_start_months: list[int], econ: Economics,
                              horizon: int) -> dict:
    """测算窗口之外的剩余租约义务及其现值（已计入窗口内自动续期）。"""
    term = int(P.get("assumptions.lease_term_months"))
    r = float(P.get("assumptions.discount_rate_annual")) / 12.0
    total_months = 0
    pv = 0.0
    for start in node_start_months:
        last = lease_end_month(start, term, horizon)
        rem = max(0, last - horizon)
        total_months += rem
        for j in range(1, rem + 1):
            pv += econ.rent_usd / (1 + r) ** j
    return {
        "lease_term_months": term,
        "remaining_node_months": total_months,
        "nominal_usd": total_months * econ.rent_usd,
        "pv_usd": pv,
    }


def roll(profile: RequestProfile, econ: Economics, sc: DemandScenario,
         months: int | None = None,
         price_erosion_annual: float | None = None,
         hazard_monthly: float | None = None,
         jurisdiction: str = "SG",
         host_country: str = "MY",
         enforce_supply_cap: bool = True,
         with_runoff: bool = True) -> pd.DataFrame:
    """按月滚动。

    with_runoff=True 时，在测算窗口之后继续模拟到最后一份租约到期，期间不再新增
    节点、需求冻结在窗口末值。这一段叫「租约清算期」，它的存在是为了公平处理
    尾部租约义务：只把窗口外的租金算成负债、却不把窗口外的收入算进来，是另一种
    方向的失真。报告同时给出两个口径——继续经营（清算期净现值）与业务停摆
    （纯租约义务现值）。
    """
    months = int(P.get("meta.horizon_months")) if months is None else months
    if price_erosion_annual is None:
        price_erosion_annual = float(P.get("assumptions.price_erosion_annual"))
    if hazard_monthly is None:
        hazard_monthly = float(P.get("assumptions.hazard_monthly"))

    startup = node_startup_capital_usd(econ)
    dep = deposit_usd(econ)
    cash = startup - dep                    # 押金付出后剩下的可动用现金
    deposits_paid = dep
    initial_capital = startup
    nodes = 1
    node_start_months = [1]
    demand = demand_curve(sc, months)

    lag_floor, lag_frac = _collection_weights()
    agg_share = econ.aggregator_share
    billed_agg: list[float] = []
    survival = 1.0
    ytd_ebt = 0.0
    compliance_m = float(P.get("assumptions.compliance_opex_usd_per_year")) / 12.0
    cap_per_quarter = int(P.get("assumptions.supply_cap_new_nodes_per_quarter"))
    lag_months = int(P.get("assumptions.provisioning_lag_months")[host_country])
    added_this_quarter = 0
    pending: list[tuple[int, int]] = []      # (到货月, 台数)

    term = int(P.get("assumptions.lease_term_months"))
    total_months = months
    if with_runoff:
        # 最迟可能下单的月份是 months，其租约延续到 months+lag+term-1
        total_months = months + lag_months + term - 1

    rows = []
    for m in range(1, total_months + 1):
        in_horizon = m <= months
        if (m - 1) % 3 == 0:
            added_this_quarter = 0
        # 前期已下单的节点到货
        arrived = sum(n for arr, n in pending if arr == m)
        if arrived:
            nodes += arrived
            node_start_months.extend([m] * arrived)
            pending = [(a, n) for a, n in pending if a != m]

        # 窗口内租约自动续期；清算期跑完当前周期后退出，不再新增
        nodes = sum(1 for s in node_start_months
                    if s <= m <= lease_end_month(s, term, months))

        erosion = (1 - price_erosion_annual) ** (m / 12.0)
        e = replace(econ, price_out=econ.price_out * erosion,
                    price_in=econ.price_in * erosion,
                    price_cached=econ.price_cached * erosion)

        # 清算期需求冻结在窗口末值，不假设继续增长
        d_now = demand[m - 1] if in_horizon else demand[months - 1]
        util = min(d_now / nodes, 1.0) if nodes else 0.0
        per_node = node_month(profile, e, util)

        revenue = per_node["revenue_usd"] * nodes
        opex = per_node["total_cost_usd"] * nodes + compliance_m
        ebt = revenue - opex
        ytd_ebt += ebt

        # 现金：自建渠道即时到账，聚合渠道按账期滞后
        billed_agg.append(revenue * agg_share)
        direct_cash = revenue * (1 - agg_share)

        def _past(k: int) -> float:
            idx = len(billed_agg) - 1 - k
            return billed_agg[idx] if idx >= 0 else 0.0

        agg_cash = _past(lag_floor) * (1 - lag_frac) + _past(lag_floor + 1) * lag_frac
        cash_in = direct_cash + agg_cash

        cash += cash_in - opex

        # 逐年计税，年末缴纳
        tax = 0.0
        if m % 12 == 0:
            tax = siting.annual_tax_usd(max(ytd_ebt, 0.0), jurisdiction, m // 12)
            cash -= tax
            ytd_ebt = 0.0

        survival *= (1 - hazard_monthly)

        # 再投资：三条约束必须同时满足。三条都记录，避免只报第一条而掩盖真实瓶颈。
        cash_ok = cash >= startup
        demand_ok = d_now > (nodes + sum(n for _, n in pending)) * 0.9
        supply_ok = (not enforce_supply_cap) or (added_this_quarter < cap_per_quarter)
        unmet = [n for n, ok in (("资金", cash_ok), ("需求", demand_ok), ("供给", supply_ok))
                 if not ok]
        binding = "+".join(unmet) if unmet else "无"
        ordered = 0
        if in_horizon and cash_ok and demand_ok and supply_ok and nodes + len(pending) < 50:
            cash -= startup
            deposits_paid += dep
            pending.append((m + lag_months, 1))
            added_this_quarter += 1
            ordered = 1

        rows.append({
            "month": m,
            "phase": "horizon" if in_horizon else "runoff",
            "nodes": nodes,
            "pending_nodes": sum(n for _, n in pending),
            "ordered": ordered,
            "binding_constraint": binding,
            "cash_ok": cash_ok,
            "demand_ok": demand_ok,
            "supply_ok": supply_ok,
            "demand_equiv_nodes": d_now,
            "utilization": util,
            "revenue_usd": revenue,
            "out_tokens": per_node["out_tokens"] * nodes,
            "in_tokens": per_node["in_tokens"] * nodes,
            "rent_usd": per_node["rent_usd"] * nodes,
            "opex_usd": opex,
            "ebt_usd": ebt,
            "tax_usd": tax,
            "net_income_usd": ebt - tax,
            "cash_in_usd": cash_in,
            "cash_usd": cash,
            "deposits_usd": deposits_paid,
            "equity_usd": cash + deposits_paid,
            "survival_prob": survival,
            "expected_net_income_usd": (ebt - tax) * survival,
            "price_index": erosion,
        })

    # 应收余额：已计收入减已收现金的累计差
    df = pd.DataFrame(rows)
    df["ar_balance_usd"] = (df["revenue_usd"].cumsum() - df["cash_in_usd"].cumsum())
    df["capital_employed_usd"] = df["deposits_usd"] + df["ar_balance_usd"].clip(lower=0)

    tail = tail_lease_obligation_usd(node_start_months, econ, months)

    # 清算期净现金流的现值：这是「继续经营」口径下窗口外的真实价值
    r = float(P.get("assumptions.discount_rate_annual")) / 12.0
    runoff = df[df["phase"] == "runoff"]
    runoff_pv = float(
        (runoff["net_income_usd"].to_numpy()
         / (1 + r) ** (runoff["month"].to_numpy() - months)).sum()
    ) if len(runoff) else 0.0

    df.attrs.update({
        "initial_capital": initial_capital,
        "startup_per_node": startup,
        "node_start_months": node_start_months,
        "tail_lease": tail,
        "runoff_pv_usd": runoff_pv,
        "runoff_months": int(len(runoff)),
        "horizon_months": months,
        "jurisdiction": jurisdiction,
        "host_country": host_country,
        "scenario": sc.name,
        "rent_cny": econ.rent_cny,
    })
    return df


def horizon_only(df: pd.DataFrame) -> pd.DataFrame:
    """截取测算窗口部分。所有窗口内指标都基于此，避免清算期污染。"""
    out = df[df["phase"] == "horizon"].copy()
    out.attrs.update(df.attrs)
    return out


def solvency(df: pd.DataFrame) -> dict:
    d = df[df["phase"] == "horizon"] if "phase" in df.columns else df
    min_cash = float(d["cash_usd"].min())
    neg = d.loc[d["cash_usd"] < 0, "month"]
    return {
        "min_cash_usd": min_cash,
        "insolvent": bool(min_cash < 0),
        "insolvent_month": int(neg.iloc[0]) if len(neg) else None,
        "additional_capital_required_usd": max(-min_cash, 0.0),
    }
