# Setting up the community backend (Phase 3)

The site is a **Cloudflare Worker**: the built site (static assets from `dist/`) plus a small
script, `worker/index.ts`, that sends `/api/*` to the community backend (`server/api.ts`).
`wrangler.jsonc` at the repository root ties the two together. The backend signs people in
with GitHub and opens a pull request for each proposal through a **GitHub App**, so proposers
need no access to the repository.

Until the settings below are in place, the site works exactly as before, with the sample
proposals — so it's safe to deploy the code first.

Proposals go into this repository, but only ever as a `proposal/…` branch and a pull request:
nothing reaches `main` until someone merges it. To undo a test, close the pull request and
delete its branch.

## 1. The GitHub App (done)

It belongs to the organisation and is installed on `physics-atlas`. For reference, these are
the settings it needs (organisation → Settings → Developer settings → GitHub Apps → the App):

| Field | Value |
|---|---|
| Callback URL | `https://<your-site>/api/auth/callback` (one per address you sign in on) |
| Webhook → Active | off |
| Repository permissions | **Contents: Read and write**, **Pull requests: Read and write**, **Issues: Read and write**; Metadata: Read-only |
| Account permissions | none |

From the App's page you need: the **App ID**, the **Client ID**, a **client secret**
(*Generate a new client secret*, shown once) and a **private key** (*Generate a private key*,
a `.pem` file downloads).

## 2. Deploy the Worker script

1. Check that `"name"` in `wrangler.jsonc` is your Worker's name, exactly as in the Cloudflare
   dashboard (Workers & Pages). If it differs, change the file — otherwise Cloudflare's build
   stops with a name mismatch.
2. In the Worker's **Settings → Build**: build command `npm run build`, deploy command
   `npx wrangler deploy` (no extra flags — `wrangler.jsonc` says where the assets are), and a
   build variable `NODE_VERSION` = `22`.
3. Commit and push. When the build finishes, open `https://<your-site>/api/me`: it should say
   `{"configured":false,…}`. That means the script runs; it just has no settings yet. The site
   itself is unchanged.

Now that the Worker has a script, its **Settings → Variables and Secrets** can be edited.

## 3. The settings

In the Worker: **Settings → Variables and Secrets → Add**. Use type **Secret** for the secret
ones (their values can't be read back afterwards — keep the originals somewhere safe).

| Name | Value | Type |
|---|---|---|
| `GITHUB_REPO` | `<organisation>/physics-atlas` | Text |
| `GITHUB_APP_ID` | the App ID | Text |
| `GITHUB_CLIENT_ID` | the Client ID | Text |
| `GITHUB_CLIENT_SECRET` | the client secret | **Secret** |
| `GITHUB_APP_PRIVATE_KEY` | the whole `.pem` file, including the `-----BEGIN …-----` and `-----END …-----` lines | **Secret** |
| `SESSION_SECRET` | a long random string, e.g. from `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"` | **Secret** |
| `ALLOWED_PROPOSERS` | optional: invited GitHub handles, comma-separated (on top of `community/experts.json`) | Text |
| `GITHUB_BASE` | optional: the branch proposals start from (default `main`) | Text |

Saving them deploys the Worker again with the new settings. `wrangler.jsonc` has
`"keep_vars": true`, so later pushes keep them.

## 4. The invite list

While the repository is private, only invited GitHub handles can submit. Either:

- add them to `community/experts.json` (see `community/README.md`) and push:

  ```json
  { "experts": [{ "github": "<handle>", "name": "Display name", "verified": false }] }
  ```

- or, for a first test, put your handle in `ALLOWED_PROPOSERS`.

The site re-reads the list within five minutes.

## 5. Check that it works

1. `https://<your-site>/api/me` → `"configured": true`. If it still says `false`,
   `https://<your-site>/api/proposals` lists the missing settings.
2. **Community** tab: the account box says **Sign in with GitHub**, and the sample proposals
   are gone (the map shows this repository's open proposals — none yet).
3. Sign in. GitHub asks you to authorise the App to read your profile; back on the site:
   *Signed in as … @you*.
4. Write a proposal → **Check and export** → **Submit as a pull request**. In the repository:
   a pull request labelled `proposal`, a `proposal/…` branch, one commit authored by you, and
   the **Checks** workflow running on it.
5. A second browser (or a private window) shows the proposal, dashed, within a minute.

If something fails, the Worker's **Logs** tab shows the backend's errors (logging is on in
`wrangler.jsonc`).

## Trying the backend locally (optional)

`npm run dev` has no backend (the Community view shows the samples). To run the Worker
itself locally, put the settings in a `.dev.vars` file at the repository root (it's in
`.gitignore` — never commit it), build, and run it:

```powershell
npm run build
npx wrangler dev
```

Signing in locally needs `http://localhost:8787/api/auth/callback` as an extra callback URL
in the App.

## Security notes

- The App can only touch the repository it's installed on, and only contents, pull requests
  and issues. Proposers' own GitHub tokens are used once, to read who they are, and never
  stored.
- The session is a signed cookie (HttpOnly, Secure, SameSite=Lax). Submissions from other
  sites are refused. Changing `SESSION_SECRET` signs everyone out.
- Everything a proposal changes is derived on the server from the proposal itself, checked
  against the map, and still goes through review and the Checks workflow before anyone merges.
