# User Stories — Login App

## Story 1: User Registration
As a new user I can register with my email and password so that I can create an account.

Acceptance Criteria:
- Email field validates format on blur
- Password must be at least 8 characters
- Confirm password must match password
- Submit button disabled until all fields valid
- On success: account created, redirect to /login
- On failure: inline error shown beneath the failing field
- Loading spinner shown during API call

## Story 2: User Login
As a registered user I can log in with my email and password so that I can access the app.

Acceptance Criteria:
- Email and password fields present
- Submit disabled until both fields non-empty
- On success: JWT stored in localStorage, redirect to /dashboard
- On failure: "Invalid email or password" shown inline (do not reveal which field is wrong)
- Loading state shown during API call
- Rate limit: block after 5 failed attempts (return 429, show "Too many attempts. Try again later.")
