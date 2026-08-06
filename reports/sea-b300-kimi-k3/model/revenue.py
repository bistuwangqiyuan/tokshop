"""收入与单节点损益。

记账口径
--------
全模型以美元记账。收入天然是美元（token 按美元定价），租金是人民币，按
params.yaml 登记的中间价折算。人民币升值直接压缩利润，故汇率列入敏感性。

双轨渠道的费率不对称，必须分开算
--------------------------------
- 聚合平台（OpenRouter）：不对 provider 价格加价，我方按自设美元价收款，
  按月开票结算。我方不承担支付手续费，但承担约 45 天的应收账期。
- 自建 API：预付额度，无应收，但承担支付通道手续费（比例费 + 每笔固定费）。

因此混合费率 = 自建占比 x 自建费率，聚合侧为零。把手续费一律按全额收入计会
高估成本，反之忽略账期会低估资金占用——两个方向的错都要避免。
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import params as P
from capacity import RequestProfile, node_capacity


@dataclass(frozen=True)
class Economics:
    """一台节点的经济参数。价格字段可被价格侵蚀逐月缩放。"""

    rent_cny: float
    price_in: float
    price_cached: float
    price_out: float
    misc_opex_usd: float
    payment_fee_rate: float
    payment_fee_fixed_usd: float
    avg_topup_usd: float
    aggregator_share: float
    usd_cny: float
    price_multiplier: float = 1.0   # 主动折价（为进入价格排序而降价）

    @property
    def rent_usd(self) -> float:
        return self.rent_cny / self.usd_cny

    @property
    def direct_share(self) -> float:
        return 1.0 - self.aggregator_share

    @property
    def net_retention_per_usd(self) -> float:
        """每 1 美元流水扣除支付成本后的净留存。聚合侧无手续费。"""
        fixed_per_usd = (
            self.payment_fee_fixed_usd / self.avg_topup_usd
            if self.avg_topup_usd > 0
            else 0.0
        )
        direct_cost = self.payment_fee_rate + fixed_per_usd
        return 1.0 - self.direct_share * direct_cost


def base_economics(rent_cny: float | None = None) -> Economics:
    return Economics(
        rent_cny=float(P.get("rent.given_cny_per_month")) if rent_cny is None else float(rent_cny),
        price_in=float(P.get("pricing.price_in_usd_per_m")),
        price_cached=float(P.get("pricing.price_cached_in_usd_per_m")),
        price_out=float(P.get("pricing.price_out_usd_per_m")),
        misc_opex_usd=float(P.get("assumptions.misc_opex_usd_per_month")),
        payment_fee_rate=float(P.get("assumptions.payment_fee_rate")),
        payment_fee_fixed_usd=float(P.get("assumptions.payment_fee_fixed_usd")),
        avg_topup_usd=float(P.get("assumptions.avg_topup_usd")),
        aggregator_share=float(P.get("assumptions.aggregator_revenue_share")),
        usd_cny=P.usd_cny(),
    )


def revenue_per_request_usd(profile: RequestProfile, econ: Economics) -> float:
    """单请求收入。缓存命中的输入按缓存价计——这是收入模型最易出错的一处。

    若误按标价 $3.00/M 计算全部输入，85% 命中率下会把输入侧收入高估约 4 倍。
    """
    m = econ.price_multiplier
    uncached = profile.input_tokens * (1.0 - profile.cache_hit)
    cached = profile.input_tokens * profile.cache_hit
    return (
        uncached / 1e6 * econ.price_in * m
        + cached / 1e6 * econ.price_cached * m
        + profile.output_tokens / 1e6 * econ.price_out * m
    )


def effective_input_price_usd_per_m(econ: Economics, cache_hit: float) -> float:
    """有效输入价：把缓存命中率折进去之后每百万输入 token 的实收。"""
    m = econ.price_multiplier
    return (1 - cache_hit) * econ.price_in * m + cache_hit * econ.price_cached * m


def node_month(profile: RequestProfile, econ: Economics, utilization: float,
               prefill_rate: float | None = None) -> dict:
    """单节点单月损益（税前）。utilization 为时间预算占用率。"""
    cap = node_capacity(profile, prefill_rate=prefill_rate)
    rev_per_req = revenue_per_request_usd(profile, econ)

    requests = cap["req_per_month"] * utilization
    gross_usd = requests * rev_per_req

    direct_gross = gross_usd * econ.direct_share
    topups = direct_gross / econ.avg_topup_usd if econ.avg_topup_usd > 0 else 0.0
    fee_usd = direct_gross * econ.payment_fee_rate + topups * econ.payment_fee_fixed_usd

    rent_usd = econ.rent_usd
    cost_usd = rent_usd + econ.misc_opex_usd + fee_usd

    return {
        "utilization": utilization,
        "requests": requests,
        "revenue_usd": gross_usd,
        "revenue_cny": gross_usd * econ.usd_cny,
        "payment_fee_usd": fee_usd,
        "rent_usd": rent_usd,
        "misc_opex_usd": econ.misc_opex_usd,
        "total_cost_usd": cost_usd,
        "ebt_usd": gross_usd - cost_usd,
        "out_tokens": cap["out_tokens_per_month"] * utilization,
        "in_tokens": cap["in_tokens_per_month"] * utilization,
        "revenue_per_node_hour_usd": gross_usd / float(P.get("meta.hours_per_month")),
    }


def breakeven_utilization(profile: RequestProfile, econ: Economics,
                          prefill_rate: float | None = None) -> float:
    """使税前利润为零的时间占用率。手续费随收入线性变化，可解析求解。"""
    cap = node_capacity(profile, prefill_rate=prefill_rate)
    gross_at_full = cap["req_per_month"] * revenue_per_request_usd(profile, econ)
    net_per_usd = econ.net_retention_per_usd
    if net_per_usd <= 0:
        return float("inf")
    fixed = econ.rent_usd + econ.misc_opex_usd
    net_at_full = gross_at_full * net_per_usd
    if net_at_full <= 0:
        return float("inf")
    return fixed / net_at_full


def crossover_volume(profile: RequestProfile, econ: Economics) -> dict:
    """自建追平「按标价向上游采购」所需的月请求量。

    自建的本质是把可变成本变成固定成本，只有产量足够大时摊薄后的固定成本才低于
    按量采购。这条判据决定「该不该自建」，比 IRR 更早需要回答。
    """
    fixed_usd = econ.rent_usd + econ.misc_opex_usd
    buy_per_req = revenue_per_request_usd(profile, econ)
    reqs = fixed_usd / buy_per_req
    cap = node_capacity(profile)
    return {
        "profile": profile.name,
        "requests_per_month": reqs,
        "out_tokens_per_month": reqs * profile.output_tokens,
        "as_pct_of_one_node": reqs / cap["req_per_month"] * 100,
        "buy_usd_per_req": buy_per_req,
    }


def unit_cost_vs_buy(profile: RequestProfile, econ: Economics, utilization: float) -> dict:
    cap = node_capacity(profile)
    requests = cap["req_per_month"] * utilization
    buy = revenue_per_request_usd(profile, econ)
    fixed_usd = econ.rent_usd + econ.misc_opex_usd
    selfhost = fixed_usd / requests if requests > 0 else float("inf")
    return {
        "utilization": utilization,
        "requests_per_month": requests,
        "buy_usd_per_req": buy,
        "selfhost_usd_per_req": selfhost,
        "selfhost_cheaper": selfhost < buy,
        "saving_pct": (1 - selfhost / buy) * 100 if buy > 0 else float("nan"),
    }


def with_price_multiplier(econ: Economics, multiplier: float) -> Economics:
    return replace(econ, price_multiplier=multiplier)
