# TokShop 测试报告

- 测试对象：https://tokshop.xyz （Vercel 生产环境，Neon Postgres，上游 Vercel AI Gateway）
- 测试日期：2026-07-18（UTC+8）
- 测试方式：`tests/e2e.mjs` 对生产部署发起真实 HTTP 请求，29 项断言全部客观可复现
- 开发-测试循环：共 3 轮收敛（上限 20 轮）
  - 第 1 轮：29/29 通过
  - 第 2 轮：复验 29/29 通过；浏览器目检发现深色主题被未分层 CSS 覆盖（非功能缺陷），修复后重新部署
  - 第 3 轮：部署后回归 29/29 通过

## 结果总览（对应计划 10 项验收标准）

| # | 验收标准 | 断言 | 结果 |
|---|---|---|---|
| 1 | 注册/登录/会话保持 | T1 x4（注册 201、会话持久、错误密码 401、登录 200） | 通过 |
| 2 | 创建/吊销 API Key | T2 x4（创建返回 sk-tok-、列表可见、吊销 200、吊销后调用 401） | 通过 |
| 3 | /v1/models 返回价目 | T3（4 个模型均含 USD/1M 双向价格） | 通过 |
| 4 | 非流式调用真实计费 | T4 x3（200+usage、model 改写为公开 slug、按价目精确扣款） | 通过 |
| 5 | 流式 SSE 与结算 | T5 x4（SSE 头、delta+[DONE]、usage 块、结算精确） | 通过 |
| 6 | 余额不足被拒 | T6（402 insufficient_balance） | 通过 |
| 7 | 无效 Key 被拒 | T7 x2（无效 key 401、缺失 key 401） | 通过 |
| 8 | 支付 webhook 到账+幂等 | T8 x6（下单、假签名 401、验签通过、到账 $5、事件重放幂等、已支付订单不可重复入账） | 通过 |
| 9 | 用量记录与数据库一致 | T9 x2（调用次数一致、总花费与独立复算一致） | 通过 |
| 10 | 生产域名 HTTPS 可用 | T10 x2（/api/health db up、首页 200） | 通过 |

最终一轮完整输出（`tests/e2e.mjs`，29 passed / 0 failed）：

```
E2E against https://tokshop.xyz

  PASS  T10 health endpoint (db up)
  PASS  T10 homepage 200
  PASS  T1 register 201
  PASS  T1 session persists (me)
  PASS  T1 wrong password rejected
  PASS  T1 login 200
  PASS  T2 create key returns sk-tok-
  PASS  T2 key listed
  PASS  T3 /v1/models returns priced models
  PASS  T6 zero balance rejected 402
  PASS  T7 invalid key rejected 401
  PASS  T7 missing key rejected 401
  PASS  T8 checkout order created
  PASS  T8 invalid signature rejected 401
  PASS  T8 webhook accepted
  PASS  T8 balance credited $5
  PASS  T8 replay is idempotent
  PASS  T8 paid order cannot be re-credited
  PASS  T4 non-stream 200 with usage
  PASS  T4 model id rewritten to public slug
  PASS  T4 balance deducted exactly per price sheet
  PASS  T5 stream 200 SSE content-type
  PASS  T5 received delta chunks and [DONE]
  PASS  T5 usage chunk present (stream_options)
  PASS  T5 stream billed correctly
  PASS  T9 usage log count matches calls
  PASS  T9 total cost matches expected spend
  PASS  T2 revoke key
  PASS  T2 revoked key rejected 401

===== 29 passed, 0 failed =====
```

## 计费可复算取证样本（`scripts/evidence.mjs` 实测输出，任何人可重跑）

真实调用 `deepseek-v3.2`（上游 Vercel AI Gateway `deepseek/deepseek-v3.2`）：

```json
{
  "timestamp": "2026-07-18T07:22:23.636Z",
  "model": "deepseek-v3.2",
  "pricing_usd_per_1m": { "input_per_million_tokens": 0.42, "output_per_million_tokens": 0.63 },
  "response_content": "pong",
  "usage": { "prompt_tokens": 10, "completion_tokens": 2, "gateway_cost": 0.00000364 },
  "balance_before_usd": 5,
  "balance_after_usd": 4.99999454,
  "deducted_usd": 0.00000546,
  "recomputed_cost_usd": 0.00000546,
  "billing_exact_match": true
}
```

