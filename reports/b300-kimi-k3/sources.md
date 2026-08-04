# 信源档案

本报告的每一个外部事实都登记在此，含原文摘录、链接与访问日期。模型 `model.py` 中的每个外生参数都在下表有对应编号，报告正文引用时标注 `[S-xx]`。

**统一访问日期：2026-08-05（UTC+8）**，个别条目另注。

凡本档案未登记的数字，一律不得作为报告结论的依据。若某条事实存在互相矛盾的来源，一并记录矛盾并说明取舍理由（见文末「矛盾与取舍」）。

---

## S-01 Kimi K3 模型规格

来源：MoonshotAI 官方仓库 <https://github.com/MoonshotAI/Kimi-K3>（仓库创建于 2026-07-27T08:01:37Z）

官方模型卡原文（Model Summary 表）：

| 项 | 值 |
| --- | --- |
| Architecture | Mixture-of-Experts (MoE) |
| Total Parameters | 2.8T |
| Activated Parameters | 104B |
| Number of Layers | 93 |
| Number of Dense Layers | 1 |
| Attention-Layer Composition | 69 KDA + 24 Gated MLA |
| Attention Hidden Dimension | 7168 |
| Number of Attention Heads | 96 |
| Latent MoE Dimension | 3584 |
| MoE Hidden Dimension (per Expert) | 3072 |
| Number of Experts | 896 |
| Selected Experts per Token | 16 |
| Number of Shared Experts | 2 |
| Vocabulary Size | 160K |
| Context Length | 1048576 |
| Attention Mechanism | KDA & Gated MLA |
| Activation Function | SiTU-GLU |
| Vision Encoder | MoonViT-V2（401M 参数） |
| Quantization | MXFP4 weights / MXFP8 activations (quantization-aware training) |
| Modality | Text, Image |

原文引述："Kimi K3 is an open-weight, native multimodal agentic model and our most capable model to date. It is a 2.8T-parameter model built on Kimi Delta Attention (KDA) and Attention Residuals (AttnRes), with native vision capabilities and a 1-million-token context window."

**关键性**：`Quantization: MXFP4 weights` 是量化感知训练（QAT）的原生权重格式，不是事后压缩。这是单机能装下 2.8T 模型的前提，直接决定本项目技术可行性。

## S-02 发布时间线

- 托管 API 上线：**2026-07-16**。来源：OpenRouter 模型页 <https://openrouter.ai/moonshotai/kimi-k3> 标注 "Jul 16, 2026"；Puter 教程亦称 "released July 16, 2026"。
- 开放权重：**2026-07-27**。来源：GitHub 仓库创建时间戳 `2026-07-27T08:01:37Z`；Unite.AI 报道 "Moonshot AI 于 2026 年 7 月 27 日发布了 Kimi K3 模型的完整权重，距离北京实验室将该模型作为托管服务推出仅仅 11 天"。

**关键性**：截至本报告日，K3 开放权重仅 **9 天**。所有第三方实测数据都是 day-0 到 day-9 之间产生的，工程栈仍在快速变动，吞吐数据的时效性有限。这一点必须在结论中如实声明。

## S-03 Kimi K3 许可证

来源：<https://github.com/MoonshotAI/Kimi-K3/blob/main/LICENSE>

授权正文原文：

> Permission is hereby granted, free of charge, to any person (the "Licensee") obtaining a copy of this software — including the model weights, parameters, configuration files, inference and training code, and associated documentation (collectively, the "Software") — to deal in the Software without restriction. This includes, without limitation, the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software; to run, deploy, fine-tune, or otherwise modify the Software and create derivative works from it...

第 2 条（MaaS 门槛）原文：

> If the Licensee or any of its affiliates operates a Model as a Service business, and the aggregate revenue of the Licensee and its affiliates exceeds 20 million US dollars (or the equivalent in other currencies) in total over any consecutive 12 months, the Licensee must enter into a separate agreement with Moonshot AI before using the Software or its derivative works for any commercial purpose.

第 3 条（署名门槛）原文：

> If the Software (or any derivative works thereof) is used for any of the Licensee's commercial products or services that have more than 100 million monthly active users, or more than 20 million US dollars (or equivalent in other currencies) in monthly revenue, "Kimi K3" must be prominently displayed on the user interface of such product or service.

第 4 条（豁免）原文：

> The requirements set forth in Sections 2 and 3 do not apply to: (a) internal use of the Software, defined as any use that does not make the Software, its outputs, or its underlying capabilities available to third parties; or (b) any use of the Software accessed through Moonshot AI's official products or certified inference partners.

