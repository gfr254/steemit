import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function rpc(method, params) {
  const response = await fetch("https://api.steemit.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }) });
  if (!response.ok) throw new Error("Steem RPC HTTP " + response.status);
  const payload = await response.json();
  if (payload.error) throw new Error("Steem RPC error: " + JSON.stringify(payload.error));
  return payload.result;
}

async function findOldestPlaceholder() {
  const author = process.env.STEEM_AUTHOR;
  const found = new Map(); let cursor = null; const existingTitles = [];
  for (let page = 0; page < 10; page++) {
    const rows = await rpc("condenser_api.get_discussions_by_blog", [{ tag: author, limit: 100, ...(cursor ? { start_author: cursor.author, start_permlink: cursor.permlink } : {}) }]);
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const item of rows) {
      if (item.author !== author) continue;
      if (item.title === "*" && item.body === "*") found.set(item.permlink, item);
      else if (item.title && item.title !== "*") existingTitles.push(item.title);
    }
    const last = rows[rows.length - 1]; if (cursor && last.author === cursor.author && last.permlink === cursor.permlink) break;
    cursor = { author: last.author, permlink: last.permlink }; if (rows.length < 100) break;
  }
  const sorted = [...found.values()].sort((a,b) => a.created.localeCompare(b.created));
  if (!sorted.length) return null;
  sorted[0].remainingPlaceholders = sorted.length;
  sorted[0].previousTitles = [...new Set(existingTitles)].slice(0, 30);
  return sorted[0];
}

