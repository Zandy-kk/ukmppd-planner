# UKMPPD Planner

A personal study planner for the UKMPPD CBT, running from 1 Dec 2026 to the exam (default 28 Feb 2027).
It's a plain HTML/CSS/JS app with no build step, hosted on GitHub Pages. Your logs are stored in Supabase so your phone and laptop stay in sync, and it keeps working offline.

## What the plan does
| Period | What happens |
|---|---|
| Dec 1–24 (after 15:00, 3–5 h) | One lecture part per weekday (Medsense rewatch). Saturday = practice questions + error log for the subjects finished that week. Sunday light. |
| Dec 25 | Practice day for Pulmo, Rheum and Surgery |
| Dec 28 – Jan 4 | Full lecture days for the Maintain subjects: lecture → 60–80 Q → error log → Anki |
| Jan 5–16 | Review days, two subjects each: rewatch only flagged concepts (max ~1 h each) → 50–60 Q each → error log. Priority twice, Strengthen once, 3 slots for your weakest |
| Saturdays Dec 26, Jan 2, Jan 9 | Full TO + review |
| Jan 18 → taper | Practice only: TO days + drill days (two subjects each). Ramadan: TO every other day, about 6 h |
| Final 7 days | Taper: Priority subjects → mixed → exam eve → exam |

Days are checklists of steps with rough durations, not clock times. Unfinished lectures, sets and TOs appear under **Carried over** until you tick or drop them.

**Tiers** (Settings → Subject tiers): Priority, Strengthen, Maintain. They decide review and drill slots. The app suggests moves from your scores (below 70% → Priority, 85%+ twice → Maintain); nothing changes until you accept.

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
- **Steps:** tick each step when it's done. Saving a practice set or TO score ticks its step for you.
- **Practice / TO:** tap **+ Log** (bottom right, on every screen) or use the log card on Today. Choose Practice set or TO score, enter questions and correct, then **Save**. You can log TOs before 1 Dec too.
- **Tiers:** tap a tier chip (on Today, Stats or Settings) to switch Priority / Strengthen / Maintain.
- **Theme:** the moon/sun button switches dark and light mode; Settings → Appearance has Auto. There's an optional timer on practice and TO steps.
- **Anki:** enter cards done. Only fill in backlog if there is one.
- **Energy:** tap 1 to 5.
- **Error log:** one line per miss. Tap **Rewatch** on concepts you still don't get; they appear on that subject's next review day.
- **Sundays:** read the weekly recap and pick next week's repair targets.

## Suggestions (you decide)
The app checks your numbers and suggests changes. Nothing changes until you tap **Accept**.

| Rule | Suggestion |
|---|---|
| Subject below 70% over its last sets | Move it to Priority (more review and drill slots) |
| Subject 85%+ on two separate days | Move it to Maintain |
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