**对本项目的判定**：本项目属于第 2 条定义的 MaaS（向第三方提供推理访问，第三方可对输入与参数施加实质控制）。但触发另签协议需要**同时**满足「经营 MaaS」与「集团连续 12 个月累计收入超 2000 万美元」两个条件。本项目远低于收入门槛，因此**可免费商用与转售，无需另行签约、无需付费**。第 3 条署名义务同样因门槛（1 亿 MAU 或月收入 2000 万美元）而不触发。

## S-04 NVIDIA B300 官方规格

来源：NVIDIA 官方技术博客 <https://developer.nvidia.com/blog/inside-nvidia-blackwell-ultra-the-chip-powering-the-ai-factory-era/>

| 项 | 值 |
| --- | --- |
| HBM 容量 | 288 GB HBM3e（8 个 12-Hi 堆栈，16×512-bit 控制器，总位宽 8192-bit） |
| HBM 带宽 | **8 TB/s 每 GPU**（H100 为 3.35 TB/s，提升 2.4 倍） |
| NVFP4 稠密算力 | 15 PFLOPS（稀疏 20 PFLOPS） |
| FP8 稠密算力 | 5 PFLOPS（稀疏 10 PFLOPS） |
| NVLink 带宽 | 1.8 TB/s |
| 最大功耗 TGP | 1400 W |
| SM 数 | 最多 160；CUDA 核 20,480 |
| 晶体管 | 208B，双 die，TSMC 4NP |

原文引述："With 288 GB of HBM3e per GPU, it offers 3.6x more on-package memory than H100 and 50% more than Blackwell... This capacity is critical for hosting trillion-parameter models."

实际可用容量（低于标称）：
- glennklockwood 技术笔记 <https://www.glennklockwood.com/garden/processors/b300>：B300 可用 270 GB，GB300 可用 279 GB。
- GPUStack 八卡实测环境记录：**每 GPU 可见显存 267.69 GiB**（见 S-06）。

**取用**：模型中的单卡可用显存采用**实测值 267.69 GiB**，而非标称 288 GB。用标称值会高估约 7%。

## S-05 K3 在 8×B300 上的实测显存与冷启动

来源：DevGENT《Kimi K3 on B300×8: MXFP4 Memory and Day-0 Paths》<https://devgent.org/en/kimi-k3-on-b300-8-mxfp4-memory-and-day-0-paths-en/>

原文数据：

> - Measured weights: ~195.86 GB/GPU, ~1.57TB total
> - Cold start: ~88.8 minutes total (~81.4 minutes load). Restarts are expensive
> - Steady-state per rank: ~248/275 GB used; Mamba/KDA state 17.13GB; MLA KV 1.70GB (65,984 tokens/rank)
> - Example effective context with DCP8: 65,984 × 8 = 527,872 tokens at `--mamba-full-memory-ratio=5`

结论原文："The short answer is conditional yes. If you have MXFP4 weights plus B300 288GB×8 (about 2.3TB aggregate HBM), single-node Day-0 validation is realistic."

**关键性**：
1. 权重 1.57 TB < 八卡可用 2.14 TB（267.69 GiB × 8），**单机装得下**，这是全项目的技术前提。
2. 冷启动约 89 分钟，意味着节点重启成本极高，直接影响可用性设计与运维自动化的可行边界。

## S-06 吞吐实测（一）：并发扫描

来源：Openzeka 白皮书《Kimi K3 Inference Benchmark on DGX-B300》<https://whitepapers.openzeka.com/papers/kimi-k3-dgx-b300-inference-benchmark/>（报告日期 2026 年 7 月）

测试条件原文：
- GPU: NVIDIA DGX-B300（Blackwell Ultra, 8×GPU）
- Parallelism: Tensor Parallel = 8 (TP8)
- KV Cache: FP8 (`--kv-cache-dtype fp8`)
- Memory Utilization: 0.95
- Prefix Caching: Enabled (`--enable-prefix-caching`)
- Model: Moonshot AI Kimi K3

聚合输出吞吐（tok/s）随并发数变化：

| 并发 c | vLLM 直出 | vLLM+投机 | SGLang 直出 | SGLang+投机 |
| --- | --- | --- | --- | --- |
| 1 | 101 | 188 | 83 | 130 |
| 4 | 293 | 398 | 237 | 228 |
| 32 | 1126 | 740 | 1074 | 493 |
| 64 | **1759** | 717 | **1863** | 931 |

c=64 时的延迟指标：vLLM 直出 TTFT 731.7 ms、ITL 30.8 ms、单用户 27.5 tok/s；SGLang 直出 TTFT 948.4 ms、ITL 27.1 ms、单用户 29.1 tok/s。

