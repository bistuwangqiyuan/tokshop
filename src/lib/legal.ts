/**
 * Terms, refund and privacy documents, bilingual.
 *
 * Kept out of i18n.ts (which holds short UI strings) because these are long
 * prose documents. Every factual claim here must match what the code actually
 * does - these pages are read by payment-provider compliance reviewers and by
 * customers deciding whether to trust us with a payment.
 */

import { CONTACT_EMAIL, CONTACT_EMAIL_CN, type Locale } from "@/lib/i18n";

export type LegalSlug = "terms" | "refund" | "privacy";

export type LegalDoc = {
  title: string;
  metaDescription: string;
  updated: string;
  intro: string;
  sections: { h: string; body: string[] }[];
};

/** Last substantive review of these documents. */
export const LEGAL_UPDATED = "2026-08-01";

const OPERATOR_EN = "Wang Qiyuan (王启源), an individual operator based in China";
const OPERATOR_ZH = "王启源（个人经营者，中国）";

export const legal: Record<Locale, Record<LegalSlug, LegalDoc>> = {
  en: {
    terms: {
      title: "Terms of Service",
      metaDescription:
        "TokShop terms of service: what we sell, how prepaid credits and per-token billing work, acceptable use, payment processing and liability.",
      updated: LEGAL_UPDATED,
      intro:
        `TokShop (tokshop.xyz) is operated by ${OPERATOR_EN}. By creating an account, ` +
        "buying credits or downloading a paid document, you agree to these terms. " +
        "If you do not agree, do not use the service.",
      sections: [
        {
          h: "1. What we sell",
          body: [
            "Prepaid API credits, denominated in US dollars, that let you call an OpenAI-compatible HTTP API which relays requests to third-party open-source language models.",
            "Paid digital documents delivered instantly as a download and as an in-browser reader page.",
            "Both are digital goods. Nothing physical is shipped.",
          ],
        },
        {
          h: "2. Accounts and API keys",
          body: [
            "An account requires only an email address and a password. You are responsible for keeping both secure.",
            "API keys are shown exactly once at creation. We store only a hash and a short prefix, so we cannot recover a lost key for you - revoke it and create a new one.",
            "Treat an API key like a password. Any usage authenticated by your key is billed to your balance, including usage by anyone you share the key with.",
            "You may buy a paid document as a guest by providing an email address. If you later register with that same email, the order is automatically linked to your account.",
          ],
        },
        {
          h: "3. Acceptable use",
          body: [
            "Do not use the API for anything unlawful where you are, or to generate content that infringes intellectual property, targets minors, facilitates fraud, or produces malware.",
            "Your requests are relayed to upstream model providers whose own usage policies also apply to you. A request they refuse will be refused here too.",
            "Do not resell or redistribute our API keys, and do not redistribute paid documents. One purchase covers one buyer's own use.",
            "Do not attempt to bypass balance checks, replay payment callbacks, or probe the payment endpoints. We log and block such attempts.",
          ],
        },
        {
          h: "4. Pricing and billing",
          body: [
            "Per-model prices in US dollars per million tokens are published on the pricing page and returned by the public GET /v1/models endpoint. They are the authoritative prices.",
            "Each request costs input_tokens x input_price / 1,000,000 plus output_tokens x output_price / 1,000,000, deducted from your prepaid balance after the request completes. Streaming responses are billed on the same basis using the upstream usage report.",
            "Every call is logged with its model, token counts and cost, and is visible in your dashboard. That log is the billing record.",
            "When your balance reaches zero, API requests return HTTP 402 until you top up. We do not extend credit and never bill you beyond what you have prepaid.",
            "Prices may change. Changes apply to future requests only; they never retroactively re-price calls you have already made.",
            "Credits do not expire and carry no monthly fee. They are usage credits for this service, not a stored-value instrument, and cannot be transferred to another account or exchanged for cash except through the refund policy.",
          ],
        },
        {
          h: "5. Payment processing",
          body: [
            "International card, Apple Pay and Google Pay payments are processed by Creem, which acts as merchant of record. Creem is the seller for those transactions and collects and remits any applicable VAT, GST or sales tax. Its name may appear on your statement.",
            "Alipay and WeChat Pay payments from mainland China are processed through XunHuPay, a technical service provider; the funds are settled to the operator by Alipay or WeChat Pay directly.",
            "We never see or store your card number, Alipay credentials or WeChat credentials.",
            "US dollars are the unit of account. For Alipay and WeChat Pay the amount is converted to Chinese yuan at a published reference rate shown before you pay; the yuan figure you approve is the amount charged.",
          ],
        },
        {
          h: "6. Availability, and what we do not promise",
          body: [
            "This is a small, individually operated service. We aim for continuous availability and run automated health checks, but we do not offer a contractual uptime guarantee or service-level agreement.",
            "The service depends on upstream model providers and cloud infrastructure. If an upstream model is withdrawn, re-priced or fails, our catalog changes accordingly.",
            "Model outputs are generated by third-party models. They can be wrong, biased or out of date. Verify anything you rely on, and do not use outputs as professional, legal, medical or financial advice.",
          ],
        },
        {
          h: "7. Data sent through the API",
          body: [
            "Request content is relayed to upstream providers to produce a response. We do not store prompt or response bodies - only the token counts and cost needed for billing. See the privacy policy for the full data flow.",
            "Because content leaves our systems in order to be answered, do not send personal data, credentials or confidential material you are not permitted to disclose to a third-party processor.",
          ],
        },
        {
          h: "8. Refunds",
          body: [
            "Refunds are governed by our refund policy, which forms part of these terms.",
          ],
        },
        {
          h: "9. Suspension and termination",
          body: [
            "You may stop using the service at any time and ask us to delete your account.",
            "We may suspend or close an account that breaches these terms, is used fraudulently, or triggers a payment dispute. If we close your account without cause on your part, we refund the unused balance.",
          ],
        },
        {
          h: "10. Liability",
          body: [
            "The service is provided as is, without warranties beyond those that cannot be excluded by law.",
            "To the extent permitted by law, our total liability for any claim is limited to the greater of the amount you paid us in the twelve months before the claim, or ten US dollars. We are not liable for indirect or consequential loss, including lost profits or lost data.",
            "Nothing here limits liability for fraud or for anything else that cannot lawfully be limited. Your statutory consumer rights are unaffected.",
          ],
        },
        {
          h: "11. Changes to these terms",
          body: [
            "We may update these terms. The revision date at the top always reflects the current version, and material changes take effect for purchases made after they are published.",
          ],
        },
        {
          h: "12. Governing law and contact",
          body: [
            "These terms are governed by the laws of the People's Republic of China, without prejudice to consumer-protection rights you have where you live.",
            `Questions, refund requests and legal notices: ${CONTACT_EMAIL} or ${CONTACT_EMAIL_CN}. We reply within one business day.`,
          ],
        },
      ],
    },
    refund: {
      title: "Refund Policy",
      metaDescription:
        "TokShop refund policy: unused prepaid credits are refundable within 14 days; paid downloads are refunded on delivery failure, misdescription or duplicate charge.",
      updated: LEGAL_UPDATED,
      intro:
        "We would rather refund you than have an unhappy customer. This page says exactly " +
        "what is refundable, what is not, and how long it takes.",
      sections: [
        {
          h: "Prepaid API credits",
          body: [
            "Unused balance is refundable within 14 days of the payment. Email us the order id and we refund the unused portion to the original payment method.",
            "Credits you have already spent on API calls are not refundable, because the upstream model cost was already incurred. Your dashboard usage log shows exactly what was consumed.",
            "Example: you top up 20 USD, spend 3 USD, and ask for a refund on day 5. We refund 17 USD.",
            "After 14 days the balance stays valid and usable indefinitely, but is no longer refundable in cash.",
          ],
        },
        {
          h: "Paid digital documents",
          body: [
            "Digital documents are delivered immediately at the moment of payment. Because delivery is instant and complete, they are not returnable in the ordinary sense, and by completing checkout you ask for immediate delivery and acknowledge this.",
            "We nevertheless refund in full, within 14 days of purchase, if any of these apply: the download or reader page did not work for you and we could not fix it; the content differs materially from what the product page described; or you were charged more than once for the same order.",
            "If you are simply not happy with a document, tell us anyway. For a purchase at this price we will normally refund rather than argue.",
          ],
        },
        {
          h: "Duplicate and failed payments",
          body: [
            "A duplicate charge is refunded in full, always, with no time limit.",
            "If a payment succeeded at your bank but your balance or download did not appear, that is our problem to fix, not a refund case. Send us the order id and we settle it manually. Payment callbacks are idempotent, so a repaired order is never credited twice.",
          ],
        },
        {
          h: "How to request a refund",
          body: [
            `Email ${CONTACT_EMAIL} or ${CONTACT_EMAIL_CN} with the order id and the email address used at checkout. Nothing else is needed - no forms and no reason required for the cases listed above.`,
            "We review within one business day. Once approved, the refund is issued to the original payment method.",
            "Card and Apple Pay or Google Pay refunds are processed by Creem, our merchant of record, and typically appear in 5 to 10 business days depending on your bank. Alipay and WeChat Pay refunds are usually faster.",
            "Refunds are issued in the currency you paid in. If your bank applied a currency conversion or a foreign transaction fee, that portion is set by your bank and outside our control.",
          ],
        },
        {
          h: "Chargebacks",
          body: [
            "Please email us before filing a chargeback. A chargeback costs us a dispute fee and takes months to resolve, whereas we can usually refund you the same day.",
            "Accounts with an unresolved chargeback are suspended until it is settled.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      metaDescription:
        "TokShop privacy policy: exactly what data we store, what we never store (card numbers, prompt content), which processors we use, and how to get your data deleted.",
      updated: LEGAL_UPDATED,
      intro:
        `TokShop (tokshop.xyz) is operated by ${OPERATOR_EN}, who is the data controller. ` +
        "This page lists precisely what we store, because a vague privacy policy is worthless.",
      sections: [
        {
          h: "What we store",
          body: [
            "Account: your email address, a bcrypt hash of your password, your balance, and the account creation time. We cannot read your password.",
            "Orders: order id, amount, currency, product, status, the email address used at checkout, the payment provider's order reference, and, for paid documents, a redeem code and a download counter.",
            "API keys: a hash of the key plus its first few characters, so we can display it in a list. The key itself is never stored and cannot be recovered.",
            "Usage log: for each API call, the model, input and output token counts, the cost charged, whether it was streamed, and the timestamp.",
          ],
        },
        {
          h: "What we never store",
          body: [
            "Card numbers, Alipay credentials and WeChat credentials. Payment data is entered on the payment provider's own hosted page and never reaches our servers.",
            "The content of your prompts and the models' responses. We record token counts, not text.",
            "Any advertising identifier, cross-site tracking profile or data broker enrichment. We do not sell or share personal data, and we run no advertising.",
          ],
        },
        {
          h: "Where API request content goes",
          body: [
            "To answer a request we relay it to Vercel AI Gateway, which forwards it to the upstream provider of the model you selected. The response comes back the same way. This is the only purpose for which request content is transmitted.",
            "We do not persist that content, but the upstream providers process it under their own privacy terms, which we cannot vary on your behalf.",
            "Practical consequence: do not send personal data, secrets or confidential material through the API unless you are permitted to disclose it to a third-party processor.",
          ],
        },
        {
          h: "Cookies",
          body: [
            "tok_session: an httpOnly signed session cookie set when you sign in, valid for 7 days. Without it you cannot stay logged in.",
            "A signed download-access cookie, valid for 30 days, set after you buy a paid document so you can re-download it without re-entering your redeem code.",
            "That is all. There are no advertising or cross-site tracking cookies, and therefore no consent banner to click through.",
          ],
        },
        {
          h: "Analytics",
          body: [
            "We load Vercel Insights, which reports aggregate page-performance and traffic metrics to us. It measures page loads, not people: it builds no cross-site advertising profile and we cannot use it to identify an individual visitor.",
          ],
        },
        {
          h: "Processors we rely on",
          body: [
            "Vercel - hosting, edge network and server logs.",
            "Neon - the managed PostgreSQL database holding the account, order and usage data listed above.",
            "Creem - merchant of record for international card, Apple Pay and Google Pay payments. It receives your email address and the order amount, and independently handles payment data and tax.",
            "XunHuPay - technical service provider for Alipay and WeChat Pay from mainland China. Funds are settled by Alipay or WeChat Pay directly to the operator.",
            "Vercel AI Gateway and the upstream model providers behind the models in our catalog, for the request relay described above.",
          ],
        },
        {
          h: "How long we keep it",
          body: [
            "Account data until you ask us to delete it. Deleting your account also deletes your API keys and usage log, which cascade from the account record.",
            "Order records are kept for as long as accounting and tax rules require, even after account deletion, because we are legally obliged to be able to evidence a sale. They are then no longer linked to a live account.",
          ],
        },
        {
          h: "Your rights",
          body: [
            `Email ${CONTACT_EMAIL} or ${CONTACT_EMAIL_CN} to get a copy of your data, correct it, or have your account and its data deleted. We act within one business day and do not charge for it.`,
            "Depending on where you live you may also have the right to object to processing, to restrict it, or to complain to a data-protection authority. Ask us and we will help rather than obstruct.",
          ],
        },
        {
          h: "Security",
          body: [
            "Passwords are hashed with bcrypt. API keys are stored only as hashes. Sessions use signed httpOnly cookies. Payment callbacks are signature-verified and processed idempotently, and the domestic payment callback is additionally re-verified against the provider before any credit is applied.",
            "No system is perfectly secure. If you find a vulnerability, email us and we will fix it and credit you if you want the credit.",
          ],
        },
        {
          h: "Children and international transfers",
          body: [
            "The service is not intended for anyone under 18, and we do not knowingly collect data from children.",
            "Our infrastructure and payment providers operate internationally, so your data is processed outside your country of residence.",
          ],
        },
        {
          h: "Changes",
          body: [
            "If we change this policy the revision date above changes with it. We will not quietly start collecting something this page does not list.",
          ],
        },
      ],
    },
  },
  zh: {
    terms: {
      title: "服务条款",
      metaDescription:
        "TokShop 服务条款：销售内容、预付额度与按 token 计费规则、可接受使用政策、支付处理方与责任限制。",
      updated: LEGAL_UPDATED,
      intro:
        `TokShop（tokshop.xyz）由 ${OPERATOR_ZH} 运营。当你创建账号、购买额度或下载付费文档时，` +
        "即表示你接受本条款。如不接受，请勿使用本服务。",
      sections: [
        {
          h: "一、我们销售什么",
          body: [
            "以美元计价的预付 API 额度。凭额度可调用本站的 OpenAI 兼容 HTTP 接口，该接口会把请求转发给第三方开源大语言模型。",
            "付费数字文档，付款后即时交付，可下载文件并在线阅读。",
            "两者均为虚拟商品，不涉及任何实物发货。",
          ],
        },
        {
          h: "二、账号与 API Key",
          body: [
            "注册只需邮箱和密码，请自行妥善保管。",
            "API Key 仅在创建时完整展示一次。我们只保存其哈希值与前几位字符，因此无法为你找回丢失的 Key —— 请吊销后重新创建。",
            "请像对待密码一样对待 API Key。凡通过你的 Key 完成鉴权的调用，一律从你的余额扣费，包括你把 Key 分享给他人后产生的调用。",
            "付费文档支持游客填写邮箱直接购买。若你之后用同一邮箱注册账号，该订单会自动关联到你的账号。",
          ],
        },
        {
          h: "三、可接受使用",
          body: [
            "不得将本接口用于你所在地法律禁止的用途，不得用于生成侵犯知识产权、涉及未成年人、协助欺诈或制作恶意软件的内容。",
            "你的请求会被转发给上游模型提供方，其使用政策同样约束你。上游拒绝的请求，在本站同样会被拒绝。",
            "不得转售或分发本站 API Key，不得二次分发付费文档。一次购买仅覆盖购买者本人使用。",
            "不得试图绕过余额校验、重放支付回调或探测支付接口。此类行为会被记录并封禁。",
          ],
        },
        {
          h: "四、价格与计费",
          body: [
            "各模型每百万 token 的美元单价公示于价格页，并可通过公开接口 GET /v1/models 获取，该价格为准。",
            "单次请求费用 = 输入 token 数 × 输入单价 ÷ 1,000,000 + 输出 token 数 × 输出单价 ÷ 1,000,000，请求完成后从预付余额扣除。流式响应按上游返回的用量报告以同一口径计费。",
            "每次调用都会记录模型、token 数与费用，可在控制台查看。该日志即为计费凭据。",
            "余额为零后，API 请求返回 HTTP 402，直至充值。我们不提供任何形式的透支或赊账，绝不会向你收取超出预付金额的费用。",
            "价格可能调整，调整仅对之后的请求生效，绝不追溯重算你已完成的调用。",
            "额度长期有效、无月费。它是本服务的使用额度，不是储值工具，不可转让至其他账号，也不可兑换现金 —— 退款请依退款政策办理。",
          ],
        },
        {
          h: "五、支付处理",
          body: [
            "国际信用卡、Apple Pay 与 Google Pay 付款由 Creem 处理，Creem 以 Merchant of Record（记录商户）身份作为该笔交易的销售方，负责代收代缴相应的 VAT、GST 或销售税，你的账单上可能显示其名称。",
            "中国大陆的支付宝与微信支付由虎皮椒作为技术服务方接入，资金由支付宝或微信支付官方直接结算给经营者。",
            "我们不会看到也不会存储你的卡号、支付宝凭证或微信凭证。",
            "美元为记账本位币。支付宝与微信支付会按付款前明示的参考汇率折算为人民币，你确认的人民币金额即为实际扣款金额。",
          ],
        },
        {
          h: "六、可用性，以及我们不承诺什么",
          body: [
            "这是一个由个人运营的小型服务。我们以持续可用为目标并配有自动化健康检查，但不提供合同层面的可用性承诺或 SLA。",
            "服务依赖上游模型提供方与云基础设施。若某个上游模型下线、调价或故障，本站价目会相应变动。",
            "模型输出由第三方模型生成，可能出错、存在偏见或信息过时。请自行核实你要依赖的内容，不要将输出当作专业、法律、医疗或财务建议。",
          ],
        },
        {
          h: "七、经由接口传输的数据",
          body: [
            "为生成回复，请求内容会被转发给上游提供方。我们不存储 prompt 与回复正文，只保留计费所需的 token 数与费用。完整数据流向见隐私政策。",
            "由于内容必须离开本站才能被回答，请不要发送你无权向第三方处理者披露的个人数据、凭证或机密材料。",
          ],
        },
        {
          h: "八、退款",
          body: ["退款事宜适用本站退款政策，该政策构成本条款的一部分。"],
        },
        {
          h: "九、暂停与终止",
          body: [
            "你可随时停止使用并要求我们删除账号。",
            "若账号违反本条款、被用于欺诈或引发支付争议，我们可暂停或关闭该账号。若并非因你的原因而由我们主动关闭，未消费余额全额退还。",
          ],
        },
        {
          h: "十、责任限制",
          body: [
            "服务按现状提供，除法律不允许排除的部分外，不附带其他保证。",
            "在法律允许范围内，我们对任何索赔的赔偿总额以下列较高者为限：索赔发生前十二个月内你向我们实际支付的金额，或十美元。我们不对间接或衍生损失负责，包括利润损失与数据损失。",
            "本条不排除欺诈责任及其他法律上不可排除的责任，也不影响你的法定消费者权利。",
          ],
        },
        {
          h: "十一、条款变更",
          body: [
            "我们可能更新本条款。页首的更新日期始终指向当前版本，实质性变更对其公布之后发生的购买生效。",
          ],
        },
        {
          h: "十二、适用法律与联系方式",
          body: [
            "本条款适用中华人民共和国法律，但不影响你所在地法律赋予你的消费者保护权利。",
            `咨询、退款申请与法律通知：${CONTACT_EMAIL} 或 ${CONTACT_EMAIL_CN}，一个工作日内回复。`,
          ],
        },
      ],
    },
    refund: {
      title: "退款政策",
      metaDescription:
        "TokShop 退款政策：未消费预付额度 14 天内可退；付费下载在交付失败、内容与描述不符或重复扣款时全额退款。",
      updated: LEGAL_UPDATED,
      intro:
        "我们宁愿把钱退给你，也不愿留下一个不满意的客户。本页明确写清哪些可退、哪些不可退、以及要多久。",
      sections: [
        {
          h: "预付 API 额度",
          body: [
            "付款后 14 天内，未消费余额可退。把订单号发邮件给我们，我们按原支付渠道退还未消费部分。",
            "已通过 API 调用消费掉的额度不可退，因为对应的上游模型成本已实际发生。控制台的用量日志会精确显示消费明细。",
            "举例：你充值 20 美元，消费了 3 美元，第 5 天申请退款，我们退你 17 美元。",
            "超过 14 天后，余额继续长期有效可用，但不再支持退现。",
          ],
        },
        {
          h: "付费数字文档",
          body: [
            "数字文档在付款瞬间即时交付。由于交付即时且完整，一般意义上不存在退货；你完成结账即表示要求立即交付并知悉这一点。",
            "但出现下列任一情形，购买后 14 天内我们全额退款：下载或在线阅读无法正常使用且我们未能修好；内容与商品页描述存在实质性不符；同一订单被重复扣款。",
            "如果你只是觉得文档不值，也请直接告诉我们。以这个价位的商品而言，我们通常会直接退款而不与你争辩。",
          ],
        },
        {
          h: "重复扣款与支付异常",
          body: [
            "重复扣款一律全额退还，不设时间限制。",
            "如果银行侧已扣款成功，但余额未到账或下载未开通，这属于我们要修的故障，而非退款事项。把订单号发给我们，我们手工结算。支付回调是幂等的，补单绝不会重复入账。",
          ],
        },
        {
          h: "如何申请退款",
          body: [
            `发邮件到 ${CONTACT_EMAIL} 或 ${CONTACT_EMAIL_CN}，写明订单号与结账时使用的邮箱即可。无需填表，上述情形也无需说明理由。`,
            "我们在一个工作日内审核。通过后按原支付渠道退款。",
            "信用卡、Apple Pay 与 Google Pay 的退款由记录商户 Creem 处理，通常 5 至 10 个工作日到账，具体取决于你的发卡行。支付宝与微信支付退款通常更快。",
            "退款按你付款时的币种退还。若你的银行收取了汇率转换费或跨境交易费，该部分由银行规则决定，非我们所能控制。",
          ],
        },
        {
          h: "关于拒付（Chargeback）",
          body: [
            "请先发邮件给我们，再考虑发起拒付。拒付会让我们承担争议费用且要数月才能处理完，而我们通常当天就能把钱退给你。",
            "存在未结拒付的账号会被暂停，直至争议处理完毕。",
          ],
        },
      ],
    },
    privacy: {
      title: "隐私政策",
      metaDescription:
        "TokShop 隐私政策：逐项列明我们存储什么、绝不存储什么（卡号、prompt 正文）、使用哪些处理方，以及如何删除你的数据。",
      updated: LEGAL_UPDATED,
      intro:
        `TokShop（tokshop.xyz）由 ${OPERATOR_ZH} 运营，运营者即数据控制者。` +
        "本页逐项列出我们究竟存了什么 —— 含糊其辞的隐私政策毫无价值。",
      sections: [
        {
          h: "我们存储什么",
          body: [
            "账号：邮箱地址、密码的 bcrypt 哈希、余额、注册时间。我们无法读取你的密码。",
            "订单：订单号、金额、币种、商品、状态、结账时填写的邮箱、支付方的订单参考号；付费文档另有兑换码与下载次数计数。",
            "API Key：Key 的哈希值与前几位字符（用于在列表中展示）。Key 本身不存储，也无法找回。",
            "用量日志：每次调用的模型、输入与输出 token 数、扣费金额、是否流式、时间戳。",
          ],
        },
        {
          h: "我们绝不存储什么",
          body: [
            "卡号、支付宝凭证、微信凭证。支付信息在支付方自有的托管页面上填写，从不经过我们的服务器。",
            "你的 prompt 正文与模型回复正文。我们只记录 token 数，不记录文本。",
            "任何广告标识符、跨站追踪画像或数据商补充信息。我们不出售、不共享个人数据，也不投放广告。",
          ],
        },
        {
          h: "接口请求内容流向哪里",
          body: [
            "为生成回复，请求会被转发至 Vercel AI Gateway，再由其转发给你所选模型的上游提供方，回复沿同一路径返回。这是请求内容被传输的唯一目的。",
            "我们不持久化这些内容，但上游提供方会依其各自的隐私条款处理，我们无法代你更改这些条款。",
            "实际含义：除非你有权向第三方处理者披露，请不要通过接口发送个人数据、密钥或机密材料。",
          ],
        },
        {
          h: "Cookie",
          body: [
            "tok_session：登录时设置的 httpOnly 签名会话 Cookie，有效期 7 天。没有它就无法保持登录状态。",
            "下载访问 Cookie：购买付费文档后设置的签名 Cookie，有效期 30 天，便于你重复下载而无需再次输入兑换码。",
            "仅此两项。没有广告或跨站追踪 Cookie，因此也不需要弹窗让你点同意。",
          ],
        },
        {
          h: "分析统计",
          body: [
            "我们加载了 Vercel Insights，用于向我们汇总页面性能与访问量指标。它统计的是页面加载而非人：不构建跨站广告画像，我们也无法用它识别某位具体访客。",
          ],
        },
        {
          h: "我们依赖的处理方",
          body: [
            "Vercel —— 托管、边缘网络与服务器日志。",
            "Neon —— 存放上述账号、订单与用量数据的托管 PostgreSQL 数据库。",
            "Creem —— 国际信用卡、Apple Pay 与 Google Pay 的记录商户。它会获得你的邮箱与订单金额，并独立处理支付数据与税务。",
            "虎皮椒 —— 中国大陆支付宝与微信支付的技术服务方。资金由支付宝或微信支付官方直接结算给经营者。",
            "Vercel AI Gateway 及本站价目中各模型背后的上游提供方 —— 用于上述请求转发。",
          ],
        },
        {
          h: "保留期限",
          body: [
            "账号数据保留至你要求删除为止。删除账号会同时删除你的 API Key 与用量日志（随账号记录级联删除）。",
            "订单记录会按会计与税务规定要求的期限保留，即使账号已删除也是如此 —— 我们有法定义务能够证明一笔交易的存在。此后这些记录不再关联到任何在用账号。",
          ],
        },
        {
          h: "你的权利",
          body: [
            `发邮件到 ${CONTACT_EMAIL} 或 ${CONTACT_EMAIL_CN}，即可获取你的数据副本、更正数据，或删除账号及其数据。我们在一个工作日内处理，不收取任何费用。`,
            "视你所在地法律，你可能还有权反对处理、限制处理，或向数据保护机构投诉。请直接告诉我们，我们会协助而不是设障。",
          ],
        },
        {
          h: "安全",
          body: [
            "密码使用 bcrypt 哈希存储，API Key 仅存哈希，会话使用签名 httpOnly Cookie。支付回调经签名校验并幂等处理，国内支付回调在入账前还会额外向支付方回查核对。",
            "没有系统是绝对安全的。若你发现漏洞，请发邮件告知，我们会修复，并在你愿意的情况下致谢。",
          ],
        },
        {
          h: "未成年人与跨境传输",
          body: [
            "本服务不面向未满 18 岁人士，我们不会在知情情况下收集儿童数据。",
            "我们的基础设施与支付方在多国运营，因此你的数据会在你居住国之外被处理。",
          ],
        },
        {
          h: "变更",
          body: [
            "本政策若有变更，页首的更新日期会同步变更。我们不会在不更新本页的情况下悄悄开始收集新的数据。",
          ],
        },
      ],
    },
  },
};
