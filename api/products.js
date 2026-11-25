export default async function handler(req, res) {
  const rawShop = String(req.query?.shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  const shop = rawShop.endsWith(".myshopify.com")
    ? rawShop
    : rawShop
      ? `${rawShop}.myshopify.com`
      : "";

  if (!shop) {
    return res.status(400).json({ error: "Missing shop parameter" });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  try {
    const storeRes = await fetch(
      `${supabaseUrl}/rest/v1/shopify_stores?shop=eq.${encodeURIComponent(shop)}&select=shop,access_token`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!storeRes.ok) {
      const errText = await storeRes.text();
      return res.status(502).json({ error: `Supabase lookup failed (${storeRes.status}): ${errText}` });
    }

    const rows = await storeRes.json();
    const store = Array.isArray(rows) ? rows[0] : null;

    if (!store || !store.access_token) {
      return res.status(401).json({ error: `Store ${shop} is not authorized yet.` });
    }

    const shopifyRes = await fetch(`https://${shop}/admin/api/2025-01/products.json?limit=50`, {
      headers: {
        "X-Shopify-Access-Token": store.access_token,
        "Content-Type": "application/json"
      }
    });

    const shopifyText = await shopifyRes.text();
    let shopifyData;
    try {
      shopifyData = JSON.parse(shopifyText);
    } catch {
      return res.status(502).json({ error: `Shopify returned non-JSON (${shopifyRes.status}): ${shopifyText}` });
    }

    if (!shopifyRes.ok) {
      return res.status(shopifyRes.status).json({
        error: shopifyData.errors || `Shopify products request failed (${shopifyRes.status})`
      });
    }

    return res.status(200).json({
      shop,
      products: shopifyData.products || []
    });
  } catch (err) {
    return res.status(500).json({ error: `Products endpoint error: ${err?.message || err}` });
  }
}
