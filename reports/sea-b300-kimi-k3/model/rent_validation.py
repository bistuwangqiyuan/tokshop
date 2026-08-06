"""租金交叉验证：¥150,000/月 这个价，在哪个市场是合理的？

三条互相独立的路径
------------------
路径 A 自下而上：反推出租方的成本结构（硬件摊销含融资 + 托管 + 电费 + 网络），
        看这个报价是否留得下毛利。若毛利为负，报价不可持续，签了也会被违约。

路径 B 自上而下的可比交易：Bit Origin（NASDAQ:BTOG）2026-06-29 公告在马来西亚
        部署 16 台 B300，公开披露预期月收入约 36 万美元。这是出租方向客户收取
        的租金总额，正是承租方视角的可比价。

路径 C 第三方挂牌价：美国 Qubrid 的 8 卡 B300 裸金属年费，以及前序报告登记的
        中国境内多源报价区间。

三条路径若指向同一区间，则报价可信；若只有一条支持，则须警惕。
"""

from __future__ import annotations

import pandas as pd

import params as P


def _lm(key: str):
    return P.get("assumptions.lessor_cost_model")[key]


def monthly_amortization_usd(hardware_usd: float) -> float:
    """硬件的等额本息月供。把融资成本计入，否则会低估出租方成本。"""
    n = float(_lm("amortization_months"))
    r = float(_lm("financing_rate_annual")) / 12.0
    if r <= 0:
        return hardware_usd / n
    return hardware_usd * r / (1.0 - (1.0 + r) ** (-n))


def lessor_cost_buildup(country: str, hardware_usd: float) -> dict:
    """出租方每台每月的成本。仅对有可引用电价的国家计算（新加坡、马来西亚）。"""
    tariffs = P.get("siting.electricity_usd_kwh")
    if country not in tariffs:
        raise KeyError(f"{country} 无可引用电价，见 params.yaml 的 G-2，不做成本反推")

    t = tariffs[country]
    tariff = float(sum(t) / len(t)) if isinstance(t, list) else float(t)

    colo_rate = colo_usd_kw_month(country)
    kw = float(_lm("contracted_kw"))
    load = float(_lm("avg_load_factor"))
    pue = float(_lm("pue"))
    hours = float(P.get("meta.hours_per_month"))

    amort = monthly_amortization_usd(hardware_usd)
    colo = colo_rate * kw
    energy_kwh = kw * load * hours * pue
    energy = energy_kwh * tariff
    network = float(_lm("network_usd_per_month"))

    total = amort + colo + energy + network
    return {
        "country": country,
        "hardware_usd": hardware_usd,
        "amortisation_usd": amort,
        "colo_usd": colo,
        "colo_rate_usd_kw_month": colo_rate,
        "energy_kwh": energy_kwh,
        "energy_usd": energy,
        "electricity_usd_kwh": tariff,
        "network_usd": network,
        "total_cost_usd": total,
    }


def colo_usd_kw_month(country: str) -> float:
    """各国 AI 级托管的每 kW 月价（估计值，非报价）。

    方法：绝对水平以 CBRE 的新加坡均价为锚（该来源口径明确、权威），相对比例取
    simpler.cloud 各国区间中值之比。之所以不直接用后者的绝对值，是因为它与 CBRE
    相差约 4 倍且口径不明——只借用它的相对关系，不借用它的水平。

    这是本模型中唯一一处「用比例推绝对值」的地方，已在 params.yaml 的 G-1 登记为
    数据缺口，须由 RFQ 实际报价替换。
    """
    sg_avg = float(P.get("siting.singapore_colo_usd_kw_month.avg")) \
        if isinstance(P.meta("siting.singapore_colo_usd_kw_month").get("avg"), (int, float)) \
        else float(P.meta("siting.singapore_colo_usd_kw_month")["avg"])
    ratios = P.get("siting.relative_colo_ratio")
    r = ratios.get(country)
    if r is None:
        raise KeyError(f"{country} 无托管价相对比例（见 G-1），不参与成本反推")
    return sg_avg * float(r)


