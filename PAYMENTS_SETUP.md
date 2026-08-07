# 支付开户与上线清单

这份清单只列**需要人去做、代码做不了**的事（KYC、开户、填环境变量）。代码侧的两条支付通道已经写好，任一通道的环境变量填齐即自动启用，未填则该通道自动隐藏，不影响站点其余部分。

经营主体：王启源，中国北京市海淀区清河小营东路 12 号（邮编 100192），个人经营。收款币种以美元为记账本位币，国内通道按 `CNY_PER_USD` 折算人民币。

---

## 一、前置条件（已完成）

Creem 官方审核检查表逐条对照，站点侧已全部满足，全部中英双语：

| 检查项 | 现状 |
| --- | --- |
| 隐私政策与服务条款 | https://tokshop.xyz/terms · /refund · /privacy（及 `/zh/` 版本） |
| 可接受使用政策（AUP） | https://tokshop.xyz/aup · https://tokshop.xyz/zh/aup |
| 客服邮箱在网站可见 | 每页页脚 + 独立联系页 https://tokshop.xyz/contact |
| 商户身份与地址 | 每页页脚、每个法务页顶部、Organization JSON-LD 均含姓名与完整地址 |
| 定价公开可见 | https://tokshop.xyz/pricing（实时价目）与 /downloads（$1.00 明码） |
| 商品已上线可购买 | /downloads 支持**游客填邮箱直接结账**，审核员无需注册即可走到真实收银台 |
| 无虚假信息 | 站内无评价、无用户数、无星级、无 SLA 承诺 |
| AI 合规 | AUP 首节声明独立转售、与各模型开发方无附属关系；目录仅文本模型，**无图像/视频生成，故不需要接 Moderation API** |

审核时如被问到「你卖什么」，标准答复：面向开发者的 OpenAI 兼容 API 额度（SaaS）与自有数字文档（ebook），均为即时交付的虚拟商品。

> **最常见的拒绝原因是邮箱不一致。** Creem 后台 Settings → Business Details 的支持邮箱必须是 `support@tokshop.xyz`，与网站页脚一致；该地址已通过 DNS 转发到 `mingxinai@agentmail.to`。

---

## 二、Creem（全球通道：信用卡 / Apple Pay / Google Pay）

用途：覆盖欧美与全球。Creem 是 Merchant of Record，全球 VAT/GST/销售税由它代收代缴，你不需要在任何国家做税务登记。

费率 3.9% + $0.40/笔；新账户前 €1,000 收入 0% 手续费。

### 当前进度（2026-08-07 实测）

- [x] 账号已注册（王启源 / 个人）
- [x] **Test Mode** API Key + Webhook 已写入 Vercel Production
- [x] 生产 `availableRails()` 含 `creem`；`/downloads` 可建单并跳转 Creem 测试收银台（URL 含 `/test/`，**尚未收真钱**）
- [ ] KYC / 店铺审核通过（Creem 后台确认 Account / Store 为 Approved）
- [ ] 换成 **live** Key + live Webhook Secret，设 `CREEM_TEST_MODE=false`，redeploy 后收真钱

**下一步只剩一件事：Creem 审核通过后切 live。** 测试链路已通，不必再等代码。

### 开户步骤（备查）

1. 注册 https://creem.io
2. Business Details：以**个人（Individual）**身份提交，网站填 `https://tokshop.xyz`
3. KYC 身份核验（由第三方 Sumsub 执行）
   - 优先使用**护照**，识别通过率高于身份证
   - 所有填写信息必须与证件完全一致
   - 若之前在别处做过 Sumsub 验证，可复用 Sumsub ID 避免重复上传
4. Payout Account：**个人身份只能绑支付宝**（企业身份才能绑对公银行卡）
   - 支付宝账户的实名姓名必须与 KYC 身份**严格一致**，否则提现会被拒
5. 等待 Creem 团队审核，通常 24–48 小时
6. 审核通过后创建 **live** Webhook：
   - URL：`https://tokshop.xyz/api/webhooks/creem`
   - 记下 Webhook Signing Secret

### 测试模式（审核期间就能做）

Test Mode 与 live 完全隔离：独立 API Key、独立商品、独立 Webhook。侧边栏底部打开 **Test Mode** 开关后：

1. Developers → 复制 **Test** API Key（形如 `creem_test_…`）
2. Developers → Webhooks → 新建测试 Webhook  
   - URL：`https://tokshop.xyz/api/webhooks/creem`  
   - 事件至少勾选：`checkout.completed`、`refund.created`、`dispute.created`  
   - 记下测试环境的 Signing Secret
3. 把下面三个值发给我（或直接写进 Vercel Production，然后告诉我已写入）：

