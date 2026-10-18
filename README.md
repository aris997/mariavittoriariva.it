# mariavittoriariva.it

WebSite Venue Manager. Personal CV site (Vite + React + TypeScript), served from the private S3 bucket `mariavittoriariva.it` through CloudFront (HTTPS).

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # → dist/
npm run preview
```

- Content: `src/content/`: facts and dates in `data.ts`, copy per language in `en.ts` / `it.ts` / `ja.ts` (typed by `types.ts`, so a missing translation fails the build).
- Photo: replace `src/assets/portrait.jpg` (portrait, ~4:5). CV download: `public/maria-vittoria-riva-cv.pdf`.
- Language: `?lang=en|it|ja`, otherwise saved choice, otherwise browser language. Theme: light by default, dark via the header toggle (remembered per browser).
- Deploy: push to `main` → GitHub Actions → S3. One-time setup in [DEPLOY.md](DEPLOY.md).
