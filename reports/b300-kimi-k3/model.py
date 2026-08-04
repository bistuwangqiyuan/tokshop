"""
B300 租赁 + Kimi K3 自建推理 + 售卖 token 的投资可行性模型。

设计原则
--------
1. 外生参数一律来自 sources.md，代码中以 S-xx 标注出处；无出处者集中在
   ASSUMPTIONS 区并显式标记为假设。
2. 产能不靠外推，按第三方实测点标定；解码与预填争抢同一台机器的时间预算。
3. 每个结论都可被 --selftest 中的物理上界与量纲检查证伪。
4. 报告正文中的数字全部来自本脚本写出的 outputs/*.csv，不允许手写。

用法
----
    python model.py --selftest     # 只跑自检
    python model.py                # 自检 + 生成全部 outputs/
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, asdict, replace
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).parent / "outputs"
SECONDS_PER_MONTH = 30 * 24 * 3600  # 2,592,000，全文统一按 30 天月


# ---------------------------------------------------------------------------
# 一、外生事实（全部可回溯到 sources.md）
# ---------------------------------------------------------------------------

# S-01 Kimi K3 模型规格
K3_TOTAL_PARAMS = 2.8e12
K3_ACTIVE_PARAMS = 104e9

# S-04 B300 单卡规格
B300_HBM_BANDWIDTH_TBS = 8.0          # TB/s per GPU
B300_NVFP4_DENSE_PFLOPS = 15.0        # 稠密算力
GPUS_PER_NODE = 8

# S-04 实测可见显存（低于 288GB 标称），单位 GiB
B300_USABLE_HBM_GIB = 267.69

# S-05 K3 在 8xB300 上的实测显存占用
K3_WEIGHTS_GB_PER_GPU = 195.86
K3_WEIGHTS_TB_TOTAL = 1.57
K3_COLD_START_MINUTES = 88.8

# S-06 / S-07 实测吞吐标定点：(平均上下文长度 token, 聚合解码输出 tok/s)
# 短上下文点取 Openzeka c=64 vLLM 直出 1759（未取 SGLang 的 1863，保守）；
# 长上下文点取两家实测中各自较优者。
THROUGHPUT_POINTS = [
    (2_000, 1759.0),    # S-06 短上下文满并发
    (65_536, 501.0),    # S-07 64K, vLLM
    (204_800, 268.0),   # S-07 200K, SGLang+DCP
]

# S-07 推导：预填速率。由 GPUStack 两组端到端耗时反解，互相印证。
#   64K :  10 x 65,536 输入; e2e 100.5s; 解码 10x3000 @501 tok/s = 59.88s
#          => 预填 40.62s => 16,134 tok/s
#   200K:  10 x 204,800 输入; e2e 295.2s; 解码 10x3000 @163 tok/s = 184.05s
#          => 预填 111.15s => 18,425 tok/s
# 两次独立反解落在同一量级，取较低者，保守。
PREFILL_TOKENS_PER_SEC = 16_134.0

# S-08 售价（美元 / 每百万 token）
PRICE_IN_USD_PER_M = 3.00
PRICE_CACHED_IN_USD_PER_M = 0.30
PRICE_OUT_USD_PER_M = 15.00

# S-09 行业实测缓存命中率区间 65%-89%，取中位
CACHE_HIT_RATE = 0.85

# S-10 国内八卡整机租金观测区间（元/月）
RENT_OBSERVED = {
    "3年长协(星宇)": 108_000,
    "长单(雪球调研)": 150_000,
    "现货中位(至顶)": 190_000,
    "现货高配(悍铭)": 265_000,
    "本项目给定": 350_000,
}
RENT_BASE = 350_000

# S-12 汇率：2026-08-04 人民币对美元中间价
USD_CNY = 6.7917


# ---------------------------------------------------------------------------
# 二、显式假设（sources.md 末节已声明无公开出处）
# ---------------------------------------------------------------------------

DEPOSIT_MONTHS = 2.0          # 押金月数
OPEX_BUFFER_MONTHS = 3.0      # 运营现金缓冲月数
BANDWIDTH_COST_CNY = 0        # 悍铭报价已含 100M 独享带宽，故不重复计
PAYMENT_FEE_RATE = 0.039      # Creem 记录商户费率
PAYMENT_FEE_FIXED_USD = 0.40  # 每笔固定费，按客户充值笔数而非 API 调用笔数
AVG_TOPUP_USD = 20.0          # 假设：客户平均单次充值额，用于摊算固定手续费
MISC_OPEX_CNY = 8_000         # 假设：监控/域名/对象存储/冗余上游等杂项


@dataclass(frozen=True)
class RequestProfile:
    """一类业务流量的画像。"""

    name: str
    input_tokens: float
    output_tokens: float
    cache_hit: float = CACHE_HIT_RATE

    @property
    def avg_context(self) -> float:
        """解码期间的平均上下文长度：输入全长 + 已生成的一半。"""
        return self.input_tokens + self.output_tokens / 2


# 四类画像。base 取「智能体/编码」与「对话」之间的中间形态。
PROFILES = {
    "chat": RequestProfile("对话 2K/500", 2_000, 500),
    "base": RequestProfile("基准 8K/800", 8_000, 800),
    "agent": RequestProfile("智能体 32K/1500", 32_000, 1_500),
    "longdoc": RequestProfile("长文档 128K/2000", 128_000, 2_000),
}


@dataclass(frozen=True)
class Economics:
    """一台八卡 B300 节点的经济参数。"""

    rent_cny: float = RENT_BASE
    usd_cny: float = USD_CNY
    price_out: float = PRICE_OUT_USD_PER_M
    price_in: float = PRICE_IN_USD_PER_M
    price_cached: float = PRICE_CACHED_IN_USD_PER_M
    misc_opex_cny: float = MISC_OPEX_CNY
    payment_fee_rate: float = PAYMENT_FEE_RATE


# ---------------------------------------------------------------------------
# 三、产能层
# ---------------------------------------------------------------------------

def decode_rate(context_tokens: float) -> float:
    """聚合解码吞吐（tok/s），按实测点做 log-log 分段插值。

    取 log-log（即分段幂律）而非 log-线性，有两个理由：
      1. 物理上更贴切。上下文越长，解码越被 KV 读取主导，吞吐趋近与上下文成反比，
         这正是幂律形态；log-线性外推会在 1M 上下文处给出负值。
      2. 更保守。在标定点之间，幂律给出的吞吐低于线性插值（基准画像处
         1049 vs 1242 tok/s），宁可低估产能也不高估。

    低于最短标定点时钳制为该点值，不外推出比实测更高的吞吐。
    """
    pts = THROUGHPUT_POINTS
    x = math.log(max(context_tokens, 1.0))
    xs = [math.log(c) for c, _ in pts]
    ys = [math.log(t) for _, t in pts]

    if x <= xs[0]:
        return math.exp(ys[0])
    for i in range(len(pts) - 1):
        if x <= xs[i + 1]:
            w = (x - xs[i]) / (xs[i + 1] - xs[i])
            return math.exp(ys[i] + w * (ys[i + 1] - ys[i]))
    # 超出最长标定点：沿用最后一段的幂律指数外推，恒为正
    slope = (ys[-1] - ys[-2]) / (xs[-1] - xs[-2])
    return math.exp(ys[-1] + slope * (x - xs[-1]))


def bandwidth_ceiling_tokens_per_sec(batch: int) -> float:
    """访存受限的理论解码上界。

    每个解码步至少要把全部 MoE 权重读一遍（大 batch 下几乎所有专家都会被命中），
    因此 步/秒 = 聚合带宽 / 权重体积，再乘以 batch 得到聚合 token/s。
    这是物理上界，任何实测或建模值都不得超过它。
    """
    aggregate_bw_tb_per_s = B300_HBM_BANDWIDTH_TBS * GPUS_PER_NODE
    steps_per_sec = aggregate_bw_tb_per_s / K3_WEIGHTS_TB_TOTAL
    return steps_per_sec * batch


def node_capacity(profile: RequestProfile) -> dict:
    """一台节点在给定流量画像下的满载产能。

    节点的每一秒被预填与解码瓜分：
        1 秒 = R x (未命中输入 / 预填速率 + 输出 / 聚合解码速率)
    解出 R 即每秒可完成的请求数。
    """
    d_rate = decode_rate(profile.avg_context)
    uncached_in = profile.input_tokens * (1.0 - profile.cache_hit)

    prefill_s = uncached_in / PREFILL_TOKENS_PER_SEC
    decode_s = profile.output_tokens / d_rate
    per_request_s = prefill_s + decode_s

    req_per_sec = 1.0 / per_request_s
    return {
        "profile": profile.name,
        "avg_context": profile.avg_context,
        "decode_rate_tok_s": d_rate,
        "prefill_s_per_req": prefill_s,
        "decode_s_per_req": decode_s,
        "req_per_sec": req_per_sec,
        "req_per_month": req_per_sec * SECONDS_PER_MONTH,
        "out_tokens_per_month": req_per_sec * SECONDS_PER_MONTH * profile.output_tokens,
        "in_tokens_per_month": req_per_sec * SECONDS_PER_MONTH * profile.input_tokens,
        "decode_time_share": decode_s / per_request_s,
    }


# ---------------------------------------------------------------------------
# 四、收入与成本
# ---------------------------------------------------------------------------

def revenue_per_request_usd(profile: RequestProfile, econ: Economics) -> float:
    uncached = profile.input_tokens * (1.0 - profile.cache_hit)
    cached = profile.input_tokens * profile.cache_hit
    return (
        uncached / 1e6 * econ.price_in
        + cached / 1e6 * econ.price_cached
        + profile.output_tokens / 1e6 * econ.price_out
    )


def node_month(profile: RequestProfile, econ: Economics, utilization: float) -> dict:
    """一台节点一个月的损益。utilization 为时间预算的占用率。"""
    cap = node_capacity(profile)
    rev_per_req = revenue_per_request_usd(profile, econ)

    requests = cap["req_per_month"] * utilization
    gross_usd = requests * rev_per_req
    gross_cny = gross_usd * econ.usd_cny

    # 支付手续费：比例费按流水计，固定费按充值笔数摊算
    topups = gross_usd / AVG_TOPUP_USD if AVG_TOPUP_USD > 0 else 0.0
    fee_usd = gross_usd * econ.payment_fee_rate + topups * PAYMENT_FEE_FIXED_USD
    fee_cny = fee_usd * econ.usd_cny

    cost_cny = econ.rent_cny + econ.misc_opex_cny + fee_cny
    return {
        "utilization": utilization,
        "requests": requests,
        "revenue_usd": gross_usd,
        "revenue_cny": gross_cny,
        "payment_fee_cny": fee_cny,
        "rent_cny": econ.rent_cny,
        "misc_opex_cny": econ.misc_opex_cny,
        "total_cost_cny": cost_cny,
        "profit_cny": gross_cny - cost_cny,
        "out_tokens": cap["out_tokens_per_month"] * utilization,
        "in_tokens": cap["in_tokens_per_month"] * utilization,
    }


def breakeven_utilization(profile: RequestProfile, econ: Economics) -> float:
    """使月利润为零的时间占用率。手续费随收入线性变化，故可解析求解。"""
    cap = node_capacity(profile)
    rev_per_req = revenue_per_request_usd(profile, econ)
    gross_at_full_usd = cap["req_per_month"] * rev_per_req

    # 每 1 美元流水的净留存（扣比例费与摊算的固定费）
    fixed_fee_per_usd = (
        PAYMENT_FEE_FIXED_USD / AVG_TOPUP_USD if AVG_TOPUP_USD > 0 else 0.0
    )
    net_per_usd = 1.0 - econ.payment_fee_rate - fixed_fee_per_usd
    if net_per_usd <= 0:
        return float("inf")

    fixed_cost_cny = econ.rent_cny + econ.misc_opex_cny
    net_cny_at_full = gross_at_full_usd * net_per_usd * econ.usd_cny
    if net_cny_at_full <= 0:
        return float("inf")
    return fixed_cost_cny / net_cny_at_full


def unit_cost_vs_buy(profile: RequestProfile, econ: Economics, utilization: float) -> dict:
    """自建单位成本 vs 直接向上游采购的单位成本。

    这是本报告最具决策价值的一条：自建把可变成本变成固定成本，
    只有当产量足够大时，摊薄后的固定成本才低于按量采购。
    """
    cap = node_capacity(profile)
    requests = cap["req_per_month"] * utilization
    buy_cost_per_req = revenue_per_request_usd(profile, econ)  # 按 list 价采购

    fixed_cny = econ.rent_cny + econ.misc_opex_cny
    selfhost_cost_per_req = (
        fixed_cny / econ.usd_cny / requests if requests > 0 else float("inf")
    )
    return {
        "utilization": utilization,
        "requests_per_month": requests,
        "buy_usd_per_req": buy_cost_per_req,
        "selfhost_usd_per_req": selfhost_cost_per_req,
        "selfhost_cheaper": selfhost_cost_per_req < buy_cost_per_req,
        "saving_pct": (1 - selfhost_cost_per_req / buy_cost_per_req) * 100
        if buy_cost_per_req > 0
        else float("nan"),
    }


def crossover_volume(profile: RequestProfile, econ: Economics) -> dict:
    """自建与采购打平所需的月请求量与月输出 token 量。"""
    fixed_cny = econ.rent_cny + econ.misc_opex_cny
    buy_per_req = revenue_per_request_usd(profile, econ)
    reqs = fixed_cny / econ.usd_cny / buy_per_req
    cap = node_capacity(profile)
    return {
        "requests_per_month": reqs,
        "out_tokens_per_month": reqs * profile.output_tokens,
        "in_tokens_per_month": reqs * profile.input_tokens,
        "as_pct_of_one_node": reqs / cap["req_per_month"] * 100,
    }


# ---------------------------------------------------------------------------
# 五、月度滚动与复利
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DemandScenario:
    """需求爬坡。用「等效满载节点数」表达，1.0 = 恰好吃满一台节点。

    这是全模型唯一无法由外部事实标定的输入，取决于项目方自身的获客能力，
    因此必须以情景而非点估计呈现。
    """

    name: str
    month_to_first_node_full: float   # 需求爬到 1.0 台所需月数
    plateau_nodes: float              # 长期需求上限（等效节点数）
    growth_after_plateau: float = 0.0  # 达到上限后的月复合增速


SCENARIOS = {
    "pessimistic": DemandScenario("悲观", month_to_first_node_full=60.0, plateau_nodes=0.35),
    "neutral": DemandScenario("中性", month_to_first_node_full=24.0, plateau_nodes=1.0),
    "optimistic": DemandScenario("乐观", month_to_first_node_full=10.0, plateau_nodes=3.0,
                                 growth_after_plateau=0.02),
}


def demand_curve(sc: DemandScenario, months: int) -> np.ndarray:
    """等效满载节点数的月度序列。爬坡段按线性，到达上限后按上限（或继续小幅增长）。"""
    out = []
    for m in range(1, months + 1):
        linear = m / sc.month_to_first_node_full
        d = min(linear, sc.plateau_nodes)
        if d >= sc.plateau_nodes and sc.growth_after_plateau > 0:
            over = max(m - sc.month_to_first_node_full * sc.plateau_nodes, 0)
            d = sc.plateau_nodes * (1 + sc.growth_after_plateau) ** over
        out.append(d)
    return np.array(out)


def node_startup_capital(econ: Economics) -> float:
    """开一台节点所需占用的营运资金：押金 + 运营现金缓冲。

    不含「首月租金」——租金已在损益表中逐月计提，若再计入占用资金会重复计算。
    押金与缓冲在正常退出时可收回，故计为占用资金而非费用。
    """
    return econ.rent_cny * (DEPOSIT_MONTHS + OPEX_BUFFER_MONTHS)


def roll(
    profile: RequestProfile,
    econ: Economics,
    sc: DemandScenario,
    months: int = 36,
    price_erosion_annual: float = 0.0,
    hazard_monthly: float = 0.0,
) -> pd.DataFrame:
    """按月滚动，利润再投资开新节点（复利）。

    再投资需同时满足两个条件，缺一不可：
      1. 现金足以覆盖新节点的启动资金；
      2. 需求侧确实吃得下新增产能（否则新节点只会白付租金）。
    """
    startup = node_startup_capital(econ)
    cash = startup                 # 初始投入 = 一台节点的启动资金
    initial_capital = startup
    nodes = 1
    demand = demand_curve(sc, months)
    rows = []
    survival = 1.0

    for m in range(1, months + 1):
        # 价格侵蚀按月折算
        erosion = (1 - price_erosion_annual) ** (m / 12.0)
        e = replace(
            econ,
            price_out=econ.price_out * erosion,
            price_in=econ.price_in * erosion,
            price_cached=econ.price_cached * erosion,
        )

        # 本月实际利用率 = 需求 / 产能，上限 100%
        util = min(demand[m - 1] / nodes, 1.0)
        per_node = node_month(profile, e, util)

        revenue = per_node["revenue_cny"] * nodes
        cost = per_node["total_cost_cny"] * nodes
        profit = revenue - cost

        cash += profit
        survival *= (1 - hazard_monthly)

        # 再投资判定
        added = 0
        while (
            cash >= startup
            and demand[m - 1] > nodes * 0.9      # 需求已逼近现有产能
            and nodes < 50
        ):
            cash -= startup
            nodes += 1
            added += 1

        rows.append(
            {
                "month": m,
                "nodes": nodes - added,          # 本月实际在运节点数
                "nodes_after_reinvest": nodes,
                "demand_equiv_nodes": demand[m - 1],
                "utilization": util,
                "revenue_cny": revenue,
                "rent_cny": per_node["rent_cny"] * (nodes - added),
                "cost_cny": cost,
                "profit_cny": profit,
                "cash_cny": cash,
                "equity_cny": cash + (nodes - 1) * startup,  # 现金 + 已沉淀的节点启动资金
                "survival_prob": survival,
                "expected_profit_cny": profit * survival,
                "price_index": erosion,
            }
        )

    df = pd.DataFrame(rows)
    df.attrs["initial_capital"] = initial_capital
    df.attrs["startup_per_node"] = startup
    return df


def solvency(df: pd.DataFrame) -> dict:
    """现金是否够撑到转正，不够的话还要再补多少。

    这是比 IRR 更先要回答的问题：一个 IRR 为正但中途现金断流的方案，
    在现实中根本活不到赚钱那一天。
    """
    min_cash = float(df["cash_cny"].min())
    first_negative = df.loc[df["cash_cny"] < 0, "month"]
    return {
        "min_cash_cny": min_cash,
        "insolvent": bool(min_cash < 0),
        "insolvent_month": int(first_negative.iloc[0]) if len(first_negative) else None,
        "additional_capital_required_cny": max(-min_cash, 0.0),
    }


def irr_monthly(cashflows: list[float]) -> float:
    """月度 IRR，二分法求 NPV 为零的贴现率。cashflows[0] 为期初投入（负）。"""
    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** i for i, cf in enumerate(cashflows))

    if npv(0.0) <= 0:
        return float("nan")  # 名义上就没回本，IRR 无意义
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


def summarize_roll(df: pd.DataFrame) -> dict:
    """把逐月表压成投资指标。"""
    c0 = df.attrs["initial_capital"]
    flows = [-c0] + df["profit_cny"].tolist()
    m_irr = irr_monthly(flows)

    cum = df["profit_cny"].cumsum()
    payback = next((int(m) for m, v in zip(df["month"], cum) if v >= c0), None)

    total_profit = df["profit_cny"].sum()
    months = len(df)
    end_equity = df["equity_cny"].iloc[-1]

    # 占用资金按各月在运节点的启动资金计
    capital_employed = df["nodes"] * df.attrs["startup_per_node"]
    monthly_roic = (df["profit_cny"] / capital_employed).replace(
        [np.inf, -np.inf], np.nan
    )

    return {
        **solvency(df),
        "initial_capital_cny": c0,
        "months": months,
        "total_profit_cny": total_profit,
        "end_cash_cny": df["cash_cny"].iloc[-1],
        "end_equity_cny": end_equity,
        "end_nodes": int(df["nodes"].iloc[-1]),
        "moic": end_equity / c0 if c0 else float("nan"),
        "irr_monthly": m_irr,
        "irr_annual": (1 + m_irr) ** 12 - 1 if m_irr == m_irr else float("nan"),
        "cagr_on_equity": (end_equity / c0) ** (12 / months) - 1 if c0 > 0 else float("nan"),
        "payback_month": payback,
        "mean_monthly_roic": float(monthly_roic.mean()),
        "capital_turns_per_year": float(
            (df["revenue_cny"].sum() / months * 12) / capital_employed.mean()
        )
        if capital_employed.mean() > 0
        else float("nan"),
        "expected_total_profit_cny": df["expected_profit_cny"].sum(),
    }


# ---------------------------------------------------------------------------
# 六、自检
# ---------------------------------------------------------------------------

def selftest() -> None:
    print("自检开始")
    failures: list[str] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}{('  ' + detail) if detail else ''}")
        if not ok:
            failures.append(name)

    # 1. 显存：权重必须装得下，否则整个方案不成立
    usable_tb = B300_USABLE_HBM_GIB * GPUS_PER_NODE * (1024**3) / 1e12
    check(
        "K3 权重装得进八卡可用显存",
        K3_WEIGHTS_TB_TOTAL < usable_tb,
        f"权重 {K3_WEIGHTS_TB_TOTAL:.2f}TB < 可用 {usable_tb:.2f}TB",
    )
    check(
        "单卡权重与总量自洽",
        abs(K3_WEIGHTS_GB_PER_GPU * GPUS_PER_NODE / 1000 - K3_WEIGHTS_TB_TOTAL) < 0.02,
        f"{K3_WEIGHTS_GB_PER_GPU}x8 = {K3_WEIGHTS_GB_PER_GPU * 8 / 1000:.3f}TB",
    )

    # 2. 物理上界：实测吞吐不得超过访存上界
    ceiling_64 = bandwidth_ceiling_tokens_per_sec(64)
    measured = THROUGHPUT_POINTS[0][1]
    check(
        "实测吞吐未突破访存物理上界",
        measured < ceiling_64,
        f"实测 {measured:.0f} = 上界 {ceiling_64:.0f} 的 {measured / ceiling_64 * 100:.0f}%",
    )

    # 3. 预填速率的算力自洽性（MoE 预填 MFU 应远低于 100%）
    prefill_pflops = PREFILL_TOKENS_PER_SEC * 2 * K3_ACTIVE_PARAMS / 1e15
    node_peak = B300_NVFP4_DENSE_PFLOPS * GPUS_PER_NODE
    mfu = prefill_pflops / node_peak
    check(
        "预填速率对应的算力利用率在合理区间",
        0 < mfu < 1.0,
        f"MFU {mfu * 100:.1f}%（{prefill_pflops:.2f}/{node_peak:.0f} PFLOPS）",
    )

    # 4. 插值函数：标定点必须精确复现，且随上下文单调不增
    for ctx, tok in THROUGHPUT_POINTS:
        check(
            f"插值在标定点 {ctx} 复现实测值",
            abs(decode_rate(ctx) - tok) < 1e-6,
            f"{decode_rate(ctx):.1f} vs {tok}",
        )
    grid = [1e3, 4e3, 16e3, 64e3, 128e3, 256e3, 512e3]
    mono = all(decode_rate(a) >= decode_rate(b) for a, b in zip(grid, grid[1:]))
    check("吞吐随上下文长度单调不增", mono)
    check("超长上下文外推为正", decode_rate(1_048_576) > 0,
          f"1M ctx -> {decode_rate(1_048_576):.1f} tok/s")

    # 5. 量纲：产能反推出的输出 token 不得超过纯解码上界
    cap = node_capacity(PROFILES["base"])
    pure_decode_max = cap["decode_rate_tok_s"] * SECONDS_PER_MONTH
    check(
        "月输出 token 不超过纯解码上界",
        cap["out_tokens_per_month"] <= pure_decode_max,
        f"{cap['out_tokens_per_month']:.3e} <= {pure_decode_max:.3e}",
    )

    # 6. 盈亏平衡与利润的一致性：在平衡点上利润应为零
    econ = Economics()
    be = breakeven_utilization(PROFILES["base"], econ)
    at_be = node_month(PROFILES["base"], econ, be)
    check(
        "盈亏平衡点处利润为零",
        abs(at_be["profit_cny"]) < 1.0,
        f"利用率 {be * 100:.1f}% 时利润 {at_be['profit_cny']:.4f} 元",
    )

    # 7. 单调性：利润必须随租金下降而上升
    cheap = replace(econ, rent_cny=150_000)
    check(
        "租金越低利润越高",
        node_month(PROFILES["base"], cheap, 0.5)["profit_cny"]
        > node_month(PROFILES["base"], econ, 0.5)["profit_cny"],
    )

    # 8. crossover 与盈亏平衡的差异应恰好等于支付手续费楔子，不多不少。
    #    crossover 比的是「固定成本 vs 采购流水」，盈亏平衡还要多扣一道手续费，
    #    因此 平衡点 = crossover / (1 - 费率)。这条把两个口径锁死。
    xo = crossover_volume(PROFILES["base"], econ)
    net_per_usd = 1 - econ.payment_fee_rate - PAYMENT_FEE_FIXED_USD / AVG_TOPUP_USD
    expected_be = xo["as_pct_of_one_node"] / 100 / net_per_usd
    check(
        "crossover 与盈亏平衡之差恰为手续费楔子",
        abs(expected_be - be) < 1e-9,
        f"crossover {xo['as_pct_of_one_node']:.2f}% / {net_per_usd:.3f} "
        f"= {expected_be * 100:.2f}% vs 平衡点 {be * 100:.2f}%",
    )

    # 9. 偿付能力：给定租金下悲观情景必然烧钱，模型必须能识别出来而不是粉饰
    df_pess = roll(PROFILES["base"], econ, SCENARIOS["pessimistic"], months=36)
    sol = solvency(df_pess)
    check(
        "悲观情景能被识别为现金断流",
        sol["insolvent"],
        f"第 {sol['insolvent_month']} 个月现金转负，需追加 "
        f"¥{sol['additional_capital_required_cny']:,.0f}",
    )

    # 10. 幂律插值在标定点之间应低于线性插值（保守性检查）
    ctx = PROFILES["base"].avg_context
    x0, y0 = THROUGHPUT_POINTS[0]
    x1, y1 = THROUGHPUT_POINTS[1]
    w = (math.log(ctx) - math.log(x0)) / (math.log(x1) - math.log(x0))
    linear_in_log = y0 + w * (y1 - y0)
    check(
        "幂律插值比线性插值保守",
        decode_rate(ctx) < linear_in_log,
        f"{decode_rate(ctx):.0f} < {linear_in_log:.0f} tok/s",
    )

    # 11. IRR：对已知答案的现金流应当算对
    #    -100 起投，随后 12 期每期 +10，月 IRR 应落在 2%-4%
    test_irr = irr_monthly([-100.0] + [10.0] * 12)
    check("IRR 求解器对照检验", 0.02 < test_irr < 0.04, f"月 IRR {test_irr * 100:.2f}%")
    check("无法回本时 IRR 返回 NaN", math.isnan(irr_monthly([-100.0] + [1.0] * 12)))

    print(f"\n自检结束：{'全部通过' if not failures else f'{len(failures)} 项失败'}")
    if failures:
        sys.exit(1)


# ---------------------------------------------------------------------------
# 七、产出
# ---------------------------------------------------------------------------

def write_outputs() -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    econ = Economics()
    facts: dict = {}

    # (1) 产能表：四类画像
    cap_rows = [node_capacity(p) for p in PROFILES.values()]
    cap_df = pd.DataFrame(cap_rows)
    cap_df["revenue_usd_per_req"] = [
        revenue_per_request_usd(p, econ) for p in PROFILES.values()
    ]
    cap_df["full_load_revenue_cny_month"] = (
        cap_df["req_per_month"] * cap_df["revenue_usd_per_req"] * econ.usd_cny
    )
    cap_df["breakeven_util"] = [
        breakeven_utilization(p, econ) for p in PROFILES.values()
    ]
    cap_df.to_csv(OUT / "01_capacity_by_profile.csv", index=False, encoding="utf-8-sig")

    base_cap = node_capacity(PROFILES["base"])
    facts["base_decode_rate"] = base_cap["decode_rate_tok_s"]
    facts["base_req_per_month"] = base_cap["req_per_month"]
    facts["base_out_tokens_per_month"] = base_cap["out_tokens_per_month"]
    facts["base_full_revenue_cny"] = float(
        cap_df.loc[cap_df["profile"] == PROFILES["base"].name,
                   "full_load_revenue_cny_month"].iloc[0]
    )
    facts["base_breakeven_util"] = breakeven_utilization(PROFILES["base"], econ)
    facts["decode_time_share_base"] = base_cap["decode_time_share"]

    # (2) 租金五档 x 四画像的盈亏平衡利用率
    rows = []
    for label, rent in RENT_OBSERVED.items():
        e = replace(econ, rent_cny=rent)
        row = {"租金档位": label, "月租金(元)": rent}
        for key, p in PROFILES.items():
            row[p.name] = breakeven_utilization(p, e)
        rows.append(row)
    rent_df = pd.DataFrame(rows)
    rent_df.to_csv(OUT / "02_breakeven_by_rent.csv", index=False, encoding="utf-8-sig")
    facts["breakeven_at_350k"] = float(
        rent_df.loc[rent_df["月租金(元)"] == 350_000, PROFILES["base"].name].iloc[0]
    )
    facts["breakeven_at_150k"] = float(
        rent_df.loc[rent_df["月租金(元)"] == 150_000, PROFILES["base"].name].iloc[0]
    )
    facts["breakeven_at_108k"] = float(
        rent_df.loc[rent_df["月租金(元)"] == 108_000, PROFILES["base"].name].iloc[0]
    )
    facts["breakeven_at_190k"] = float(
        rent_df.loc[rent_df["月租金(元)"] == 190_000, PROFILES["base"].name].iloc[0]
    )

    # (3) 利用率 x 租金的月利润矩阵
    utils = np.arange(0.1, 1.01, 0.05)
    grid = []
    for label, rent in RENT_OBSERVED.items():
        e = replace(econ, rent_cny=rent)
        for u in utils:
            r = node_month(PROFILES["base"], e, float(u))
            grid.append(
                {
                    "租金档位": label,
                    "月租金(元)": rent,
                    "利用率": round(float(u), 3),
                    "月收入(元)": r["revenue_cny"],
                    "月利润(元)": r["profit_cny"],
                }
            )
    grid_df = pd.DataFrame(grid)
    grid_df.to_csv(OUT / "03_profit_grid.csv", index=False, encoding="utf-8-sig")

    # (4) 自建 vs 采购
    xo_rows = []
    for key, p in PROFILES.items():
        xo = crossover_volume(p, econ)
        xo["profile"] = p.name
        xo_rows.append(xo)
    xo_df = pd.DataFrame(xo_rows)
    xo_df.to_csv(OUT / "04_crossover.csv", index=False, encoding="utf-8-sig")
    base_xo = crossover_volume(PROFILES["base"], econ)
    facts["crossover_requests_month"] = base_xo["requests_per_month"]
    facts["crossover_out_tokens_month"] = base_xo["out_tokens_per_month"]

    uc_rows = [
        unit_cost_vs_buy(PROFILES["base"], econ, float(u))
        for u in [0.2, 0.4, 0.6, 0.8, 1.0]
    ]
    uc_df = pd.DataFrame(uc_rows)
    uc_df.to_csv(OUT / "05_unit_cost.csv", index=False, encoding="utf-8-sig")
    facts["selfhost_saving_at_full"] = uc_rows[-1]["saving_pct"]

    # (5) 三情景 x 租金两档的滚动复利
    roll_summaries = []
    for sk, sc in SCENARIOS.items():
        for rent_label, rent in [("给定 35万", 350_000), ("长单 15万", 150_000)]:
            e = replace(econ, rent_cny=rent)
            df = roll(PROFILES["base"], e, sc, months=36,
                      price_erosion_annual=0.20, hazard_monthly=0.015)
            df.to_csv(
                OUT / f"06_roll_{sk}_{rent}.csv", index=False, encoding="utf-8-sig"
            )
            s = summarize_roll(df)
            s["scenario"] = sc.name
            s["rent"] = rent_label
            roll_summaries.append(s)
    roll_df = pd.DataFrame(roll_summaries)
    roll_df.to_csv(OUT / "07_roll_summary.csv", index=False, encoding="utf-8-sig")

    # (6) 断供危险率的生存分析
    surv_rows = []
    for h in [0.005, 0.015, 0.03]:
        for sk, sc in SCENARIOS.items():
            e = replace(econ, rent_cny=RENT_BASE)
            df = roll(PROFILES["base"], e, sc, months=36,
                      price_erosion_annual=0.20, hazard_monthly=h)
            surv_rows.append(
                {
                    "hazard_monthly": h,
                    "expected_life_months": (1 / h) if h > 0 else float("inf"),
                    "survive_36m": (1 - h) ** 36,
                    "scenario": sc.name,
                    "nominal_profit_36m": df["profit_cny"].sum(),
                    "expected_profit_36m": df["expected_profit_cny"].sum(),
                }
            )
    surv_df = pd.DataFrame(surv_rows)
    surv_df.to_csv(OUT / "08_survival.csv", index=False, encoding="utf-8-sig")

    # (7) 关键事实快照，供报告正文直接引用
    facts["usd_cny"] = econ.usd_cny
    facts["startup_capital_350k"] = node_startup_capital(econ)
    facts["startup_capital_150k"] = node_startup_capital(replace(econ, rent_cny=150_000))
    facts["usable_hbm_tb"] = B300_USABLE_HBM_GIB * GPUS_PER_NODE * (1024**3) / 1e12
    facts["bandwidth_ceiling_c64"] = bandwidth_ceiling_tokens_per_sec(64)
    facts["measured_vs_ceiling_pct"] = (
        THROUGHPUT_POINTS[0][1] / bandwidth_ceiling_tokens_per_sec(64) * 100
    )
    facts["prefill_mfu_pct"] = (
        PREFILL_TOKENS_PER_SEC * 2 * K3_ACTIVE_PARAMS / 1e15
        / (B300_NVFP4_DENSE_PFLOPS * GPUS_PER_NODE) * 100
    )
    facts["rent_vs_spot_median"] = RENT_BASE / 190_000
    facts["rent_vs_3y_contract"] = RENT_BASE / 108_000

    with open(OUT / "facts.json", "w", encoding="utf-8") as f:
        json.dump(facts, f, ensure_ascii=False, indent=2, default=float)

    return facts


def write_charts() -> None:
    """图表一律用英文标签：Windows 环境缺中文字体时会渲染成方块，
    与其冒险，不如把解读留在报告正文里。"""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"figure.dpi": 130, "font.size": 9, "axes.grid": True,
                         "grid.alpha": 0.3, "axes.spines.top": False,
                         "axes.spines.right": False})
    econ = Economics()

    # 图 1：吞吐随上下文长度的衰减，含三个实测标定点
    fig, ax = plt.subplots(figsize=(6.5, 4))
    xs = np.logspace(math.log10(1500), math.log10(1_048_576), 200)
    ax.plot(xs, [decode_rate(x) for x in xs], lw=2, label="Model (piecewise power law)")
    ax.scatter([c for c, _ in THROUGHPUT_POINTS], [t for _, t in THROUGHPUT_POINTS],
               zorder=5, s=55, color="crimson", label="Measured (3rd-party)")
    for c, t in THROUGHPUT_POINTS:
        ax.annotate(f"{t:.0f}", (c, t), textcoords="offset points", xytext=(6, 6),
                    color="crimson")
    for p in PROFILES.values():
        ax.axvline(p.avg_context, ls=":", lw=0.8, color="gray")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Average context length (tokens)")
    ax.set_ylabel("Aggregate decode throughput (tok/s)")
    ax.set_title("Kimi K3 on 8x B300: throughput collapses with context length")
    ax.legend()
    fig.tight_layout()
    fig.savefig(OUT / "fig1_throughput_vs_context.png")
    plt.close(fig)

    # 图 2：盈亏平衡利用率（本报告最重要的一张图）
    rent_df = pd.read_csv(OUT / "02_breakeven_by_rent.csv")
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    labels_en = {
        "对话 2K/500": "Chat 2K/500",
        "基准 8K/800": "Base 8K/800",
        "智能体 32K/1500": "Agent 32K/1.5K",
        "长文档 128K/2000": "Long-doc 128K/2K",
    }
    rents = rent_df["月租金(元)"].tolist()
    x = np.arange(len(rents))
    width = 0.2
    for i, (cn, en) in enumerate(labels_en.items()):
        ax.bar(x + (i - 1.5) * width, rent_df[cn] * 100, width, label=en)
    ax.axhline(100, color="crimson", lw=1.6, ls="--")
    ax.set_ylim(0, 145)
    ax.text(-0.45, 134, "100% = node saturated 24/7. Bars above the red line "
            "cannot break even at any demand level.",
            ha="left", va="top", color="crimson", fontsize=8)
    ax.set_xticks(x)
    ax.set_xticklabels([f"CNY {r/1000:.0f}k" for r in rents])
    ax.set_xlabel("Monthly rent per 8-GPU node")
    ax.set_ylabel("Break-even utilisation (%)")
    ax.set_title("Break-even utilisation by rent and traffic profile")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig2_breakeven_by_rent.png")
    plt.close(fig)

    # 图 3：月利润随利用率变化，五档租金
    grid = pd.read_csv(OUT / "03_profit_grid.csv")
    fig, ax = plt.subplots(figsize=(6.8, 4.2))
    for label, sub in grid.groupby("租金档位", sort=False):
        rent = sub["月租金(元)"].iloc[0]
        ax.plot(sub["利用率"] * 100, sub["月利润(元)"] / 10000, lw=1.8,
                label=f"CNY {rent/1000:.0f}k/mo")
    ax.axhline(0, color="black", lw=1)
    ax.set_xlabel("Utilisation (% of node time budget)")
    ax.set_ylabel("Monthly profit (CNY 10k)")
    ax.set_title("Monthly profit per node, base profile (8K in / 800 out)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig3_profit_vs_utilisation.png")
    plt.close(fig)

    # 图 4：自建单位成本 vs 直接采购
    fig, ax = plt.subplots(figsize=(6.5, 4))
    us = np.linspace(0.15, 1.0, 60)
    for rent, style in [(350_000, "-"), (190_000, "--"), (108_000, ":")]:
        e = replace(econ, rent_cny=rent)
        costs = [unit_cost_vs_buy(PROFILES["base"], e, float(u))["selfhost_usd_per_req"]
                 for u in us]
        ax.plot(us * 100, costs, style, lw=1.8, label=f"Self-host @ CNY {rent/1000:.0f}k/mo")
    buy = revenue_per_request_usd(PROFILES["base"], econ)
    ax.axhline(buy, color="crimson", lw=1.8, label=f"Buy wholesale (${buy:.4f}/req)")
    ax.set_ylim(0, buy * 3)
    ax.set_xlabel("Utilisation (%)")
    ax.set_ylabel("Cost per request (USD)")
    ax.set_title("Self-hosting only beats buying above the crossover utilisation")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(OUT / "fig4_unit_cost.png")
    plt.close(fig)

    # 图 5：36 个月现金曲线
    fig, ax = plt.subplots(figsize=(7, 4.2))
    for sk, sc in SCENARIOS.items():
        for rent, style in [(350_000, "-"), (150_000, "--")]:
            df = pd.read_csv(OUT / f"06_roll_{sk}_{rent}.csv")
            ax.plot(df["month"], df["cash_cny"] / 10000, style, lw=1.6,
                    label=f"{sk} @ CNY {rent/1000:.0f}k")
    ax.axhline(0, color="crimson", lw=1.2)
    ax.set_xlabel("Month")
    ax.set_ylabel("Cash balance (CNY 10k)")
    ax.set_title("Cash runway: below the red line the business is insolvent")
    ax.legend(fontsize=7, ncol=2)
    fig.tight_layout()
    fig.savefig(OUT / "fig5_cash_runway.png")
    plt.close(fig)

    print(f"  图表已写入 {OUT}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true", help="只运行自检")
    args = ap.parse_args()

    selftest()
    if args.selftest:
        return

    facts = write_outputs()
    write_charts()
    print("\n关键结果")
    print(f"  汇率                    1 USD = {facts['usd_cny']} CNY")
    print(f"  八卡可用显存            {facts['usable_hbm_tb']:.2f} TB（权重 {K3_WEIGHTS_TB_TOTAL} TB）")
    print(f"  基准画像解码吞吐        {facts['base_decode_rate']:.0f} tok/s")
    print(f"  满载月收入              ¥{facts['base_full_revenue_cny']:,.0f}")
    print(f"  月租 35 万盈亏平衡利用率 {facts['breakeven_at_350k'] * 100:.1f}%")
    print(f"  月租 19 万盈亏平衡利用率 {facts['breakeven_at_190k'] * 100:.1f}%")
    print(f"  月租 15 万盈亏平衡利用率 {facts['breakeven_at_150k'] * 100:.1f}%")
    print(f"  月租 10.8 万盈亏平衡利用率 {facts['breakeven_at_108k'] * 100:.1f}%")
    print(f"  自建追平采购所需月请求  {facts['crossover_requests_month']:,.0f} 次")
    print(f"  满载时自建相对采购节省  {facts['selfhost_saving_at_full']:.1f}%")
    print(f"\n产出目录：{OUT}")


if __name__ == "__main__":
    main()
