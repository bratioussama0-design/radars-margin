export default function handler(req, res) {
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

  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).send("Invalid or missing shop parameter (expected your-store.myshopify.com)");
  }

  const clientId = String(process.env.SHOPIFY_CLIENT_ID || "").trim();
  const appUrl = String(process.env.APP_URL || "https://radar-margin.vercel.app")
    .trim()
    .replace(/\/+$/, "");

  if (!clientId) {
    return res.status(500).send("Missing SHOPIFY_CLIENT_ID environment variable");
  }

  const scopes = "read_orders,read_products";
  const redirectUri = `${appUrl}/api/auth/callback`;

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return res.redirect(302, installUrl);
}
