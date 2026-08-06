"""选址对比：候选国的八维矩阵、延迟、税负与结构选择。

一条贯穿全模块的原则
--------------------
凡是「查到了报价」的，标为 quote；凡是「用比例推出来的」，标为 estimate；凡是
「查不到」的，留空并指向 params.yaml 的 gaps 段。绝不用估计值冒充报价，也绝不
用留空处的空白暗示「没有问题」。
"""

from __future__ import annotations

import pandas as pd

import params as P
import rent_validation as RV

SGD_PER_USD = None  # 由 fx 推导，见 sgd_per_usd()


def sgd_per_usd() -> float:
    return float(P.get("fx.usd_sgd"))


# ---------------------------------------------------------------------------
# 延迟
# ---------------------------------------------------------------------------

def latency_to_market(country: str) -> dict:
    """到主要需求市场的往返延迟。

    需求侧是全球开发者（经 OpenRouter 与自建 API），不是中国用户，因此参照点
    取美西与法兰克福，而非到华南的延迟。东南亚各国国际出口普遍经新加坡，故
    延迟 = 新加坡基准 + 本地到新加坡的一跳。
    """
    base_us = P.get("siting.latency_rtt_ms_to_us_west")["SG"]
    base_eu = P.get("siting.latency_rtt_ms_to_frankfurt")["SG"]
    hops = P.get("siting.latency_hop_to_singapore_ms")

    key = {"MY": "MY_KL", "ID": "ID_Jakarta", "TH": "TH_Bangkok", "PH": "PH_Manila"}.get(country)
    hop = 0.0 if country == "SG" else hops.get(key)

    if hop is None:
        return {"country": country, "hop_ms": None, "rtt_us_west_ms": None,
                "rtt_frankfurt_ms": None, "data_status": "缺口 G-3"}
    return {
        "country": country,
        "hop_ms": float(hop),
        "rtt_us_west_ms": float(base_us) + float(hop),
        "rtt_frankfurt_ms": float(base_eu) + float(hop),
        "data_status": "quote" if country == "SG" else "derived",
    }


def ttft_slo_check(country: str, base_ttft_mean_ms: float = 731.7,
                   base_ttft_p90_ms: float = 1107.0,
                   slo_ms: float = 1000.0) -> dict:
    """选址的网络增量叠加到实测 TTFT 后，是否仍满足 1 秒 SLO。

    实测基准取 Openzeka 在 DGX-B300 上 vLLM 直出 c=64 的 TTFT 均值 731.7ms 与
    P90 1107ms；SLO 阈值 1000ms 取自该白皮书（Nielsen 的 1 秒「思维流」界限）。

    注意结论的方向：P90 在任何选址下都已超过 1 秒——这是模型本身的问题，不是
    选址造成的。选址只贡献 1.4%-3.2% 的增量。
    """
    lat = latency_to_market(country)
    if lat["hop_ms"] is None:
        return {"country": country, "status": "缺口 G-3，不参与延迟排名"}
    delta = lat["hop_ms"]
    return {
        "country": country,
        "network_delta_ms": delta,
        "ttft_mean_ms": base_ttft_mean_ms + delta,
        "ttft_p90_ms": base_ttft_p90_ms + delta,
        "mean_pass_slo": (base_ttft_mean_ms + delta) <= slo_ms,
        "p90_pass_slo": (base_ttft_p90_ms + delta) <= slo_ms,
        "mean_degradation_pct": delta / base_ttft_mean_ms * 100,
        "p90_degradation_pct": delta / base_ttft_p90_ms * 100,
    }


# ---------------------------------------------------------------------------
# 税
# ---------------------------------------------------------------------------

def singapore_tax_usd(profit_usd: float, year_index: int) -> float:
    """新加坡企业所得税，含新创减免与 YA2026 税额回扣。

    year_index 从 1 起。前 3 个评估年适用 SUTE，之后适用部分免税 PTE。
    回扣仅 YA2026 一次性，按 year_index==1 计入（保守：只享受一年）。
    """
    if profit_usd <= 0:
        return 0.0
    rate = float(P.get("siting.corporate_income_tax")["SG"])
    fx = sgd_per_usd()
    profit_sgd = profit_usd * fx

    if year_index <= int(P.get("siting.singapore_sute.years")):
        t1 = float(P.get("siting.singapore_sute.first_tranche_sgd"))
        e1 = float(P.get("siting.singapore_sute.first_exempt"))
        t2 = float(P.get("siting.singapore_sute.second_tranche_sgd"))
        e2 = float(P.get("siting.singapore_sute.second_exempt"))
    else:
        t1, e1, t2, e2 = 10_000.0, 0.75, 190_000.0, 0.50

    taxable = 0.0
    remain = profit_sgd
    take = min(remain, t1)
    taxable += take * (1 - e1)
    remain -= take
    take = min(max(remain, 0.0), t2)
    taxable += take * (1 - e2)
    remain -= take
    taxable += max(remain, 0.0)

    tax_sgd = taxable * rate
    if year_index == 1:
        rebate = min(tax_sgd * float(P.get("siting.singapore_cit_rebate_ya2026.rate")),
                     float(P.get("siting.singapore_cit_rebate_ya2026.cap_sgd")))
        tax_sgd = max(tax_sgd - rebate, 0.0)
    return tax_sgd / fx