原文结论："At low load (c=1) speculative decoding yields a clear gain... At high load speculative decoding becomes a bottleneck: vLLM + Spec @c=64: per-user TPS drops to 11 tok/s (vLLM direct 27 tok/s)."

注：原始表格中 c=16 一行在抓取文本中有字符损坏（"6?7"），**本报告不使用 c=16 数据点**。

**取用**：本模型的短上下文满载吞吐基准取 **vLLM 直出 c=64 的 1,759 tok/s**（保守选择，未取 SGLang 的 1,863）。

## S-07 吞吐实测（二）：长上下文

来源：GPUStack《Day 0 Support for Kimi-K3: vLLM vs. SGLang Inference Benchmark on 8×B300 GPUs》<https://dev.to/gpustack/gpustack-day-0-support-for-kimi-k3-vllm-vs-sglang-inference-benchmark-on-8xb300-gpus-2g0g>

测试条件原文：单节点 8×NVIDIA B300；每 GPU 可见显存 267.69 GiB；模型 Kimi-K3 (MXFP4)；草稿模型 Kimi-K3-DSpark；输入长度 64K / 200K；输出长度 3K；并发 10；数据集为随机数据。

| 场景 | vLLM | SGLang |
| --- | --- | --- |
| 64K 稳态解码吞吐 | **~501 tok/s** | ~335 tok/s |
| 200K 稳态解码吞吐 | ~163 tok/s | **~268 tok/s** |
| 64K 端到端耗时 | 100.5 s | 150.8 s |
| 200K 端到端耗时 | 295.2 s | 225.3 s |
| 64K→200K 解码衰减 | 3.29× | 1.25× |

原文补充："At 64K, stable throughput was approximately 313–418 tok/s, averaging about 335 tok/s. Per request, this is approximately 33.5 tok/s"（此段指 SGLang）。

**关键性**：这是全报告最重要的一组数据。它证明**吞吐随上下文长度急剧衰减**——从短上下文的 1,759 tok/s 降到 64K 的 501 tok/s（降 3.5 倍），再降到 200K 的 163–268 tok/s。任何用峰值吞吐乘以时间来估算收入的做法都会系统性高估数倍。

注：随机数据集会使投机解码的接受率崩溃（原文："Speculative decoding is generally ineffective on random data"），真实业务数据下长上下文吞吐可能优于此处实测。本报告按实测取值，属**保守**处理。

## S-08 K3 官方与市场售价

来源（官方）：Moonshot AI 定价，经多方交叉验证
- Puter 教程 <https://developer.puter.com/tutorials/kimi-api-pricing/>：K3 输入 $3.00/M、输出 $15.00/M
- Morph <https://www.morphllm.com/kimi-api>："`kimi-k3`: $3/M input, $0.30/M cached, $15/M output, flat context"
- Wan27 <https://wan27.org/blog/kimi-k3-cost-pricing>：缓存命中输入 $0.30、未命中输入 $3.00、输出 $15.00

来源（市场）：OpenRouter 模型页 <https://openrouter.ai/moonshotai/kimi-k3>，快照含 11 家 provider：

| Provider | 输入 $/M | 输出 $/M | 缓存读 $/M | 吞吐 tps | 可用率 |
| --- | --- | --- | --- | --- | --- |
| Morph | 2.90 | 14.00 | 0.29 | 42 | 98.77% |
| Modal | 3.00 | 15.00 | 0.30 | 45 | 98.19% |
| Baseten | 3.00 | 15.00 | 0.30 | 48 | 98.48% |
| Fireworks | 3.00 | 15.00 | 0.30 | 26 | 96.85% |
| Chutes | 3.00 | 15.00 | 0.30 | 22 | 89.06% |
| Moonshot AI | 3.00 | 15.00 | 0.30 | 22 | 99.54% |
| Together | 3.00 | 15.00 | 0.30 | 31 | 97.56% |
| DigitalOcean | 3.00 | 15.00 | 0.30 | 11 | 96.07% |
| Fireworks Fast | 4.50 | 22.50 | 0.45 | 67 | 98.06% |
| Wafer Fast | 4.50 | 22.50 | 0.45 | 47 | 99.19% |
| Morph Fast | 6.00 | 22.50 | 0.60 | 87 | 98.78% |

**关键性**：开放权重仅 9 天，已有 11 家 provider 以几乎完全相同的价格供应同一模型。这是典型的**同质化商品市场**，新进入者是纯粹的价格接受者，不具备定价权。

