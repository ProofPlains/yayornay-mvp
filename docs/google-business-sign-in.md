# Google sign-in rollout

Use a Google OAuth web client for business sign-in. In Google Cloud, add the FlashFeedback origin and authorise the callback URL displayed by Supabase for the Google provider. Enter the client ID and secret in Supabase Authentication → Sign In / Providers → Google. Keep the secret in Supabase.

In Supabase Authentication → URL Configuration, allow the app callback `https://flashfeedback.co.uk/?ff_google=1`. The sign-in screen also preserves `team_invite` on the callback when present. In Supabase redirect patterns, `?` is a glob character. Verify the allow list accepts both the ordinary callback and an invitation callback. Use the corresponding app origin for any isolated test project.

Apply the `google_business_signup` and `optional_signup_owner_name` migrations before deploying the frontend. It delegates to the existing atomic signup RPC, including optional signup attribution. Run `node --test tests/*.test.mjs` for local browser and database coverage. When real Google OAuth is configured, smoke-test the redirect with a new Google account, an existing same-email owner, a team invite, and a cancelled consent screen. Verify the account gets its original or new business as appropriate, the first location is created once, and optional campaign consent stays tied to the signup. Keep the Google provider disabled in production until the migration and app are ready.

## Remaining release checks

Before deploying the frontend:

- [x] Google signup with a paid plan and cancellation at Stripe checkout passed in the founder's local preview test.
- [x] Cancellation at the Google account picker passed in the founder's local preview test.
- [x] The founder confirmed Google sign-in from a team invitation worked in the local preview against hosted Supabase.

After deploying the frontend:

- [ ] Sign in with an existing test account on the production domain to verify the live redirect.

[Supabase Google provider setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Supabase redirect allow list](https://supabase.com/docs/guides/auth/redirect-urls)
