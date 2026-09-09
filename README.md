# The Kitchen Plan

A daily calorie and protein ledger built around the printed plan. Every recipe
figure in here is generated from the same audited ingredient ledger as the PDF,
so the two cannot disagree.

The site is static files. Accounts and data live in Supabase, which is free.
Total cost: nothing.

---

## What you are setting up

| Piece | Where it lives | Cost |
|---|---|---|
| The site itself | GitHub Pages, your repo | Free |
| Login and database | Supabase, your account | Free |
| Your data | Supabase, plus JSON exports you download | Free |

Nothing depends on anyone else. If you stop paying attention to it for a year,
it is still yours.

---

## Part 1. Make the database

**1.1** Go to `https://supabase.com` and click **Start your project**. Sign in
with GitHub, which saves making another password.

**1.2** Click **New project**.

- **Name**: `kitchen-plan`
- **Database Password**: click Generate, then copy it into your password
  manager. You will almost certainly never need it, but there is no way to
  recover it later.
- **Region**: **West EU (London)** or **West EU (Ireland)**. Pick the closest
  one to you, it is the difference between the app feeling instant and feeling
  slightly slow.
- **Plan**: Free

Click **Create new project** and wait about two minutes while it builds.

**1.3** In the left sidebar click the **SQL Editor** icon, then **New query**.

**1.4** Open `schema.sql` from these files, copy the whole thing, paste it into
the editor, and click **Run**. You should see "Success. No rows returned."

That has created your four tables and, more importantly, turned on row level
security. That is the part that makes this genuinely private: the database
itself will refuse to hand one account another account's rows, even if someone
has the public key.

---

## Part 2. Point the app at your database

**2.1** In Supabase, click the gear icon (**Project Settings**) at the bottom of
the sidebar, then **API Keys**.

**2.2** Copy the **Publishable key**. It starts with `sb_publishable_`.

Supabase renamed these. Guides written before late 2025 tell you to look for an
**anon** or **public** key starting with `ey`, and projects created since then
do not have one. The publishable key is its replacement and works identically.
If your project does show an old `ey...` anon key, that works too.

Do **not** copy anything labelled **secret** (`sb_secret_...`) or
**service_role**. Those bypass all security and must never go in a website.

**2.3** You also need the **Project URL**. It is on the **Data API** page in the
same Settings menu, or behind the green **Connect** button at the top of the
dashboard. It looks like `https://abcdefghijkl.supabase.co`.

**2.4** Open `assets/config.js` in a text editor and paste both in:

```js
window.KITCHEN_CONFIG = {
  supabaseUrl: 'https://abcdefghijkl.supabase.co',
  supabaseKey: 'sb_publishable_AbC123...'
};
```

Save the file.

The publishable key being public is fine and intended. It only grants the
permissions your row level security policies allow, which is "your own rows once
you have signed in, nothing otherwise."

---

## Part 3. Lock the door behind you

By default anyone who finds the site could create an account. They would not be
able to see your data, but they would be using your database. Since this is
just for you, shut the door.

**3.1** First create your own account. You can do that after Part 4 when the
site is live, or right now by opening `index.html` in your browser.

**3.2** In Supabase go to **Authentication** in the sidebar, then **Sign In /
Providers**, and under Email turn **Allow new users to sign up** off. Save.

From then on, the only way in is an account that already exists. That is real
protection, enforced by the server, not a password box in JavaScript that
anyone could read around.

**Optional, to skip the confirmation email.** In the same Authentication
section, under Email, turn **Confirm email** off before you create your
account. Convenient for one person. Leave it on if other people will ever sign
up.

**If you want to add someone later**: turn signups back on, have them register,
turn signups off again. Or add them directly under Authentication > Users >
Add user.

---

## Part 4. Put the site on the internet

**4.1** Go to `https://github.com/new`.

- **Repository name**: `kitchen-plan`
- **Public**. GitHub Pages needs a public repo unless you pay for Pro. That is
  fine here, because the only key involved is the publishable one, and that is
  designed to be public.
- Do not tick "Add a README file".
- Click **Create repository**.

**4.2** On the next screen click **uploading an existing file**.

**4.3** Drag in everything from this folder:

```
index.html
schema.sql
README.md
assets/app.css
assets/app.js
assets/config.js      <- the one you edited
assets/data.js
assets/supabase.js
.github/workflows/keepalive.yml
```