## S-09 缓存命中率与有效输入价（决定收入的隐藏变量）

来源：OpenRouter 同页 "Effective Pricing"（近 1 日实测）

| Provider | 有效输入价 $/M | 输出价 $/M | 缓存命中率 | token 份额 |
| --- | --- | --- | --- | --- |
| Moonshot AI | **0.588** | 15.00 | 89.3% | 51.6% |
| Modal | 0.661 | 15.00 | 86.6% | 17.8% |
| Together | 0.779 | 15.00 | 82.2% | 14.5% |
| Fireworks | 0.679 | 15.00 | 86.0% | 7.5% |
| Morph | 0.629 | 14.00 | 87.0% | 3.1% |
| DigitalOcean | 0.963 | 15.00 | 75.4% | 2.7% |
| Baseten | 1.23 | 15.00 | 65.5% | 0.4% |
| Chutes | 2.46 | 15.00 | 19.9% | 0.1% |

**关键性**：真实业务的缓存命中率高达 65%–89%，导致**有效输入价仅为标价的 20%–33%**。若按标价 $3.00/M 计算输入收入，会把输入侧收入高估 3–5 倍。本模型取行业中位区间 **85% 命中率**，对应有效输入价 $0.705/M，并对该参数做敏感性。

## S-10 国内 B300 八卡整机租金（多源）

| 来源 | 报价 | 说明 | 链接 |
| --- | --- | --- | --- |
| 悍铭数据中心 | **¥265,000/月** | 8×B300、2.3TB HBM、3TB DDR5、64TB NVMe、100M 独享带宽、云南昆明 T3+ 全液冷、7×24 驻场 | <https://www.hanming.com/b300> |
| 猿界算力 | **¥188,000/月** | B300 8 卡算力租赁挂牌价 | <https://apetops.com/> |
| 至顶网（2026-07-22） | **¥190,000/月** | 报道称买断价 1450 万元，"月租19万，一年228万" | <https://www.zhiding.cn/zd-ai-lab/2026/0722/3194165.shtml> |
| 星宇智算 | **¥110,000–135,000/月** | 国内月租区间；长协 1 年 11.5 万、3 年 10.8 万、5 年 10.2 万 | <https://www.starverse-ai.com/guide/archives/7697> |
| 雪球产业调研（2026-05-21） | **¥150,000/月**（长单）；小厂报价 20–21 万 | 另载 Nebius 海外 B300 提价至 $4.3/小时，折合约 21.2 万元/月 | <https://xueqiu.com/3576712780/390638817> |

**已观测区间：¥102,000（5 年长协）– ¥265,000（现货高配）。现货/短租报价中位数约 ¥190,000。**

**对本项目的判定**：本项目给定租金 **¥350,000/月**，高于上述**全部**公开报价，约为现货中位数 19 万的 **1.84 倍**，为 3 年长协 10.8 万的 **3.24 倍**。此差额将在模型中以租金五档敏感性量化。

## S-11 出口管制与灰色渠道现状

来源：路透社经 MarketScreener 转载（2026-04-30）<https://www.marketscreener.com/news/prices-of-nvidia-s-b300-server-at-1-million-in-china-on-us-curbs-sources-say-ce7f58dbdb81f625>；The Business Times 中文版同源报道。

原文要点：
> Strong demand for AI computing equipment in China has nearly doubled prices for Nvidia's B300 servers to about 7 million yuan ($1 million) each, industry sources said, as a crackdown on chip smuggling dries up black-market supply.

英伟达官方回应原文：
> Nvidia said the B300 was restricted from sale in China, and its partners needed to be committed to strict compliance. "As systems become increasingly large and complex, unlawful diversion is a recipe for failure... **Nvidia does not provide any service or support for such systems**, and the enforcement mechanisms are rigorous and effective."

价格演变：2025 年底约 400 万元 → 2026 年 4 月约 700 万元，涨幅近一倍；美国本土标价约 55 万美元。涨价直接诱因为 2026 年 3 月美国起诉 Supermicro 联合创始人 Yih-Shyan "Wally" Liaw，指控其将约 25 亿美元含受管制 Blackwell 芯片的服务器经东南亚中转公司转售。

