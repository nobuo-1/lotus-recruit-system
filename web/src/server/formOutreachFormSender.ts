// web/src/server/formOutreachFormSender.ts

export type FormSenderContext = {
  targetUrl: string;
  html: string;
  message: string; // ★ テンプレート本文（問い合わせ内容）
  sender: {
    company?: string | null;
    postal_code?: string | null;
    prefecture?: string | null;
    address?: string | null;
    last_name?: string | null;
    first_name?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  recipient: {
    company_name?: string | null;
    website?: string | null;
    industry?: string | null;
    prefecture?: string | null;
  };
};

type FormPlan = {
  method: "GET" | "POST";
  action: string;
  fields: Record<string, string>;
};

function buildSystemPrompt(): string {
  return `
  あなたは「企業への問い合わせフォーム」を自動入力するアシスタントです。
  
  # 目的
  - HTML から問い合わせフォームを特定し、送信者情報・メッセージを使って、実際に送信できるようなフィールド名と値の一覧を作成します。
  
  # 入力データ
  - targetUrl: フォームページのURL
  - html: フォームを含むHTML
  - sender: 送信者の会社名・住所・氏名・メールアドレスなど
  - recipient: 相手企業の社名・サイトURL・業種・都道府県など
  - message: メッセージテンプレートの本文（問い合わせの本文として使う）
  
  # 必ず守ること
  - 出力フォーマットは **必ず JSON** だけにしてください。余計な文章を絶対に含めないでください。
  - JSON 形式:
    {
      "method": "GET" または "POST",
      "action": "フォーム送信先URL（空または相対ならそのまま）",
      "fields": {
        "<input name>": "<送信する値>",
        ...
      }
    }
  
  # フォームの選び方
  - 問い合わせ・資料請求・お仕事依頼・お問い合わせなど、営業連絡に関係するフォームを 1 つ選んでください。
  - <form> タグが複数ある場合は、もっともメインと思われる問い合わせフォームを選ぶこと。
  
  # 入力ルール
  - 「必須」や「*」が付いている項目はできるだけすべて埋める。
  - text, textarea: 送信者情報や **message（テンプレート本文）** から適切な日本語で入力する。
    - 問い合わせ内容やご質問の欄には、基本的に **message** をそのまま入力する。
  - select, radio, checkbox:
    - ラベルや placeholder を見て、**もっとも自然な選択肢**を選ぶ。
    - 「その他」がある場合、情報がはっきりしないときは「その他」を選ぶ。
  - プライバシーポリシーや利用規約の同意チェック:
    - 「同意する」「同意しました」などのチェックを **必ずオン** にする。
    - value が "1" や "on", "yes" などの場合はそれを使用する。
  - 確認用入力（メールアドレス再入力など）がある場合:
    - 同じ値をもう一度 fields に含める。
  
  # 名前・住所などの扱い
  - 氏名が「姓」「名」に分かれている場合:
    - sender.last_name, sender.first_name を使い分ける。
  - 「会社名」は sender.company を使う。
  - 「郵便番号」「都道府県」「住所」は sender.postal_code, sender.prefecture, sender.address を使う。
  - フリガナの欄があっても、読み仮名情報が無い場合は、カタカナに変換せず、名前をそのままカナ風に変換したり、ある程度自然なカタカナを推定して入力してよい。
  
  # メールアドレス
  - メールアドレス欄には sender.email を設定する。
  - 確認欄があれば、同じメールアドレスを設定する。
  
  # 産業・業種など
  - 「業種」「業界」には recipient.industry を優先して設定する。
  - なければ sender.company やメッセージ内容から自然なものを推定してもよい。
  
  # 出力例（フォーマットのみの例）
  {
    "method": "POST",
    "action": "/contact/confirm",
    "fields": {
      "company": "株式会社LOTUS",
      "last_name": "山田",
      "first_name": "太郎",
      "email": "sales@example.com",
      "email_confirm": "sales@example.com",
      "postal": "123-4567",
      "pref": "大阪府",
      "address": "大阪市北区...",
      "agree_privacy": "1",
      "inquiry": "message の内容をここに入れる",
      "category": "その他"
    }
  }
  `;
}

export async function planFormSubmission(
  ctx: FormSenderContext
): Promise<FormPlan | null> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const htmlSnippet =
    ctx.html.length > 12000 ? ctx.html.slice(0, 12000) : ctx.html;

  const userPayload = {
    targetUrl: ctx.targetUrl,
    html: htmlSnippet,
    message: ctx.message,
    sender: ctx.sender,
    recipient: ctx.recipient,
  };

  const system = buildSystemPrompt();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message?: { content?: string | null } }[];
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as FormPlan;
    if (
      !parsed ||
      !parsed.action ||
      !parsed.method ||
      typeof parsed.fields !== "object"
    ) {
      return null;
    }
    const methodUpper = parsed.method.toUpperCase() === "GET" ? "GET" : "POST";
    return {
      method: methodUpper,
      action: parsed.action,
      fields: parsed.fields || {},
    };
  } catch {
    return null;
  }
}

/**
 * 実際にフォーム送信を行う
 */
export async function submitFormPlan(
  targetUrl: string,
  plan: FormPlan
): Promise<{ ok: boolean; status: number; url: string }> {
  const base = new URL(targetUrl);
  const actionUrl = new URL(plan.action || ".", base).toString();

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(plan.fields || {})) {
    params.append(k, v);
  }

  const method = plan.method.toUpperCase();

  let res: Response;
  if (method === "GET") {
    const urlObj = new URL(actionUrl);
    for (const [k, v] of params.entries()) {
      urlObj.searchParams.set(k, v);
    }
    res = await fetch(urlObj.toString(), {
      method: "GET",
      headers: {
        Referer: targetUrl,
      },
    });
  } else {
    res = await fetch(actionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Referer: targetUrl,
      },
      body: params.toString(),
    });
  }

  return {
    ok: res.ok,
    status: res.status,
    url: actionUrl,
  };
}
