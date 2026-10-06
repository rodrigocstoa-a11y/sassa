import { Suspense } from 'react';
import { NewAudioPage } from '@/features/audios/NewAudioPage';

export default function Page() {
  return (
    <Suspense>
      <NewAudioPage />
    </Suspense>
  );
}
