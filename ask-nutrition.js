// netlify/functions/ask-nutrition.js
//
// Securely proxies free-text nutrition/diet questions to Google's Gemini API.
// The Gemini API key lives only here, as a Netlify environment variable
// (GEMINI_API_KEY) — it is never exposed to the browser.
//
// Reuses the same key already configured for netlify/functions/analyze-food.js

const GEMINI_MODEL = "gemini-flash-latest"; // change here if Google renames/retires this model

exports.handler = async function (event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: "GEMINI_API_KEY is not configured on the server. Set it in Netlify: Site settings -> Environment variables.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { question, context } = payload;
  if (!question || typeof question !== "string") {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing 'question' in request body" }),
    };
  }

  const ctx = context || {};
  const promptParts = [
    "אתה יועץ תזונה ידידותי בתוך אפליקציית מעקב קלוריות בעברית. ענה בקצרה, בעברית, בטון חם ותומך, ותמיד תתחשב בנתונים שסופקו למטה. אל תיתן ייעוץ רפואי אישי (מצבים בריאותיים, תרופות, הריון) — במקרה כזה המלץ לפנות לאיש מקצוע. תשובה קצרה וממוקדת, עד כמה פסקאות קצרות או רשימה קצרה.",
    "",
    "נתוני היום של המשתמש:",
    `- יעד קלוריות יומי (כולל בונוס מאימון): ${ctx.goal ?? "לא ידוע"} קק"ל`,
    `- נצרך עד כה היום: ${ctx.consumed ?? 0} קק"ל`,
    `- נותר להיום: ${ctx.remaining ?? "לא ידוע"} קק"ל`,
    ctx.eaten && ctx.eaten.length ? `- מזון שכבר נאכל היום: ${ctx.eaten.join(", ")}` : "- עדיין לא נאכל כלום היום",
    ctx.anchors && ctx.anchors.length ? `- ארוחות קבועות שכבר תוכננו להיום: ${ctx.anchors.join(", ")}` : "",
    "",
    `שאלת המשתמש: ${question}`,
  ].filter(Boolean).join("\n");

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: promptParts }],
            },
          ],
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return {
        statusCode: geminiResponse.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: data?.error?.message || "Gemini API request failed" }),
      };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "לא הצלחתי לחשוב על תשובה כרגע, נסה שוב.";

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || "Unknown server error" }),
    };
  }
};
