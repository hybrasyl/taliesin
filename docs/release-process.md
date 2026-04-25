# Release Process

How to cut a Taliesin release end-to-end. The portable Windows build is
produced by the `release.yml` GitHub Action; everything else is a few
manual steps in the right order.

The flow at a glance:

1. Pre-release sanity (local)
2. Bump the version, commit, push
3. Push a `v*` tag (or wait for the GH UI to create the tag)
4. Create the release in the GitHub UI — this is what triggers the
   action that builds the portable exe and attaches it
5. Discord notification fires automatically on success

---

## 1. Pre-release sanity (local)

Before bumping anything, run the standard checks against `main`:

```bash
git checkout main
git pull
npm run typecheck
npm run test
```

Both must be clean. `npm run lint` is currently broken (parser config
issue, pre-existing — not a release blocker; tracked separately). The
build pipeline uses `tsc --build` and `electron-vite build`, neither of
which depends on the lint config.

Also smoke-test anything user-visible that landed since the last
release. The dev server is the user's job to launch
(`npm run dev` in their own shell), since Claude-launched Electron
hasn't worked reliably.

## 2. Bump the version

`package.json`'s `version` field drives the release tag and the
artifact name. Pick the bump:

- **Patch** (e.g. `2.3.0 → 2.3.1`): bug fixes only, no new
  user-visible features.
- **Minor** (e.g. `2.2.0 → 2.3.0`): new features, sizeable additions,
  or security hardening that users should notice. This is the common
  case.
- **Major** (e.g. `2.x → 3.0`): breaking changes to settings format,
  on-disk file layouts (palettes, calibrations, asset packs), or the
  IPC contract.

Edit `package.json`, then:

```bash
git add package.json
git commit -m "chore: bump version to X.Y.Z"
git push origin main
```

The commit message body can summarize the major themes of the release
(features, fixes, hardening) — it's what a reader sees in `git log`
even if they never see the GitHub release notes.

## 3. Tag the release

The GH UI requires the tag to exist before you can create a release
against it. Push the tag from CLI:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The `v` prefix is required — `release.yml` triggers on `tags: ['v*']`.

## 4. Draft the release notes

Get the full commit list since the previous release tag:

```bash
git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --oneline
```

(`HEAD^` skips the version-bump commit so `describe` finds the
prior tag, not the one you just pushed.)

**Read the whole list, don't skim.** Easy to undercount when many
commits are docs/chore that you'll skip but a few are quietly
user-visible. Group by user impact, not by commit order:

- **Highlights**: new features users will notice. One bullet per
  feature, lead with the user-facing thing, not the implementation.
- **Fixes**: bugs closed since the last release.
- **Security & hardening**: anything that changes the trust boundary
  (IPC validation, path gates, secrets handling).
- **Developer / docs**: test infra, license, README rewrites, plan
  archives. One short bullet per topic, not per commit.

Keep the markdown raw (in a fenced block when sharing in chat) so it
copies clean into the GH UI without rendering artifacts.

## 5. Create the release in the GitHub UI

1. https://github.com/hybrasyl/taliesin/releases → **Draft a new
   release**.
2. **Choose a tag** → select the `vX.Y.Z` you just pushed.
3. **Release title** → `vX.Y.Z` (or a short headline).
4. Paste the markdown notes from step 4 into the description.
5. Leave **Set as the latest release** checked.
6. **Publish release**.

Publishing the release fires `release.yml`:

- Builds the app (`npm ci`, `npm run build`)
- Packages the portable exe (`electron-builder --win portable
  --publish never`)
- Attaches `dist/*-portable.exe` to the release via
  `softprops/action-gh-release@v2`
- Posts a Discord announcement to the channel configured in the
  `DISCORD_WEBHOOK_URL` repo secret

Watch the Actions tab to confirm the build went green. Typical
runtime is a few minutes.

## 6. After the build

- Confirm the portable exe is attached to the release page.
- Confirm the Discord post landed (if applicable).
- If anything's wrong with the artifact, you can delete the release,
  delete the tag (`git push --delete origin vX.Y.Z`), fix forward,
  re-tag, and re-publish. Tags are cheap; don't be precious about them.

---

## Pinned facts

- Workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)
- Trigger: `push` of any tag matching `v*`
- Builds on: `windows-latest`, Node 24
- Currently produces: Windows portable exe only
  (`electron-builder --win portable`). `build:win`, `build:mac`,
  `build:linux` exist as npm scripts but aren't wired into CI.
- Discord webhook URL lives in repo secret `DISCORD_WEBHOOK_URL`.
- Previous tags are listed via `git tag --sort=-version:refname`.
