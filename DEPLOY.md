# Deploy

Vite + React static build → S3 static website hosting (HTTP only) → GitHub Actions on every push to `main`.

| | |
|---|---|
| Bucket | `mariavittoriariva.it`, region `eu-central-1` (from `x-amz-bucket-region`, 2026-10-17) |
| Website endpoint | `http://mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com` |
| Repo | `aris997/mariavittoriariva.it` (public), `origin` over SSH (`gharis` alias) |
| Workflow | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| CI identity | IAM user `gha-mariavittoriariva-it`, access keys in `production` environment secrets |
| DNS | Hostinger (`apollo`/`athena.dns-parking.com`) |

Code blocks contain no `#` comments, so they paste cleanly into zsh without `interactivecomments`.

## What the workflow does

Two jobs, so npm dependencies never run on the runner that holds the AWS keys:

- **`build`** (no secrets): `npm ci --ignore-scripts && npm run build` (Node from `.nvmrc`), fails if `dist/index.html` or `dist/error.html` is missing, uploads `dist/` as an artifact.
- **`deploy`** (`environment: production`, `main` only): downloads `dist/`, then:
  1. `dist/assets/` → `assets/`: no delete, `Cache-Control: public, max-age=31536000, immutable`, `--size-only` (names are content-hashed).
  2. Everything else → bucket root with `--delete` (excluding `assets/*`) and `Cache-Control: no-cache`. HTML is uploaded last, with `Content-Type: text/html; charset=utf-8`.
  3. Prunes stale `assets/` (`--delete`).
  4. Smoke-tests the website endpoint (HTTP 200 and the right Content-Type for `/` and the first js/css/woff2), then writes both URLs to the job summary.

