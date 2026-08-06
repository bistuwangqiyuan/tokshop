# 东南亚 B300 + Kimi K3 投资可行性分析

在东南亚不受美国 GPU 出口管制的国家，以 15 万元人民币/月租用一台 8 卡 NVIDIA B300，
部署开放权重模型 Kimi K3，通过自建 API 与 OpenRouter 双轨售卖 token 的可行性测算。

## 读什么

| 文件 | 内容 |
| --- | --- |
| [`01-投资可行性分析报告.md`](01-投资可行性分析报告.md) | **主报告。结论先行，从这里开始读** |
| [`02-数据来源与核验附录.md`](02-数据来源与核验附录.md) | 每个外部事实的出处、原文摘录、矛盾取舍与数据缺口 |
| [`03-选址对比矩阵.md`](03-选址对比矩阵.md) | 八维选址对比与可直接使用的 RFQ 询价清单 |
| [`outputs/`](outputs/) | 全部计算产物（CSV + 图 + facts.json） |
| [`model/`](model/) | 可复现的计算模型 |

## 怎么复算

```bash
pip install -r requirements.txt
python model/test_model.py     # 55 项模型自检（物理约束、会计恒等式、可证伪性）
python model/run_all.py        # 自检 + 重新生成全部 outputs/
python model/run_all.py --fast # 同上，蒙特卡洛降到 300 次，约 25 秒
python verify.py               # 60 项报告数字回溯核对
```

任何一项失败均以非零码退出。

## 想改参数

所有外生数字集中在 [`model/params.yaml`](model/params.yaml)，每项带 `src`（可回溯到
`02-数据来源与核验附录.md` 的 S-xx 编号）、`date` 与说明。改一处即全局重算。

三个最值得替换成你自己判断的参数：

| 参数 | 路径 | 当前值 | 为什么关键 |
| --- | --- | --- | --- |
| 年化价格侵蚀率 | `assumptions.price_erosion_annual` | 20% | 单独决定九种情景中哪些成立，且无历史序列可拟合 |
| 租约期限 | `assumptions.lease_term_months` | 36 | 决定下行敞口。改成 12 可把第 6 月失败的损失从 57.0 万降到 12.8 万美元 |
| 需求爬坡 | `assumptions.demand_scenarios` | 三情景 | 全模型唯一完全无外部依据的输入 |

## 模块

| 文件 | 职责 |
| --- | --- |
| `params.py` | 参数加载器。代码中不出现裸字面量常数 |
| `compliance_screen.py` | 三层出口管制筛查（实体属性 / 目的地属性 / 东道国管制） |
| `rent_validation.py` | 租金三路交叉验证 + 出租方成本反推 |
| `siting.py` | 选址矩阵、延迟与 SLO、各国税负、结构选择 |
| `capacity.py` | 产能：实测标定 + 分段幂律插值 + roofline 护栏 |
| `revenue.py` | 收入、盈亏平衡、自建 vs 采购 |
| `rolling.py` | 按月滚动 + 复利再投资 + 租约清算期 |
| `metrics.py` | 收益率与资金使用效率 |
| `sensitivity.py` | 单因素敏感性、平衡曲面、跨选址、蒙特卡洛 |
| `run_all.py` | 一键复现 |
| `test_model.py` | 55 项自检 |

## 与姊妹报告的关系

[`../b300-kimi-k3/`](../b300-kimi-k3/) 分析同一模式在**中国境内 35 万元/月**的情形。
两份共用同一套技术事实与方法论，本报告新增三层合规筛查、多国选址、租金交叉验证、
营运资金与账期、逐年计税、租约清算期与尾部义务、下行不对称、蒙特卡洛。
