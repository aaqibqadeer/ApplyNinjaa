# ApplyNinjaa — Setup & Testing Guide

**Who this is for:** anyone who needs to get ApplyNinjaa running and check that
it works. No programming knowledge assumed. You will copy and paste commands
into a terminal, and click around in a web browser.

**How long it takes:** about 30 minutes for the basic setup (Part 1 + Part 2),
plus 15–45 minutes for the optional paid services (Part 3) if you want to test
AI, payments, or Gmail.

**Important:** this application has never been run against a live database
before. You are the first person to test it. Expect to find bugs — that is the
point. See [Reporting problems](#reporting-problems) at the end.

---

## Table of contents

- [Part 1 — Install the tools you need](#part-1--install-the-tools-you-need)
- [Part 2 — Get the app running (minimum setup)](#part-2--get-the-app-running-minimum-setup)
- [Part 3 — Optional services (AI, payments, Gmail, email, social login)](#part-3--optional-services)
- [Part 4 — Install the Chrome extension](#part-4--install-the-chrome-extension)
- [Part 5 — Testing checklist](#part-5--testing-checklist)
- [Troubleshooting](#troubleshooting)
- [Reporting problems](#reporting-problems)

---

## A few things to know first

**What is a terminal?** It is an app where you type commands instead of
clicking. On **Mac**, press `Cmd + Space`, type "Terminal", press Enter. On
**Windows**, press the Start button, type "PowerShell", press Enter.

**Running a command** means: copy the line, paste it into the terminal, press
Enter. Wait for it to finish before typing the next one.

**A "key" or "secret"** is a long password-like string that lets our app talk to
another company's service (like Stripe for payments). You get them by signing up
on that company's website. They are free for testing.

⚠️ **Never share these keys publicly** — no screenshots on social media, no
pasting into public chats. Treat them like passwords.

**Two terminal windows.** Later you will need two terminals open at the same
time (one keeps the app running, the other runs commands). To open a second one,
just launch Terminal/PowerShell again.

---

# Part 1 — Install the tools you need

You need four things. Install each one, then move on.

### 1.1 — Node.js (runs the application)

1. Go to **https://nodejs.org**
2. Download the version labelled **LTS** (the left/green button).
3. Open the downloaded file and click through the installer, accepting the
   defaults.
4. **Verify it worked.** Open a terminal and run:

   ```bash
   node --version
   ```

   You should see something like `v22.x.x`. If you see "command not found",
   restart your computer and try again.

   > The version must be **20 or higher**. If it is lower, download the LTS
   > version again.

### 1.2 — Git (downloads the code)

1. Go to **https://git-scm.com/downloads**
2. Download for your operating system, run the installer, accept defaults.
3. Verify:

   ```bash
   git --version
   ```

   You should see a version number.

### 1.3 — Docker Desktop (runs the database on your computer)

This gives you a database without signing up for anything.

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Download and install for your operating system.
3. **Open the Docker Desktop app** and leave it running. You should see a green
   "Engine running" indicator at the bottom left.
4. Verify:

   ```bash
   docker --version
   ```

> **Can't install Docker?** (Some work laptops block it.) Skip this and use the
> free cloud database in [Part 3.0](#30--alternative-cloud-database-no-docker)
> instead.

### 1.4 — Google Chrome

The extension only works in Chrome. Download from **https://www.google.com/chrome/**
if you do not have it.

---

# Part 2 — Get the app running (minimum setup)

At the end of this part you will have the website running with a working
database, signup, login, dashboard, and admin panel. AI features, payments, and
Gmail need Part 3.

### 2.1 — Download the code

Run these one at a time:

```bash
git clone https://github.com/aaqibqadeer/ApplyNinjaa.git
```

```bash
cd ApplyNinjaa
```

```bash
git checkout staging
```

> `staging` is the branch that has all the new work. This matters — the `master`
> branch does not have any of it.

**Every command from here on must be run inside this folder.** If you close the
terminal and open a new one, run `cd ApplyNinjaa` again first.

### 2.2 — Install the app's building blocks

```bash
npm install
```

This takes 1–3 minutes and prints a lot of text. Some warnings are normal.
If it ends without the word `error`, you are fine.

### 2.3 — Start the database

Make sure Docker Desktop is open and running, then:

```bash
docker compose up -d
```

Expected output ends with something like `Container ninjakit-mongo Started`.

Verify it is running:

```bash
docker ps
```

You should see a line mentioning `mongo:7`.

### 2.4 — Create your settings file

The app reads its settings from a file called `.env.local`. Create it by copying
the example:

**Mac:**

```bash
cp .env.example .env.local
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env.local
```

### 2.5 — Generate two security keys

These two keys are generated by you — they are not from any website.

Run this **twice**, and keep both results:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Each run prints a random line like `k3Jf9x...=`. Label them mentally:

- **1st result → `AUTH_SECRET`** (keeps login sessions secure)
- **2nd result → `EEO_ENCRYPTION_KEY`** (encrypts sensitive demographic answers)

⚠️ **`EEO_ENCRYPTION_KEY` can never be changed once real data exists.** If you
lose it, the encrypted answers become permanently unreadable. For testing this
does not matter, but keep it in mind.

### 2.6 — Fill in the settings file

Open `.env.local` in a text editor.

- **Mac:** run `open -e .env.local`
- **Windows:** run `notepad .env.local`

You will see many lines. Lines starting with `#` are switched off (they are
comments). **To switch a setting on, delete the `#` and the space at the start
of the line.**

Find and edit these lines so they look exactly like this (paste your own
generated keys after the `=`):

```
AUTH_SECRET=paste-your-1st-generated-key-here
EEO_ENCRYPTION_KEY=paste-your-2nd-generated-key-here
MONGODB_URI=mongodb://localhost:27017/applyninjaa
SUPER_ADMIN_EMAIL=admin@example.com
```

Then find these lines and **switch them OFF** by making sure they begin with
`# ` (we will turn them on in Part 3):

```
# NEXT_PUBLIC_FEATURE_PAYMENTS=1
# NEXT_PUBLIC_FEATURE_PAYMENTS_ANNUAL_BILLING=1
# NEXT_PUBLIC_FEATURE_AI_PROVIDERS=deepseek
# NEXT_PUBLIC_FEATURE_GMAIL=1
# NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GOOGLE=1
# NEXT_PUBLIC_FEATURE_AUTH_OAUTH_LINKEDIN=1
```

Leave these **ON** (no `#`):

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_FEATURE_AUTH_EMAIL_PASSWORD=1
NEXT_PUBLIC_FEATURE_ADMIN=1
NEXT_PUBLIC_FEATURE_COOKIE_BANNER=1
DB_PROVIDER=mongodb
```

**Save the file and close the editor.**

> **Why switch things off?** Each feature you switch on demands its keys before
> the app will start. Starting minimal means fewer things can go wrong.

### 2.7 — Fill the database with starter data

```bash
npm run seed
```

Expected output ends with a summary listing an organization, two users, four
plans (Free/Starter/Pro/Premium), six job filters, and a password.

This creates two test accounts:

| Email               | Password       | Role                            |
| ------------------- | -------------- | ------------------------------- |
| `admin@example.com` | `Password123!` | Super admin (full admin access) |
| `user@example.com`  | `Password123!` | Normal user                     |

> Safe to run again any time — it will not create duplicates.

### 2.8 — Start the app

```bash
npm run dev
```

Wait for `✓ Ready`. **Leave this terminal open and running.** Closing it stops
the website.

Open **http://localhost:3000** in Chrome. You should see the ApplyNinjaa
homepage.

🎉 **The app is running.** Jump to [Part 5](#part-5--testing-checklist) to start
testing, or continue to Part 3 to enable AI/payments/Gmail.

> **To stop the app:** click the terminal and press `Ctrl + C`.
> **To start it again later:** `cd ApplyNinjaa`, then `npm run dev`
> (make sure Docker Desktop is running first).

---

# Part 3 — Optional services

Each section is independent — set up only what you want to test. **After
changing `.env.local` you must always restart the app** (`Ctrl + C`, then
`npm run dev`).

### 3.0 — Alternative cloud database (no Docker)

Only if you could not install Docker.

1. Go to **https://www.mongodb.com/cloud/atlas/register** and create a free
   account.
2. Choose the **M0 / Free** cluster. Any provider or region is fine. Click
   **Create**.
3. On "Security Quickstart", create a database user. **Write down the username
   and password** — avoid special characters like `@` or `/` in the password.
4. Under "Where would you like to connect from", choose **My Local
   Environment** and click **Add My Current IP Address**.
   - If you later see connection timeouts, come back to **Network Access** and
     add `0.0.0.0/0` (allows any location — fine for testing, never for real
     data).
5. Click **Connect → Drivers**. Copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`
6. Replace `<password>` with your real password, and insert the database name
   `applyninjaa` right after `.net/`:

   ```
   MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.abcde.mongodb.net/applyninjaa?retryWrites=true&w=majority
   ```

7. Put that in `.env.local`, then run `npm run seed`.

### 3.1 — DeepSeek (required for ALL AI features)

Without this: no resume parsing, no job screening, no fit scores, no autofill,
no Gmail classification. **This is the most important optional service.**

⚠️ **This one costs money** — a few US dollars minimum top-up. Everything else
in this guide is free. Testing typically uses well under $1.

1. Go to **https://platform.deepseek.com** and sign up.
2. Click **Top up** / **Billing** and add the minimum credit. Without credit,
   every AI action fails.
3. Go to **API keys** in the left sidebar → **Create new API key**.
4. Give it a name (e.g. "ApplyNinjaa testing") and click Create.
5. **Copy the key immediately — it is shown only once.** It starts with `sk-`.
6. In `.env.local`, switch on the feature and paste the key:

   ```
   NEXT_PUBLIC_FEATURE_AI_PROVIDERS=deepseek
   DEEPSEEK_API_KEY=sk-your-key-here
   ```

7. Restart the app.

### 3.2 — Resend (sending real emails) — optional

**You probably do not need this.** Without it, every email the app sends
(verification links, password resets) is **printed into the terminal running
`npm run dev`** instead. That is usually easier for testing.

Set it up only if you want to test that emails really arrive in an inbox.

1. Go to **https://resend.com** and sign up (free tier).
2. Click **API Keys → Create API Key**. Name it, permission **Sending access**.
3. Copy the key (starts with `re_`).
4. In `.env.local`:

   ```
   RESEND_API_KEY=re_your-key-here
   AUTH_EMAIL_FROM=onboarding@resend.dev
   ```

5. Restart the app.

> Resend's test address `onboarding@resend.dev` can only send to **the email
> address you registered with**. To email anyone else you must verify your own
> domain, which is beyond testing scope.

### 3.3 — Google sign-in + Gmail scanning

One setup covers both. It is the longest section — allow 15 minutes.

**Create the project and consent screen:**

1. Go to **https://console.cloud.google.com** and sign in.
2. At the top, click the project dropdown → **New Project**. Name it
   "ApplyNinjaa" → **Create**. Wait, then make sure it is selected.
3. In the search bar, type **OAuth consent screen** and open it.
4. Choose **External** → **Create**.
5. Fill in: App name `ApplyNinjaa`, your email for both support and developer
   contact. **Save and Continue**.
6. On **Scopes**, click **Add or Remove Scopes**. In the filter box, search for
   `gmail.readonly`. Tick the row `.../auth/gmail.readonly`. Click **Update**,
   then **Save and Continue**.
   - _Skip this step if you only want the login button, not Gmail scanning._
7. On **Test users**, click **Add Users** and enter **the Gmail address you will
   test with**. **Save and Continue**.
   - ⚠️ Skipping this causes "app is blocked" errors later.

**Create the credentials:**

8. Search for **Credentials** → **Create Credentials** → **OAuth client ID**.
9. Application type: **Web application**. Name: `ApplyNinjaa Local`.
10. Under **Authorised redirect URIs**, click **Add URI** and add **both** of
    these, exactly:

    ```
    http://localhost:3000/api/auth/callback/google
    http://localhost:3000/api/gmail/callback
    ```

11. Click **Create**. A box shows your **Client ID** and **Client secret** —
    copy both.
12. In `.env.local`:

    ```
    NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GOOGLE=1
    NEXT_PUBLIC_FEATURE_GMAIL=1
    GOOGLE_CLIENT_ID=paste-client-id-here
    GOOGLE_CLIENT_SECRET=paste-client-secret-here
    ```

    > Turning on `NEXT_PUBLIC_FEATURE_GMAIL` requires these Google keys even if
    > you leave the Google login button off.

13. Restart the app.

### 3.4 — LinkedIn sign-in

1. Go to **https://www.linkedin.com/developers/apps** → **Create app**.
2. Fill in app name, and a LinkedIn **Company Page** (you must associate one; if
   you have none, create a free page first), and upload any logo. Create.
3. Open the **Products** tab → find **Sign In with LinkedIn using OpenID
   Connect** → **Request access**. It is normally granted instantly.
4. Open the **Auth** tab. Under **Authorized redirect URLs for your app**, add
   exactly:

   ```
   http://localhost:3000/api/auth/callback/linkedin
   ```

5. On the same tab, copy the **Client ID** and **Client Secret**.
6. In `.env.local`:

   ```
   NEXT_PUBLIC_FEATURE_AUTH_OAUTH_LINKEDIN=1
   LINKEDIN_CLIENT_ID=paste-here
   LINKEDIN_CLIENT_SECRET=paste-here
   ```

7. Restart the app.

### 3.5 — Stripe (payments)

Everything here uses Stripe **test mode** — fake cards, no real money.

**Get the keys:**

1. Go to **https://dashboard.stripe.com/register** and sign up.
2. **Make sure the "Test mode" toggle at the top right is ON.** Everything below
   assumes test mode.
3. Go to **Developers → API keys**.
4. Copy the **Publishable key** (`pk_test_...`) and reveal + copy the **Secret
   key** (`sk_test_...`).

**Set up the webhook** (lets Stripe tell the app when a payment succeeds):

5. Install the Stripe CLI: **https://docs.stripe.com/stripe-cli** — follow the
   instructions for your operating system.
6. In a **second terminal window**, run:

   ```bash
   stripe login
   ```

   This opens your browser to confirm. Then run:

   ```bash
   stripe listen --forward-to localhost:3000/api/payments/webhook
   ```

7. It prints `Your webhook signing secret is whsec_...`. **Copy that.**
   **Leave this terminal running** the whole time you test payments.

**Configure and create the products:**

8. In `.env.local`:

   ```
   NEXT_PUBLIC_FEATURE_PAYMENTS=1
   NEXT_PUBLIC_FEATURE_PAYMENTS_ANNUAL_BILLING=1
   STRIPE_SECRET_KEY=sk_test_your-key
   STRIPE_WEBHOOK_SECRET=whsec_your-secret
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your-key
   ```

9. Restart the app.
10. In a third terminal (inside the `ApplyNinjaa` folder), create the products
    in Stripe:

    ```bash
    npm run sync:plans
    ```

    Expected: one line per paid plan showing `product=prod_... monthly=price_...`,
    and a note that Free has no Stripe IDs (correct — it is free).

**Test card numbers** (use any future expiry date, any 3-digit CVC, any ZIP):

| Card number           | What it does                  |
| --------------------- | ----------------------------- |
| `4242 4242 4242 4242` | Payment succeeds              |
| `4000 0000 0000 0002` | Payment declined              |
| `4000 0025 0000 3155` | Requires authentication popup |

---

# Part 4 — Install the Chrome extension

### 4.1 — Build it

In a terminal (inside the `ApplyNinjaa` folder — you can use the same one as
`npm run seed`, but **not** the one running `npm run dev`):

```bash
npm run build:extension
```

Expected: ends with `✓ built in ...`.

### 4.2 — Load it into Chrome

1. Open Chrome and go to **chrome://extensions**
2. Turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** (top left).
4. Navigate into your `ApplyNinjaa` folder → select the **`extension/dist`**
   folder → click Select/Open.
   - ⚠️ Select `extension/dist`, **not** `extension`.
5. "ApplyNinjaa" now appears in your extensions list.
6. Click the puzzle-piece icon in Chrome's toolbar and **pin** ApplyNinjaa so
   its icon is always visible.

> **After any code change** you must run `npm run build:extension` again, then
> click the **refresh/reload icon** on the ApplyNinjaa card at
> chrome://extensions.

---

# Part 5 — Testing checklist

Work through these in order — later tests depend on earlier ones. For each test,
compare what you see against **Expected**. Anything different is a bug worth
reporting.

**Legend:** 🟢 = works without any Part 3 setup · 🔵 = needs DeepSeek ·
🟣 = needs Stripe · 🟠 = needs Google/Gmail

---

## A. Homepage and public pages

### A1 🟢 Homepage loads

1. Go to **http://localhost:3000**

**Expected:** Headline about not applying to jobs that will say no. Sections for
How It Works (4 steps), Pricing (4 cards: Free, Starter, Pro, Premium),
Testimonials, and a footer.

> Pricing cards are read from the database. If they are missing, `npm run seed`
> did not run successfully.

### A2 🟢 Pricing shows the right numbers

1. On the homepage, scroll to Pricing.

**Expected:** Free $0 / 5 AI actions · Starter $3.99 / 50 · Pro $6.99 / 150 ·
Premium $9.99 / 300. Pro is marked "Popular".

### A3 🟣 Monthly/annual toggle

1. In the Pricing section, click the **Annual** toggle.

**Expected:** Prices switch to yearly (about 20% cheaper than 12× monthly:
$38.30 / $67.10 / $95.90). Free stays $0.

> The toggle only appears when Stripe annual billing is switched on.

### A4 🟢 Cookie banner

1. Open the site in a **new Incognito window** (`Cmd/Ctrl + Shift + N`).

**Expected:** A cookie banner appears at the bottom with Accept and Reject.
Clicking either dismisses it. Reloading the page does **not** bring it back.

### A5 🟢 Legal pages

1. In the footer, click **Privacy Policy**, then **Terms of Service**, then
   **Cookie Policy**.

**Expected:** All three open and have real content (not "coming soon"). Specific
things to confirm are present:

- Privacy: a section on EEO/demographic data being encrypted and optional; a
  Gmail section mentioning **Google API Services User Data Policy** and
  **Limited Use**; a 30-day deletion section.
- Terms: a clearly-worded statement that **every action is initiated by you**
  and the product does not apply to jobs on your behalf.

### A6 🟢 Dark mode

1. Click the sun/moon icon in the top-right of the header.

**Expected:** The site switches between light and dark. Colours stay violet,
text stays readable everywhere. Reload the page — **your choice is remembered**
and there is no white flash before dark mode appears.

---

## B. Accounts and login

### B1 🟢 Sign up

1. Click **Get started** / go to http://localhost:3000/signup
2. Enter a new email (e.g. `test1@example.com`) and a password of at least 8
   characters. Submit.

**Expected:** You land on the dashboard, signed in. A yellow-ish banner says
**"Verify your email"**.

### B2 🟢 Try a weak password

1. Sign out (button in the header). Go to signup and try a 3-character password.

**Expected:** A clear error like "Password must be at least 8 characters". No
account is created.

### B3 🟢 Duplicate email is rejected

1. Try signing up again with the **same** email as B1.

**Expected:** An error saying the user already exists. No duplicate account.

### B4 🟢 Verify your email (this also starts the trial)

1. Look at the terminal running `npm run dev`.
2. Find a block like `[email → test1@example.com] Verify your ApplyNinjaa email`
   containing a long link starting with `http://localhost:3000/api/auth/verify-email?token=...`
3. Copy that entire link, paste it into Chrome, press Enter.

   > If you set up Resend (3.2), check your inbox instead and click the button.

**Expected:** You are redirected to the dashboard and the "Verify your email"
banner is **gone**.

### B5 🟢 Resend verification

1. Create another new account. On the dashboard banner, click **Resend email**.

**Expected:** Button shows "Sent ✓" and a fresh link appears in the terminal.

### B6 🟢 Log out and back in

1. Click **Log out**. Then log in with the account from B1.

**Expected:** Logging out returns you to the login page. Logging back in returns
you to the dashboard. A **wrong password** gives "Invalid email or password"
(and notably does **not** reveal whether the email exists).

### B7 🟢 Protected pages require login

1. While logged out, paste **http://localhost:3000/dashboard** into the address
   bar.

**Expected:** You are sent to the login page, not the dashboard.

### B8 🟠 Google sign-in

1. Log out. On the login page click **Continue with Google**. Complete the
   Google prompts.

**Expected:** You end up signed in on the dashboard. Because Google confirmed
your email, there is **no** "Verify your email" banner.

### B9 🟠 LinkedIn sign-in

Same as B8 using **Continue with LinkedIn**.

---

## C. Onboarding and profiles

### C1 🔵 Resume upload and parsing

1. Log in as your test user. Go to **http://localhost:3000/onboarding**
2. Step 1 (Welcome): click **Continue**.
3. Step 2: click the upload box and choose a **PDF or DOCX resume**.
   (Any real resume works. If you have none, export any Word/Google document
   with a name, job title, and a few skills.)

**Expected:** A "Reading your resume…" message, then after 5–20 seconds you land
on Step 3 with fields **already filled in** from the resume — name, email, work
history, education, skills.

> Nothing happens / error? DeepSeek (3.1) is not set up, or its account has no
> credit.

### C2 🟢 Everything is editable

1. On Step 3, change several fields — name, a job title, add a skill.

**Expected:** Every field can be edited. You can add and remove experience and
education entries with the Add/Remove buttons.

### C3 🟢 EEO section is genuinely optional

1. Scroll to the box about EEO/demographic answers.

**Expected — check all of these:**

- The consent checkbox is **NOT ticked** by default.
- The demographic dropdowns are **hidden** until you tick it.
- The wording explains the data is encrypted and optional.
- Ticking it reveals dropdowns for gender, race/ethnicity, veteran status, and
  disability status, each including a **"Prefer not to say"** option.

### C4 🟢 Save the profile

1. Give the profile a name (e.g. "Primary"), then click **Save & continue**.

**Expected:** You move to Step 4 (filters).

### C5 🟢 Filters step

1. On Step 4, review the list.

**Expected:** Six filters appear — Visa Sponsorship Available, US Citizenship
Required, Security Clearance Required, Work Authorization Match,
Remote/Hybrid/Onsite Match, Salary Range Disclosed — all switched **on**.
Toggling one off works. Typing a custom filter and clicking **Add** adds it to
the list with a Remove button.

### C6 🟢 Finish onboarding

1. Click **Continue**, then on Step 5 click **Go to my dashboard**.

**Expected:** The progress bar reached 100% and you land on the dashboard.

### C7 🟢 Multiple profiles

1. Go to **Profiles** in the top menu → **New profile**.
2. Name it "Backend" and fill in a couple of fields → **Create profile**.

**Expected:** Two profiles listed. One shows a **Default** badge. Clicking
**Make default** on the other moves the badge.

### C8 🟢 Duplicate profile names are rejected

1. Create another profile using an existing name.

**Expected:** Error: you already have a profile with that name.

### C9 🟢 Delete a profile

1. Click **Delete** on the "Backend" profile and confirm.

**Expected:** A confirmation dialog appears first; after confirming, the profile
disappears from the list.

---

## D. Chrome extension

Complete Part 4 first, and be signed in at http://localhost:3000 in the same
Chrome profile.

### D1 🟢 Popup opens

1. Open any real job posting in Chrome (LinkedIn, Indeed, Greenhouse, Lever —
   any site).
2. Click the ApplyNinjaa icon.

**Expected:** A popup opens showing the ApplyNinjaa header. It should **not** ask
you to sign in (it borrows your website session automatically).

### D2 🟢 Signed-out handling

1. Log out on the website, then click the extension icon on a job page.

**Expected:** The popup says to sign in and offers a **Sign in** button that
opens the login page. Log back in afterwards.

### D3 🔵 Job analysis

1. On a job posting page, open the popup and wait.

**Expected:** Within ~30 seconds you see:

- A **Fit score** out of 100 with a one-sentence explanation.
- A **badge per enabled filter** reading Yes, No, or Neutral.
- A usage counter in the header like `1/150 AI actions`.

Sanity-check the result: a job explicitly saying "we do not sponsor" should show
**No** for Visa Sponsorship Available.

### D4 🔵 Results are cached per page

1. Close the popup and immediately reopen it on the same job page.

**Expected:** Results appear instantly and the AI counter does **not** increase.
(Opening a _different_ job does use one more.)

### D5 🔵 Autofill

1. Open a page with an actual application **form** (e.g. click "Apply" on a
   Greenhouse/Lever posting).
2. Open the popup, click **Autofill**.

**Expected:** Form fields fill in with your profile data — name, email, phone,
etc. Below the buttons, a **"Review these fields manually"** list names any
field that was not filled or was low-confidence.

**Important check:** the file-upload (resume attachment) field must be left
**untouched** — it should never be auto-filled.

### D6 🔵 Right-click single field fill

1. On a form, **click into** a single empty field (e.g. Phone).
2. Right-click it → choose **Fill this field with ApplyNinjaa**.

**Expected:** That one field fills. If the AI cannot map it, a small dark
notification appears at the bottom-right explaining so.

### D7 🟢 Track a job

1. On a job posting, open the popup and click **Track**.

**Expected:** The button changes to **Tracked ✓**. 2. Go to http://localhost:3000/dashboard.
**Expected:** The job appears in the table with status **Applied**, and the
company/role filled in.

### D8 🟢 Profile picker remembers per site

1. Create a second profile (C7) if you deleted it.
2. On a job page, use the popup's profile dropdown to pick the second profile.
3. Close the popup, then reopen it on **another job on the same website**.

**Expected:** The dropdown still shows the profile you chose for that site.

### D9 🟢 Dark mode in the popup

1. Switch your **operating system** to dark mode (Mac: System Settings →
   Appearance; Windows: Settings → Personalisation → Colours).
2. Open the popup.

**Expected:** The popup follows, using dark violet colours with readable text.

---

## E. Applications dashboard

### E1 🟢 Table shows your applications

Go to http://localhost:3000/dashboard.

**Expected:** Columns for Company, Role, Status, Fit, Applied, Notes. With no
applications yet, a friendly empty message appears instead.

### E2 🟢 Inline editing

1. Click into the Company cell, change the text, then click elsewhere.
2. Reload the page.

**Expected:** The change persisted. The same works for Role, Notes, and the date.

### E3 🟢 Status dropdown has all ten values

1. Open the Status dropdown on any row.

**Expected:** Saved, Applied, OA/Assessment, Phone Screen, Interview, Final
Round, Offer, Rejected, Withdrawn, Ghosted. Changing it saves immediately
(confirm with a reload).

### E4 🟢 You can override the AI's fit score

1. Change the number in the **Fit** column to `99`. Click away. Reload.

**Expected:** Your value stuck — the user's judgement wins over the AI's.

### E5 🟢 Sorting

1. Click the **Company** header, then click it again.

**Expected:** Rows sort A→Z, then Z→A (arrow indicator flips). Fit and Applied
sort numerically/by date.

### E6 🟢 Search and filter

1. Type a company name into the search box.
2. Clear it, then pick a status in the status dropdown filter.

**Expected:** The table narrows to matching rows only.

### E7 🟢 Bulk actions

1. Tick the checkboxes on two rows.
2. Click **Mark rejected**.

**Expected:** Both rows change to Rejected. 3. With rows still selected, click **Delete** and confirm.
**Expected:** A confirmation appears first; the rows then disappear.

### E8 🟢 CSV export

1. Click **Export CSV**.

**Expected:** `applications.csv` downloads. Opening it in Excel/Numbers/Sheets
shows Company, Role, Status, Fit Score, Date Applied, URL, Notes.

> Selecting specific rows first exports only those rows.

---

## F. Usage limits and billing

### F1 🔵 Usage counter increases

1. Note the counter in the extension popup (e.g. `3/150`).
2. Analyze a new job posting.

**Expected:** The number goes up by exactly 1 per action.

### F2 🔵 Hitting the limit hard-blocks (important test)

The quickest way to test this is on a Free-plan account with only 5 actions.

1. Create a brand-new account but **do not verify its email** (unverified means
   no free trial, so it sits on Free with 5 actions).
2. Give it a profile **without uploading a resume**: go to **Profiles → New
   profile**, type a name and a few details, and save.
   - Uploading a resume would itself spend one of the five actions, changing
     the count below.
3. Analyze **6 different** job postings (different URLs — repeating the same
   posting reuses the cached result and does not count).

**Expected:** The 6th attempt is **refused**, not queued or silently ignored.
The popup shows **"Monthly AI limit reached"** with an **Upgrade** button.
Clicking Upgrade opens the billing page.

**Also confirm:** non-AI features still work while blocked — you can still
**Track** jobs and edit the dashboard.

### F3 🟣 Billing page

Go to http://localhost:3000/settings/billing.

**Expected:** Your current plan; if you are in the trial, "free trial, N days
left"; a usage bar showing used/total AI actions; and four plan cards.

### F4 🟣 Upgrade checkout

1. On the billing page click **Upgrade** on Starter.
2. Pay with card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.

**Expected:** Stripe's checkout page opens, payment succeeds, you return to the
dashboard. The Stripe CLI terminal shows events arriving. Back on
**/settings/billing**, the current plan now reads **Starter** and the AI
allowance is 50.

> Plan not updating? The `stripe listen` terminal must be running (3.5 step 6),
> and `STRIPE_WEBHOOK_SECRET` must match the one it printed.

### F5 🟣 Declined card

1. Repeat F4 with card `4000 0000 0000 0002`.

**Expected:** Stripe shows a decline message. Your plan does **not** change.

### F6 🟣 Customer portal

1. On the billing page click **Manage billing**.

**Expected:** Stripe's portal opens where you can update the card or cancel.

### F7 🟢 Trial countdown

1. Sign in with an account that verified its email (B4) and open
   /settings/billing.

**Expected:** Plan is **Pro** with a trial notice counting down from 7 days, and
a note that no card is on file.

---

## G. Gmail scanning 🟠

### G1 Connect Gmail

1. Go to **http://localhost:3000/settings/gmail**

**Expected:** An explanation that access is read-only, only scans on demand, and
that you approve every change — with a **Connect Gmail** button.

2. Click Connect and complete Google's prompts.

**Expected:** Google explicitly asks for permission to **read** your email. After
approving you return to the page, now showing your connected Gmail address.

> "App is blocked"? Add your address as a Test User (3.3 step 7).

### G2 Run a scan

1. Pick a date range covering a period when you received job-related emails
   (the default is the last 14 days).
2. Click **Scan Now**.

**Expected:** After 15–60 seconds a results block appears listing job-related
emails classified as interview / rejection / offer / assessment. Unrelated
emails (newsletters, personal mail) are excluded.

### G3 Nothing changes without your approval (important test)

1. Look at a proposal that matched one of your tracked applications.
2. **Before clicking anything**, check that application's status on the
   dashboard. Note it.
3. Return to the Gmail page and click **Approve** on that proposal.
4. Check the dashboard again.

**Expected:** The status was **unchanged** until you approved, and only changed
afterwards. This is the single most important Gmail behaviour to verify.

### G4 Dismiss a proposal

1. Click **Dismiss** on another proposal.

**Expected:** It is marked dismissed and the related application is **not**
changed.

### G5 Disconnect

1. Click **Disconnect**.

**Expected:** The page returns to the "Connect Gmail" state.

---

## H. Admin panel

Log in as **admin@example.com** / `Password123!`.

### H1 🟢 Admin access

1. Click **Admin** in the top menu.

**Expected:** An admin area with tabs: Overview, Users, Subscriptions (if Stripe
is on), Plans, Filters, Audit log, Settings.

### H2 🟢 Normal users are locked out (important security test)

1. Log out, log in as **user@example.com** / `Password123!`.
2. **Expected:** There is **no** Admin link in the menu.
3. Now paste **http://localhost:3000/admin** into the address bar.

**Expected:** A "page not found" — **not** the admin panel. Repeat with
**http://localhost:3000/admin/users**. Same result.

### H3 🟢 User management

Back as admin: **Admin → Users**.

**Expected:** All accounts listed with plan, AI usage this month, and status.
The search box filters by email/name.

### H4 🟢 Suspend blocks login

1. On a test user's row click **Suspend**. A reason is **required** — type one
   and confirm.
2. Log out and try to log in as that user.

**Expected:** Login is refused with a message about the account being suspended. 3. As admin, click **Reactivate** on that user; login works again.

### H5 🟢 Audit log records everything

1. Go to **Admin → Audit log**.

**Expected:** Your suspend and reactivate actions appear with who did it, what
they did, when, and the **reason you typed**.

### H6 🟢 Plan management

1. Go to **Admin → Plans**. Click edit on Starter and change its description.
   Save.

**Expected:** The change is saved and appears on the homepage pricing.

> With Stripe on, changing a **price** creates a new price in Stripe rather than
> editing the old one — existing subscribers keep the price they signed up at.

### H7 🟢 Filter master list

1. Go to **Admin → Filters**. Add a new default filter, e.g. "Sponsorship
   mentioned in posting".

**Expected:** It appears in the list. Now log in as a normal user and check
**Filters** in their menu — the new filter appears there too.

2. Back as admin, toggle a filter **off**.

**Expected:** It disappears from normal users' filter lists.

### H8 🟣 Refunds require a reason

1. **Admin → Subscriptions** (needs a completed test payment from F4).
2. Click **Refund** on a row.

**Expected:** A dialog with the amount pre-filled to the full charge **and a
required Reason box**. Submitting without a reason is rejected. 3. Enter a smaller amount and a reason, then confirm.
**Expected:** Success; the refund appears in your Stripe dashboard under
Payments; the action is in the Audit log.

### H9 🟣 Cancel is separate from suspend

1. On a subscription row click **Cancel**, give a reason, confirm.

**Expected:** The subscription is cancelled but the **user can still log in** —
cancelling billing and banning an account are deliberately different actions.

---

## I. Privacy and account deletion

### I1 🟢 Marketing email toggle

1. As any user, go to **http://localhost:3000/settings/account**

**Expected:** A toggle for marketing emails (on by default) and a Delete account
section. Toggling off and reloading keeps it off.

### I2 🟢 Unsubscribe link works without logging in

1. In the terminal or your inbox, find a marketing-style email's unsubscribe
   link. (If you have not sent one, skip — this is verified by I1.)

**Expected:** Opening the link while logged out shows an "You're unsubscribed"
confirmation page.

### I3 🟢 Account deletion is a 30-day soft delete

1. Sign up a throwaway account, then on /settings/account click **Delete**.

**Expected:** A confirmation dialog explains the 30-day recovery window. After
confirming you are signed out immediately, and trying to log back in with that
account is refused.

> The data is not gone yet — it is marked for deletion. The scheduled cleanup
> (`npm run hard-delete`) removes it permanently after 30 days.

### I4 🟢 Parsed resume file is not kept

1. Complete a resume upload (C1).

**Expected:** Only the extracted text/details are stored — the file you parsed
is not downloadable anywhere. Documents you deliberately save on a profile
(J5) are different and _are_ stored on purpose.

---

## J. Phase 3 features

### J1 🟢 Sidebar layout

1. Sign in and visit Dashboard, Profiles, Filters, Billing, Account, Help.
2. Narrow the window to phone width.

**Expected:** Navigation is a rail down the left on every signed-in page, with
the current page highlighted. Content uses the full remaining width. At phone
width the rail collapses behind a ☰ button and closes itself after you tap a
link.

### J2 🟢 Resume parsing shows a spinner

1. Onboarding step 2: choose a PDF resume.
2. Then go to **Profiles → open a profile → Upload résumé**, choose a PDF.

**Expected:** Both show a spinning indicator and "Reading your résumé…" for the
whole wait (this can take 10-20 seconds). The profile version fills the form
below it and leaves the profile name, job preferences and EEO answers alone.

### J3 🟢 Exclusions warn before you spend anything

1. **Filters → Exclusions**: add a company (use one you can find a posting for)
   and a keyword like `unpaid`.
2. Open a matching job posting and click the extension icon — **without**
   clicking Check fit score.

**Expected:** A red "On your exclusion list" banner naming up to two reasons,
with no AI action consumed (the counter in the popup header is unchanged).
Filter verdicts appear as a single ✓/✗/○ line you can click to expand.

### J4 🟢 Application details expand

1. Track a job after running Check fit score.
2. On the dashboard, click the ▸ at the start of that row.
3. Open the same job on a second site and use **Re-track** on it.

**Expected:** The panel shows the fit reasoning (a few specific sentences, not
one vague line), filter verdicts, what the AI read off the posting (location,
salary, sponsorship…), timestamps, and **every** link — the original and each
re-tracked one, labelled. Re-track in the popup lists those links straight
after it runs. Export CSV includes the new columns.

### J5 🟢 CV and cover letter attach themselves

1. **Profiles → open a profile → Documents**: upload a CV and a cover letter.
2. Open a real application form that has file upload fields (Greenhouse and
   Lever postings usually do) and click **Quick Fill**.

**Expected:** Both files appear attached in the page's own file fields, named
as you uploaded them. Quick Fill says how many files it attached and uses no AI
action. Removing a document on the profile stops it being attached.

### J6 🟢 Extension sign out and back in

1. In the popup, click **Sign out**.
2. Click **Sign in**, log in on the tab that opens.
3. Return to the popup and click **I've signed in — retry**.

**Expected:** Sign out returns the popup to the signed-out screen. Sign in lands
you on the dashboard. Retry restores the popup without reinstalling anything.

### J7 🟢 Manual per-field fill (no AI)

1. On any application form, right-click inside a text field.
2. **ApplyNinjaa → Fill manually →** your profile **→** a field.
3. Wait a minute (so the extension goes idle) and repeat on another field.

**Expected:** The chosen value is typed into the field, the AI counter does not
move, and the second attempt works exactly like the first. Adding a saved
answer on the profile and reopening the popup makes it appear in the menu.

### J8 🟣 Super admin can change any plan

1. As the super admin: **Admin → Users → Change plan** on another account.
2. Do the same for your own account from **Admin → Subscriptions**.
3. Check **Admin → Audit**.

**Expected:** The plan changes immediately (verify on that account's Billing
page), a reason is required, and both changes appear in the audit log. If the
account has a real Stripe subscription the dialog warns that billing is
unaffected — that is deliberate, not a bug.

---

# Troubleshooting

**"command not found: npm" (or node/git/docker)**
That tool is not installed or the terminal was opened before installing it.
Close the terminal, open a new one, try again. If it persists, reinstall from
Part 1.

**The app will not start and mentions "Invalid environment configuration"**
Read the list it prints — it names exactly which settings are missing and why.
Usually a feature was switched on in `.env.local` without its key. Either add
the key or put `#` back at the start of that feature's line, then restart.

**"MONGODB_URI is not configured" or connection errors**
Docker Desktop is not running, or the container stopped. Open Docker Desktop and
run `docker compose up -d` again.

**Port 3000 is already in use**
Another copy of the app is still running. Find its terminal and press
`Ctrl + C`, or restart your computer.

**Changes to `.env.local` seem ignored**
The app only reads that file at startup. Stop it (`Ctrl + C`) and run
`npm run dev` again.

**Extension shows old behaviour after a rebuild**
Run `npm run build:extension`, then go to chrome://extensions and click the
reload icon on the ApplyNinjaa card.

**Extension popup says to sign in but you are signed in**
Make sure you are signed in at exactly **http://localhost:3000** (not a
different port), in the same Chrome profile.

**AI actions fail**
Check `DEEPSEEK_API_KEY` is correct and that your DeepSeek account has credit.
The terminal running `npm run dev` prints the underlying error.

**Stripe payment succeeds but the plan does not change**
The `stripe listen` terminal must be running, and `STRIPE_WEBHOOK_SECRET` must
be the value that command printed.

**Google says "Access blocked" / "App is blocked"**
Add the Gmail address you are testing with as a **Test user** on the OAuth
consent screen (3.3 step 7).

**Starting over completely**
This erases all test data:

```bash
docker compose down -v
docker compose up -d
npm run seed
```

---

# Reporting problems

When something does not match the Expected result, capture:

1. **Which test** (e.g. "D5 Autofill").
2. **What you did** — the exact steps.
3. **What you expected** vs **what actually happened**.
4. **A screenshot** of the screen.
5. **The terminal output** — copy the last ~20 lines from the terminal running
   `npm run dev`. This usually contains the real error.
6. For extension issues: right-click inside the popup → **Inspect** → the
   **Console** tab → screenshot anything in red.

⚠️ **Before sharing, remove any keys/secrets** from what you copy (anything
starting `sk-`, `sk_test_`, `whsec_`, `re_`, or your `AUTH_SECRET` /
`EEO_ENCRYPTION_KEY`).

---

## Known state of the software

Be aware while testing:

- **This has never been run against a live database before.** Every
  database-backed feature in this guide is being exercised for the first time,
  including everything in section J.
- No AI, payment, email, or Gmail call has ever actually executed — those code
  paths are unproven.
- What _has_ been verified: the project builds cleanly, passes its code checks,
  and resume text extraction (PDF and DOCX) works.
- Automated tests do not exist yet, which is why this manual guide matters.

Prioritise reporting: anything that loses data, anything that lets a normal user
reach admin pages (H2), the AI limit not blocking (F2), and Gmail changing
anything without approval (G3).
