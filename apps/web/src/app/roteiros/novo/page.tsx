import { Suspense } from 'react';
import { NewScriptPage } from '@/features/scripts/ScriptPages';

export default function Page() {
  return (
    <Suspense>
      <NewScriptPage />
    </Suspense>
  );
}
