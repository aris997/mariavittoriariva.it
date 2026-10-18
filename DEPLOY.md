# Deploy

Vite + React static build → private S3 bucket → CloudFront (HTTPS, OAC, `www` → apex) → GitHub Actions on every push to `main`.

## As built

Verified live on 2026-10-18.

| | |
|---|---|
| Site | `https://mariavittoriariva.it/`. `http://` and `www` return 301 to it |
| Bucket | `mariavittoriariva.it`, `eu-central-1`. Private: Block Public Access all four on, ACLs disabled (`BucketOwnerEnforced`), SSE-S3, static website hosting off |
| Bucket policy | `s3:GetObject` on `mariavittoriariva.it/*` for `cloudfront.amazonaws.com`, only when `AWS:SourceArn` is this distribution |
| Distribution | `EL9HCOE5TAT16` (`d2hoan8wpwtbsz.cloudfront.net`). Aliases: apex and `www`. `DefaultRootObject` `index.html`, HTTP/2 and HTTP/3, IPv6, `PriceClass_All` |
| Origin | `mariavittoriariva.it.s3.eu-central-1.amazonaws.com`: the S3 REST endpoint, not the website endpoint. Read through OAC `E2YXTZ87324IL7` (`mariavittoriariva-it`, SigV4, always sign) |
| TLS | ACM certificate in `us-east-1` for the apex and `www`, DNS-validated. It renews automatically while the validation CNAMEs exist. SNI only, `TLSv1.2_2021` |
| Default behavior | `redirect-to-https`, GET/HEAD, managed `CachingOptimized` policy (`658327ea-f89d-4fab-a63d-7e88639e58f6`), compression on (brotli/gzip), viewer-request function `www-to-apex` |
| Error pages | 403 and 404 → `/error.html`, served as 404, error-caching TTL 10 s |
| Pricing | CloudFront flat-rate **Free** plan (active since 2026-10-17), covering the distribution and its web ACL. See [§6](#6-waf-and-cost) |
| WAF | Web ACL `CreatedByCloudFront-f099c992` with 3 AWS managed rule groups. Part of the Free plan: $0, and required while the plan is active |
| DNS | Hostinger (`apollo`/`athena.dns-parking.com`): ALIAS `@` and CNAME `www` → `d2hoan8wpwtbsz.cloudfront.net`, plus 2 ACM validation CNAMEs |
| Repo | `aris997/mariavittoriariva.it` (public), `origin` over SSH (`gharis` alias) |
| Workflow | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| CI identity | IAM user `github-action-mariavittoriariva.it-bucket` with inline policy `plc-iam-github-action-mariavittoriariva.it`. The access keys must be `production` environment secrets; check with §3.2 |
| Repo variables | `AWS_REGION=eu-central-1`; `CLOUDFRONT_DOMAIN=d2hoan8wpwtbsz.cloudfront.net` must be set before the CloudFront workflow runs (check with `gh variable list`) |
| Leftover | Bucket `www.mariavittoriariva.it`: the old HTTP redirect bucket, empty and unused since DNS points at CloudFront. It is safe to delete: `aws s3 rb s3://www.mariavittoriariva.it` |

Until 2026-10-18, the site was served from a public bucket through the HTTP-only S3 website endpoint. The distribution was created in the console and then rewritten with `update-distribution`. §2 rebuilds the same result with the CLI.

This repo is public, so the AWS account ID and the certificate ARN are not written here. The commands below derive them.

Code blocks contain no `#` comments, so they paste cleanly into zsh without `interactivecomments`.

## What the workflow does

There are two jobs, so npm dependencies never run on the runner that holds the AWS keys:

- **`build`** (no secrets): runs `npm ci --ignore-scripts && npm run build` with Node from `.nvmrc`. It fails if `dist/index.html` or `dist/error.html` is missing, then uploads `dist/` as an artifact.
- **`deploy`** (`environment: production`, `main` only): fails fast if the `AWS_REGION` or `CLOUDFRONT_DOMAIN` variable is unset. Then it downloads `dist/` and:
  1. Syncs `dist/assets/` → `assets/` with no delete, `Cache-Control: public, max-age=31536000, immutable` and `--size-only` (asset names are content-hashed).
  2. Syncs everything else → bucket root with `--delete` (excluding `assets/*`) and `Cache-Control: no-cache`. HTML is uploaded last, with `Content-Type: text/html; charset=utf-8`.
  3. Prunes stale `assets/` (`--delete`).
  4. Smoke-tests `https://$CLOUDFRONT_DOMAIN`. This is the `*.cloudfront.net` name, so the test doesn't depend on DNS. It checks for HTTP 200 and the right Content-Type on `/` and on the first js, css and woff2 file. Then it writes the site and CloudFront URLs to the job summary.

Because of this order, a visitor never gets HTML that points at assets not uploaded yet. Content-Types other than HTML come from the AWS CLI's guess. The runner's CLI bundles Python 3.14, whose `mimetypes` (plus Ubuntu's `/etc/mime.types`) maps js, css, woff, woff2, svg, pdf and jpg correctly. That guess gives HTML no charset, so the workflow sets it explicitly.

The workflow never invalidates CloudFront, so the CI user needs no CloudFront permission:

- `CachingOptimized` honours the origin's `Cache-Control`, clamped between 1 s and 1 year.
- HTML and root files are `no-cache`. The edge revalidates them against S3 at most 1 s apart (`x-cache: RefreshHit`), so a deploy is live immediately.
- Assets are cached for a year. That is only safe because their names change whenever their content does.

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

## 2. AWS: rebuild from scratch

**Prerequisites:** `aws --version` must work (2.38.1 does), along with `jq` and `dig`. If the CLI fails with `Library not loaded: .../libaws-c-s3.1.2.dylib`, see [§8](#local-homebrew-awscli-fails-with-library-not-loaded-libaws-c-s312dylib).

Use an admin identity, not root (see [§7](#7-caveats)).

Everything in this section already exists in the live account. Use it as the rebuild path and as the reference for each piece. Each step is idempotent or guarded unless it says otherwise.

```sh
export BUCKET=mariavittoriariva.it
export AWS_REGION=eu-central-1
export IAM_USER=github-action-mariavittoriariva.it-bucket
export DIST_ID=EL9HCOE5TAT16
export CF_DOMAIN=d2hoan8wpwtbsz.cloudfront.net
export ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export WORK="$(mktemp -d)"
aws sts get-caller-identity --query Arn --output text
```

On a rebuild, §2.6 replaces `DIST_ID` and `CF_DOMAIN`.

### 2.1 Bucket (private)

```sh
curl -sI "https://s3.amazonaws.com/$BUCKET" | grep -i '^x-amz-bucket-region'
aws s3api head-bucket --bucket "$BUCKET" --expected-bucket-owner "$ACCOUNT_ID" 2>/dev/null || aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION" --create-bucket-configuration "LocationConstraint=$AWS_REGION"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api delete-bucket-website --bucket "$BUCKET"
aws s3api get-bucket-encryption --bucket "$BUCKET" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text
```

- **Website hosting off:** website endpoints are HTTP only and can't use OAC, so the origin is the REST endpoint. `delete-bucket-website` succeeds even when there is no website configuration.
- **Encryption:** expect `AES256` (SSE-S3). With SSE-KMS, the KMS key policy would also have to allow CloudFront.
- **Region:** for `us-east-1`, omit `--create-bucket-configuration`.

**Account-level Block Public Access.** This site no longer needs it relaxed, and the bucket-level setting above is enough here. The account-level setting applies to **every** bucket, though, and another site in the same account may be served from a public bucket on purpose. Turning on all four settings would take that site down immediately. This block only applies it when no bucket is public by policy or by ACL:

```sh
aws s3control get-public-access-block --account-id "$ACCOUNT_ID"
PUBLIC_BUCKETS="$(for b in $(aws s3api list-buckets --query 'Buckets[].Name' --output text); do s="$(aws s3api get-bucket-policy-status --bucket "$b" --query PolicyStatus.IsPublic --output text 2>/dev/null)"; g="$(aws s3api get-bucket-acl --bucket "$b" --query 'Grants[?Grantee.Type==`Group`].Permission' --output text 2>/dev/null)"; if [ "$s" = True ] || [ -n "$g" ]; then echo "$b"; fi; done)"
if [ -z "$PUBLIC_BUCKETS" ]; then aws s3control put-public-access-block --account-id "$ACCOUNT_ID" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true; else printf 'public buckets, account BPA left unchanged:\n%s\n' "$PUBLIC_BUCKETS"; fi
```

- If another bucket must stay public by policy, you can still block ACLs account-wide (`BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false`), as long as no bucket relies on a public ACL.
- If the account is in an AWS Organization, an SCP or an org-level S3 policy can also enforce this.

### 2.2 IAM deploy user (least privilege)

The move to CloudFront didn't change this user. CI only writes objects: it never reads them and never touches CloudFront.

```sh
export IAM_POLICY=plc-iam-github-action-mariavittoriariva.it
aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1 || aws iam create-user --user-name "$IAM_USER"
aws iam put-user-policy --user-name "$IAM_USER" --policy-name "$IAM_POLICY" --policy-document '{
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
aws iam get-user-policy --user-name "$IAM_USER" --policy-name "$IAM_POLICY"
```

What each permission is for:

- **`s3:ListBucket`** (bucket ARN): `sync` runs `ListObjectsV2` on the destination to compute the diff. If the region is wrong, it also covers the CLI's `HeadBucket` redirect lookup.
- **`s3:PutObject`** (`/*`): uploads, including multipart parts for files over 8 MB.
- **`s3:DeleteObject`** (`/*`): `--delete`.

Deliberately left out:

- **`s3:GetObject`**: a local→S3 sync never reads objects, and the smoke test goes through CloudFront.
- **`cloudfront:CreateInvalidation`**: deploys don't need it (see [What the workflow does](#what-the-workflow-does)). Invalidations are an admin task.
- **`s3:PutObjectAcl`**: no `--acl` is used, and ACLs are disabled anyway.
- **`s3:AbortMultipartUpload`**: only needed to clean up a failed upload over 8 MB. Add it if you ever ship files that large.

`sts:GetCallerIdentity`, which `configure-aws-credentials` calls, needs no permission.

§3.2 creates the access key and pipes it straight into GitHub secrets, so it never lands on disk.

### 2.3 ACM certificate (us-east-1)

CloudFront only accepts certificates from `us-east-1`, whatever region the bucket is in.

```sh
CERT_ARN="$(aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='$BUCKET'].CertificateArn | [0]" --output text)"
if [ "$CERT_ARN" = "None" ]; then
  CERT_ARN="$(aws acm request-certificate --region us-east-1 --domain-name "$BUCKET" --subject-alternative-names "www.$BUCKET" --validation-method DNS --query CertificateArn --output text)"
  sleep 10
fi
export CERT_ARN
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
  --query 'Certificate.DomainValidationOptions[].[DomainName,ValidationStatus,ResourceRecord.Name,ResourceRecord.Value]' --output table
```

Add the two `ResourceRecord` CNAMEs at Hostinger ([§4](#4-dns-at-hostinger)), then wait. The loop polls instead of using `aws acm wait certificate-validated`, which gives up after 5 minutes:

```sh
until [ "$(aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" --query Certificate.Status --output text)" != PENDING_VALIDATION ]; do sleep 30; done
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
  --query 'Certificate.[Status,NotAfter,RenewalEligibility,SubjectAlternativeNames]' --output json
```

- Expect `ISSUED`, covering both names. It usually takes a few minutes once the CNAMEs resolve. ACM gives up after 72 hours.
- If `ResourceRecord` is empty right after the request, re-run `describe-certificate`.

### 2.4 Origin access control

```sh
OAC_ID="$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='mariavittoriariva-it'].Id | [0]" --output text)"
if [ "$OAC_ID" = "None" ]; then
  OAC_ID="$(aws cloudfront create-origin-access-control --origin-access-control-config '{"Name":"mariavittoriariva-it","SigningProtocol":"sigv4","SigningBehavior":"always","OriginAccessControlOriginType":"s3"}' --query OriginAccessControl.Id --output text)"
fi
export OAC_ID
echo "$OAC_ID"
```

The live OAC is `E2YXTZ87324IL7`. OAC replaces the legacy origin access identity (OAI): it signs every request with SigV4, and the bucket policy pins it to one distribution ARN.

### 2.5 `www` → apex function

The redirect runs at the edge, so `www` needs no bucket of its own. It keeps the path and the query parameters, so `?lang=` survives. Nothing on the site depends on the edge cases: parameter order isn't preserved, `k=` becomes `k`, and a repeated key keeps only its first value.

```sh
cat > "$WORK/www-to-apex.js" <<'EOF'
function handler(event) {
  var req = event.request;
  if (req.headers.host && req.headers.host.value === 'www.mariavittoriariva.it') {
    var qs = Object.keys(req.querystring).map(function (k) {
      var v = req.querystring[k].value;
      return v ? k + '=' + v : k;
    }).join('&');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://mariavittoriariva.it' + req.uri + (qs ? '?' + qs : '') } },
    };
  }
  return req;
}
EOF
FN_CONFIG='{"Comment":"Redirect www to apex","Runtime":"cloudfront-js-2.0"}'
if FN_ETAG="$(aws cloudfront describe-function --name www-to-apex --query ETag --output text 2>/dev/null)"; then
  aws cloudfront update-function --name www-to-apex --if-match "$FN_ETAG" --function-config "$FN_CONFIG" --function-code "fileb://$WORK/www-to-apex.js" --query ETag --output text
else
  aws cloudfront create-function --name www-to-apex --function-config "$FN_CONFIG" --function-code "fileb://$WORK/www-to-apex.js" --query ETag --output text
fi
```

`update-function` only changes the `DEVELOPMENT` stage. Test that stage, then publish it to `LIVE`, which is what the distribution runs:

```sh
FN_ETAG="$(aws cloudfront describe-function --name www-to-apex --query ETag --output text)"
aws cloudfront test-function --name www-to-apex --if-match "$FN_ETAG" --stage DEVELOPMENT --cli-binary-format raw-in-base64-out \
  --event-object '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.7"},"request":{"method":"GET","uri":"/cv","querystring":{"lang":{"value":"ja"}},"headers":{"host":{"value":"www.mariavittoriariva.it"}},"cookies":{}}}' \
  --query 'TestResult.[FunctionErrorMessage,FunctionOutput]' --output text
aws cloudfront publish-function --name www-to-apex --if-match "$FN_ETAG" --query FunctionSummary.Status --output text
export FUNC_ARN="$(aws cloudfront describe-function --name www-to-apex --stage LIVE --query FunctionSummary.FunctionMetadata.FunctionARN --output text)"
```

The test should print an empty error column followed by `"statusCode":301` and `"location":{"value":"https://mariavittoriariva.it/cv?lang=ja"}`.

### 2.6 Distribution

**Skip this on the live setup.** It creates a new distribution, and fails with `CNAMEAlreadyExists` while `EL9HCOE5TAT16` holds the aliases.

The config below matches the live distribution with one exception: `WebACLId` is empty. A distribution created this way is **pay-as-you-go**. The live one is on the flat-rate Free plan, which needs a web ACL; to match it, subscribe the new distribution in the console afterwards (see [§6](#6-waf-and-cost)). `jq` fills in the placeholders:

```sh
: "${CERT_ARN:?}" "${OAC_ID:?}" "${FUNC_ARN:?}"
jq --arg ref "$BUCKET-$(date +%s)" --arg cert "$CERT_ARN" --arg oac "$OAC_ID" --arg fn "$FUNC_ARN" '
  .CallerReference = $ref
  | .ViewerCertificate.ACMCertificateArn = $cert
  | .Origins.Items[0].OriginAccessControlId = $oac
  | .DefaultCacheBehavior.FunctionAssociations.Items[0].FunctionARN = $fn
' > "$WORK/dist-config.json" <<'EOF'
{
  "CallerReference": "CALLER_REFERENCE",
  "Aliases": {"Quantity": 2, "Items": ["mariavittoriariva.it", "www.mariavittoriariva.it"]},
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "s3-mariavittoriariva.it",
        "DomainName": "mariavittoriariva.it.s3.eu-central-1.amazonaws.com",
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": false},
        "OriginAccessControlId": "OAC_ID"
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-mariavittoriariva.it",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["HEAD", "GET"],
      "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]}
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "FunctionAssociations": {
      "Quantity": 1,
      "Items": [{"FunctionARN": "FUNCTION_ARN", "EventType": "viewer-request"}]
    }
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {"ErrorCode": 403, "ResponsePagePath": "/error.html", "ResponseCode": "404", "ErrorCachingMinTTL": 10},
      {"ErrorCode": 404, "ResponsePagePath": "/error.html", "ResponseCode": "404", "ErrorCachingMinTTL": 10}
    ]
  },
  "Comment": "",
  "PriceClass": "PriceClass_All",
  "Enabled": true,
  "ViewerCertificate": {
    "CloudFrontDefaultCertificate": false,
    "ACMCertificateArn": "CERT_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
  "WebACLId": "",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true
}
EOF
read -r DIST_ID CF_DOMAIN < <(aws cloudfront create-distribution --distribution-config "file://$WORK/dist-config.json" --query 'Distribution.[Id,DomainName]' --output text)
export DIST_ID CF_DOMAIN
echo "$DIST_ID $CF_DOMAIN"
aws cloudfront wait distribution-deployed --id "$DIST_ID"
```

- **Why 403 is mapped too:** CloudFront has no `s3:ListBucket`, so the private bucket answers a missing key with 403, not 404. Both codes become `error.html` with a real 404.
- **Aliases:** they require the certificate to be `ISSUED` and to cover both names.
- **Security headers (optional, not applied live):** the HTTP→HTTPS redirect is a plain 301 with no HSTS. Adding `"ResponseHeadersPolicyId": "67f7725c-6f97-4210-82d7-5512b31e9d03"` (Managed-SecurityHeadersPolicy) to `DefaultCacheBehavior` sends HSTS (1 year), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` and a referrer policy. HSTS is sticky in browsers for its max-age, so add it only once HTTPS is final.

### 2.7 Bucket policy (OAC)

```sh
: "${ACCOUNT_ID:?}" "${DIST_ID:?}"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": {"Service": "cloudfront.amazonaws.com"},
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/*",
      "Condition": {"StringEquals": {"AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"}}
    }
  ]
}
EOF
)"
aws s3api get-bucket-policy-status --bucket "$BUCKET" --query PolicyStatus.IsPublic --output text
```

- Expect `False`. S3 treats any fixed service principal as non-public, so `False` holds with or without the condition, and the policy coexists with Block Public Access.
- The `AWS:SourceArn` condition is what limits reads to this one distribution. Without it, any CloudFront distribution with an OAC (in any account) could read the bucket. Check the pin explicitly (expect `true`):

```sh
aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text | jq -e --arg arn "arn:aws:cloudfront::$ACCOUNT_ID:distribution/$DIST_ID" '[.Statement[] | select(.Effect == "Allow")] | length == 1 and .[0].Condition.StringEquals["AWS:SourceArn"] == $arn'
```

- `put-bucket-policy` replaces the whole policy.

**After a rebuild:**

1. Set `CLOUDFRONT_DOMAIN` to the new `$CF_DOMAIN` (§3.2).
2. Run the workflow to fill the bucket (`gh workflow run deploy.yml --ref main`).
3. Repoint DNS to the new `*.cloudfront.net` name (§4).

## 3. GitHub

### 3.1 Repo

The repo exists (`aris997/mariavittoriariva.it`, public), and `main` tracks `origin/main` over SSH, so pushes aren't limited by gh token scopes.

- `origin/main` (`851fe18`) already holds the site. It was deployed on 2026-10-17 by the old S3-website workflow.
- `cv/` (the original CV PDF) and the contact data in `src/content/` are therefore already in public history.
- `dist/`, `node_modules/` and `.claude/` are gitignored.

**Do §3.2 before pushing the CloudFront changes** (the workflow, this doc, `index.html`, `src/content/data.ts`, the README). Any push to `main` runs the deploy, and without `CLOUDFRONT_DOMAIN` it fails at *Check repository variables*. Until then, `gh workflow run deploy.yml` on `main` runs the **old** workflow, which syncs and then fails its smoke test against the now-disabled website endpoint.

`gh` only needs an API login for §3.2:

```sh
gh auth login --hostname github.com --web
gh repo view --json nameWithOwner,visibility
```

### 3.2 Environment, secrets and variables

Run this from the repo directory, so `gh` infers `OWNER/mariavittoriariva.it` from `origin`. Use the same shell as §2, because it needs `AWS_REGION`, `IAM_USER` and `CF_DOMAIN`.

The goal is that the keys live only in the `production` environment, and that environment only accepts deployments from `main`. Then no other branch or dispatched ref can read them. The first deploy (2026-10-17) auto-created the environment without a branch policy, and the keys it used were most likely repo-level secrets.

Set the branch policy (idempotent):

```sh
gh api -X PUT 'repos/{owner}/{repo}/environments/production' --input - <<<'{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST 'repos/{owner}/{repo}/environments/production/deployment-branch-policies' -f name=main -f type=branch
```

The `POST` fails with `already_exists` on a re-run, which is fine.

Set the variables and see where the secrets are:

```sh
: "${AWS_REGION:?}" "${IAM_USER:?}" "${CF_DOMAIN:?}"
gh variable set AWS_REGION --body "$AWS_REGION"
gh variable set CLOUDFRONT_DOMAIN --body "$CF_DOMAIN"
gh variable list
gh api 'repos/{owner}/{repo}/environments/production/deployment-branch-policies' --jq '.branch_policies[].name'
gh secret list
gh secret list --env production
aws iam list-access-keys --user-name "$IAM_USER" --query 'AccessKeyMetadata[].[AccessKeyId,Status,CreateDate]' --output text
```

What you want: the branch policy prints `main`; both `AWS_*` secrets appear under `--env production` and **not** under the repo-level list.

- **Both `AWS_*` secrets in the environment, none at repo level:** skip the next block.
- **Secrets only at repo level, or missing:** run the next block to issue a fresh key straight into the environment, since a key's secret can't be read back. After one green deploy, remove the repo-level copies with `gh secret delete AWS_ACCESS_KEY_ID` and `gh secret delete AWS_SECRET_ACCESS_KEY` (no `--env`), then delete the old IAM key with `aws iam delete-access-key`. If you still have the old pair, you can instead re-store it with `gh secret set AWS_ACCESS_KEY_ID --env production` and the same for `AWS_SECRET_ACCESS_KEY` (both prompt, input hidden), then delete the repo-level copies.

The next block creates the access key and stores it:

- If `create-access-key` fails (for example because the user already has 2 keys), the existing secrets are left untouched.
- If storing fails, the new key is deleted again, so no orphan credential is left behind.

```sh
if read -r AKID SAK < <(aws iam create-access-key --user-name "$IAM_USER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text) && [ -n "$SAK" ]; then
  { printf '%s' "$AKID" | gh secret set AWS_ACCESS_KEY_ID --env production && printf '%s' "$SAK" | gh secret set AWS_SECRET_ACCESS_KEY --env production; } || aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$AKID"
else
  echo 'create-access-key failed; secrets untouched'
fi
unset AKID SAK
gh secret list --env production
```

`CLOUDFRONT_DOMAIN` must be the bare hostname, with no `https://` and no trailing slash, because the workflow prepends `https://`.

### 3.3 Deploy the CloudFront changes

```sh
git add -A
git status --short
git commit -m "Serve through CloudFront over HTTPS"
git push
```

Wait a few seconds for the run to register, then:

```sh
RUN_ID="$(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$RUN_ID" --exit-status
gh run view "$RUN_ID" --web
```

The run's **Summary** tab shows `https://mariavittoriariva.it/` and `https://d2hoan8wpwtbsz.cloudfront.net/`. To redeploy without a commit:

```sh
gh workflow run deploy.yml --ref main
```

### 3.4 Access key rotation

Rotate every 90 days. A user can hold at most 2 keys. For a suspected leak, use §3.5 instead.

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

Disable the key first, then look at what's possible, then re-issue:

```sh
export LEAKED_AKID=AKIA...
aws iam update-access-key --user-name "$IAM_USER" --access-key-id "$LEAKED_AKID" --status Inactive
aws iam get-access-key-last-used --access-key-id "$LEAKED_AKID"
aws s3api list-objects-v2 --bucket "$BUCKET" --query 'sort_by(Contents,&LastModified)[].[LastModified,Size,Key]' --output text | tail -n 50
gh run list --workflow deploy.yml --limit 20 --json createdAt,updatedAt,conclusion,headSha
```

Everything this key can do (list, put, delete objects) is an S3 data event. No trail or S3 access logging records those here, and CloudTrail event history only holds management events. So:

- A `LastModified` outside a deploy window is suspect.
- Deletions leave no trace.
- Assume tampering and always do the full restore below.

Then run §3.2 for a new key, and delete the leaked one: `aws iam delete-access-key --user-name "$IAM_USER" --access-key-id "$LEAKED_AKID"`.

Redeploying alone does not restore integrity, for two reasons:

- Assets sync with `--size-only`, so a tampered asset of the same size would never be overwritten.
- CloudFront keeps whatever it cached for up to a year.

Fix it with admin credentials, without building locally (no `npm` on the machine that holds admin credentials):

1. Delete every asset, so the redeploy has to re-upload all of them.
2. Redeploy, which also rewrites the root files and prunes extra keys. Until the run finishes, edges without a cached copy serve the 404 page for assets.

```sh
aws s3 rm "s3://$BUCKET/assets/" --recursive
gh workflow run deploy.yml --ref main
```

3. Once the run is green, flush every edge:

```sh
INV_ID="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INV_ID"
```

- `/*` counts as one invalidation path, and the first 1,000 paths each month are free.
- Browsers that already fetched a tampered asset keep it for a year (`immutable`). Only a build that changes the affected asset's hash evicts it. A leaked key also controls object metadata, so tampered HTML could carry a long max-age. The invalidation clears the edges, not browsers.

**Optional hardening:**

- Enable bucket versioning: `aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled`, plus a `NoncurrentVersionExpiration` lifecycle rule. The CI user has no `s3:DeleteObjectVersion`, so a leaked key could not erase history.
- Record S3 writes: server access logging to a separate bucket, or a CloudTrail trail with S3 `WriteOnly` data events on this bucket.
- Switch to a GitHub OIDC role: the same action with `role-to-assume` instead of keys, and the trust condition `repo:OWNER/mariavittoriariva.it:environment:production`. This removes long-lived keys entirely.

### 3.6 Action updates

Actions are pinned to commit SHAs. [`.github/dependabot.yml`](.github/dependabot.yml) opens a monthly PR that bumps the pins. Dependabot PRs don't trigger this push-only workflow and get no secrets.

Optionally, under repo **Settings → Actions → General**:

- allow only `actions/*` and `aws-actions/configure-aws-credentials`;
- require full-length SHA pinning.

## 4. DNS at Hostinger

hPanel → **Domains** → `mariavittoriariva.it` → **DNS / Nameservers** → DNS records. The live zone:

| Type (in hPanel) | Name | Points to | Purpose |
|---|---|---|---|
| CNAME (stored as ALIAS) | `@` | `d2hoan8wpwtbsz.cloudfront.net` | Apex. Hostinger flattens it to CloudFront's A/AAAA records (TTL 300 observed) |
| CNAME | `www` | `d2hoan8wpwtbsz.cloudfront.net` | `www`. TTL 3600; the function returns 301 to the apex |
| CNAME | `_<hash>` | `_<hash>.<id>.acm-validations.aws` | ACM validation for the apex. **Keep it:** renewal needs it |
| CNAME | `_<hash>.www` | `_<hash>.<id>.acm-validations.aws` | ACM validation for `www`. **Keep it:** renewal needs it |

- **ALIAS at `@`:** in hPanel, pick type **CNAME**, set the name to `@`, and enter a bare hostname as the target. Hostinger stores it as an ALIAS and allows only one ALIAS per zone. If Hostinger CDN is enabled, disable it first, because it manages its own ALIAS.
- **No other A/AAAA records at `@`:** the old parking record (`2.57.91.91`) is gone. Mail MX/TXT records can be added freely.
- **ACM record names and values:** take them from `describe-certificate` (§2.3). In hPanel, drop the trailing `.mariavittoriariva.it.` from the name.

Check against the authoritative server, which skips caches:

```sh
dig +noall +answer A "$BUCKET" @athena.dns-parking.com
dig +noall +answer AAAA "$BUCKET" @athena.dns-parking.com
dig +noall +answer CNAME "www.$BUCKET" @athena.dns-parking.com
for n in $(aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" --query 'Certificate.DomainValidationOptions[].ResourceRecord.Name' --output text); do dig +noall +answer CNAME "$n" @athena.dns-parking.com; done
```

What to expect:

- The apex returns CloudFront addresses (`13.33.x`, `18.238.x`, `99.86.x`, `2600:9000:…`) with TTL 300, and the set changes between queries.
- `www` returns a CNAME to `d2hoan8wpwtbsz.cloudfront.net`.
- Both ACM names return CNAMEs under `acm-validations.aws`.

### Fallback: Route 53

If the Hostinger ALIAS misbehaves (see [§7](#7-caveats)), host the zone in Route 53. It costs about $0.50/month plus queries. Alias A/AAAA records there resolve CloudFront for the visitor's own resolver. `Z2FDTNDATAQYW2` is the fixed hosted-zone ID for every CloudFront alias target.

```sh
ZONE_ID="$(aws route53 list-hosted-zones-by-name --dns-name "$BUCKET." --query "HostedZones[?Name=='$BUCKET.'].Id | [0]" --output text)"
if [ "$ZONE_ID" = "None" ]; then ZONE_ID="$(aws route53 create-hosted-zone --name "$BUCKET" --caller-reference "$BUCKET-$(date +%s)" --query HostedZone.Id --output text)"; fi
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch '{
  "Changes": [
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "mariavittoriariva.it", "Type": "A", "AliasTarget": {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "d2hoan8wpwtbsz.cloudfront.net", "EvaluateTargetHealth": false}}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "mariavittoriariva.it", "Type": "AAAA", "AliasTarget": {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "d2hoan8wpwtbsz.cloudfront.net", "EvaluateTargetHealth": false}}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.mariavittoriariva.it", "Type": "A", "AliasTarget": {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "d2hoan8wpwtbsz.cloudfront.net", "EvaluateTargetHealth": false}}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "www.mariavittoriariva.it", "Type": "AAAA", "AliasTarget": {"HostedZoneId": "Z2FDTNDATAQYW2", "DNSName": "d2hoan8wpwtbsz.cloudfront.net", "EvaluateTargetHealth": false}}}
  ]
}'
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" --query 'Certificate.DomainValidationOptions[].ResourceRecord' --output json \
  | jq '{Changes: [.[] | {Action: "UPSERT", ResourceRecordSet: {Name: .Name, Type: .Type, TTL: 300, ResourceRecords: [{Value: .Value}]}}]}' > "$WORK/r53-acm.json"
aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" --change-batch "file://$WORK/r53-acm.json"
aws route53 get-hosted-zone --id "$ZONE_ID" --query DelegationSet.NameServers --output text
```

Then, in hPanel, go to **Domains** → `mariavittoriariva.it` → **DNS / Nameservers** → *Change nameservers*, and enter the 4 Route 53 nameservers.

- **Create the zone and its records before switching.** `.it` nameserver changes can be rejected if the new servers don't answer authoritatively.
- **Copy every record first.** After the switch, the Hostinger zone is ignored, so the ACM CNAMEs (done above) and any MX/TXT records must already be in Route 53.

## 5. Verify

```sh
chk() { printf '%-72s ' "$1"; curl -sS -o /dev/null --max-time 20 -w '%{http_code} %{content_type} %{redirect_url}\n' "$1"; }
chk "https://$CF_DOMAIN/"
chk https://mariavittoriariva.it/
chk http://mariavittoriariva.it/
chk 'https://www.mariavittoriariva.it/?lang=ja'
chk https://mariavittoriariva.it/does-not-exist
chk https://mariavittoriariva.it/maria-vittoria-riva-cv.pdf
chk https://mariavittoriariva.it/favicon.svg
chk https://s3.eu-central-1.amazonaws.com/mariavittoriariva.it/index.html
chk http://mariavittoriariva.it.s3-website.eu-central-1.amazonaws.com/
```

| Check | Expect |
|---|---|
| CloudFront domain and apex | `200 text/html; charset=utf-8` |
| `http://` apex | `301` → `https://mariavittoriariva.it/` |
| `www` with `?lang=ja` | `301` → `https://mariavittoriariva.it/?lang=ja` |
| Missing path | `404 text/html; charset=utf-8` (the `error.html` body, `x-cache: Error from cloudfront`) |
| PDF, SVG | `200 application/pdf`, `200 image/svg+xml`. These are fetched through OAC, so OAC works with the dotted bucket name |
| S3 REST endpoint (path-style) | `403 application/xml`: there is no public access |
| Old website endpoint | `404`, `NoSuchWebsiteConfiguration` |

Use path-style URLs for manual S3 checks. Virtual-hosted HTTPS (`https://mariavittoriariva.it.s3…`) fails TLS, because the `*.s3…` wildcard certificate doesn't cover a dotted bucket name.

Headers and compression:

```sh
curl -sSI https://mariavittoriariva.it/ | grep -iE '^(HTTP|content-type|cache-control|x-cache)'
ASSET="$(curl -sS https://mariavittoriariva.it/ | grep -oE '/assets/[^"]+\.js' | head -n1)"
curl -sSI -H 'Accept-Encoding: br' "https://mariavittoriariva.it$ASSET" | grep -iE '^(HTTP|content-type|content-encoding|cache-control|x-cache)'
```

- HTML: expect `cache-control: no-cache` and `x-cache: RefreshHit from cloudfront` (or `Miss`).
- Asset: expect `content-encoding: br`, `cache-control: public, max-age=31536000, immutable`, and `x-cache: Hit from cloudfront` after the first request.

Distribution state (this prints the account ID locally):

```sh
aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.[Status,DomainName]' --output text
aws cloudfront get-distribution-config --id "$DIST_ID" --query 'DistributionConfig.{Aliases:Aliases.Items,Origin:Origins.Items[0].DomainName,OAC:Origins.Items[0].OriginAccessControlId,Function:DefaultCacheBehavior.FunctionAssociations.Items[0].FunctionARN,Errors:CustomErrorResponses.Items[].[ErrorCode,ResponseCode,ResponsePagePath],WAF:WebACLId}' --output json
```

## 6. WAF and cost

The distribution is on the CloudFront flat-rate **Free** plan ($0/month: 1M requests and 100 GB per month, no overage charges). The plan bundles the web ACL `CreatedByCloudFront-f099c992` (default action Allow) with three AWS managed rule groups:

- `AWSManagedRulesAmazonIpReputationList`
- `AWSManagedRulesCommonRuleSet`
- `AWSManagedRulesKnownBadInputsRuleSet`

Check the plan:

```sh
aws pricing-plan-manager list-subscriptions --region us-east-1 --query 'subscriptionSummaries[].[planFamily,planTier,status]' --output text
```

Expect `CloudFront FREE ACTIVE`. Keep the ACL attached: the plan requires a web ACL, and you don't pay for it.

- **Leaving the plan:** `aws pricing-plan-manager cancel-subscription` moves the distribution to pay-as-you-go. The ACL then costs about $5/month, plus $1 per rule group, plus $0.60 per million requests, so detach and delete it in that case. Pay-as-you-go still includes CloudFront's permanent free allowance of 1 TB and 10M requests a month.
- **Deleting the distribution:** cancel the plan first.

## 7. Caveats

- **Apex edge selection:** Hostinger flattens the ALIAS by resolving `d2hoan8wpwtbsz.cloudfront.net` from its own resolvers. Apex visitors therefore get edges picked for Hostinger's location, not their own, so a visitor in Japan may land on a European edge. `www` is a real CNAME, but it redirects to the apex anyway. Route 53 alias records ([§4](#fallback-route-53)) fix this.
- **ALIAS freshness:** the apex keeps working only while Hostinger re-resolves as CloudFront rotates edge IPs. On 2026-10-18 the TTL was 300 and the IP sets changed between queries. If the apex ever sticks to one set with a long TTL, move to Route 53.
- **Dangling CNAME:** never delete the distribution or remove its aliases while Hostinger still points at it. Repoint or remove the DNS records first, so nobody else can attach the hostname to their own distribution.
- **Teardown order:** DNS records first, then disable and delete the distribution (cancel the plan first, §6), and only then empty and delete the bucket. Bucket names are global: while a distribution's origin still points at a deleted bucket name, anyone could re-create it and have CloudFront serve their content under your certificate.
- **ACM validation CNAMEs:** they must stay. Without them, the automatic renewal fails and the certificate expires.
- **Root credentials:** never use root for the CLI. This must print `0 1` (no root access key, MFA on):

```sh
aws iam get-account-summary --query 'SummaryMap.[AccountAccessKeysPresent,AccountMFAEnabled]' --output text
```

If root has a key, switch to IAM Identity Center (`aws configure sso`) or an admin IAM user, then delete the root key (Console → account menu → Security credentials).

## 8. Troubleshooting

### CloudFront 403 `AccessDenied`, or every page returns the 404 page

Two different symptoms:

- **Raw 403 on every path:** the OAC or bucket policy is broken. `error.html` can't be read either, so CloudFront passes S3's `AccessDenied` through.
- **The 404 page on a path that exists:** either the object is missing, or the WAF blocked the request (its 403 is rewritten to the 404 page by the 403 mapping). Check the web ACL's sampled requests, or the `BlockedRequests` metric in CloudWatch (`us-east-1`).

```sh
curl -sSI "https://$CF_DOMAIN/" | grep -iE '^(HTTP|x-cache|content-type)'
aws s3api head-object --bucket "$BUCKET" --key index.html --query '[ContentType,CacheControl]' --output text
aws s3api get-bucket-policy --bucket "$BUCKET" --query Policy --output text | jq .
aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.ARN --output text
aws cloudfront get-distribution-config --id "$DIST_ID" --query 'DistributionConfig.Origins.Items[0].[DomainName,OriginAccessControlId]' --output text
```

- **`AWS:SourceArn` doesn't match the distribution ARN**, for example after a rebuild with a new ID: re-run §2.7.
- **`OriginAccessControlId` is empty**, or the origin is a custom origin: S3 sees an anonymous request. The origin must be the REST endpoint as an S3 origin with the OAC attached (§2.6).
- **The object is missing:** S3 answers 403 (CloudFront has no `s3:ListBucket`), which is shown as the 404 page. For `/`, this means `index.html` isn't in the bucket and the deploy hasn't run.
- **Objects are encrypted with SSE-KMS:** the KMS key policy must also allow CloudFront. Keep the default SSE-S3.

### 502 / 504

The origin is misconfigured. Typical causes:

- It points at the S3 *website* endpoint (`*.s3-website.*`) with an HTTPS origin protocol: website endpoints are HTTP only, and website hosting is off now anyway.
- The origin domain has a typo.
- The origin uses the wrong region.

```sh
aws cloudfront get-distribution-config --id "$DIST_ID" --query 'DistributionConfig.Origins.Items[0]' --output json
```

Expect `DomainName` `mariavittoriariva.it.s3.eu-central-1.amazonaws.com`, an `S3OriginConfig`, no `CustomOriginConfig`, and the OAC ID.

### Certificate and alias errors

- **`CNAMEAlreadyExists`:** another distribution, possibly in another account, holds the alias. Run `aws cloudfront list-conflicting-aliases --distribution-id "$DIST_ID" --alias "$BUCKET"` to find it. Remove the alias there, or move it with `aws cloudfront associate-alias`, which needs a TXT record `_<alias>` pointing at the target `*.cloudfront.net` name.
- **`InvalidViewerCertificate`:** the certificate is not in `us-east-1`, not `ISSUED`, or doesn't cover every alias.
- **Browser `ERR_CERT_COMMON_NAME_INVALID`:** the browser reached CloudFront for a name the certificate doesn't cover.
- **CloudFront's own 403 page "The request could not be satisfied":** the Host isn't one of the distribution's aliases.

```sh
aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" --query 'Certificate.[Status,SubjectAlternativeNames,RenewalSummary.RenewalStatus]' --output json
aws cloudfront get-distribution-config --id "$DIST_ID" --query 'DistributionConfig.[Aliases.Items,ViewerCertificate.ACMCertificateArn]' --output json
```

A `RenewalStatus` of `PENDING_VALIDATION` means the ACM CNAMEs are missing at Hostinger.

### Stale content after a deploy

```sh
curl -sSI https://mariavittoriariva.it/ | grep -iE '^(cache-control|last-modified|etag|age|x-cache)'
```

- **HTML** is `no-cache`: the edge serves it at most 1 s stale, and browsers revalidate on every load.
- **Assets** are immutable but content-hashed, so a new build has new URLs.
- **A response without `cache-control`** was uploaded by hand. CloudFront then applies `CachingOptimized`'s default TTL (24 h), and browsers cache it heuristically.
- **To flush the edge**, invalidate with admin credentials (the CI user has no CloudFront permission by design):

```sh
INV_ID="$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INV_ID"
```

### Wrong MIME type

```sh
curl -sSI https://mariavittoriariva.it/ | grep -i '^content-type'
```

- Expect `text/html; charset=utf-8`. Check assets the same way with `/assets/<file>`.
- Assets are synced with `--size-only`, so an asset uploaded with bad metadata is never re-uploaded. Fix it in place with admin credentials (the CI user can't read objects), then invalidate `/assets/*`, because CloudFront caches the old headers for a year. For example:

```sh
aws s3 cp "s3://$BUCKET/assets/" "s3://$BUCKET/assets/" --recursive --exclude '*' --include '*.woff2' --metadata-directive REPLACE --content-type font/woff2 --cache-control 'public, max-age=31536000, immutable'
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/assets/*'
```

### Workflow fails at "Check repository variables", "Smoke test CloudFront", "Check build output" or credentials

- **Check repository variables:** `AWS_REGION` or `CLOUDFRONT_DOMAIN` is unset. Fix it with `gh variable set CLOUDFRONT_DOMAIN --body d2hoan8wpwtbsz.cloudfront.net` (see §3.2).
- **Smoke test CloudFront:**
  - `curl: (6) Could not resolve host` (step exits 6): `CLOUDFRONT_DOMAIN` is wrong (for example, it includes `https://`).
  - `404` on `/`: `index.html` is missing, or the WAF blocked the runner's IP; see the 403 entry above.
  - Wrong Content-Type: see *Wrong MIME type*.
- **Check build output** (build job): `dist/error.html` is missing. `vite.config.ts` must list `error.html` in the build `input`.
- **configure-aws-credentials: credentials could not be loaded:** the keys are set neither on the `production` environment nor at repo level (`gh secret list --env production`, `gh secret list`).

### 403 in CI on `ListObjectsV2` or `PutObject`

- `s3:ListBucket` must be on the bucket ARN, and Put/Delete on `.../*`.
- `InvalidClientTokenId` or `SignatureDoesNotMatch` means the secrets are wrong, or the key was rotated or deleted.

### Local Homebrew `awscli` fails with `Library not loaded: .../libaws-c-s3.1.2.dylib`

This happened on this machine on 2026-10-17 and was fixed by upgrading to `awscli 2.38.1`:

- The `awscli 2.37.8` bottle's `_awscrt` module was built against `aws-c-s3 1.2.0`.
- `aws-c-s3` had since been upgraded to `1.3.0`, which only ships `libaws-c-s3.1.3.dylib`.
- `brew reinstall awscli` on a stale index re-pours the same broken bottle.

```sh
brew update
brew upgrade awscli
aws --version
otool -L "$(brew --prefix awscli)"/libexec/lib/python3.*/site-packages/_awscrt*.so | grep aws-c-s3
```

The `otool` line should reference a `libaws-c-s3` version that exists under `$(brew --prefix aws-c-s3)/lib`.

- If it still breaks, run `brew update` and then `brew reinstall awscli`.
- Alternatively, drop Homebrew's CLI (`brew uninstall awscli`) and use AWS's self-contained installer, `https://awscli.amazonaws.com/AWSCLIV2.pkg`, which bundles its own CRT.
