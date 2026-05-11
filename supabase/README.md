# Supabase 보안 적용 순서

이 앱은 브라우저에서 Supabase에 직접 접속하므로, 운영 사용 전에는 Auth와 RLS를 같이 적용해야 합니다.

## 1. Auth URL 설정

Supabase Dashboard에서 `Authentication > URL Configuration`으로 이동합니다.

- Site URL: `https://sop-sage-eight.vercel.app`
- Redirect URLs: `https://sop-sage-eight.vercel.app`
- 로컬 테스트용 Redirect URLs: `http://127.0.0.1:5173`, `http://localhost:5173`

Google provider를 기본 로그인으로 쓰려면 `Authentication > Providers > Google`에서 Google Cloud OAuth의 Client ID/Secret을 입력하고 활성화합니다.
Email provider는 보조 로그인으로 쓸 경우 켜져 있어야 합니다.

## 2. RLS 마이그레이션 실행

Supabase Dashboard의 `SQL Editor`에서 `rls-auth-migration.sql` 내용을 실행합니다.

이 SQL은 이전 프로토타입 공개 정책을 제거하고, 로그인 사용자 본인의 SOP/작업기록만 읽고 쓸 수 있게 바꿉니다.

만약 앱 하단에 `Could not find the 'owner_id' column of 'app_settings' in the schema cache`가 표시되면 `fix-app-settings-owner-id.sql`도 SQL Editor에서 한 번 실행합니다.

## 3. 배포 확인

Vercel 배포 후 앱에서 Google 또는 이메일 링크로 로그인합니다. 로그인 후 좌측 저장 상태가 `Supabase 저장`으로 바뀌면 정상입니다.
