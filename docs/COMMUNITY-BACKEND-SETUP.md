# Setting up the community backend (Phase 3)

The site runs on Cloudflare. Its small backend — `functions/api/[[path]].ts`, which calls
`server/api.ts` — signs people in with GitHub and opens a pull request for each proposal. It
uses a **GitHub App**, so proposers need no access to the repository at all. Until it's set up,
the site works exactly as before, with the sample proposals.

Do it on a **test repository** first, so nothing touches the real one while you try it out.
Each step names where to click; nothing here needs the command line except step 1.

## 1. A test repository

1. On GitHub, create a new **private** repository, e.g. `physics-atlas-test` (empty: no README,
   no licence).
2. From the `physics-atlas` folder, push a copy of the project into it:

   ```powershell
   git push https://github.com/<owner>/physics-atlas-test.git main
   ```

3. In the test repo, open **Settings → Actions → General** and make sure Actions are allowed:
   the **Checks** workflow runs the validator on every proposal's pull request.

## 2. The GitHub App

**Settings → Developer settings → GitHub Apps → New GitHub App** (your personal settings, or
the organisation's if the repo belongs to one).

| Field | Value |
|---|---|
| GitHub App name | `Physics Atlas (test)` (names are global; add something if it's taken) |
| Homepage URL | your site, e.g. `https://physics-atlas.pages.dev` |
| Callback URL | `https://<your-site>/api/auth/callback` — add one per address you'll sign in on (the preview address too, see step 4) |
| Expire user authorization tokens | leave as it is (the site uses the token once, at sign-in) |
| Request user authorization (OAuth) during installation | off |
| Webhook → Active | **off** (no webhooks needed) |
| Repository permissions | **Contents: Read and write**, **Pull requests: Read and write**, **Issues: Read and write** (labels and the list of open proposals); Metadata: Read-only (set automatically) |
| Account permissions | none |
| Where can this GitHub App be installed? | Only on this account |

Then, on the App's page:

1. Note the **App ID** and the **Client ID**.
2. **Generate a new client secret** — copy it now, it's shown once.
3. **Generate a private key** — a `.pem` file downloads. Keep it safe; you'll paste its whole
   contents into Cloudflare. (It's in the "RSA PRIVATE KEY" format; the backend converts it, so
   paste it exactly as downloaded.)
4. **Install App** → choose the account → **Only select repositories** → the **test** repository.

## 3. The invite list

While the repository is private, only invited GitHub handles can submit. Add yourself:

- either edit `community/experts.json` in the test repository (see `community/README.md`):

  ```json
  { "experts": [{ "github": "<your-handle>", "name": "Your name", "verified": false }] }
  ```

- or, for a quick test, put your handle in the `ALLOWED_PROPOSERS` setting below.

## 4. The Cloudflare settings

In the Cloudflare dashboard, open the site's project.

**Build settings** (Settings → Build): build command `npm run build`, output directory `dist`,
and an environment variable `NODE_VERSION` = `22`.

**Variables and secrets** (Settings → Variables and secrets). Add these for the **Preview**
environment first (the test repo), and later for **Production** (the real repo). Mark the
secret ones as *Secret*.

| Name | Value | Secret? |
|---|---|---|
| `GITHUB_REPO` | `<owner>/physics-atlas-test` | no |
| `GITHUB_APP_ID` | the App ID | no |
| `GITHUB_CLIENT_ID` | the Client ID | no |
| `GITHUB_CLIENT_SECRET` | the client secret | **yes** |
| `GITHUB_APP_PRIVATE_KEY` | the whole `.pem` file, including the `-----BEGIN …-----` lines | **yes** |
| `SESSION_SECRET` | a long random string — e.g. run `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` | **yes** |
| `ALLOWED_PROPOSERS` | optional: extra invited handles, comma-separated | no |
| `GITHUB_BASE` | optional: the branch proposals start from (default `main`) | no |

Settings apply to the **next** deployment: push a commit (or use **Retry deployment**) after
changing them.

**Which address to test on:** Cloudflare gives each branch its own preview address,
`<branch>.<project>.pages.dev`. Push this work to a branch (e.g. `staging`), and add
`https://staging.<project>.pages.dev/api/auth/callback` as a callback URL in the GitHub App.

### If your project is a Worker

The `functions/` folder is how a Cloudflare **Pages** project runs code. If your project was
created as a **Worker** (the dashboard says "Worker", and there's no "Functions" tab), add a
`wrangler.jsonc` at the repository root instead:

```jsonc
{
  "name": "physics-atlas",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist", "binding": "ASSETS" }
}
```

`worker/index.ts` sends `/api/*` to the backend and everything else to the built site. The
variables and secrets are the same.

## 5. Check that it works

1. Open `https://<your-site>/api/me`. It should say `"configured": true`. If it says
   `"configured": false`, a setting is missing — `/api/proposals` lists which ones.
2. Open the **Community** tab. The account box says **Sign in with GitHub**; the sample
   proposals are gone (the map now shows the test repo's open proposals — none yet).
3. Sign in. GitHub asks you to authorise *Physics Atlas (test)* to read your profile. Back on
   the site: *Signed in as … @you*.
4. Write a proposal and press **Submit as a pull request**. A pull request appears in the test
   repository, labelled `proposal`, authored by you (opened by the app), with the content files
   and the **Checks** workflow running on it.
5. In a second browser (or a private window), open the Community tab: the proposal shows,
   dashed, within a minute.

## Going live

When you're ready to take proposals into the real repository: install the App there too (or
create a second App for production), set the **Production** variables with
`GITHUB_REPO=<owner>/physics-atlas`, and add the production callback URL. Invite people
through `community/experts.json` in the real repository.

## Security notes

- The App can only touch the repositories it's installed on, and only contents, pull requests
  and issues. Proposers' own GitHub tokens are used once, to read who they are, and never
  stored.
- The session is a signed cookie (HttpOnly, Secure, SameSite=Lax). Submissions from other
  sites are refused. Changing `SESSION_SECRET` signs everyone out.
- Everything a proposal changes is derived on the server from the proposal itself, checked
  against the map, and still goes through review and the Checks workflow before anyone merges.
