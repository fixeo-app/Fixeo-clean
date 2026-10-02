# FIXEO Mobile — Gate A/B candidate

Branch-only native Expo foundation. No Production mutation.

## Gate B contract
Client authenticated -> create_my_service_request_v1 -> canonical dispatch -> artisan authenticated -> get_my_mission_offers -> claim_mission -> client confirmation channel.

## Environment
Only EXPO_PUBLIC_SUPABASE_URL and a public/publishable Supabase key belong in the app. Never service_role.

## Certification
Gate B is PASS only after two physical devices on staging complete the full loop. Until then status is CANDIDATE / NOT CERTIFIED.