def flat_tax_usd(profit_usd: float, country: str) -> float:
    if profit_usd <= 0:
        return 0.0
    return profit_usd * float(P.get("siting.corporate_income_tax")[country])


def annual_tax_usd(profit_usd: float, jurisdiction: str, year_index: int) -> float:
    if jurisdiction == "SG":
        return singapore_tax_usd(profit_usd, year_index)
    return flat_tax_usd(profit_usd, jurisdiction)


# ---------------------------------------------------------------------------
# 八维对比矩阵
# ---------------------------------------------------------------------------

def siting_matrix() -> pd.DataFrame:
    countries = P.raw()["countries"]
    vac = P.get("siting.vacancy_rate")
    vac_key = {"SG": "SG", "MY": "MY_Johor", "ID": "ID_Jakarta", "TH": "TH_Bangkok"}
    tariffs = P.get("siting.electricity_usd_kwh")
    cit = P.get("siting.corporate_income_tax")
    consumption = P.get("siting.export_service_consumption_tax")
    hc = P.raw()["host_country_controls"]
    lag = P.get("assumptions.provisioning_lag_months")

    b300_presence = {
        "TH": "Freyr AI，首家将 B300/GB300 集群投入实际运营的 NVIDIA 云伙伴",
        "MY": "Bit Origin 16 台，2026Q3 交付，已有托管安排与签约客户",
        "ID": "Freyr AI 列为战略优先市场，尚无已投运公开案例",
        "PH": "无公开案例",
        "SG": "多家新加坡供应商可询价（SuperX 等），价格最高",
    }

    rows = []
    for code, c in countries.items():
        if c.get("verdict") not in ("candidate", "benchmark"):
            continue
        lat = latency_to_market(code)
        slo = ttft_slo_check(code)
        t = tariffs.get(code)
        try:
            colo = RV.colo_usd_kw_month(code)
            colo_status = "quote" if code == "SG" else "estimate（G-1）"
        except KeyError:
            colo, colo_status = None, "缺口 G-1"

        rows.append({
            "code": code,
            "国家": c["name_cn"],
            "层二目的地": "通过" if not (set(c.get("groups") or []) & {"D:1", "D:4", "D:5"}) else "不通过",
            "层三东道国管制": hc[code]["instrument"] if code in hc else "未核实（G-4）",
            "B300可得性": b300_presence.get(code, ""),
            "托管_USD_kW_月": colo,
            "托管数据状态": colo_status,
            "电价_USD_kWh": (sum(t) / len(t) if isinstance(t, list) else t) if t is not None else None,
            "空置率": vac.get(vac_key.get(code)) if vac_key.get(code) else None,
            "到美西RTT_ms": lat["rtt_us_west_ms"],
            "TTFT均值_ms": slo.get("ttft_mean_ms"),
            "TTFT均值达标": slo.get("mean_pass_slo"),
            "TTFT_P90达标": slo.get("p90_pass_slo"),
            "企业所得税": cit.get(code),
            "出口服务消费税": consumption.get(code),
            "交付前置期_月": lag.get(code),
        })
    order = {"TH": 0, "MY": 1, "ID": 2, "PH": 3, "SG": 4}
    return pd.DataFrame(rows).sort_values("code", key=lambda s: s.map(order)).reset_index(drop=True)


def negotiating_power() -> pd.DataFrame:
    """空置率决定议价能力。这是本节最反直觉的一条。"""
    vac = P.get("siting.vacancy_rate")
    label = {"SG": "新加坡", "MY_Johor": "马来西亚 柔佛",
             "ID_Jakarta": "印尼 雅加达", "TH_Bangkok": "泰国 曼谷"}
    rows = [{"市场": label[k], "空置率": v,
             "市场性质": "买方市场" if v > 0.15 else ("卖方市场" if v < 0.05 else "均衡")}
            for k, v in vac.items()]
    return pd.DataFrame(rows).sort_values("空置率", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------------------
# 结构选择：注册地 x 算力地
# ---------------------------------------------------------------------------

def structure_comparison(annual_profit_usd: float = 300_000.0) -> pd.DataFrame:
    """注册地与算力地分离 vs 单一辖区。只比税负与合规，不比不可量化项。"""
    combos = [
        ("SG", "TH", "新加坡主体 + 泰国算力"),
        ("SG", "MY", "新加坡主体 + 马来西亚算力"),
        ("SG", "ID", "新加坡主体 + 印尼算力"),
        ("SG", "SG", "新加坡主体 + 新加坡算力（对照）"),
        ("MY", "MY", "马来西亚主体 + 马来西亚算力"),
        ("TH", "TH", "泰国主体 + 泰国算力"),
    ]
    rows = []
    for reg, comp, name in combos:
        y1 = annual_tax_usd(annual_profit_usd, reg, 1)
        y4 = annual_tax_usd(annual_profit_usd, reg, 4)
        rows.append({
            "结构": name,
            "注册地": reg,
            "算力地": comp,
            "首年税_USD": y1,
            "第4年税_USD": y4,
            "首年有效税率": y1 / annual_profit_usd,
            "第4年有效税率": y4 / annual_profit_usd,
            "常设机构风险": "取决于交易形态：买算力即服务为低，租裸金属为高"
            if reg != comp else "不适用（同一辖区）",
        })
    return pd.DataFrame(rows).sort_values("首年税_USD").reset_index(drop=True)
