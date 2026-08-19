// netlify/functions/analyze-day.js
//
// Securely proxies a request to analyze the quality of today's eaten food
// (whole vs. processed, protein sufficiency, macro balance) to Google's
// Gemini API. The Gemini API key lives only here, as a Netlify environment
// variable (GEMINI_API_KEY) — it is never exposed to the browser.
//
// Reuses the same key already configured for analyze-food.js / ask-nutrition.js

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

  const { items, totals, goals } = payload;
  if (!Array.isArray(items) || items.length === 0) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing or empty 'items' array in request body" }),
    };
  }

  const t = totals || {};
  const g = goals || {};
  const itemsList = items.map(i => `- ${i.name} (${i.qtyLabel || ''}, ${Math.round(i.kcal)} קק"ל)`).join("\n");

  const promptParts = [
    "אתה תזונאי ידידותי בתוך אפליקציית מעקב קלוריות בעברית. נתח את רשימת המזון שהמשתמש אכל היום, וכתוב הערכה קצרה וממוקדת (עד 4-5 משפטים קצרים, אפשר כרשימת נקודות) שמתייחסת ל:",
    "1. איכות המזון הכללית — האם מדובר בעיקר במזון טבעי/שלם או מזון מעובד",
    "2. האם צריכת החלבון מספיקה ביחס ליעד",
    "3. האם יש חוסר איזון בין המאקרו-נוטריאנטים (למשל עודף שומן, מעט מדי פחמימה)",
    "4. המלצה מעשית אחת או שתיים להמשך היום (למשל 'כדאי להוסיף מקור פחמימה מורכבת', 'תוסיף מנת חלבון')",
    "היה חם, לא שיפוטי, ואל תיתן ייעוץ רפואי אישי. בעברית בלבד.",
    "",
    "רשימת המזון שנאכל היום:",
    itemsList,
    "",
    "סה\"כ היום:",
    `- קלוריות: ${Math.round(t.kcal||0)} מתוך יעד ${g.kcalGoal ?? "לא ידוע"}`,
    `- חלבון: ${Math.round(t.p||0)}g מתוך יעד ${g.proteinGoal ?? "לא ידוע"}g`,
    `- פחמימה: ${Math.round(t.c||0)}g מתוך יעד ${g.carbGoal ?? "לא ידוע"}g`,
    `- שומן: ${Math.round(t.f||0)}g מתוך יעד ${g.fatGoal ?? "לא ידוע"}g`,
  ].join("\n");

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

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "לא הצלחתי לנתח את היום כרגע, נסה שוב.";

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