复算过程（可用 Python 验证）：

```python
input_tokens, output_tokens = 10, 2
input_price, output_price = 0.42, 0.63          # USD / 1M tokens（价目表公开值）
cost = (input_tokens * input_price + output_tokens * output_price) / 1e6
assert round(cost, 8) == 0.00000546              # 与实际扣款一致
upstream = 0.00000364                            # AI Gateway 实收成本
assert round(upstream * 1.5, 8) == 0.00000546    # 零售价 = 成本 x 1.5，毛利率 33.3%
```

## SEO/GEO 引擎验收（2026-07-18 下午追加）

- 测试对象：https://tokshop.xyz 生产环境（引擎代码本轮从 tokenshop 项目移植并适配 Drizzle/Neon 架构，引擎表独立放在 `engine` schema）
- 测试方式：`tests/seo-e2e.mjs` 对生产发起真实 HTTP 请求，21 项断言
- 开发-测试循环：共 3 轮收敛（上限 20 轮）
  - 第 1 轮：20/21（S03 RSS 无条目——首篇文章尚未生成，属冷启动时序而非缺陷）
  - 第 2 轮：21/21 通过；随后复跑暴露真实缺陷：AI 产出标题 71 字符 > 68 上限，质检直接弃稿导致该时段无产出（S12–S19 连锁 FAIL）
  - 修复：标题超长时按词边界收缩至 68 字符内（不再弃稿）+ 质检失败自动重试一次（commit dd9385d）
  - 第 3 轮：部署后 seo 21/21 + 售卖回归 29/29；再复跑一次仍 21/21 + 29/29（防偶然通过）

| 分组 | 断言 | 结果 |
|---|---|---|
| 技术基座 | S01 sitemap（动态含文章）/ S02 robots / S03 RSS / S04 llms.txt / S05 llms-full / S06 IndexNow key 根路径 | 通过 |
| 结构化数据 | S07 Organization+WebSite（首页）/ S08 Product（/pricing）/ S09 FAQPage（/docs）JSON-LD | 通过 |
| 热词引擎 | S10 无凭据 401 / S11 七 geo Google Trends 抓取 70 词 + AI 相关性打分 | 通过 |
| 内容引擎 | S12 生成并发布过质检文章（约 1000–1200 词）/ S13 IndexNow 200 / S14 WebSub 推送 | 通过 |
| 文章质量 | S15 页面 200 / S16 Article JSON-LD+canonical / S17 内链 / S18 标题 ≤70 字符 / S19 即时进 sitemap+RSS | 通过 |
| 自审 | S20 审计评分 100 且基础设施全绿 / S21 零页面问题 | 通过 |

**调度（全自动）**：GitHub Actions `tokshop-engine.yml`（amd 仓）——trends 每 30 分钟、content 每 2 小时、seo-audit/health/reconcile 每日；本轮已实测 workflow_dispatch 全任务运行 conclusion=success。Vercel 项目已配置 `CRON_SECRET` 与 `INDEXNOW_KEY`（与 Actions secret 同值）。

**对账不变量**：`/api/engine/reconcile` 每日校验 `sum(users.balance) = sum(已支付订单入账) − sum(usage_logs.cost)`，偏差 > $0.000001 记入 `engine.ops_log` 并报错。

## 边界与如实声明

1. **支付**：Creem 商户账号尚未注册（法律要求实名主体，无法由 AI 代办）。当前 webhook 到账链路已按 Creem 官方规范（HMAC-SHA256 验签、`checkout.completed` 事件）实现并通过模拟签名事件全量测试；接入真实收款只需配置 3 个环境变量并重新部署（见 README）。
2. **上游额度**：当前上游走 Vercel AI Gateway 账户额度，本轮全部测试实际消耗 < $0.01。
3. **T8 的"模拟"边界**：模拟的是 Creem 服务器发出 HTTP 请求这一动作（用与生产一致的密钥签名），验签、幂等、入账逻辑均为生产代码真实执行，无任何测试专用旁路。
