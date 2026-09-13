function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return res.status(503).send("Password setup is not configured.");
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
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${connectOrigin}; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  );

  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Set your SafeSpend password</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #08110d; color: #edf7f0; padding: 24px; }
    main { width: min(100%, 440px); background: #102019; border: 1px solid #274636; border-radius: 20px; padding: 30px; box-shadow: 0 24px 80px #0008; }
    h1 { margin: 0 0 10px; font-size: 1.65rem; }
    p { color: #bcd0c4; line-height: 1.5; }
    label { display: block; margin: 18px 0 7px; font-weight: 650; }
    input { width: 100%; padding: 12px 14px; border: 1px solid #426653; border-radius: 10px; background: #09140e; color: inherit; font: inherit; }
    input:focus { outline: 2px solid #6bdd9b; outline-offset: 2px; }
    button { width: 100%; margin-top: 22px; padding: 13px; border: 0; border-radius: 10px; background: #65d997; color: #062112; font: inherit; font-weight: 750; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    #status { min-height: 24px; margin-bottom: 0; }
    .error { color: #ffaca7; }
    .success { color: #82eaaa; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main>
    <h1>Set your SafeSpend password</h1>
    <p id="intro">Choose a new password for your private owner account. Use at least 12 characters and do not reuse a password from another service.</p>
    <form id="form">
      <label for="password">New password</label>
      <input id="password" name="password" type="password" minlength="12" autocomplete="new-password" required>
      <label for="confirmation">Confirm password</label>
      <input id="confirmation" name="confirmation" type="password" minlength="12" autocomplete="new-password" required>
      <button id="submit" type="submit">Save password</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    (() => {
      const authUserUrl = ${JSON.stringify(authUserUrl)};
      const publishableKey = ${JSON.stringify(publishableKey)};
      const params = new URLSearchParams(location.hash.slice(1));
      const accessToken = params.get("access_token");
      const errorDescription = params.get("error_description");
      history.replaceState(null, "", location.pathname + location.search);

      const form = document.getElementById("form");
      const button = document.getElementById("submit");
      const status = document.getElementById("status");
      const intro = document.getElementById("intro");

      const show = (message, kind = "error") => {
        status.textContent = message;
        status.className = kind;
      };

      if (!accessToken) {
        form.classList.add("hidden");
        intro.textContent = "This link is invalid or has expired.";
        show(errorDescription || "Request a fresh password email and open its link once.");
        return;
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = document.getElementById("password").value;
        const confirmation = document.getElementById("confirmation").value;
        if (password.length < 12) return show("Use at least 12 characters.");
        if (password !== confirmation) return show("The passwords do not match.");

        button.disabled = true;
        show("Saving…", "");
        try {
          const response = await fetch(authUserUrl, {
            method: "PUT",
            headers: {
              apikey: publishableKey,
              Authorization: "Bearer " + accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ password }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.msg || result.message || "Could not update the password.");
          form.reset();
          form.classList.add("hidden");
          intro.textContent = "Your password is ready.";
          show("You can now sign in to SafeSpend with your owner email.", "success");
        } catch (error) {
          show(error.message || "Could not update the password.");
          button.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`);
}