监管现状：
- BIS 2026-01-15 终局规则：H200 与 MI325X 由「推定拒绝」改为「逐案审查」（附 25% 关税、50% 数量上限、第三方检测、严格 KYC）；**B200/Blackwell 级维持推定拒绝**，预计在美国本土发布后 18–24 个月内不得对华出口。来源：Introl <https://introl.com/blog/bis-export-policy-h200-mi325x-china-case-by-case-2026>
- BIS 2026-05-31 指引：**只要实体总部或其最终母公司注册在 D:5 国家组（含中国）或澳门，即使接收方实体位于新加坡、阿联酋、马来西亚等第三国，仍需出口许可证。** 来源：Greenberg Traurig <https://www.gtlaw.com/en/insights/2026/6/enforcement-pause-has-limits-bis-clarifies-ongoing-license-requirement-for-advanced-computing-items-to-china-linked-entities>
- 美国众议院以 369-22 通过 Remote Access Security Act，旨在堵住「云 GPU 远程租用」绕道。来源：同 Introl 文。

**对本项目的判定**：境内可租到的 B300 必然来自非官方渠道。承租方在中国境内租用算力本身不违反中国法律，但需如实认知三项后果：(1) 英伟达明确不提供任何服务与支持，无保修、无驱动支持；(2) 供应链受查处影响，存在服务中断风险；(3) 上述 BIS 指引意味着「换到境外租」对中国总部实体同样受限，并非规避路径。本报告将其建模为月度中断危险率，见风险章。

## S-12 汇率

来源：中国外汇交易中心受权公布，2026-08-04 人民币对美元汇率中间价 **1 美元 = 6.7917 元人民币**（较前一交易日下调 19 个基点；8-03 为 6.7898，7-31 为 6.7894）。链接：<http://news.cnfol.com/zhengquanyaowen/20260804/32325212.shtml>；官方发布渠道 <https://www.chinamoney.com.cn/chinese/bkccpr/>

**关键性**：本项目收入以美元计价（token 按美元定价），成本以人民币计价（租金）。人民币升值直接压缩利润。当前 6.7917 显著低于市场惯用的 7.1–7.3 假设，若沿用旧汇率会**高估人民币收入约 4.5%**。模型将汇率列为敏感性变量。

---

## 矛盾与取舍

诚实记录调研中发现的互相矛盾之处，以及本报告的取舍理由。

| # | 矛盾 | 取舍 |
| --- | --- | --- |
| C-1 | K3 激活参数：官方模型卡为 **104B**；第三方博客 narenvadapalli.com 称 "37 Billion Active Parameters"。 | 采用官方 104B。第三方数值与「896 专家选 16 + 2 共享、MoE 每专家隐层 3072」的结构推算不符，判定为笔误。 |
| C-2 | B300 FP8 稠密算力：NVIDIA 官方表为 **5 PFLOPS**；spheron 与 vast.ai 均称 7 PFLOPS。 | 采用官方 5 PFLOPS。本模型的解码环节为访存受限，该参数不影响主结论，仅用于预填能力上界估算。 |
| C-3 | 单卡可用显存：标称 288 GB；glennklockwood 称 270 GB 可用；GPUStack 实测可见 **267.69 GiB**。 | 采用实测 267.69 GiB，最保守。 |
| C-4 | K3 许可证性质：narenvadapalli 博客称 "Modified Apache-2.0 / Open Access"；许可证原文为自定义 Kimi K3 License，Hugging Face 标记为 `license:other`。 | 以许可证原文为准，见 S-03。该博客表述错误。 |
| C-5 | 长上下文最优引擎：Openzeka 白皮书结论偏向 vLLM；GPUStack 实测在 200K 时 SGLang 反超。 | 两者测试条件不同（并发数、输入长度、是否启用 DCP），不构成矛盾。模型按上下文长度分段取各自较优实测值，并在敏感性中同时给出较劣值。 |

## 未能查证、列为假设的参数

以下参数缺乏可引用的公开来源，在模型中作为**显式假设**处理，全部纳入敏感性分析，并在报告中明确标注为推测：

| 参数 | 假设值 | 依据与不确定性 |
| --- | --- | --- |
| 押金月数 | 2 个月租金 | 国内 IDC 常见商务条款，未获本项目合同文本证实 |
| 中断月度危险率 h | 0.5% / 1.5% / 3%（三档） | 无公开统计。以 2026 年 3 月查处事件后现货价近乎翻倍作为查处强度的间接证据，取区间而非点估计 |
| 利用率爬坡曲线 | 三情景，见模型 | 取决于获客能力，属项目方自身变量，非外部事实 |
| 年化价格侵蚀率 | 0% / 20% / 40%（三档） | 依据 11 家 provider 同价竞争的市场结构定性推断，无历史序列可拟合 |
| 支付与结算费率 | 3.9% + $0.40/笔（Creem 记录商户） | 来自本项目已接入的支付通道公开费率，见仓库 `PAYMENTS_SETUP.md` |
