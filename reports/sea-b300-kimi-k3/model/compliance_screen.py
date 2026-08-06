"""三层出口管制筛查。

为什么要分三层
--------------
把「美国对 GPU 的管制」当成一个整体，是选址分析最常见的错误。它至少是三套
独立的规则，触发条件不同、能否用选址规避也不同：

  层一 实体属性（EAR 742.6(a)(6)(iii)(A)）
      判定依据是终端用户的总部与最终母公司所在地，适用于「美国境外的一切目
      的地」。换国家不解除。这一层是否决门槛，不是选址题。

  层二 目的地属性（3A090 对 Country Group D:1/D:4/D:5）
      判定依据是货物运抵地。这一层换国家有效，也是本次选址分析的真正战场。

  层三 东道国自身管制
      马来西亚 MITI Directive 1/2025 要求美国原产先进 AI 芯片的出口/转运/过境
      申领战略贸易许可，且申请须附美国再出口许可。它是美国制度的前置执行，
      不是绕道。

本模块只做「按已登记事实做筛选」这一件事，不做法律定性。定性须由持牌出口
管制律师出具意见——这是能力边界，代码里也照此标注。
"""

from __future__ import annotations

import pandas as pd

import params as P

CONTROLLED_DESTINATION_GROUPS = {"D:1", "D:4", "D:5"}


def layer1_entity_gate(entity_hq_in_d5_or_macau: bool | None) -> dict:
    """层一：实体属性。返回结论与依据，不做定性。

    entity_hq_in_d5_or_macau 取 None 表示「用户未披露」，此时不假设任何一种情形，
    而是把两个分支都摆出来——这比替用户猜一个答案要诚实。
    """
    m = P.meta("export_control.entity_rule")
    base = {
        "layer": "层一 实体属性",
        "citation": m.get("citation"),
        "src": m.get("src"),
        "date": m.get("date"),
        "scope": m.get("scope"),
        "geography_can_solve": False,
    }
    if entity_hq_in_d5_or_macau is None:
        return {
            **base,
            "verdict": "undetermined",
            "detail": "运营主体及最终母公司总部所在地未披露，两个分支并列呈现，不做假设",
        }
    if entity_hq_in_d5_or_macau:
        return {
            **base,
            "verdict": "blocked",
            "detail": "触发全球许可要求，实践为推定拒绝；更换东道国无效，须转向替代方案",
        }
    return {
        **base,
        "verdict": "pass",
        "detail": "该项许可要求不因本条附着；仍须出租方完成其自身的终端用户筛查",
    }


def layer2_destination_screen() -> pd.DataFrame:
    """层二：按 Country Group 归属筛选目的地。"""
    rows = []
    for code, c in P.raw()["countries"].items():
        groups = c.get("groups") or []
        hit = sorted(set(groups) & CONTROLLED_DESTINATION_GROUPS)
        rows.append(
            {
                "code": code,
                "country": c["name_cn"],
                "country_groups": ",".join(groups) if groups else "(未见于所查节录)",
                "controlled_group_hit": ",".join(hit) if hit else "",
                "layer2_pass": not hit,
                "evidence_status": c.get("status"),
                "verdict": c.get("verdict"),
                "reason": c.get("reason"),
                "src": c.get("src"),
            }
        )
    df = pd.DataFrame(rows).sort_values(
        ["layer2_pass", "code"], ascending=[True, True]
    ).reset_index(drop=True)
    return df


