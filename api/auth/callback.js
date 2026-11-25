function resolveShopFromQuery(query = {}) {
  const direct = String(query.shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (direct) {
    return direct.endsWith(".myshopify.com") ? direct : `${direct}.myshopify.com`;
  }

  if (query.host) {
    try {
      const decoded = Buffer.from(String(query.host), "base64").toString("utf8").trim().toLowerCase();
      const storeHandle = decoded.split("/store/")[1]?.split("/")[0];
      if (storeHandle) return `${storeHandle}.myshopify.com`;
      if (decoded.endsWith(".myshopify.com")) return decoded;
    } catch (_) {}
  }

  return "";
}

export default async function handler(req, res) {
  const { code } = req.query || {};
  const shop = resolveShopFromQuery(req.query || {});

  if (!code || !shop || !shop.endsWith(".myshopify.com")) {
    return res.status(400).send(`Invalid callback params: code=${Boolean(code)}, shop=${shop || "missing"}`);
  }

  const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const appUrl = String(process.env.APP_URL || "https://radar-margin.vercel.app")
    .trim()
    .replace(/\/+$/, "");

  if (!clientId || !clientSecret) {
    return res.status(500).send("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET");
  }

  if (!supabaseUrl || !supabaseUrl.startsWith("https://") || !serviceRoleKey) {
    return res.status(500).send("Invalid or missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  let tokenData;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const rawText = await tokenRes.text();
    try {
      tokenData = JSON.parse(rawText);
    } catch {
      return res.status(502).send(`Shopify non-JSON response (${tokenRes.status}): ${rawText}`);
    }

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(502).send(`Shopify token error (${tokenRes.status}): ${JSON.stringify(tokenData)}`);
    }
  } catch (err) {
    return res.status(502).send(`Shopify token fetch failed (${shop}): ${err?.message || err}`);
  }

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/shopify_stores?on_conflict=shop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([
        {
          shop,
          access_token: tokenData.access_token,
          scope: tokenData.scope || ""
        }
      ])
    });

    if (!dbRes.ok) {
      const dbErr = await dbRes.text();
      return res.status(502).send(`Supabase upsert failed (${dbRes.status}): ${dbErr}`);
    }
  } catch (err) {
    return res.status(502).send(`Supabase fetch failed (${supabaseUrl}): ${err?.message || err}`);
  }

  return res.redirect(302, `${appUrl}/?shop=${encodeURIComponent(shop)}`);
}