def bit_origin_implied() -> dict:
    """由 Bit Origin 公告反解每台每月租金与硬件单价。"""
    bo = P.get("rent_validation.bit_origin")
    per_server_rev = bo["projected_monthly_revenue_usd"] / bo["servers"]
    per_server_capex = bo["capex_usd"] / bo["servers"]
    return {
        "servers": bo["servers"],
        "capex_usd_total": bo["capex_usd"],
        "capex_usd_per_server": per_server_capex,
        "monthly_revenue_usd_total": bo["projected_monthly_revenue_usd"],
        "rent_usd_per_server_month": per_server_rev,
        "rent_cny_per_server_month": per_server_rev * P.usd_cny(),
        "gross_yield_on_capex_annual": per_server_rev * 12 / per_server_capex,
        "months_to_recover_capex_gross": per_server_capex / per_server_rev,
    }


def compare_to_given() -> pd.DataFrame:
    """把本项目报价与各路参照并排。"""
    given_usd = P.rent_usd_per_month()
    given_cny = float(P.get("rent.given_cny_per_month"))
    hours = float(P.get("meta.hours_per_month"))
    gpus = float(P.get("rent.gpus_per_node"))

    rows = [{
        "参照": "本项目给定",
        "地区": "东南亚（待定）",
        "月租_USD": given_usd,
        "月租_CNY": given_cny,
        "USD_per_GPU_hour": given_usd / (gpus * hours),
        "src": "项目给定",
    }]

    bo = bit_origin_implied()
    rows.append({
        "参照": "Bit Origin 可比交易",
        "地区": "马来西亚",
        "月租_USD": bo["rent_usd_per_server_month"],
        "月租_CNY": bo["rent_cny_per_server_month"],
        "USD_per_GPU_hour": bo["rent_usd_per_server_month"] / (gpus * hours),
        "src": P.src("rent_validation.bit_origin"),
    })

    q_year = float(P.get("rent_validation.qubrid_bare_metal_usd_per_year"))
    rows.append({
        "参照": "Qubrid 挂牌裸金属",
        "地区": "美国",
        "月租_USD": q_year / 12,
        "月租_CNY": q_year / 12 * P.usd_cny(),
        "USD_per_GPU_hour": q_year / 12 / (gpus * hours),
        "src": P.src("rent_validation.qubrid_bare_metal_usd_per_year"),
    })

    for label, cny in P.get("rent_validation.china_domestic_observed_cny_per_month").items():
        rows.append({
            "参照": f"中国境内 {label}",
            "地区": "中国",
            "月租_USD": cny / P.usd_cny(),
            "月租_CNY": float(cny),
            "USD_per_GPU_hour": cny / P.usd_cny() / (gpus * hours),
            "src": P.src("rent_validation.china_domestic_observed_cny_per_month"),
        })

    df = pd.DataFrame(rows)
    df["相对本项目"] = df["月租_CNY"] / given_cny
    return df.sort_values("月租_CNY").reset_index(drop=True)


def validation_summary() -> dict:
    """三条路径的汇总判定。"""
    given_usd = P.rent_usd_per_month()
    bo = bit_origin_implied()
    hw_lo, hw_hi = P.get("rent_validation.hardware_cost_usd_per_node")

    buildups = {}
    for country in ("SG", "MY"):
        for label, hw in (("low", hw_lo), ("mid", (hw_lo + hw_hi) / 2), ("high", hw_hi)):
            buildups[f"{country}_{label}"] = lessor_cost_buildup(country, hw)

    my_mid = buildups["MY_mid"]["total_cost_usd"]
    sg_mid = buildups["SG_mid"]["total_cost_usd"]

    return {
        "given_rent_usd": given_usd,
        "given_rent_cny": float(P.get("rent.given_cny_per_month")),
        "given_usd_per_gpu_hour": P.rent_usd_per_gpu_hour(),
        "bit_origin_rent_usd": bo["rent_usd_per_server_month"],
        "bit_origin_delta_pct": (given_usd / bo["rent_usd_per_server_month"] - 1) * 100,
        "bit_origin_capex_per_server": bo["capex_usd_per_server"],
        "bit_origin_gross_yield_annual": bo["gross_yield_on_capex_annual"],
        "lessor_cost_my_mid": my_mid,
        "lessor_cost_sg_mid": sg_mid,
        "margin_vs_my_mid_pct": (given_usd / my_mid - 1) * 100,
        "margin_vs_sg_mid_pct": (given_usd / sg_mid - 1) * 100,
        "buildups": buildups,
        "verdict_my": "可持续" if given_usd > my_mid else "低于出租方成本，不可持续",
        "verdict_sg": "可持续" if given_usd > sg_mid else "低于出租方成本，不可持续",
    }


