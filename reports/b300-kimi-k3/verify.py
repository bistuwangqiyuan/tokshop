"""
交付前自查：把报告正文里出现的数字逐一回溯到 outputs/ 的产物。

这份脚本的存在本身就是结论的一部分——报告声称「每个数字都可回溯」，
就必须有一个可执行的东西来证明它，而不是靠作者自述。

用法：python verify.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
OUT = HERE / "outputs"
REPORT = HERE / "报告.md"

facts = json.loads((OUT / "facts.json").read_text(encoding="utf-8"))
cap = pd.read_csv(OUT / "01_capacity_by_profile.csv")
rent = pd.read_csv(OUT / "02_breakeven_by_rent.csv")
grid = pd.read_csv(OUT / "03_profit_grid.csv")
xo = pd.read_csv(OUT / "04_crossover.csv")
roll = pd.read_csv(OUT / "07_roll_summary.csv")
text = REPORT.read_text(encoding="utf-8")

failures: list[str] = []


def claim(label: str, needle: str, expected: float, actual: float, tol: float = 0.01) -> None:
    """needle 必须出现在报告中，且 expected 与模型产物 actual 在容差内一致。"""
    in_report = needle in text
    matches = abs(expected - actual) <= tol * max(abs(actual), 1e-9)
    ok = in_report and matches
    status = "PASS" if ok else "FAIL"
    detail = ""
    if not in_report:
        detail = f'报告中找不到 "{needle}"'
    elif not matches:
        detail = f"报告 {expected} vs 产物 {actual}"
    print(f"  {status}  {label}{('  ' + detail) if detail else ''}")
    if not ok:
        failures.append(label)


print("回溯核对：报告数字 -> 模型产物\n")

claim("满载月收入", "371,144", 371144, facts["base_full_revenue_cny"])
claim("满载月利润为负", "−¥8,754", -8754,
      float(grid[(grid["月租金(元)"] == 350000) & (grid["利用率"] == 1.0)]["月利润(元)"].iloc[0]))
claim("35万盈亏平衡利用率", "102.5%", 1.025, facts["breakeven_at_350k"])
claim("15万盈亏平衡利用率", "45.2%", 0.452, facts["breakeven_at_150k"])
claim("190k盈亏平衡利用率", "56.7%", 0.567, facts["breakeven_at_190k"])
claim("108k盈亏平衡利用率", "33.2%", 0.332, facts["breakeven_at_108k"])
claim("对话画像盈亏平衡", "76.4%", 0.764,
      float(rent[rent["月租金(元)"] == 350000]["对话 2K/500"].iloc[0]))
claim("租金相对现货中位倍数", "1.84 倍", 1.84, facts["rent_vs_spot_median"])
claim("租金相对三年长约倍数", "3.24 倍", 3.24, facts["rent_vs_3y_contract"])
claim("crossover 月请求数", "298.8 万", 2_988_000, facts["crossover_requests_month"], tol=0.002)
claim("crossover 输出token", "23.9 亿", 2.39e9, facts["crossover_out_tokens_month"], tol=0.005)
claim("满载自建节省比例", "3.5%", 3.5, facts["selfhost_saving_at_full"], tol=0.02)
claim("访存物理上界", "2,609 tok/s", 2609, facts["bandwidth_ceiling_c64"])
claim("实测占上界比例", "67.4%", 67.4, facts["measured_vs_ceiling_pct"])
claim("八卡可用显存", "2.2994 TB", 2.2994, facts["usable_hbm_tb"])
claim("基准解码吞吐", "1,049 tok/s", 1049, facts["base_decode_rate"])
claim("预填算力利用率", "2.8%", 2.8, facts["prefill_mfu_pct"], tol=0.02)
claim("汇率", "6.7917", 6.7917, facts["usd_cny"])
claim("35万档启动资金", "175 万元", 1_750_000, facts["startup_capital_350k"])
claim("15万档启动资金", "75 万元", 750_000, facts["startup_capital_150k"])

opt15 = roll[(roll["scenario"] == "乐观") & (roll["rent"] == "长单 15万")].iloc[0]
claim("乐观15万 IRR", "42.8%", 0.428, float(opt15["irr_annual"]))
claim("乐观15万 MOIC", "2.88 倍", 2.88, float(opt15["moic"]))
claim("乐观15万 回本期", "19 个月", 19, float(opt15["payback_month"]))
claim("乐观15万 累计损益", "+¥1,412,816", 1_412_816, float(opt15["total_profit_cny"]))

pes35 = roll[(roll["scenario"] == "悲观") & (roll["rent"] == "给定 35万")].iloc[0]
claim("悲观35万 追加资金", "9,030,619", 9_030_619,
      float(pes35["additional_capital_required_cny"]))

# 全部租金档满载利润必须与报告表格一致
for r, v in [(108000, 233246), (150000, 191246), (190000, 151246), (265000, 76246)]:
    actual = float(grid[(grid["月租金(元)"] == r) & (grid["利用率"] == 1.0)]["月利润(元)"].iloc[0])
    claim(f"{r} 满载月利润", f"{v:,}", v, actual)

# 结构性检查：报告不得残留占位符或未填数字
for bad in ["TODO", "TBD", "XXX", "待补", "??"]:
    ok = bad not in text
    print(f"  {'PASS' if ok else 'FAIL'}  报告无占位符 {bad}")
    if not ok:
        failures.append(f"placeholder {bad}")

# 结构性检查：所有引用的产物文件必须真实存在
for rel in re.findall(r"\(outputs/([^)]+)\)", text):
    rel = rel.split("#")[0]
    if rel.endswith("/"):
        continue
    exists = (OUT / rel).exists()
    if not exists:
        print(f"  FAIL  报告引用了不存在的产物 outputs/{rel}")
        failures.append(f"missing {rel}")
print(f"  PASS  报告引用的产物文件均存在"
      if not any(f.startswith("missing") for f in failures) else "")

print(f"\n核对结束：{'全部通过' if not failures else f'{len(failures)} 项失败'}")
sys.exit(1 if failures else 0)
