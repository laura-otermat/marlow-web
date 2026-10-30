# Marlow Web

React + TypeScript client for the Marlow household-memory API.

## Configure

Copy `.env.example` to `.env.local` and set:

- `VITE_MARLOW_API_URL` to the Marlow API URL.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project URL and public anon/publishable key.

In Supabase **Authentication → URL Configuration**, set the local **Site URL** to `http://localhost:5173` and add `http://localhost:5173/**` to **Redirect URLs**. Add your production app URL there before deploying. Supabase invitation links use the Site URL; password-reset emails sent from this app explicitly return to the current app origin. Restart Vite after editing `.env.local`.

Run `npm install`, then `npm run dev -- --host localhost`. Sign in through Supabase Auth, then use **Invite household owner** to call `POST /households/invite-owner` with the current bearer token and no request body. Marlow sends the configured owner a secure Supabase invitation link for password setup; the app does not create users directly. Opening a valid invite or recovery link in the app displays a password form. The invite endpoint's service-role key remains server-side. The app also sends the current access token as a bearer token when saving memories and requesting summaries.

Users must already have membership in the selected household. Provision `household_members` through a trusted server/admin flow; adding a household ID in this browser does not grant access. The API derives the memory creator from the authenticated user.

Run `npm run build` and `npm run lint` to validate changes.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
