// Receives Fizzy webhook payloads and triggers a GitHub Actions workflow
// to merge staging → main when a card is closed (Done).

import { createHmac } from "node:crypto";

async function verifySignature(req, body) {
  const secret = process.env.FIZZY_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if no secret configured

  const signature = req.headers.get("x-webhook-signature");
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  if (!(await verifySignature(req, rawBody))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Fizzy sends card data — check if the card was closed
  if (!payload.closed) {
    return new Response("Not a closure event, ignoring", { status: 200 });
  }

  const ghToken = process.env.GITHUB_DISPATCH_TOKEN;
  if (!ghToken) {
    return new Response("Missing GITHUB_DISPATCH_TOKEN", { status: 500 });
  }

  // Dispatch to GitHub Actions
  const res = await fetch("https://api.github.com/repos/nm-static/events/dispatches", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "fizzy-approve",
      client_payload: {
        card_title: payload.title || "Unknown card",
        card_number: payload.number || 0,
      },
    }),
  });

  if (res.ok || res.status === 204) {
    return new Response("Dispatched merge workflow", { status: 200 });
  }

  return new Response(`GitHub dispatch failed: ${res.status}`, { status: 502 });
};

export const config = {
  path: "/api/fizzy-webhook",
};
