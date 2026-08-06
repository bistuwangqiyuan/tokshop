"""单节点产能层：一台 8 卡 B300 能给 Kimi K3 跑出多少 token。

方法论
------
1. 不外推。解码吞吐由三组第三方实测点标定，点间按 log-log（分段幂律）插值。
   选幂律而非线性有两个理由：物理上上下文越长解码越被 KV 读取主导，吞吐趋近与
   上下文成反比；以及在标定点之间幂律给出的值低于线性，宁可低估产能。

2. Roofline 只作护栏，不作预测。全权重读取口径给出的上界用于自检——若有人把
   参数改到突破物理上界，脚本直接报错。它不是产能预测值。

3. 时间预算是硬约束。节点的每一秒被预填与解码瓜分，不能把「输入侧收入」与
   「输出侧收入」简单相加，那等于把同一台机器的时间算两遍。

关于 MoE 专家覆盖率的一点说明
-----------------------------
K3 每 token 从 896 个专家里选 16 个。批大小为 B 时，批内触及的专家期望覆盖率
为 φ(B) = 1 - (1 - 16/896)^B。φ(10) 仅 16.5%，φ(64) 为 68.4%。这解释了一个乍看
矛盾的实测现象：c=10 时的 ITL（18.6ms）低于「把 1.57TB 权重完整读一遍」所需的
24.5ms —— 因为低并发下根本不需要读全部专家。

本模块只把 φ(B) 用于解释与自检，不用它去反推专家权重占比。理由是：由公开架构
参数（latent MoE 维 3584、每专家隐层 3072、896 专家）推算出的参数量与官方公布的
2.8T 总量 / 104B 激活量无法自洽，说明「Stable LatentMoE」的参数共享方式未完全
公开。既然推不出，就不推——不用一个对不上的中间量去支撑结论。
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import params as P

SECONDS_PER_MONTH = float(P.get("meta.seconds_per_month"))


# ---------------------------------------------------------------------------
# 解码吞吐：实测标定 + 分段幂律插值
# ---------------------------------------------------------------------------

def _points() -> list[tuple[float, float]]:
    return [(float(c), float(t)) for c, t in P.get("capacity.decode_points")]


def decode_rate(context_tokens: float) -> float:
    """聚合解码吞吐（tok/s），按实测点做 log-log 分段插值。

    低于最短标定点时钳制为该点值：不外推出比实测更高的吞吐。
    超出最长标定点时沿用末段幂律指数，恒为正（log-线性会在 1M 处给出负值）。
    """
    pts = _points()
    xs = [math.log(c) for c, _ in pts]
    ys = [math.log(t) for _, t in pts]
    x = math.log(max(context_tokens, 1.0))

    if x <= xs[0]:
        return math.exp(ys[0])
    for i in range(len(pts) - 1):
        if x <= xs[i + 1]:
            w = (x - xs[i]) / (xs[i + 1] - xs[i])
            return math.exp(ys[i] + w * (ys[i + 1] - ys[i]))
    slope = (ys[-1] - ys[-2]) / (xs[-1] - xs[-2])
    return math.exp(ys[-1] + slope * (x - xs[-1]))


def linear_interp_decode_rate(context_tokens: float) -> float:
    """同样标定点下的 log-线性插值，仅用于证明幂律更保守。"""
    pts = _points()
    xs = [math.log(c) for c, _ in pts]
    ys = [t for _, t in pts]
    x = math.log(max(context_tokens, 1.0))
    if x <= xs[0]:
        return ys[0]
    for i in range(len(pts) - 1):
        if x <= xs[i + 1]:
            w = (x - xs[i]) / (xs[i + 1] - xs[i])
            return ys[i] + w * (ys[i + 1] - ys[i])
    return ys[-1]


# ---------------------------------------------------------------------------
# 物理护栏
# ---------------------------------------------------------------------------

def expert_coverage(batch: int) -> float:
    """批大小 B 时批内触及专家的期望覆盖率 φ(B) = 1-(1-k/N)^B。k、N 均为官方值。"""
    k = float(P.get("model_k3.experts_per_token"))
    n = float(P.get("model_k3.num_experts"))
    return 1.0 - (1.0 - k / n) ** batch


def full_weight_read_ms() -> float:
    """把全部权重完整读一遍所需的时间（毫秒）。大批量下的每步时间下界。"""
    return P.get("model_k3.weights_tb_total") / P.aggregate_bandwidth_tb_s() * 1000.0


def bandwidth_ceiling_tokens_per_sec(batch: int) -> float:
    """全权重读取口径的解码吞吐上界。仅作自检护栏，非产能预测。"""
    steps_per_sec = P.aggregate_bandwidth_tb_s() / float(P.get("model_k3.weights_tb_total"))
    return steps_per_sec * batch


def prefill_mfu() -> float:
    """预填速率对应的算力利用率。MoE 长上下文预填 MFU 偏低是已知特征。"""
    tok_s = float(P.get("capacity.prefill_tokens_per_sec"))
    flops = tok_s * 2 * float(P.get("model_k3.active_params")) / 1e15
    return flops / P.node_peak_pflops()


def weights_fit() -> dict:
    """权重能否装进八卡可用显存。这是全项目的技术前提。"""
    usable = P.usable_hbm_tb_per_node()
    weights = float(P.get("model_k3.weights_tb_total"))
    return {
        "weights_tb": weights,
        "usable_tb": usable,
        "headroom_tb": usable - weights,
        "fits": weights < usable,
        "headroom_pct": (usable - weights) / usable * 100,
    }


def kv_bytes_per_token() -> float:
    """由实测 KV 池反解出的每 token KV 占用（字节）。"""
    gib = float(P.get("capacity.kv_gib_per_gpu"))
    tokens = float(P.get("capacity.kv_pool_tokens"))
    return gib * (1024 ** 3) / tokens


def max_concurrency_from_kv(context_tokens: float) -> float:
    """KV 池容量给出的并发上限。

    vLLM 在准入时按 max-model-len 全长预留 KV，因此把 max-model-len 从 1M 降到业务
    实际需要的长度，可以立刻放大并发——这是本模型给出的一条零成本运营建议。
    """
    return float(P.get("capacity.kv_pool_tokens")) / max(context_tokens, 1.0)


# ---------------------------------------------------------------------------
# 流量画像与时间预算
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RequestProfile:
    name: str
    input_tokens: float
    output_tokens: float
    cache_hit: float

    @property
    def avg_context(self) -> float:
        """解码期间的平均上下文：输入全长 + 已生成的一半。"""
        return self.input_tokens + self.output_tokens / 2


def default_profiles() -> dict[str, RequestProfile]:
    """四类画像。与前序报告 reports/b300-kimi-k3 同口径，便于两份报告横向对照。"""
    hit = float(P.get("pricing.cache_hit_rate"))
    return {
        "chat": RequestProfile("对话 2K/500", 2_000, 500, hit),
        "base": RequestProfile("基准 8K/800", 8_000, 800, hit),
        "agent": RequestProfile("智能体 32K/1500", 32_000, 1_500, hit),
        "longdoc": RequestProfile("长文档 128K/2000", 128_000, 2_000, hit),
    }


def node_capacity(profile: RequestProfile, prefill_rate: float | None = None) -> dict:
    """满载产能。

        1 秒 = R x (未命中输入 / 预填速率 + 输出 token / 聚合解码速率)

    解出 R 即每秒可完成的请求数。缓存命中的输入 token 不需要重新预填，这一点
    对长上下文画像影响极大——85% 命中率下 128K 输入只有 19.2K 需要真算。
    """
    pf = float(P.get("capacity.prefill_tokens_per_sec")) if prefill_rate is None else prefill_rate
    d_rate = decode_rate(profile.avg_context)
    uncached_in = profile.input_tokens * (1.0 - profile.cache_hit)

    prefill_s = uncached_in / pf
    decode_s = profile.output_tokens / d_rate
    per_request_s = prefill_s + decode_s
    req_per_sec = 1.0 / per_request_s

    return {
        "profile": profile.name,
        "input_tokens": profile.input_tokens,
        "output_tokens": profile.output_tokens,
        "cache_hit": profile.cache_hit,
        "avg_context": profile.avg_context,
        "decode_rate_tok_s": d_rate,
        "prefill_s_per_req": prefill_s,
        "decode_s_per_req": decode_s,
        "req_per_sec": req_per_sec,
        "req_per_month": req_per_sec * SECONDS_PER_MONTH,
        "out_tokens_per_month": req_per_sec * SECONDS_PER_MONTH * profile.output_tokens,
        "in_tokens_per_month": req_per_sec * SECONDS_PER_MONTH * profile.input_tokens,
        "decode_time_share": decode_s / per_request_s,
        "kv_max_concurrency": max_concurrency_from_kv(profile.avg_context),
    }


# ---------------------------------------------------------------------------
# 延迟与 SLO：选址的网络增量在这里进入模型
# ---------------------------------------------------------------------------

def ttft_with_network(base_ttft_ms: float, network_rtt_delta_ms: float) -> float:
    """把选址造成的网络往返增量叠加到实测 TTFT 上。

    这里只做加法，不构造「延迟 -> 流量份额」的弹性——那个映射没有公开数据
    （见 params.yaml 的 G-6）。因此本函数的产物只用于 SLO 阈值的通过与否判断。
    """
    return base_ttft_ms + network_rtt_delta_ms
