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
   ├─ /api/*                 注册/登录/Key 管理/用量/充值/结账/webhook/付费下载
   ├─ Neon Postgres          用户、Key、模型价目、用量日志、订单、webhook 幂等表
   ├─ Vercel AI Gateway      上游模型（DeepSeek/GLM/Kimi/Qwen），OIDC 自动鉴权
   ├─ Creem (MoR)            全球卡 / Apple Pay / Google Pay，HMAC 验签自动到账
   └─ 虎皮椒                  支付宝 / 微信支付（国内），MD5 验签 + 回查核对后到账
```

## 技术栈

- Next.js 16 (App Router, TypeScript) + Tailwind CSS 4，部署于 Vercel
- 国际化：英文站点在根路径，中文站点在 `/zh` 子路径（首页/价格/文档/博客/登录/注册/控制台），带 hreflang 互链与语言切换；博客文章发布时自动翻译中文版
- SEO/GEO 引擎：热词追踪 → 答案优先文章生成（TL;DR/FAQ/问句 H2）→ 对照实时价目的事实核查 QC → 中英双语发布 → IndexNow/WebSub 推送；每日自审（SEO 分 + GEO 分入库）+ GitHub Actions 每日 34 项 e2e 与 Lighthouse 评分（本轮 7/7 URL SEO=100，详见 `TEST_REPORT.md`）
- Neon Postgres（Vercel Marketplace 集成，自动注入 `DATABASE_URL`）+ Drizzle ORM
- 认证：邮箱+密码（bcrypt）+ JWT httpOnly cookie（jose）
- 上游：Vercel AI Gateway（优先 `AI_GATEWAY_API_KEY`，否则用部署自带 OIDC token，零配置）
- 支付：两条互相独立的通道，各自由环境变量单独启用，任一条不可用不影响另一条与整站
  - Creem（Merchant of Record，代扣全球税费）：信用卡、Apple Pay、Google Pay
  - 虎皮椒（技术服务方，资金由支付宝/微信官方直接结算）：支付宝、微信支付，按 `CNY_PER_USD` 折算人民币
  - 两条通道都只做「建单后跳转对方托管页」，本站不渲染收银台、不接触卡号或钱包凭证
- 商品：预付 API 额度（`$1/5/10/20/50/100`，其中 `$1` 每账号限一次）与 `$1` 付费数字文档
- 付费下载：游客填邮箱即可购买，凭「会话 / 签名 Cookie / 兑换码」三种凭证之一取件；注册或登录时自动把同邮箱的游客订单绑定到账号
- 结算：`settleOrder` 用单条 CTE 语句完成「订单转已付 + 余额入账」，规避 neon-http 无交互事务的不原子问题；退款与争议走对称的 `reverseOrder` 回收余额或吊销下载权

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
| `CREEM_WEBHOOK_SECRET` | Creem webhook HMAC 验签密钥；不设则所有回调被拒 |
| `CREEM_API_KEY` | Creem API key（未设置时该通道隐藏，结账降级为 pending 订单） |
| `CREEM_TEST_MODE` | 默认 test；设为 `false` 走 live `api.creem.io` |
| `XUNHU_APPID` / `XUNHU_APPSECRET` | 虎皮椒主应用（通常是微信侧）；不设则该通道隐藏 |
| `XUNHU_ALIPAY_APPID` / `XUNHU_ALIPAY_APPSECRET` | 支付宝侧独立应用；不设则支付宝回落到主应用 |
| `CNY_PER_USD` | 国内通道折算汇率，默认 `7.3` |
| `DOWNLOAD_TOKEN_SECRET` | 下载访问 Cookie 与交付页回跳签名；不设回落到 `AUTH_SECRET` |
| `AGENTMAIL_API_KEY` | 可选；结算后发收据/兑换码，并驱动客服自动回复 |
| `AGENTMAIL_INBOX_ID` | 可选；默认 `mingxinai@agentmail.to` |
| `AGENTMAIL_WEBHOOK_SECRET` | 可选；入站邮件 Svix 验签（`/api/webhooks/agentmail`） |
| `AI_GATEWAY_API_KEY` | 可选；不设则用 Vercel OIDC token |
| `APP_URL` | `https://tokshop.xyz` |

变量名模板见 [`.env.example`](.env.example)。开户与 KYC 是唯一无法自动化的环节，所需资料、风险与税务口径见 [`PAYMENTS_SETUP.md`](PAYMENTS_SETUP.md)。拿到 Key 后跑 `npm run payments:golive`。

## 测试

```bash
# 售卖与支付链路
BASE_URL=https://tokshop.xyz CREEM_WEBHOOK_SECRET=... node tests/e2e.mjs
# SEO/GEO（基础设施、JSON-LD、hreflang、内容引擎、翻译、法务页与下载页、审计 SEO=100 + GEO=100）
BASE_URL=https://tokshop.xyz CRON_SECRET=... INDEXNOW_KEY=... node tests/seo-e2e.mjs
# 外部 Lighthouse SEO 评分（要求全部 100）
BASE_URL=https://tokshop.xyz node scripts/lighthouse.mjs
```

售卖链路断言覆盖：注册/登录/会话、Key 生命周期、价目接口、真实上游调用（非流式+流式）的精确计费复算、余额不足 402、无效 Key 401、webhook 验签/到账/幂等（事件级+订单级双层）、用量账单一致性、生产域名可用性，以及支付部分的 `$1` 每账号限一次、游客下载订单无 userId、注册后自动关联、未授权下载 401、兑换码鉴权与 Cookie 免密复下、虎皮椒错误签名一律非 success、退款回收余额。详见 `TEST_REPORT.md`。

以上三套在 GitHub Actions 每日自动运行（`seo-geo-audit.yml` 审计评分、`engine-scheduler.yml` 引擎调度）。

## 开通正式收款（唯一人工步骤）

代码侧已完成。完整资料清单、风险与税务口径见 [`PAYMENTS_SETUP.md`](PAYMENTS_SETUP.md)。

**当前进度（2026-08-06）**：软件侧已补齐收据邮件、About 页、支付健康探针与 `payments:golive`。Creem 账号已注册，KYC / 店铺审核仍须本人完成；生产 `availableRails()` 在 Key 写入前为空。虎皮椒尚未开户（不阻塞全球卡收款）。

摘要：

1. Creem（https://creem.io ）：审核期间打开侧边栏 Test Mode，取 test `CREEM_API_KEY` + 测试 Webhook Secret；审核通过后换 live Key，设 `CREEM_TEST_MODE=false`，Webhook 仍填 `https://tokshop.xyz/api/webhooks/creem`
2. 虎皮椒（https://www.xunhupay.com ，备选易收米）：提交身份证、手机号、本人银行卡与网站地址，回调填 `https://tokshop.xyz/api/webhooks/xunhupay`，取 `XUNHU_APPID` / `XUNHU_APPSECRET`（如支付宝为独立应用则另取一套）
3. 写入 Vercel 环境变量后重新部署，再跑一条命令自动接通与自检：

```bash
CREEM_API_KEY=... CREEM_WEBHOOK_SECRET=... npm run creem:activate
```

该脚本按 Key 前缀自动判定 test/live、在 Creem 侧建好全部商品与税类、交叉核对环境是否与 `CREEM_TEST_MODE` 一致、验证 Webhook 验签与幂等，并打印一条可人工付款的收银台链接。代码无需改动。

合规页面（支付方审核的硬性检查项）已全部上线，中英双语：`/terms`、`/refund`、`/privacy`、`/aup`（可接受使用政策）、`/contact`（含经营者姓名与经营地址）。经营者身份与地址同时出现在每页页脚与 Organization JSON-LD 中。

## 切换自有推理端点（脱离 AI Gateway）

上游是任何 OpenAI 兼容端点即可：设 `AI_GATEWAY_BASE_URL=https://你的vLLM网关/v1`、`AI_GATEWAY_API_KEY=你的密钥`，并把 `models.upstream_id` 更新为你端点上的模型名。

## 运维

- 健康检查：`GET /api/health`（含数据库连通性），可接 Uptime Kuma 等监控
- 用量对账：`usage_logs` 表逐条可审计；订单在 `orders`，webhook 原始报文留存于 `webhook_events`
- 出金审批等资金操作保留人工双确认（按方案报告 H2 条款）