| 环境变量 | 值 |
| --- | --- |
| `CREEM_API_KEY` | Test Mode 的 API Key |
| `CREEM_WEBHOOK_SECRET` | Test Mode 的 Webhook Signing Secret（会覆盖现有测试密钥） |
| `CREEM_TEST_MODE` | 不要填，或填 `true`（**切勿填 `false`**，否则会打到 live API） |

收到后我会：写入环境变量 → 重新部署 → 用测试卡跑通登录充值、游客买下载、交付页、兑换码找回；证据写进 `TEST_REPORT.md`。

### 审核通过后要交给我的三个值（正式收款）

| 环境变量 | 从哪里取 |
| --- | --- |
| `CREEM_API_KEY` | Creem 后台关掉 Test Mode → Developers → API Key（**live**） |
| `CREEM_WEBHOOK_SECRET` | live Webhook 的签名密钥（在 live 模式下新建，URL 同上） |
| `CREEM_TEST_MODE` | 填 `false`（不填或填其他值都会走测试环境，收不到真钱） |

### 提现须知

- 余额满 $50 才能提现；提现费 $7 或 1% 取高，所以**建议攒到 $200 以上再提**（费率摊到 3.5% 以下）
- 支付宝单笔上限 5 万人民币，年度 30–60 万人民币
- 资金在放款前会被风控保留 7–12 天

---

## 三、虎皮椒（国内通道：支付宝 / 微信支付）

用途：覆盖中国大陆用户。Creem 的结账页**不支持支付宝和微信**，而国内用户多数只有银联卡或花呗，所以这条通道是中国市场的必需项。

费率：开户费约 118 元 + 平台通道费 1–2% + 支付宝/微信官方 0.38–0.6%。**没有固定手续费**，所以 ¥7.3（约 $1）这种小额订单的实际成本约 ¥0.19（2.6%），远优于 Creem 的 $0.40 固定费（$1 订单要扣 44%）。这也是低价引流商品的主力通道。

### 开户步骤

1. 注册 https://www.xunhupay.com （备选：https://www.yishoumi.cn）
2. 缴开户费，创建网站应用，网站地址填 `https://tokshop.xyz`
3. 提交资料：
   - 微信侧：身份证、手机号、**本人**银行卡、网站地址
   - 支付宝侧：支付宝实名认证账号（未被清退过）
4. 人工审核（微信侧约 30 分钟，支付宝侧约 5 分钟，工作时间内）
5. 在应用配置里填回调地址：`https://tokshop.xyz/api/webhooks/xunhupay`
6. 记下 APPID 与 APPSECRET（微信、支付宝可能是两套独立应用，则两套都要）

### 需要交给我的值

| 环境变量 | 说明 |
| --- | --- |
| `XUNHU_APPID` / `XUNHU_APPSECRET` | 主应用（通常是微信侧） |
| `XUNHU_ALIPAY_APPID` / `XUNHU_ALIPAY_APPSECRET` | 支付宝侧，若为独立应用则填；不填则支付宝走主应用 |
| `CNY_PER_USD` | 美元兑人民币折算率，不填默认 7.3 |

### 必须知道的风险（如实告知）

- **审核可能不通过**：TokShop 提供的是境外大模型 API 中转，属于国内支付风控相对敏感的类目。如实申报为「开发者 API 服务与技术文档」，不要美化描述。
- **通过后仍可能被关停**：第三方聚合服务商本身受微信/支付宝风控约束，存在后续接口被关闭的可能。
- **服务商风险**：资金由微信/支付宝官方直接清算到你本人账户，服务商不碰资金，这一点是安全的；但服务商跑路会导致接口失效，需要换服务商。
- **代码已做隔离**：两条通道各自独立开关。国内通道挂掉时，`/downloads` 与充值页会自动只显示 Creem 通道，不会报错、不影响下单。

### 税务（如实告知）

- Creem 是 Merchant of Record，它是那些交易的销售方，税由它代收代缴，你只需为**提现所得**申报个人所得。
- 虎皮椒**不是** MoR。经它收到的款项属于你个人的经营所得，需要你自行申报纳税。
- 结算节奏：微信侧 D+1 结算到银行卡（可在「微信支付商家助手」小程序里开自动提现）；支付宝侧实时到支付宝账户。

---

## 四、把值交给我之后：一条命令自动接通

拿到 Key 后，写入 Vercel 环境变量并重新部署，然后跑：

```bash
CREEM_API_KEY=creem_test_xxx CREEM_WEBHOOK_SECRET=xxx npm run creem:activate
```

`scripts/creem-activate.mjs` 会自动完成：