def layer3_host_controls() -> pd.DataFrame:
    """层三：东道国自身管制。未核实的国家留空，不得据此宣称其「无管制」。"""
    hc = P.raw()["host_country_controls"]
    candidates = [
        (code, c) for code, c in P.raw()["countries"].items()
        if c.get("verdict") in ("candidate", "benchmark")
    ]
    rows = []
    for code, c in candidates:
        entry = hc.get(code)
        if entry:
            rows.append(
                {
                    "code": code,
                    "country": c["name_cn"],
                    "host_regime": entry["instrument"],
                    "effective": entry["effective"],
                    "covered_acts": ",".join(entry["covered_acts"]),
                    "advance_notice_days": entry["advance_notice_days"],
                    "requires_us_reexport_license": entry["requires_us_reexport_license"],
                    "status": "已核实存在",
                    "src": entry["src"],
                }
            )
        else:
            rows.append(
                {
                    "code": code,
                    "country": c["name_cn"],
                    "host_regime": "",
                    "effective": "",
                    "covered_acts": "",
                    "advance_notice_days": None,
                    "requires_us_reexport_license": None,
                    "status": "未核实（不得据此认定无管制）",
                    "src": "G-4",
                }
            )
    return pd.DataFrame(rows)


def candidate_list() -> list[str]:
    """通过层二筛查、进入经济性对比的候选国代码（含作为对照的新加坡）。"""
    df = layer2_destination_screen()
    return df.loc[df["layer2_pass"], "code"].tolist()


def screen_summary(entity_hq_in_d5_or_macau: bool | None = None) -> dict:
    l1 = layer1_entity_gate(entity_hq_in_d5_or_macau)
    l2 = layer2_destination_screen()
    l3 = layer3_host_controls()
    excluded = l2.loc[~l2["layer2_pass"], "country"].tolist()
    return {
        "layer1": l1,
        "layer2": l2,
        "layer3": l3,
        "excluded_by_destination": excluded,
        "candidates": candidate_list(),
        "n_excluded": len(excluded),
        "n_candidates": len(candidate_list()),
        "host_regimes_verified": int((l3["status"] == "已核实存在").sum()),
        "host_regimes_unverified": int((l3["status"] != "已核实存在").sum()),
    }


def k3_license_check(group_revenue_12m_usd: float | None) -> dict:
    """Kimi K3 许可 §2 的门槛判定。

    注意分母：门槛是「被许可方及其关联方的合计收入」，不是 K3 业务收入。
    未披露时返回 undetermined，不替用户假设。
    """
    thr = float(P.get("license_k3.maas_threshold_usd_12m"))
    if group_revenue_12m_usd is None:
        verdict, detail = "undetermined", "集团 12 个月合计收入未披露，须自查"
    elif group_revenue_12m_usd > thr:
        verdict, detail = "agreement_required", "已超门槛，商用前须与 Moonshot 另签协议"
    else:
        verdict, detail = "free_commercial_use", "低于门槛，可免费商用与转售，无需另签"
    return {
        "threshold_usd_12m": thr,
        "is_maas": True,
        "is_maas_reason": "通过 API 使第三方对输入与参数有实质控制，落入 §2 的 MaaS 定义",
        "attribution_mau_threshold": float(P.get("license_k3.attribution_mau")),
        "attribution_rev_threshold": float(
            P.get("license_k3.attribution_monthly_revenue_usd")
        ),
        "verdict": verdict,
        "detail": detail,
        "src": P.src("license_k3"),
    }


def structure_recommendation() -> pd.DataFrame:
    """交易形态选择：同一个决定同时影响出口管制定性与东道国常设机构风险。

    两个风险指向同一个答案（买算力即服务而非租裸金属），这不是巧合——两者
    判定的都是「你是否支配该物项」。
    """
    rows = [
        {
            "交易形态": "购买算力即服务（不占有不控制物项）",
            "出口管制定性": "物项未离开出租方支配，历史上不视为物项出口/转让",
            "东道国常设机构风险": "低。无自有或自行支配的服务器",
            "谈判难度": "中。需出租方接受服务化合同而非租赁合同",
            "推荐": True,
        },
        {
            "交易形态": "独占式裸金属租赁",
            "出口管制定性": "可能构成 EAR 意义上的 transfer (in-country)，须律师定性",
            "东道国常设机构风险": "较高。按 OECD 注释，自行支配运营的服务器可构成 PE",
            "谈判难度": "低。市场主流形态",
            "推荐": False,
        },
    ]
    return pd.DataFrame(rows)