Dragging the whole folder in at once keeps the `assets` structure. If your
browser flattens it, upload `index.html` first, then use **Add file > Upload
files** again and drag the `assets` folder on its own.

Write "First version" in the commit box and click **Commit changes**.

**4.4** In the repo, click **Settings**, then **Pages** in the left sidebar.

- **Source**: Deploy from a branch
- **Branch**: `main`, folder `/ (root)`
- Click **Save**

**4.5** Wait one to two minutes, then reload that page. It will show your
address:

```
https://YOUR-USERNAME.github.io/kitchen-plan/
```

Open it. You should get the sign-in screen.

**4.6** Create your account, confirm the email if you left that on, sign in, and
log something. Then go back and do step 3.2 to close signups.

---

## Part 5. Keep it awake

Free Supabase projects pause after seven days with no database activity. If you
log every day this never happens. It only bites when you go away.

The included workflow pokes the database every three days.

**5.1** In your repo go to **Settings > Secrets and variables > Actions**.

**5.2** Click **New repository secret** twice:

- Name `SUPABASE_URL`, value your project URL
- Name `SUPABASE_ANON_KEY`, value your publishable key

**5.3** Go to the **Actions** tab and enable workflows if prompted. You can hit
**Run workflow** once to check it works. It should print `Supabase replied 200`.

One thing to know: GitHub switches off scheduled workflows in repos that have
had no commits for 60 days. It emails you first. Pushing any change turns it
back on.

If a project does pause, nothing is lost. Open the Supabase dashboard and click
Restore, wait about 30 seconds.

---

## Part 6. Put it on your phone

**iPhone**: open the site in Safari, tap the share button, then **Add to Home
Screen**. It gets an icon and opens without browser chrome.

**Android**: open in Chrome, tap the three dots, then **Add to Home screen**.

You stay signed in, so from then on it is one tap to log a meal.

---

## Using it

**Today** is the logging screen. Add food opens a sheet with four tabs: the plan
recipes grouped by meal slot, the sides, your own saved foods, and a manual
entry form for anything else. The plus and minus buttons on a logged row change
the servings in half steps. The arrows at the top move between days, so you can
fill in yesterday if you forgot.

**Add psyllium and miso** puts both fixed daily items in with one tap.

**Ledger** is the point of the whole thing. The big number is your average
across the last seven logged days, which is the figure to steer by. Any single
day means very little.

**Recipes** is the full plan, ingredients and method, with a button to log any
of them straight to today.

**My foods** is your own library. Anything saved there shows up in the Add food
sheet.

**Settings** holds your targets, the weekly weigh-in, and the export button.

---

## Backups

The Supabase free plan has no automatic backups. Press **Download my data** in
Settings every few weeks. You get a plain JSON file with every entry, food,
weight and your targets. Keep it somewhere that is not your laptop.

---

## Changing things later

Edit the file on GitHub directly: open it in the repo, click the pencil icon,
make the change, commit. Pages redeploys in about a minute. Hard refresh in the
browser if you do not see it, since the old file may be cached.

To change your daily targets you do not need to touch any code, they are in
Settings.

---

## If something goes wrong

**"Something broke" mentioning a missing table or relation.** The schema has
not run. Redo Part 1.4.

**"Invalid API key" or a 401.** You have most likely pasted the Project URL and
the key the wrong way round, or copied a secret key instead of the publishable
one. The URL always starts `https://` and the key never does.

**Sign-in says invalid credentials but the password is right.** You probably
have not clicked the confirmation link in your email, or signups were disabled
before you created the account.

**The page says it is not connected to a database.** `config.js` still has the
placeholder text in it, or it did not upload. Check the repo shows your real
URL in `assets/config.js`.

**Everything loads but nothing saves.** Usually the project has paused. Open the
Supabase dashboard and restore it.

**Site shows a 404 after uploading.** Pages takes a minute or two on the first
deploy, and the file must be `index.html` at the repository root, not inside a
folder.

---

## What this does not do

It is a ledger, not a nutrition database. It knows the plan's recipes and
whatever you add yourself. There is no barcode scanning and no lookup of
arbitrary restaurant food, so anything outside the plan gets typed in with your
own estimate.

Calorie figures for the plan's recipes are as good as the labels behind them,
which is documented in the printed plan. Figures you type in are as good as
your guess.