The order means a visitor never gets HTML that points at assets not uploaded yet. Other Content-Types come from the AWS CLI's guess. The runner's CLI bundles Python 3.14, and its `mimetypes` (plus Ubuntu's `/etc/mime.types`) maps js, css, woff, woff2, svg, pdf and jpg correctly. HTML gets no charset from that guess, so the workflow sets it explicitly.

## 1. Local dev

Node 24 (`.nvmrc`):

```sh
nvm use
npm install
npm run dev
```

- `npm run dev` serves http://localhost:5173.
- Use `npm ci` for a clean, lockfile-exact install, which is what CI runs.

```sh
npm run build
npm run preview
```

`build` runs `tsc -b && vite build` into `dist/`. `preview` serves `dist/` at http://localhost:4173.

## 2. AWS, one-time

**Prerequisite:** `aws --version` must work (2.38.1 does). If it fails with `Library not loaded: .../libaws-c-s3.1.2.dylib`, see [§6](#local-homebrew-awscli-fails-with-library-not-loaded-libaws-c-s312dylib).

Run these with an admin profile (`export AWS_PROFILE=...` if needed). Every step below is idempotent except creating the access key, which is in §3.

```sh
export BUCKET=mariavittoriariva.it
export AWS_REGION=eu-central-1
export IAM_USER=gha-mariavittoriariva-it
export S3_WEBSITE="s3-website.$AWS_REGION.amazonaws.com"
aws sts get-caller-identity
```

`S3_WEBSITE` uses the dot style (`s3-website.<region>`). Only nine older regions use the dash style (`s3-website-<region>`): us-east-1, us-west-1, us-west-2, eu-west-1, ap-southeast-1, ap-southeast-2, ap-northeast-1, sa-east-1 and us-gov-west-1. The authoritative list is the [S3 website endpoints table](https://docs.aws.amazon.com/general/latest/gr/s3.html#s3_website_region_endpoints).

### 2.1 Bucket region

```sh
curl -sI "https://s3.amazonaws.com/$BUCKET" | grep -i '^x-amz-bucket-region'
aws s3api get-bucket-location --bucket "$BUCKET" --query LocationConstraint --output text
```

- The `curl` check needs no credentials.
- In the `get-bucket-location` output, `None` means `us-east-1` and `EU` means `eu-west-1`.
- Console: S3 → bucket → **Properties** → *AWS Region*.

### 2.2 Website configuration

This re-applies the same settings as the console's index/error documents.

```sh
aws s3api put-bucket-website --bucket "$BUCKET" \
  --website-configuration '{"IndexDocument":{"Suffix":"index.html"},"ErrorDocument":{"Key":"error.html"}}'
aws s3api get-bucket-website --bucket "$BUCKET"
```

`put-bucket-website` replaces the whole configuration (there are no routing rules here, so nothing is lost).

### 2.3 Block Public Access (bucket level)

Keep ACLs blocked and allow a public bucket policy:

```sh
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api get-public-access-block --bucket "$BUCKET"
```

Console: bucket → **Permissions** → *Block public access* → Edit. Leave the two *ACLs* boxes checked and uncheck the two *bucket policies* boxes.

Confirm ACLs are disabled (expect `BucketOwnerEnforced`, the default for buckets created since April 2023):

```sh
aws s3api get-bucket-ownership-controls --bucket "$BUCKET"
```

If it shows anything else: `aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'`.

**The account-level setting also applies, and the stricter of the two wins:**

```sh
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
aws s3control get-public-access-block --account-id "$ACCOUNT_ID"
```

- `NoSuchPublicAccessBlockConfiguration` means nothing is set at account level, which is fine.
- If `BlockPublicPolicy` or `RestrictPublicBuckets` is `true` there, the site returns 403.
- Relaxing it affects **every bucket in the account**: a bucket with an existing public policy that lacks its own bucket-level BPA becomes public again immediately. Audit first:

```sh
for b in $(aws s3api list-buckets --query 'Buckets[].Name' --output text); do
  [ "$b" = "$BUCKET" ] && continue
  printf '%s\t%s\n' "$b" "$(aws s3api get-public-access-block --bucket "$b" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text 2>/dev/null || echo NONE)"
done
```

For every bucket not showing `True True True True` (unless it is public on purpose), pin it at bucket level first, since the stricter level wins:

```sh
aws s3api put-public-access-block --bucket OTHER_BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Only then relax the account level:

```sh
aws s3control put-public-access-block --account-id "$ACCOUNT_ID" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
```

Console: S3 → *Block Public Access settings for this account*. If the account is in an AWS Organization, an SCP or an org-level S3 policy can also block this.

### 2.4 Public-read bucket policy

This grants `s3:GetObject` on objects only:

```sh
aws s3api put-bucket-policy --bucket "$BUCKET" --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::mariavittoriariva.it/*"
    }
  ]
}'
aws s3api get-bucket-policy-status --bucket "$BUCKET"
```

`get-bucket-policy-status` should show `"IsPublic": true`. If `put-bucket-policy` fails with `AccessDenied`, BlockPublicPolicy is still on at bucket or account level (§2.3).

Without a public `s3:ListBucket`, a missing path returns **403** (the body is still `error.html`) instead of 404. For real 404s, add a second statement: `s3:ListBucket` on `arn:aws:s3:::mariavittoriariva.it`. That makes the key listing public through the REST API, although every object is public anyway.

### 2.5 IAM deploy user (least privilege)

```sh
aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1 || aws iam create-user --user-name "$IAM_USER"
aws iam put-user-policy --user-name "$IAM_USER" --policy-name s3-deploy-mariavittoriariva-it --policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListForSync",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::mariavittoriariva.it"
    },
    {
      "Sid": "WriteObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::mariavittoriariva.it/*"
    }
  ]
}'
aws iam get-user-policy --user-name "$IAM_USER" --policy-name s3-deploy-mariavittoriariva-it
```

What each permission is for:

- **`s3:ListBucket`** (bucket ARN): `sync` runs `ListObjectsV2` on the destination to compute the diff. If the region is wrong, it also covers the CLI's `HeadBucket` redirect lookup.
- **`s3:PutObject`** (`/*`): uploads. This also covers multipart parts for files over 8 MB.
- **`s3:DeleteObject`** (`/*`): `--delete`.

Deliberately left out:

- **`s3:GetObject`**: a local→S3 sync never reads objects, and the smoke test uses the public endpoint.
- **`s3:PutObjectAcl`**: no `--acl` is used, and ACLs are disabled anyway.
- **`s3:AbortMultipartUpload`**: only needed to clean up a failed upload over 8 MB. Add it if you ever ship files that large.

`sts:GetCallerIdentity`, which `configure-aws-credentials` calls, needs no permission.

The access key is created in §3.2 and piped straight into GitHub secrets, so it never lands on disk.

### 2.6 `www` redirect bucket

```sh
aws s3api head-bucket --bucket "www.$BUCKET" 2>/dev/null || aws s3api create-bucket --bucket "www.$BUCKET" --region "$AWS_REGION" --create-bucket-configuration "LocationConstraint=$AWS_REGION"
aws s3api put-bucket-website --bucket "www.$BUCKET" \
  --website-configuration '{"RedirectAllRequestsTo":{"HostName":"mariavittoriariva.it","Protocol":"http"}}'
curl -sI "http://www.$BUCKET.$S3_WEBSITE/" | grep -iE '^(HTTP|Location)'
```

- Expect `301` with `Location: http://mariavittoriariva.it/`.
- A redirect-all bucket serves no objects, so it needs no bucket policy. Leave its Block Public Access on.
- For `us-east-1`, omit `--create-bucket-configuration`.
- **Never delete either bucket while a DNS record points at it** — remove the record first. S3 website endpoints resolve by bucket name, so anyone could re-create a deleted bucket and serve content on your domain.

## 3. GitHub

### 3.1 Repo

The repo already exists (`aris997/mariavittoriariva.it`, public) and `main` tracks `origin/main` over SSH, so pushes aren't limited by gh token scopes. Only the README is committed so far.

Everything you commit is public, including `cv/` (the original CV PDF) and the contact data in `src/content/`. `dist/`, `node_modules/` and `.claude/` are gitignored.

**Do §3.2 before pushing the site.** Any push to `main` runs the deploy, and without the variable and secrets it fails at *Resolve website endpoint* (`AWS_REGION` unset). `gh` only needs an API login for §3.2:

```sh
gh auth login --hostname github.com --web
gh repo view --json nameWithOwner,visibility
```

### 3.2 Environment, secrets and variable

Run this from the repo directory, so `gh` infers `OWNER/mariavittoriariva.it` from `origin`, in the same shell as §2 (it needs `AWS_REGION` and `IAM_USER`).

The `production` environment only accepts deployments from `main`, and the keys live there instead of in repo-wide secrets, so no other branch or dispatched ref can read them:

```sh
gh api -X PUT 'repos/{owner}/{repo}/environments/production' --input - <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST 'repos/{owner}/{repo}/environments/production/deployment-branch-policies' -f name=main -f type=branch
```

Create the access key and store it. If `create-access-key` fails (e.g. the user already has 2 keys), the existing secrets are left untouched; if storing fails, the new key is deleted again so no orphan credential is left behind:

```sh
: "${AWS_REGION:?}" "${IAM_USER:?}"
gh variable set AWS_REGION --body "$AWS_REGION"
if read -r AKID SAK < <(aws iam create-access-key --user-name "$IAM_USER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text) && [ -n "$SAK" ]; then
  { printf '%s' "$AKID" | gh secret set AWS_ACCESS_KEY_ID --env production && printf '%s' "$SAK" | gh secret set AWS_SECRET_ACCESS_KEY --env production; } || aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$AKID"
else
  echo 'create-access-key failed; secrets untouched'
fi
unset AKID SAK
gh secret list --env production
gh variable list
```

### 3.3 First deploy

```sh
git add -A
git status --short
git commit -m "Add site"
git push
```

Wait a few seconds for the run to register, then:

```sh
RUN_ID="$(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" --exit-status
gh run view "$RUN_ID" --web
```

The run's **Summary** tab shows `http://mariavittoriariva.it/` and the S3 website endpoint URL. To redeploy without a commit:

```sh
gh workflow run deploy.yml --ref main
```

### 3.4 Access key rotation

Rotate every 90 days. A user can hold at most 2 keys. (For a suspected leak, use the next section instead.)

1. Run `aws iam list-access-keys --user-name "$IAM_USER" --output table` and note the old key ID.
2. Re-run the `create-access-key` + `gh secret set` block from §3.2.
3. Run `gh workflow run deploy.yml --ref main` and wait for it to pass.
4. Disable the old key:

```sh
export OLD_AKID=AKIA...
aws iam update-access-key --user-name "$IAM_USER" --access-key-id "$OLD_AKID" --status Inactive
```

5. After a day or so with no failures, delete it:

```sh
aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$OLD_AKID"
```

### 3.5 Suspected key leak

Disable first, then investigate, then re-issue:

```sh
export LEAKED_AKID=AKIA...
aws iam update-access-key --user-name "$IAM_USER" --access-key-id "$LEAKED_AKID" --status Inactive
aws iam get-access-key-last-used --access-key-id "$LEAKED_AKID"
aws cloudtrail lookup-events --lookup-attributes AttributeKey=AccessKeyId,AttributeValue="$LEAKED_AKID" --max-results 50
```

Then run §3.2 for a new key. Redeploying alone does not restore integrity: assets sync with `--size-only`, so a tampered asset of the same size would never be overwritten (and is served `immutable`). From a clean local build, with admin credentials, force a full rewrite, then redeploy to prune extra keys:

```sh
npm ci && npm run build
aws s3 cp dist/assets "s3://$BUCKET/assets" --recursive --cache-control 'public, max-age=31536000, immutable'
gh workflow run deploy.yml --ref main
```

Optional hardening: enable bucket versioning (`aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled`, plus a `NoncurrentVersionExpiration` lifecycle rule). The CI user has no `s3:DeleteObjectVersion`, so a leaked key could not erase history.

Optional upgrade: a GitHub OIDC role (same action, `role-to-assume` instead of keys, trust condition `repo:OWNER/mariavittoriariva.it:environment:production`) removes long-lived keys entirely.

### 3.6 Action updates

Actions are pinned to commit SHAs. [`.github/dependabot.yml`](.github/dependabot.yml) opens a monthly PR bumping the pins (Dependabot PRs don't trigger this push-only workflow and get no secrets). Optionally, under repo **Settings → Actions → General**, allow only `actions/*` and `aws-actions/configure-aws-credentials` and require full-length SHA pinning.

## 4. DNS at Hostinger

S3 website hosting routes by the `Host` header, which must equal the bucket name. The apex therefore has to resolve to the S3 website endpoint while the browser keeps sending `Host: mariavittoriariva.it`. A plain CNAME can't sit at the apex. Hostinger supports **ALIAS** at `@`, which it flattens to the target's A records.

Sources: [How to Manage ALIAS Records at Hostinger](https://www.hostinger.com/support/?p=468) and [CNAME vs ALIAS Records at Hostinger](https://www.hostinger.com/support/10085192-cname-vs-alias-records-at-hostinger/), both updated 2026-09-15.

The live zone on 2026-10-17 (`dig`) had:

- NS `apollo` and `athena.dns-parking.com`
- `A @ 2.57.91.91` (Hostinger parking)
- `CNAME www → mariavittoriariva.it`
- no AAAA, MX or TXT records

To edit it: hPanel → **Domains** → `mariavittoriariva.it` → **DNS / Nameservers** → DNS records.

| Action | Type (in hPanel) | Name | Points to | TTL |
|---|---|---|---|---|
| delete | A | `@` | `2.57.91.91` (parking) | |
| delete | AAAA | `@` | any value (none today) | |
| delete | CNAME | `www` | `mariavittoriariva.it` | |
| delete if present | A | `ftp` | Hostinger default (absent today) | |
| **add** | **CNAME** (saved as ALIAS) | `@` | `mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com` | 3600 |
| **add** | **CNAME** | `www` | `www.mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com` | 3600 |

- **ALIAS at `@`:** in hPanel, pick type **CNAME**, set the name to `@`, and enter a bare hostname as the target (no `http://`, no path, no IP). Hostinger stores it as ALIAS and allows only one ALIAS per zone. If Hostinger CDN is enabled, disable it first, because it manages its own ALIAS.
- **Delete the old `@` records first.** Leaving the parking A record next to the ALIAS would hand out both sets of IPs.
- **Keep any MX/TXT records** you add later for mail. They don't conflict with an ALIAS.
- **Point at the bucket-prefixed hostname**, not the bare regional endpoint. Never hardcode S3 IPs in an A record, because they rotate.

### Verify

Before cutover, confirm you own both buckets the records will point at, then test the Host-header routing directly with no DNS change:

```sh
aws s3api head-bucket --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT_ID"
aws s3api head-bucket --bucket "www.$BUCKET" --expected-bucket-owner "$ACCOUNT_ID"
IP="$(dig +short "$BUCKET.$S3_WEBSITE" | grep -E '^[0-9.]+$' | head -n1)"
curl -sI --resolve "$BUCKET:80:$IP" "http://$BUCKET/" | head -n5
```

After cutover (querying the authoritative server skips caches):

```sh
dig +short "$BUCKET" @athena.dns-parking.com
dig +short "www.$BUCKET" @athena.dns-parking.com
curl -sI "http://$BUCKET/" | grep -iE '^(HTTP|Server|Content-Type)'
curl -sI "http://www.$BUCKET/" | grep -iE '^(HTTP|Location)'
```

- The apex should return S3 IPs, not `2.57.91.91`, and serve `Server: AmazonS3`.
- `www` should return `301` to `http://mariavittoriariva.it/`.

S3 rotates the endpoint's IPs (TTL 5 s). No Hostinger page says how often its ALIAS re-resolves the target, and day 1 looks the same either way. Check that the apex follows S3, and repeat 24–48 h later:

```sh
for i in 1 2 3; do dig +noall +answer "$BUCKET" @athena.dns-parking.com; dig +short "$BUCKET.$S3_WEBSITE" | tail -n +2 | head -3; sleep 20; done
```

Expect a short TTL and IPs that change along with S3's. If the apex keeps returning one fixed IP set with a long TTL (3600/14400), move to fallback 1 or 2 below before AWS retires those IPs.

### Fallbacks if Hostinger ALIAS misbehaves

Use these in order.

**1. Route 53 hosted zone with alias A records.** This is AWS-native, costs about $0.50/month plus queries, and doesn't depend on flattening. `Z21DNDUVLTQW6Q` is the S3 website hosted-zone ID for `eu-central-1`; take the ID for other regions from the endpoints table linked above.

```sh
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$BUCKET." --query "HostedZones[?Name=='$BUCKET.'].Id | [0]" --output text)"
if [ "$ZONE_ID" = "None" ]; then ZONE_ID="$(aws route53 create-hosted-zone --name "$BUCKET" --caller-reference "$BUCKET-$(date +%s)" --query HostedZone.Id --output text)"; fi
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch '{
  "Changes": [
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "mariavittoriariva.it", "Type": "A",
      "AliasTarget": {"HostedZoneId": "Z21DNDUVLTQW6Q", "DNSName": "s3-website.eu-central-1.amazonaws.com", "EvaluateTargetHealth": false}}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.mariavittoriariva.it", "Type": "A",
      "AliasTarget": {"HostedZoneId": "Z21DNDUVLTQW6Q", "DNSName": "s3-website.eu-central-1.amazonaws.com", "EvaluateTargetHealth": false}}}
  ]
}'
aws route53 get-hosted-zone --id "$ZONE_ID" --query DelegationSet.NameServers --output text
```

Then in hPanel go to **Domains** → `mariavittoriariva.it` → **DNS / Nameservers** → *Change nameservers*, and enter the 4 Route 53 nameservers. Create the zone and records *before* switching: `.it` nameserver changes can be rejected if the new servers don't answer authoritatively. After the switch, the Hostinger zone is ignored.

**2. Cloudflare DNS (free).** Change the nameservers to Cloudflare's. Add `CNAME @ → mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com` (flattened automatically) and `CNAME www → www.mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com`. Keep both **DNS only** (grey cloud): proxying changes the TLS and caching behaviour.

## 5. HTTPS

S3 website endpoints are HTTP only, so `https://mariavittoriariva.it` won't connect, and browsers mark the site "Not secure". Chrome is rolling out *Always Use Secure Connections* by default, which adds a click-through warning before the first visit to an HTTP-only site.

The path to HTTPS later:

1. Create an ACM certificate in **us-east-1** for the apex and `www`.
2. Put a CloudFront distribution in front, with the S3 *website* endpoint as an HTTP-only custom origin and both names as alternate domain names.
3. Point the Hostinger ALIAS at the `dxxxx.cloudfront.net` hostname.
4. Optionally, add `cloudfront:CreateInvalidation` to the IAM user and invalidate `/*.html` after the sync.

## 6. Troubleshooting

### 403 `AccessDenied` from the website

```sh
aws s3api get-public-access-block --bucket "$BUCKET"
aws s3control get-public-access-block --account-id "$ACCOUNT_ID"
aws s3api get-bucket-policy-status --bucket "$BUCKET"
aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text
```

Likely causes:

- `BlockPublicPolicy` or `RestrictPublicBuckets` is `true` at bucket **or account** level (or an Org policy enforces it).
- The policy is missing, or its `Resource` lacks `/*`.
- The path doesn't exist. With no public `ListBucket`, a missing key returns 403.
- Requester Pays is enabled.
- Objects are encrypted with SSE-KMS. Anonymous reads can't decrypt them; use the default SSE-S3.

### 403 in CI on `ListObjectsV2` or `PutObject`

- `s3:ListBucket` must be on the bucket ARN, and Put/Delete on `.../*`.
- `InvalidClientTokenId` or `SignatureDoesNotMatch` means the secrets are wrong or the key was rotated or deleted.

### 404 `NoSuchBucket`

The `Host` header doesn't match a bucket in that endpoint's region.

```sh
dig +short "$BUCKET"
curl -sI "http://$BUCKET/" | grep -i '^x-amz-error'
```

- DNS still points at parking, or there's a typo in the record.
- The `www` bucket doesn't exist yet (§2.6).
- `NoSuchWebsiteConfiguration` means website hosting is off; re-run §2.2.

### 400 `IncorrectEndpoint`

The record points at another region's website endpoint. The `x-amz-error-detail-endpoint` response header names the right one:

```sh
curl -sI "http://$BUCKET/" | grep -i '^x-amz-error'
```

### Stale content after a deploy

```sh
curl -sI "http://$BUCKET/" | grep -iE '^(cache-control|last-modified|etag)'
```

- HTML and root files are `no-cache`, so they revalidate on every load. Assets are immutable but content-hashed.
- The usual cause is a page cached *before* the first CI deploy. Objects uploaded by hand had no `Cache-Control`, so browsers cache them heuristically; hard-reload once.
- Also check that DNS has propagated.

### Wrong MIME type

```sh
curl -sI "http://$BUCKET/" | grep -i '^content-type'
```

- Expect `text/html; charset=utf-8`. Check assets the same way with `/assets/<file>`.
- Assets are synced with `--size-only`, so an asset uploaded with bad metadata is never re-uploaded. Fix it in place with admin credentials (the CI user can't read objects), for example:

```sh
aws s3 cp "s3://$BUCKET/assets/" "s3://$BUCKET/assets/" --recursive --exclude '*' --include '*.woff2' --metadata-directive REPLACE --content-type font/woff2 --cache-control 'public, max-age=31536000, immutable'
```

### Workflow fails at "Resolve website endpoint", "Check build output" or credentials

- **Resolve website endpoint:** the `AWS_REGION` repo variable is unset; see §3.2.
- **Check build output** (build job): `dist/error.html` is missing. `vite.config.ts` must list `error.html` in the build `input`.
- **configure-aws-credentials: credentials could not be loaded:** the keys are not set on the `production` environment (`gh secret list --env production`).

### Local Homebrew `awscli` fails with `Library not loaded: .../libaws-c-s3.1.2.dylib`

Seen on this machine on 2026-10-17 and fixed by upgrading to `awscli 2.38.1`. The `awscli 2.37.8` bottle's `_awscrt` module was built against `aws-c-s3 1.2.0`, but `aws-c-s3` had been upgraded to `1.3.0`, which only ships `libaws-c-s3.1.3.dylib`. `brew reinstall awscli` on a stale index re-pours the same broken bottle.

```sh
brew update
brew upgrade awscli
aws --version
otool -L "$(brew --prefix awscli)"/libexec/lib/python3.*/site-packages/_awscrt*.so | grep aws-c-s3
```

The `otool` line should reference a `libaws-c-s3` version that exists under `$(brew --prefix aws-c-s3)/lib`. If it still breaks, run `brew reinstall awscli` after `brew update`. Alternatively, drop Homebrew's CLI (`brew uninstall awscli`) and use AWS's self-contained installer, `https://awscli.amazonaws.com/AWSCLIV2.pkg`, which bundles its own CRT.
