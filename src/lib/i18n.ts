/**
 * Lightweight i18n: English at the root URLs, Chinese under /zh.
 * Shared by server pages and client components (dictionary is small).
 */

export type Locale = "en" | "zh";

export const LOCALES: Locale[] = ["en", "zh"];

export const CONTACT_EMAIL = "mingxinai@agentmail.to";
export const CONTACT_EMAIL_CN = "13426086861@139.com";

/** Map a canonical (English) path to its URL in the given locale. */
export function localePath(locale: Locale, path: string): string {
  if (locale === "en") return path;
  return path === "/" ? "/zh" : `/zh${path}`;
}

export const dict = {
  en: {
    nav: {
      pricing: "Pricing",
      docs: "Docs",
      blog: "Blog",
      signIn: "Sign in",
      getKey: "Get API Key",
    },
    footer: {
      tagline: "TokShop · OpenAI-compatible token marketplace",
      contact: "Contact",
      docs: "Docs",
      pricing: "Pricing",
      blog: "Blog",
    },
    home: {
      heroLine1: "Open-source LLM tokens.",
      heroLine2: "Pay as you go.",
      heroSub:
        "One OpenAI-compatible API for DeepSeek, GLM, Qwen and Kimi. Transparent per-token pricing, instant API keys, no subscription, no minimum spend.",
      ctaKey: "Get your API key",
      ctaDocs: "Read the docs",
      codeComment: "# Works with any OpenAI SDK",
      pricingTitle: "Pricing",
      pricingSub: "USD per 1M tokens. Billed per request, down to the token.",
      thModel: "Model",
      thContext: "Context",
      thInput: "Input / 1M",
      thOutput: "Output / 1M",
      catalogEmpty: "Model catalog is being provisioned. Check back shortly.",
      features: [
        {
          title: "OpenAI-compatible",
          body: "Drop-in replacement. Point your existing SDK at tokshop.xyz/v1 and go.",
        },
        {
          title: "Per-token billing",
          body: "Prepaid credits, deducted per request with full usage logs you can audit.",
        },
        {
          title: "Instant & automated",
          body: "Sign up, top up, get a key - the whole flow is self-serve, 24/7.",
        },
      ],
    },
    pricing: {
      title: "Pricing",
      sub: "USD per 1M tokens, billed per request down to the token. Prepaid credits, no subscription, no minimum spend.",
      prepaid: "prepaid credits",
      ctaKey: "Get your API key",
      ctaDocs: "Read the docs",
    },
    blog: {
      title: "Blog",
      sub: "Guides on open-source model APIs, pricing and cost engineering. Articles are AI-generated from live trend signals, fact-checked against our real catalog, and reviewed by automated QC.",
      empty: "First articles are being generated — check back shortly.",
    },
    docs: {
      title: "API Documentation",
      intro: "TokShop exposes an OpenAI-compatible API. Base URL:",
      s1: "1. Get an API key",
      s1Body:
        "Register, top up your balance, then create a key in the dashboard. Keys look like",
      s1Body2: "and are shown only once.",
      s2: "2. List models",
      s2Note:
        "Public endpoint. Returns model ids, context windows and USD pricing per 1M tokens.",
      s3: "3. Chat completions",
      s3Python: "With the official OpenAI Python SDK:",
      s4: "4. Streaming",
      s4Body: "Set",
      s4Body2: ". Server-sent events, identical to OpenAI's format.",
      s5: "5. Billing",
      billing: [
        "Prepaid USD credits; each request is deducted from the balance.",
        "Cost = input_tokens x input_price / 1M + output_tokens x output_price / 1M.",
        "Every call is logged and auditable in your dashboard.",
      ],
      billing402pre: "When the balance reaches zero, requests return",
      errorsTitle: "Errors",
      err401: "missing or invalid API key",
      err402: "insufficient balance",
      err404: "unknown model",
      supportTitle: "Support",
      supportBody:
        "Questions, invoices or enterprise volume? Email us — we reply within one business day:",
    },
    auth: {
      signInTitle: "Sign in",
      registerTitle: "Create your account",
      email: "Email",
      password: "Password",
      passwordHint: " (min 8 characters)",
      wait: "Please wait...",
      signIn: "Sign in",
      register: "Create account",
      noAccount: "No account?",
      registerLink: "Register",
      hasAccount: "Already registered?",
      signInLink: "Sign in",
      requestFailed: "Request failed",
    },
    dash: {
      loading: "Loading...",
      signOut: "Sign out",
      balance: "Balance",
      totalCalls: "Total calls",
      totalSpend: "Total spend",
      topUpTitle: "Top up credits",
      topUpSub: "Prepaid credits in USD, applied instantly after payment.",
      keysTitle: "API keys",
      createKey: "Create key",
      createKeyFailed: "Failed to create key",
      checkoutFailed: "Checkout failed",
      pendingPayment:
        "Order created, but online payment is not enabled yet. Please contact support at mingxinai@agentmail.to to complete the payment.",
      copyKey: "Copy your key now - it is shown only once:",
      thKey: "Key",
      thStatus: "Status",
      thCreated: "Created",
      noKeys: "No keys yet.",
      revoke: "Revoke",
      usageTitle: "Recent usage",
      totalTokens: "Total tokens:",
      tokensIn: "in",
      tokensOut: "out",
      thTime: "Time",
      thModel: "Model",
      thTokens: "Tokens (in/out)",
      thCost: "Cost",
      noUsage: "No usage yet. Make your first API call - see the",
      docsWord: "docs",
    },
  },
  zh: {
    nav: {
      pricing: "价格",
      docs: "文档",
      blog: "博客",
      signIn: "登录",
      getKey: "获取 API Key",
    },
    footer: {
      tagline: "TokShop · OpenAI 兼容的大模型 Token 交易平台",
      contact: "联系我们",
      docs: "文档",
      pricing: "价格",
      blog: "博客",
    },
    home: {
      heroLine1: "开源大模型 Token,",
      heroLine2: "按量付费。",
      heroSub:
        "一个 OpenAI 兼容 API,直连 DeepSeek、GLM、Qwen、Kimi。按 token 透明计价,即时发放 API Key,无订阅费,无最低消费。",
      ctaKey: "获取 API Key",
      ctaDocs: "查看文档",
      codeComment: "# 兼容任意 OpenAI SDK",
      pricingTitle: "价格",
      pricingSub: "美元 / 每百万 token,逐请求精确到单个 token 计费。",
      thModel: "模型",
      thContext: "上下文",
      thInput: "输入 / 1M",
      thOutput: "输出 / 1M",
      catalogEmpty: "模型价目正在初始化,请稍后刷新。",
      features: [
        {
          title: "OpenAI 兼容",
          body: "即插即用,把现有 SDK 的 base_url 指向 tokshop.xyz/v1 即可。",
        },
        {
          title: "按 token 计费",
          body: "预付余额,逐请求扣费,完整用量日志可随时审计。",
        },
        {
          title: "即时全自动",
          body: "注册、充值、发 Key 全程自助,7×24 小时可用。",
        },
      ],
    },
    pricing: {
      title: "价格",
      sub: "美元 / 每百万 token,逐请求精确到单个 token 计费。预付余额,无订阅费,无最低消费。",
      prepaid: "预付额度",
      ctaKey: "获取 API Key",
      ctaDocs: "查看文档",
    },
    blog: {
      title: "博客",
      sub: "开源大模型 API、价格与成本工程指南。文章由 AI 基于实时趋势信号生成,并对照真实价目自动事实核查、通过自动化质检后发布。",
      empty: "首批文章正在生成中,请稍后再来。",
    },
    docs: {
      title: "API 文档",
      intro: "TokShop 提供 OpenAI 兼容 API。Base URL:",
      s1: "1. 获取 API Key",
      s1Body: "注册并充值后,在控制台创建 Key。Key 形如",
      s1Body2: ",仅在创建时展示一次。",
      s2: "2. 查询模型列表",
      s2Note: "公开接口,返回模型 ID、上下文长度和每百万 token 的美元价格。",
      s3: "3. 对话补全",
      s3Python: "使用官方 OpenAI Python SDK:",
      s4: "4. 流式输出",
      s4Body: "设置",
      s4Body2: ",返回 Server-Sent Events,格式与 OpenAI 完全一致。",
      s5: "5. 计费说明",
      billing: [
        "预付美元余额,每次请求从余额中扣除。",
        "费用 = 输入 token 数 × 输入单价 / 1M + 输出 token 数 × 输出单价 / 1M。",
        "每次调用均有日志,可在控制台随时审计。",
      ],
      billing402pre: "余额耗尽后请求返回",
      errorsTitle: "错误码",
      err401: "API Key 缺失或无效",
      err402: "余额不足",
      err404: "未知模型",
      supportTitle: "技术支持",
      supportBody: "使用问题、发票或企业批量采购,请邮件联系,一个工作日内回复:",
    },
    auth: {
      signInTitle: "登录",
      registerTitle: "创建账号",
      email: "邮箱",
      password: "密码",
      passwordHint: "(至少 8 位)",
      wait: "请稍候...",
      signIn: "登录",
      register: "创建账号",
      noAccount: "还没有账号?",
      registerLink: "注册",
      hasAccount: "已有账号?",
      signInLink: "登录",
      requestFailed: "请求失败",
    },
    dash: {
      loading: "加载中...",
      signOut: "退出登录",
      balance: "余额",
      totalCalls: "总调用次数",
      totalSpend: "累计消费",
      topUpTitle: "充值",
      topUpSub: "预付美元额度,支付成功后即时到账。",
      keysTitle: "API Key",
      createKey: "创建 Key",
      createKeyFailed: "创建 Key 失败",
      checkoutFailed: "下单失败",
      pendingPayment:
        "订单已创建,但在线支付暂未开通。请联系客服 mingxinai@agentmail.to 完成付款。",
      copyKey: "请立即复制你的 Key —— 仅展示这一次:",
      thKey: "Key",
      thStatus: "状态",
      thCreated: "创建时间",
      noKeys: "暂无 Key。",
      revoke: "吊销",
      usageTitle: "近期用量",
      totalTokens: "总 token 数:",
      tokensIn: "输入",
      tokensOut: "输出",
      thTime: "时间",
      thModel: "模型",
      thTokens: "Token(输入/输出)",
      thCost: "费用",
      noUsage: "暂无调用记录。发起第一次 API 调用,请参考",
      docsWord: "文档",
    },
  },
} as const;

export type Dict = (typeof dict)[Locale];
