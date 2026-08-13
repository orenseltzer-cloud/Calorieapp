// netlify/functions/analyze-food.js
//
// Securely proxies food-photo analysis requests to Google's Gemini API.
// The Gemini API key lives only here, as a Netlify environment variable
// (GEMINI_API_KEY) — it is never exposed to the browser.
//
// Get a free API key at https://aistudio.google.com/apikey

const GEMINI_MODEL = "gemini-2.5-flash"; // change here if Google renames/retires this model

const PROMPT = `התבונן בתמונה בעיון וזהה רק מזון שבאמת נראה בה בפועל. אם התמונה מציגה מזון ארוז/ממותג (כמו חטיף, סוכרייה, שוקולד) גם ללא תווית תזונה גלויה — תן הערכה סבירה על סמך ערכים תזונתיים טיפוסיים למוצר דומה או לקטגוריה שלו (לדוגמה: סוכריה קשה בודדת כ-20-25 קלוריות), ואל תסרב במקרה כזה. אך אם התמונה אינה ברורה, פגומה, ריקה, או שאינך רואה בה מזון כלל — אסור לך להמציא פריט מזון שאינו נראה בפועל; במקרה כזה החזר מערך items ריק. עבור כל פריט אמיתי שזיהית, הערך גודל מנה סביר בגרמים וחשב קלוריות, חלבון, פחמימות ושומן למנה הזו. השב אך ורק ב-JSON תקין בפורמט המדויק הזה: {"items":[{"name":"שם המזון בעברית","grams":מספר,"kcal":מספר,"protein":מספר,"carbs":מספר,"fat":מספר}]}`;

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

  const { image, mimeType } = payload;
  if (!image || typeof image !== "string") {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Missing 'image' (base64 string) in request body" }),
    };
  }

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
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
          },
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

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{"items":[]}';

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


