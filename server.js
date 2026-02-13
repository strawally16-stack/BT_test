// server.js
require("dotenv").config();

const path = require("path");
const express = require("express");
const braintree = require("braintree");

const app = express();

// --- middleware (app must be initialized before this) ---
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Optional: make sure "/" serves index.html even if static config changes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Braintree gateway ---
const environment =
  process.env.BT_ENVIRONMENT === "Production"
    ? braintree.Environment.Production
    : braintree.Environment.Sandbox;

const gateway = new braintree.BraintreeGateway({
  environment,
  merchantId: process.env.BT_MERCHANT_ID,
  publicKey: process.env.BT_PUBLIC_KEY,
  privateKey: process.env.BT_PRIVATE_KEY,
  merchantAccountId: process.env.BT_MERCHANT_ACCOUNT_ID_GBP, // 
});

// Quick env sanity check at startup
console.log("BT_ENVIRONMENT:", process.env.BT_ENVIRONMENT || "Sandbox");
console.log("BT_MERCHANT_ID set:", !!process.env.BT_MERCHANT_ID);
console.log("BT_PUBLIC_KEY set:", !!process.env.BT_PUBLIC_KEY);
console.log("BT_PRIVATE_KEY set:", !!process.env.BT_PRIVATE_KEY);

// --- routes ---
app.get("/client_token", (req, res) => {
  gateway.clientToken.generate({}, (err, response) => {
    if (err) {
      console.error("clientToken.generate error:", err);
      return res.status(500).send(err.message || "client token error");
    }
    if (!response?.clientToken) {
      console.error("No clientToken returned:", response);
      return res.status(500).send("No clientToken returned");
    }
    res.type("text/plain").send(response.clientToken);
  });
});

app.post("/checkout", (req, res) => {
  const { payment_method_nonce, amount } = req.body;

  if (!payment_method_nonce) {
    return res.status(400).json({ ok: false, error: "Missing payment_method_nonce" });
  }

  gateway.transaction.sale(
    {
      amount: amount || "100.00",
      paymentMethodNonce: payment_method_nonce,
      options: { submitForSettlement: true },
      merchantAccountId: process.env.BT_MERCHANT_ACCOUNT_ID_GBP, // 
    },
    (err, result) => {
      if (err) {
        console.error("transaction.sale error:", err);
        return res.status(500).json({ ok: false, error: err.message || "sale error" });
      }

      if (result.success) {
        return res.json({ ok: true, transactionId: result.transaction.id });
      }

      return res.status(422).json({
        ok: false,
        error: result.message,
        details: result.errors ? result.errors.deepErrors() : [],
      });
    }
  );
});

// --- Shipping Module callback (PayPal -> your server) ---
// Your client passes shippingCallbackUrl pointing here.
// NOTE: This endpoint will be called by PayPal servers, so it must be publicly reachable
// and the domain must be allowed in your Braintree Control Panel shipping module settings.
app.post("/shipping/callback", (req, res) => {
  // For now, return a basic "success" response with shipping options + updated totals.
  // Adjust logic based on req.body (shipping address / chosen option).
  const currency_code = "GBP";

  const itemTotal = "180.00";
  const taxTotal = "20.00";
  const shipping = "15.00";
  const total = (Number(itemTotal) + Number(taxTotal) + Number(shipping)).toFixed(2);

  res.status(200).json({
    merchant_id: process.env.BT_MERCHANT_ID || "YOUR_MERCHANT_ID",
    purchase_units: [
      {
        reference_id: "PUHF",
        amount: {
          currency_code,
          value: total,
          breakdown: {
            item_total: { value: itemTotal, currency_code },
            tax_total: { value: taxTotal, currency_code },
            shipping: { value: shipping, currency_code },
          },
        },
        shipping: {
          options: [
            {
              id: "SHIP_STANDARD",
              label: "Standard Shipping",
              type: "SHIPPING",
              selected: true,
              amount: { value: "15.00", currency_code },
            },
            {
              id: "SHIP_EXPRESS",
              label: "Express Shipping",
              type: "SHIPPING",
              selected: false,
              amount: { value: "30.00", currency_code },
            },
          ],
        },
      },
    ],
  });
});

// Optional helper for client-side onShippingChange (only if you use it)
app.post("/shipping/reprice", (req, res) => {
  res.json({
    amount: "100.00",
    currency: "GBP",
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
