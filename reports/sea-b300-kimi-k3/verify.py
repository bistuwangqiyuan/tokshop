"""报告数字回溯核对。

"每个数字可回溯"这句话本身也应当可执行。本脚本把三份报告正文里的关键数字
逐一与 outputs/ 的产物比对，并检查：
  1. 正文数字是否与模型产物一致（容差按量级设定）
  2. 是否残留占位符（TODO / TBD / XXX / 待补）
  3. 正文引用的产物文件是否真实存在
  4. 声称的自检项数与实际是否一致

不通过则以非零码退出。

    python verify.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs"
DOCS = [
    ROOT / "01-投资可行性分析报告.md",
    ROOT / "02-数据来源与核验附录.md",
    ROOT / "03-选址对比矩阵.md",
]

FAILURES: list[str] = []
CHECKED = 0


def facts() -> dict:
    with open(OUT / "facts.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _norm(s: str) -> str:
    """把正文里的千分位与货币符号去掉，便于做子串匹配。"""
    return s.replace(",", "").replace("$", "").replace("¥", "")


def expect(doc_text: str, literal: str, name: str) -> None:
    """正文中必须出现该字面量（已做千分位归一）。"""
    global CHECKED
    CHECKED += 1
    ok = literal in doc_text or _norm(literal) in _norm(doc_text)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}  期望出现 {literal!r}")
    if not ok:
        FAILURES.append(f"{name}: 正文未出现 {literal!r}")


def sg_tax_gain(cs: pd.DataFrame, code: str, sg_tax: float) -> float:
    """注册在新加坡相对注册在当地，36 期少缴的税。"""
    local = cs[(cs["code"] == code) & (cs["注册地"] == "当地")].iloc[0]
    return float(local["36期累计税_USD"]) - sg_tax


def main() -> int:
    global CHECKED
    print("报告数字回溯核对\n")
    f = facts()
    texts = {}
    for d in DOCS:
        if not d.exists():
            FAILURES.append(f"缺少报告文件 {d.name}")
            continue
        texts[d.name] = d.read_text(encoding="utf-8")
    main_doc = texts.get("01-投资可行性分析报告.md", "")
    site_doc = texts.get("03-选址对比矩阵.md", "")

    print("零、产物口径检查")
    CHECKED += 1
    mc_ok = int(f.get("mc_n", 0)) == 2000
    print(f"  {'PASS' if mc_ok else 'FAIL'}  facts.json 由完整蒙特卡洛生成"
          f"  mc_n={f.get('mc_n')}"
          f"{'' if mc_ok else '  → 请运行 python model/run_all.py（不带 --fast）后重试'}")
    if not mc_ok:
        FAILURES.append(f"facts.json 的 mc_n={f.get('mc_n')}，正文引用的是 2000 次的结果")

    print("\n一、主报告关键数字")
    expect(main_doc, f"{f['rent_usd_per_month']:,.0f}", "月租金 USD")
    expect(main_doc, f"{f['rent_usd_per_gpu_hour']:.4f}", "每卡·小时租金")
    expect(main_doc, f"{f['bit_origin_rent_usd']:,.0f}", "Bit Origin 每台月租")
    expect(main_doc, f"{abs(f['bit_origin_delta_pct']):.2f}", "与 Bit Origin 偏差")
    expect(main_doc, f"{f['bit_origin_capex_per_server']:,.0f}", "Bit Origin 每台硬件单价")
    expect(main_doc, f"{f['bit_origin_gross_yield_annual']*100:.1f}", "硬件毛收益率")
    expect(main_doc, f"{f['lessor_cost_my_mid']:,.0f}", "马来西亚出租方成本中位")
    expect(main_doc, f"{f['lessor_cost_sg_mid']:,.0f}", "新加坡出租方成本中位")
    expect(main_doc, f"{f['margin_my_low_hw_pct']:.1f}", "马来西亚低位硬件毛利率")

    expect(main_doc, f"{f['base_full_revenue_usd']:,.0f}", "基准画像满载月收入")
    expect(main_doc, f"{f['base_breakeven_util']*100:.1f}", "基准画像盈亏平衡利用率")
    expect(main_doc, f"{f['breakeven_at_half_price']*100:.1f}", "折价 50% 后平衡利用率")
    expect(main_doc, f"{f['base_decode_rate']:,.0f}", "基准画像解码吞吐")
    expect(main_doc, f"{f['base_decode_time_share']*100:.1f}", "解码占用时间比")
    expect(main_doc, f"{f['effective_input_price']:.3f}", "有效输入价")
    expect(main_doc, f"{f['kv_bytes_per_token']:,.0f}", "每 token KV 占用")
    expect(main_doc, f"{f['full_weight_read_ms']:.2f}", "全权重读取时间")
    expect(main_doc, f"{f['bandwidth_ceiling_c64']:,.0f}", "c=64 访存上界")
    expect(main_doc, f"{f['measured_vs_ceiling_pct']:.1f}", "实测占上界比例")
    expect(main_doc, f"{f['prefill_mfu_pct']:.2f}", "预填 MFU")
    expect(main_doc, f"{f['expert_coverage_c10']*100:.1f}", "专家覆盖率 c=10")
    expect(main_doc, f"{f['expert_coverage_c64']*100:.1f}", "专家覆盖率 c=64")
    expect(main_doc, f"{f['weights_fit']['headroom_pct']:.1f}", "显存余量比例")

    expect(main_doc, f"{f['crossover_requests_month']/1e4:,.1f}", "crossover 月请求数(万)")
    expect(main_doc, f"{f['selfhost_saving_at_full_pct']:.1f}", "满载自建节省比例")

    expect(main_doc, f"{f['initial_capital']:,.0f}", "初始投入")
    expect(main_doc, f"{f['peak_capital_optim']:,.0f}", "乐观情景峰值资金占用")
    expect(main_doc, f"{f['ccc_days']:.0f}", "现金转换周期")
    expect(main_doc, f"{f['downside_36m_fail6_pv']:,.0f}", "36 月租约第 6 月失败义务现值")
    expect(main_doc, f"{f['downside_12m_fail6_pv']:,.0f}", "12 月租约第 6 月失败义务现值")
    expect(main_doc, f"{abs(f['stop_case_optim_e20']):,.0f}", "乐观情景停摆终值")

    expect(main_doc, f"{f['irr_optim_e20']*100:.1f}", "乐观+20%侵蚀 IRR")
    expect(main_doc, f"{f['irr_neutral_e0']*100:.1f}", "中性+0%侵蚀 IRR")
    expect(main_doc, f"{f['irr_optim_e0']*100:.1f}", "乐观+0%侵蚀 IRR")
    expect(main_doc, f"{f['mc_prob_positive_going_concern']*100:.1f}", "蒙特卡洛正收益概率")
    expect(main_doc, f"{f['mc_prob_payback_within_horizon']*100:.1f}", "蒙特卡洛回本概率")
    expect(main_doc, f"{abs(f['mc_equity_p50']):,.0f}", "蒙特卡洛终值中位数")
    expect(main_doc, f"{abs(f['mc_worst_stop_case_usd']):,.0f}", "最坏停摆情形")

    expect(main_doc, f"{f['ttft_p90_sg_ms']:,.0f}", "新加坡 P90 TTFT")
    expect(main_doc, f"{f['ttft_degradation_bangkok_pct']:.2f}", "曼谷 TTFT 恶化比例")

    # 跨选址与租期这两组结论直接读 CSV，因为它们是表级结论而非单点事实
    cs = pd.read_csv(OUT / "07_cross_site.csv")
    sg_tax = float(cs.loc[cs["注册地"] == "新加坡", "36期累计税_USD"].iloc[0])
    expect(main_doc, f"{sg_tax:,.0f}", "新加坡注册 36 期累计税")
    for code, name in (("TH", "泰国"), ("ID", "印尼"), ("MY", "马来西亚")):
        loc = cs[(cs["code"] == code) & (cs["注册地"] == "当地")].iloc[0]
        expect(main_doc, f"{float(loc['36期累计税_USD']):,.0f}", f"{name}本地注册累计税")
        gain = sg_tax_gain(cs, code, sg_tax)
        expect(main_doc, f"{gain:,.0f}", f"{name}分离结构净收益")

    sens = pd.read_csv(OUT / "07_sensitivity_neutral.csv")
    lease12 = sens[(sens["因素"] == "租约期限_月") & (sens["取值"].astype(str) == "12")]
    expect(main_doc, f"{float(lease12['继续经营终值_USD'].iloc[0]):,.0f}",
           "12 个月租约继续经营终值")

    print("\n二、选址文档关键数字")
    expect(site_doc, f"{f['colo_sg_usd_kw']:.0f}", "新加坡托管价")
    expect(site_doc, f"{f['colo_my_usd_kw']:.1f}", "马来西亚托管价估计")
    expect(site_doc, f"{f['colo_th_usd_kw']:.1f}", "泰国托管价估计")
    expect(site_doc, f"{f['colo_id_usd_kw']:.1f}", "印尼托管价估计")
    expect(site_doc, f"{f['lessor_mid_ID']:,.0f}", "印尼出租方成本中位")
    expect(site_doc, f"{f['lessor_mid_TH']:,.0f}", "泰国出租方成本中位")

    print("\n三、结构性检查")

    # 占位符
    CHECKED += 1
    placeholders = re.compile(r"TODO|TBD|XXX|待补|FIXME|\?\?\?")
    hits = [(n, m.group()) for n, t in texts.items() for m in placeholders.finditer(t)]
    print(f"  {'PASS' if not hits else 'FAIL'}  正文无残留占位符"
          f"{'' if not hits else '  ' + str(hits[:5])}")
    if hits:
        FAILURES.append(f"残留占位符：{hits[:5]}")

    # 引用的产物文件必须存在
    CHECKED += 1
    ref = re.compile(r"\]\((outputs/[^)\s]+)\)")
    missing = []
    for n, t in texts.items():
        for m in ref.finditer(t):
            p = ROOT / m.group(1)
            if not p.exists() and not m.group(1).endswith("/"):
                missing.append((n, m.group(1)))
    print(f"  {'PASS' if not missing else 'FAIL'}  引用的产物文件均存在"
          f"{'' if not missing else '  缺失 ' + str(missing[:5])}")
    if missing:
        FAILURES.append(f"引用了不存在的产物：{missing[:5]}")

    # 自检项数声明必须与实际一致
    CHECKED += 1
    import test_model_probe
    n_actual = test_model_probe.count_checks()
    claimed = re.search(r"运行 \*\*(\d+) 项检查\*\*", main_doc)
    ok = claimed is not None and int(claimed.group(1)) == n_actual
    print(f"  {'PASS' if ok else 'FAIL'}  正文声称的自检项数与实际一致"
          f"  实际 {n_actual}，正文 {claimed.group(1) if claimed else '未声明'}")
    if not ok:
        FAILURES.append(f"自检项数不符：实际 {n_actual}")

    # 关键产物齐备
    CHECKED += 1
    required = ["facts.json", "01_screen_layer2_destination.csv", "02_rent_benchmarks.csv",
                "02_lessor_cost_by_country.csv", "03_siting_matrix.csv",
                "04_capacity_by_profile.csv", "05_breakeven_surface.csv",
                "06_roll_summary.csv", "07_downside_asymmetry.csv",
                "08_monte_carlo_summary.csv"]
    lack = [r for r in required if not (OUT / r).exists()]
    print(f"  {'PASS' if not lack else 'FAIL'}  关键产物齐备{'' if not lack else '  缺 ' + str(lack)}")
    if lack:
        FAILURES.append(f"缺少产物：{lack}")

    # 数据缺口必须在正文中被承认
    CHECKED += 1
    gaps = ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"]
    unacknowledged = [g for g in gaps if not any(g in t for t in texts.values())]
    print(f"  {'PASS' if not unacknowledged else 'FAIL'}  全部数据缺口在正文中被承认"
          f"{'' if not unacknowledged else '  遗漏 ' + str(unacknowledged)}")
    if unacknowledged:
        FAILURES.append(f"未承认的数据缺口：{unacknowledged}")

    print(f"\n核对结束：共 {CHECKED} 项，"
          f"{'全部通过' if not FAILURES else f'{len(FAILURES)} 项失败'}")
    for x in FAILURES:
        print(f"  失败项：{x}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
