# UKMPPD Planner

A personal study planner for the UKMPPD CBT, running from 1 Dec 2026 to the exam (default 28 Feb 2027).
It's a plain HTML/CSS/JS app with no build step, hosted on GitHub Pages. Your logs are stored in Supabase so your phone and laptop stay in sync, and it keeps working offline.

## What the plan does

| Period | Days | What happens |
|---|---|---|
| Dec 1–24 (after 15:00) | 18 material days, 3 TOs, 3 light Sundays | First pass through all 18 subjects |
| Dec 25 – Jan 17 (full days) | 17 material days, 3 TOs, 4 light Sundays | Second pass: Tier A twice, Tier B once. Material study ends Jan 17 |
| Jan 18 – Feb 7 | 5 TOs + 1 drill day per week | Practice only: TO, review, drills, Anki |
| Ramadan (from Feb 8, 6 h) | TO every other day, drill days in between | Blocks moved around sahur and iftar |
| Final 7 days | Taper | Tier A repair → mixed → exam eve → exam |

- Sundays are always light half days.
- There are no TOs in the last 48 hours before the exam.
- If you change the exam date in Settings, the whole plan rebuilds and the taper moves with it.

## Setup: about 20 minutes, one time only

### 1. Create the Supabase project
1. Go to https://supabase.com and sign up (free).
2. Click **New project**:
   - Name it `ukmppd-planner`.
   - Choose region **Southeast Asia (Singapore)**.
   - Set a database password and save it somewhere private. **Never put it in this repo or share it.**
3. Wait about a minute for the project to finish starting.

### 2. Create the tables
1. In the left menu, open **SQL Editor** and click **New query**.
2. Open `supabase/schema.sql` from this repo, copy all of it, paste it in, and click **Run**.
3. You should see "Success. No rows returned".

This creates 3 tables. It also turns on Row Level Security, which means only your signed-in account can read or write your rows.

### 3. Create your login
The app uses email + password, so it never has to send you an email.

1. Go to **Authentication → Users**, click **Add user → Create new user**.
2. Enter your email and a password, tick **Auto Confirm User**, and click **Create user**.
3. Recommended: go to **Authentication → Sign In / Providers** and switch off **Allow new users to sign up**. Then nobody else can create an account in your project.

You don't need to touch **Emails → Templates**. On the free plan they can't be edited without custom SMTP, and this setup doesn't need them.

### 4. Put your keys in the app
1. In Supabase, go to **Project Settings → API** (or **API Keys**) and copy two values:
   - the **Project URL**, which looks like `https://abcd1234.supabase.co`
   - the **anon / publishable** key
2. Open `js/config.js` and replace the two placeholders with them.
3. Commit the change.

The anon/publishable key is designed to be public; the RLS rules from step 2 protect your data. **Do not** use the `service_role` / secret key anywhere.

### 5. Switch on GitHub Pages
1. In the repo, go to **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**, then branch `main`, folder `/ (root)`, and click **Save**.
3. After about a minute, your link appears at the top: `https://<your-username>.github.io/<repo-name>/`

### 6. Connect the link to Supabase (optional)
In **Authentication → URL Configuration**, set **Site URL** to your GitHub Pages link. Password sign-in works without this, but it keeps Supabase's settings tidy.

### 7. Sign in on both devices
1. Open the link on your laptop and sign in with the email and password from step 3.
2. Do the same on your phone.
3. On iPhone, tap Share → **Add to Home Screen**. On Android, open the ⋮ menu → **Install app**.
4. Test the sync: tick a block on your phone, then reload on your laptop. The tick should be there.
5. Finally, go to **Settings → Reset logs** to clear the test data.

## Daily use (under 1 minute of logging)
- **Blocks:** tap the circle when you finish a block. Each block counts as one hour.
- **Questions:** after each set, enter the number of questions and how many you got right, then tap **Add**. Choosing a source is optional.
- **Anki:** enter the number of cards you did. Only fill in backlog if there is one.
- **Energy:** tap 1 to 5.
- **Error log:** write one line per miss: the rule that would have got it right.

## Suggestions (you decide)
The app checks your numbers and suggests changes. Nothing changes until you tap **Accept**.

| Rule | Suggestion |
|---|---|
| Subject below 70% over its last sets | Add a repair session on the next drill or full material day |
| Subject 85%+ on two separate sets | Move it to maintenance and free its drill slots |
| Energy 2 or lower for 3 days | Cut question targets by about 40% for 48 hours |
| Last week's blocks below 80% | Lower this week's targets by about 13% |
| Anki backlog | New cards to 0 until it clears |

## Changing the plan
- **Calendar → tap a Phase 2 day** to switch it between a TO day, drill day or light day, or to change the drill subjects.
- **Settings:** exam date, when material study ends, Ramadan dates, TO length, and Anki target.
- **Settings → Undo all accepted changes** returns to the default plan.

## Backups
**Settings → Export JSON** downloads everything. **Import JSON** restores it.

## Updating the app
After changing files, bump `VERSION` in `sw.js` (for example to `ukmppd-v2`) so phones pick up the new version.

## Files
```
index.html            app shell
css/styles.css        design (style A, light + dark)
js/config.js          your Supabase URL + anon key
js/schedule.js        rules that generate the day-by-day plan
js/stats.js           accuracy, weekly stats, suggestion rules
js/store.js           local cache + Supabase sync
js/app.js             screens
supabase/schema.sql   tables + Row Level Security
sw.js, manifest.webmanifest, icons/   installable / offline
```

Note: the 66.4% line on the TO chart is the MCQs-CBT pass mark from the February 2026 period. It's shown for reference only; pass marks are set per period.
