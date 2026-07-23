# TokShop — 大模型 Token 全自动售卖系统

生产地址：**https://tokshop.xyz**（中文版：https://tokshop.xyz/zh ）｜ 代码仓库：https://github.com/bistuwangqiyuan/tokshop

联系方式：mingxinai@agentmail.to ｜ 13426086861@139.com

一个 OpenAI 兼容的大模型 Token 零售平台，实现"注册 → 充值 → 发 API Key → 调用 → 按 token 计费扣款"的全自动闭环，全程无人工干预。依据《国产开源大模型 Token 全自动化售卖系统方案报告》中 F1（自建 OpenAI 兼容 API 零售）渠道落地。

## 架构

```
客户 (OpenAI SDK / curl)
   │  Bearer sk-tok-...
   ▼
Next.js on Vercel (tokshop.xyz)
   ├─ /v1/chat/completions   OpenAI 兼容代理（流式+非流式），鉴权→余额校验→转发→按 usage 扣费
   ├─ /v1/models             公开价目（USD / 1M tokens）
   ├─ /api/*                 注册/登录/Key 管理/用量/充值/webhook
   ├─ Neon Postgres          用户、Key、模型价目、用量日志、订单、webhook 幂等表
   ├─ Vercel AI Gateway      上游模型（DeepSeek/GLM/Kimi/Qwen），OIDC 自动鉴权
   └─ Creem (MoR)            收款，webhook 验签自动到账
```

## 技术栈

- Next.js 16 (App Router, TypeScript) + Tailwind CSS 4，部署于 Vercel
- 国际化：英文站点在根路径，中文站点在 `/zh` 子路径（首页/价格/文档/登录/注册/控制台），带 hreflang 互链与语言切换
- Neon Postgres（Vercel Marketplace 集成，自动注入 `DATABASE_URL`）+ Drizzle ORM
- 认证：邮箱+密码（bcrypt）+ JWT httpOnly cookie（jose）
- 上游：Vercel AI Gateway（优先 `AI_GATEWAY_API_KEY`，否则用部署自带 OIDC token，零配置）
- 支付：Creem（Merchant of Record，代扣全球税费）；未配置 API key 时订单仍可创建（pending），配置后自动出结账页

## 计费模型

- 余额为预付 USD，`numeric(16,8)` 精度
- 单次调用成本 = `input_tokens × input_price/1M + output_tokens × output_price/1M`
- 零售价 = AI Gateway 成本价 × 1.5（`scripts/seed.mjs` 从网关实时拉取成本价并校验模型可用性）
- 余额 ≤ 0 → `402 insufficient_balance`；无效/吊销 Key → `401`
- 流式请求强制向上游带 `stream_options.include_usage`，在流结束时结算，保证计量不丢失

## 本地开发

```bash
npm install
vercel link && vercel env pull .env.local   # 拉取 DATABASE_URL 等
npm run db:push                              # 同步 schema 到 Neon
npx dotenv -e .env.local -- npm run db:seed  # seed 模型价目（会调 AI Gateway 校验）
npm run dev
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Neon 连接串（Marketplace 集成自动注入） |
| `AUTH_SECRET` | JWT 签名密钥（随机 64 hex） |
| `CREEM_WEBHOOK_SECRET` | Creem webhook HMAC 验签密钥 |
| `CREEM_API_KEY` | Creem API key（未设置时结账降级为 pending 订单） |
| `CREEM_TEST_MODE` | 默认 test；设为 `false` 走 live `api.creem.io` |
| `AI_GATEWAY_API_KEY` | 可选；不设则用 Vercel OIDC token |
| `APP_URL` | `https://tokshop.xyz` |

## 测试

```bash
BASE_URL=https://tokshop.xyz CREEM_WEBHOOK_SECRET=... node tests/e2e.mjs
```

29 项断言覆盖：注册/登录/会话、Key 生命周期、价目接口、真实上游调用（非流式+流式）的精确计费复算、余额不足 402、无效 Key 401、webhook 验签/到账/幂等（事件级+订单级双层）、用量账单一致性、生产域名可用性。详见 `TEST_REPORT.md`。

## 切换 Creem 正式收款（唯一人工步骤）

1. 注册 https://creem.io 并完成商户审核（法律要求实名主体，无法自动化）
2. Dashboard → Developers 获取 live API key 与 webhook secret
3. Webhook URL 配置为 `https://tokshop.xyz/api/webhooks/creem`
4. 更新 Vercel 环境变量：`CREEM_API_KEY`（live key）、`CREEM_WEBHOOK_SECRET`（Creem 提供的值）、`CREEM_TEST_MODE=false`
5. `vercel deploy --prod` 重新部署即可，代码无需改动

## 切换自有推理端点（脱离 AI Gateway）

上游是任何 OpenAI 兼容端点即可：设 `AI_GATEWAY_BASE_URL=https://你的vLLM网关/v1`、`AI_GATEWAY_API_KEY=你的密钥`，并把 `models.upstream_id` 更新为你端点上的模型名。

## 运维

- 健康检查：`GET /api/health`（含数据库连通性），可接 Uptime Kuma 等监控
- 用量对账：`usage_logs` 表逐条可审计；订单在 `orders`，webhook 原始报文留存于 `webhook_events`
- 出金审批等资金操作保留人工双确认（按方案报告 H2 条款）