def conditional_buildup_table() -> pd.DataFrame:
    """泰国与印尼的出租方成本：条件推算，不是事实。

    这两国的工商电价没有可引用来源（G-2），因此这里显式假设「电价与马来西亚相同」，
    只让托管价的差异发挥作用。之所以还要算，是因为它回答了一个决策相关的问题：
    在哪些国家，¥150,000/月 这个价对出租方是可持续的。

    结论若为「可持续」，只在该电价假设成立时有效——报告中必须照此表述。
    """
    hw_lo, hw_hi = P.get("rent_validation.hardware_cost_usd_per_node")
    tariffs = P.get("siting.electricity_usd_kwh")
    my_t = tariffs["MY"]
    fallback = float(sum(my_t) / len(my_t))
    kw = float(_lm("contracted_kw"))
    load = float(_lm("avg_load_factor"))
    pue = float(_lm("pue"))
    hours = float(P.get("meta.hours_per_month"))
    kwh = kw * load * hours * pue
    network = float(_lm("network_usd_per_month"))
    rent = P.rent_usd_per_month()

    rows = []
    for country in ("MY", "TH", "ID", "SG"):
        own = tariffs.get(country)
        tariff = (float(sum(own) / len(own)) if isinstance(own, list) else float(own)) \
            if own is not None else fallback
        energy = kwh * tariff
        colo = colo_usd_kw_month(country) * kw
        for label, hw in (("硬件低位", hw_lo), ("硬件中位", (hw_lo + hw_hi) / 2),
                          ("硬件高位", hw_hi)):
            amort = monthly_amortization_usd(hw)
            total = amort + colo + energy + network
            rows.append({
                "国家": country,
                "情形": label,
                "电价假设": "实测" if country in ("MY", "SG") else "假设同马来西亚(G-2)",
                "硬件_USD": hw,
                "摊销_USD": amort,
                "托管_USD": colo,
                "电费_USD": energy,
                "网络_USD": network,
                "合计成本_USD": total,
                "本项目租金_USD": rent,
                "出租方毛利率": 1 - total / rent,
                "对出租方可持续": total < rent,
            })
    return pd.DataFrame(rows)


def buildup_table() -> pd.DataFrame:
    hw_lo, hw_hi = P.get("rent_validation.hardware_cost_usd_per_node")
    rows = []
    for country in ("SG", "MY"):
        for label, hw in (("硬件低位", hw_lo), ("硬件中位", (hw_lo + hw_hi) / 2),
                          ("硬件高位", hw_hi)):
            b = lessor_cost_buildup(country, hw)
            b["情形"] = f"{country} {label}"
            b["本项目租金_USD"] = P.rent_usd_per_month()
            b["出租方毛利率"] = 1 - b["total_cost_usd"] / P.rent_usd_per_month()
            rows.append(b)
    cols = ["情形", "country", "hardware_usd", "amortisation_usd", "colo_rate_usd_kw_month",
            "colo_usd", "electricity_usd_kwh", "energy_usd", "network_usd",
            "total_cost_usd", "本项目租金_USD", "出租方毛利率"]
    return pd.DataFrame(rows)[cols]