async function generate() {
  const target = await findOldestPlaceholder();
  if (target && target.permlink === "3tmtka") {
    const article = {"title":"The Beetle’s Rounded Lines: A Design That Invites a Closer Look","body_ja":"ビートルを見たとき、まず目に入るのは、車全体をつなぐ丸い輪郭です。前から横へ、そして後ろへと続く曲線には、角ばった形とは違うやわらかさがあります。\n\nこの魅力は、数値や仕様を知らなくても楽しめます。写真の中でも、イベントで実車を見かけたときでも、少し離れて眺めると、丸みのある形が周囲の景色に独特の印象を加えていることに気づきます。\n\n空冷VWに詳しい人はもちろん、初めて関心を持った人にとっても、デザインは親しみやすい入口です。ビートルの輪郭を眺めることから、その車を大切にする人たちの文化にも興味が広がっていきます。","body_en":"The first thing many people notice about a Beetle is its rounded outline. The curves running from the front, along the sides, and toward the rear create a softer impression than a sharply angular shape.\n\nYou do not need to know technical specifications to appreciate that impression. Whether you see the car in a photograph or in person at an event, stepping back for a moment makes it easier to notice how its rounded form changes the way it sits in the surrounding scene.\n\nFor longtime air-cooled VW fans and newcomers alike, design is an approachable starting point. Looking at the Beetle’s outline can lead to a wider interest in the culture of people who care for these cars.","body_es":"Lo primero que muchas personas notan de un Beetle es su silueta redondeada. Las curvas que van del frente, recorren los laterales y llegan hasta la parte trasera crean una impresión más suave que una forma de líneas angulosas.\n\nNo hace falta conocer las especificaciones técnicas para apreciar esa impresión. Tanto en una fotografía como al verlo en persona en un evento, tomar cierta distancia ayuda a observar cómo su forma redondeada cambia la presencia del automóvil en el paisaje.\n\nPara quienes llevan tiempo interesados en los VW refrigerados por aire y para quienes recién los descubren, el diseño es un punto de partida accesible. Observar el contorno del Beetle puede despertar interés por la cultura de las personas que cuidan estos autos.","body_ko":"비틀을 볼 때 많은 사람이 먼저 알아차리는 것은 둥근 윤곽입니다. 앞부분에서 옆면을 따라 뒤쪽으로 이어지는 곡선은 각진 형태와는 다른 부드러운 인상을 줍니다.\n\n이 느낌을 즐기기 위해 기술 사양을 알 필요는 없습니다. 사진으로 보든 행사에서 실제로 보든, 조금 떨어져 바라보면 둥근 형태가 주변 풍경 속에서 자동차의 인상을 어떻게 만드는지 살펴볼 수 있습니다.\n\n오랫동안 공랭식 폭스바겐에 관심을 가져온 사람에게도, 이제 막 관심을 갖기 시작한 사람에게도 디자인은 쉽게 다가갈 수 있는 출발점입니다. 비틀의 윤곽을 바라보는 일은 이 차를 아끼는 사람들의 문화에 대한 관심으로 이어질 수 있습니다.","tags":["aircooled","beetle","classiccar","japan","vwculture","design"]};
    article.target = { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created };
    fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
    console.log("Approved first article loaded without another AI call.");
    return;
  }
  const prompt = `
あなたは「空冷かずひろ」のSteemit多言語投稿AIです。
記事番号に応じた独立したデザイン・見方のエッセイにします。根拠資料が与えられていないため、歴史上の事実や日本の市場・イベント事情は扱いません。

重要な前提:
- 筆者は現時点で空冷VWを所有していません。
- 筆者自身の運転、修理、整備、所有体験として書いてはいけません。
- 資料がないときは、見た目についての解釈・感想だけを書いてください。具体的な歴史、年、仕様、価格、地域、市場、イベントの頻度、所有者の行動を事実として述べないでください。
- 年号、数値、統計、断定的な人気・頻度の主張は書かないでください。車両や仕様は個体ごとに異なるため、全車に当てはまるような説明を避けてください。
- 個人的な体験を捏造せず、解釈は「〜と感じられる」「〜かもしれない」など所感として示してください。
- 確認できない年式、仕様、価格、店舗名、地域情報、出来事を創作しないでください。
- 整備や安全に関する内容は一般的な知識にとどめ、専門店への確認を促してください。

### 本文構造
本文は以下の構造にする：
1. 紹介する文化・歴史・イベントのテーマ
2. 背景や用語の説明
3. 日本の空冷VW文化との関係
4. 海外読者にも伝わる見どころ
5. 事実と個人の感想を分けたまとめ

### 英語タイトル生成ルール
次の語を中心に、海外の旧車ファンにも意味が伝わるタイトルにする：
Air-cooled Beetle / VW History / Classic Car Culture / Japan

追加できる語：
Japanese Car Culture / Beetle History / Design Story /
VW Event / Classic Car Community / Air-cooled Culture

タイトルにFujiokaなど確認できない地域名を入れてはいけません。
筆者が所有者であると誤解される表現を使ってはいけません。

### タグ生成ルール
固定タグ：
aircooled / beetle / classiccar / japan / vwculture / history

可変タグ：
history / design / event / community / japaneseclassiccar / volkswagen

### 出力形式
{
  "title": "英語タイトル",
  "body_ja": "本文（日本語）",
  "body_en": "本文（英語）",
  "body_es": "本文（スペイン語）",
  "body_ko": "본문 (한국어)",
  "tags": ["固定タグ＋可変タグ"]
}
`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You generate high-quality multilingual JSON for Steemit." },
      { role: "user", content: prompt + (target ? "\n\n記事番号: " + (187 - target.remainingPlaceholders) + "\n過去の投稿タイトル。内容や題材を重複させない: " + target.previousTitles.join(" | ") + "\n本文は視覚・デザインに関する解釈だけ。年、数値、技術仕様、イベント頻度、価格、地域の事実を追加しない。" : "\n差し替え対象なし。通常の新規記事を生成する。") }
    ],
    response_format: { type: "json_object" }
  });

  const article = JSON.parse(response.choices[0].message.content);
  article.target = target ? { author: target.author, permlink: target.permlink, parent_author: target.parent_author, parent_permlink: target.parent_permlink, created: target.created } : null;

  fs.writeFileSync("article.json", JSON.stringify(article, null, 2));
  console.log("✔ 整備固定記事生成完了: article.json に保存しました");
}

generate();