1. 用 Key 直连 Creem API 验证有效性，并**按 `creem_test_` 前缀自动判定** test / live，选对 base URL
2. 读取线上价目，确认部署侧已点亮 Creem 通道（能区分「Key 无效」与「Key 还没写进 Vercel」两种失败）
3. 驱动线上真实结账接口，把**全部 6 个充值档位（saas 税类）与文档商品（ebook 税类）**在 Creem 侧建好，避免第一个真实客户成为第一个建商品的人
4. 交叉核对环境：本地 Key 是 test 但线上返回 live 收银台链接时会直接报错（这种不一致会让所有真实支付静默失败）
5. 验证 Webhook：伪造签名必须被 401 拒绝；**测试模式**下再发一条真实签名事件，断言订单结算且重放幂等
6. 打印一条 $1 文档的收银台链接，供你人工付款验收

安全边界：真实签名的结算模拟**只在测试模式执行**。live 模式下伪造一笔已支付订单会污染真实账目，脚本会自动跳过，改由你真实自购 $1 验证。

## 五、只有一条通道能开怎么办

不阻塞上线。两条通道互不依赖：

- 只有 Creem：全球用户可付，中国用户需用支持境外支付的卡。站点正常赚钱。
- 只有虎皮椒：中国用户可付，海外用户看不到支付方式。
- 一条都没有：`/api/checkout` 仍会创建 pending 订单并提示联系客服，站点不报错。

## 六、环境变量总表

完整模板见 [`.env.example`](.env.example)（只含变量名，不含密钥）。

| 变量 | 必填 | 默认 | 用途 |
| --- | --- | --- | --- |
| `CREEM_API_KEY` | 开 Creem 通道必填 | 无 | Creem API 鉴权；不填则该通道隐藏 |
| `CREEM_WEBHOOK_SECRET` | 开 Creem 通道必填 | 无 | Webhook HMAC 验签；不填则一切回调被拒 |
| `CREEM_TEST_MODE` | 上线时必填 `false` | 测试环境 | 非 `false` 一律走 test-api，收不到真钱 |
| `XUNHU_APPID` | 开国内通道必填 | 无 | 虎皮椒应用 ID |
| `XUNHU_APPSECRET` | 开国内通道必填 | 无 | 虎皮椒签名密钥 |
| `XUNHU_ALIPAY_APPID` | 否 | 回落到主应用 | 支付宝侧独立应用 |
| `XUNHU_ALIPAY_APPSECRET` | 否 | 回落到主应用 | 支付宝侧独立应用密钥 |
| `CNY_PER_USD` | 否 | `7.3` | 国内通道的美元折人民币汇率 |
| `DOWNLOAD_TOKEN_SECRET` | 否 | 回落到 `AUTH_SECRET` | 下载访问 Cookie 与交付页回跳签名 |
| `AGENTMAIL_API_KEY` | 否 | 无 | 结算后自动发收据/兑换码；不填则仅站内交付 |
| `AGENTMAIL_INBOX_ID` | 否 | `mingxinai@agentmail.to` | AgentMail 内部发件收件箱；公开客服地址 `support@tokshop.xyz` 转发至此 |
| `AGENTMAIL_WEBHOOK_SECRET` | 开客服自动回复必填 | 无 | AgentMail/Svix 入站验签（`whsec_…`） |

### AgentMail 客服自动回复（可选、无人值守）

1. 在 https://console.agentmail.to 为 `mingxinai@agentmail.to` 建 Webhook  
   - URL：`https://tokshop.xyz/api/webhooks/agentmail`  
   - 事件：`message.received`  
2. 把 Signing Secret 写入 `AGENTMAIL_WEBHOOK_SECRET`，API Key 写入 `AGENTMAIL_API_KEY`  
3. 效果：来信若含订单 UUID 或 `TSK-` 兑换码，自动回查并回复状态；否则回一条说明「本人仍会阅读」的交接信

### 软件侧已就绪、仍等人开户的清单（2026-08-06）

| 项 | 状态 |
| --- | --- |
| 双轨结账 / webhook / 退款回收 | 代码完成 |
| 结算后收据邮件（AgentMail） | 代码完成；待填 `AGENTMAIL_API_KEY` |
| `/about` 中英页、支付健康探针、`.env.example` | 代码完成 |
| `npm run payments:golive` | 拿到 Creem Key 后一键激活 |
| Creem KYC / Test Key | **等人**（见第二节） |
| Creem live 收款 | **等人**审核通过后换 Key |
| 虎皮椒开户 | **等人**（见第三节）；不过审不阻塞全球卡收款 |

拿到 Key 后：写入 Vercel → 重新部署 → `npm run payments:golive`（或 `npm run creem:activate`）。
