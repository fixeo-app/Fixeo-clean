# FIXEO Mobile — M5 WOW Experience candidate

Native Expo application for FIXEO.

## Current checkpoint

- M4 physical certification: PASS on two Android devices.
- M5 candidate: 0.3.0 / Android versionCode 4.
- Branch: `feat/fixeo-mobile-m5-wow-experience`.
- Backend: isolated Supabase Staging.
- Preview API: branch-scoped Vercel Preview only.
- Production/main: out of scope.

## Product contract

One app, contextual universes:
- Client;
- Artisan;
- Enterprise Field later in its dedicated block.

Mobile is the action layer, not a reduced dashboard.

RAFI understands.
Decision Center prioritizes.
FIXEO orchestrates.
The user acts.

## Security boundary

The app may contain only public/publishable configuration.

Never embed:
- Supabase service-role / secret keys;
- OpenAI/provider keys;
- privileged server credentials.

RAFI voice/photo call authenticated server endpoints with the current Supabase session.
Decision cues are bounded to the authenticated user’s own Client/Artisan scope.

## M5 certification

See:
- `docs/M5-WOW-EXPERIENCE-BLUEPRINT.md`
- `docs/M5-CERTIFICATION.md`

M5 is not certified until the exact 0.3.0 candidate passes CI, Preview API checks, and two-device Android physical certification.
