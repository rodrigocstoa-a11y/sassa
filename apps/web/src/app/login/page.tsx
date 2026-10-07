import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/LoginForm';

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
