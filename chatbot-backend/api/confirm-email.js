export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return res.status(503).send("Email confirmation is not configured.");
  }

  const authUserUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`;
  const connectOrigin = new URL(supabaseUrl).origin;

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${connectOrigin}; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );

  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Confirm your SafeSpend email</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, sans-serif; color: #0e3e3e; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #e9fff5; }
    main { width: min(100%, 440px); padding: 32px; border-radius: 24px; background: #fff; text-align: center; box-shadow: 0 12px 40px #0e3e3e1a; }
    .icon { margin: 0 auto 20px; width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: #00d09e; font-size: 32px; font-weight: 800; }
    h1 { margin: 0 0 12px; font-size: 1.6rem; }
    p { margin: 0; color: #426a60; line-height: 1.55; }
    .error { color: #a92f32; }
  </style>
</head>
<body>
  <main>
    <div class="icon" aria-hidden="true">✓</div>
    <h1 id="heading">Confirming your email…</h1>
    <p id="message" role="status" aria-live="polite">Please wait a moment.</p>
  </main>
  <script>
    (async () => {
      const params = new URLSearchParams(location.hash.slice(1));
      const accessToken = params.get("access_token");
      const redirectError = params.get("error_description") || params.get("error");
      history.replaceState(null, "", location.pathname + location.search);

      const heading = document.getElementById("heading");
      const message = document.getElementById("message");
      const fail = (text) => {
        heading.textContent = "Could not confirm your email";
        message.textContent = text;
        message.className = "error";
      };

      if (!accessToken) {
        fail(redirectError || "This link is invalid or has expired. Request a new verification email in SafeSpend.");
        return;
      }

      try {
        const response = await fetch(${JSON.stringify(authUserUrl)}, {
          headers: {
            apikey: ${JSON.stringify(publishableKey)},
            Authorization: "Bearer " + accessToken,
          },
        });
        if (!response.ok) throw new Error("The confirmation link could not be verified.");
        const user = await response.json();
        if (!user.email_confirmed_at) throw new Error("Your email is not confirmed yet.");
        heading.textContent = "Email confirmed!";
        message.textContent = "Return to SafeSpend and log in with the password you chose when you signed up.";
      } catch (error) {
        fail(error.message || "Please request a new verification email in SafeSpend.");
      }
    })();
  </script>
</body>
</html>`);
}
