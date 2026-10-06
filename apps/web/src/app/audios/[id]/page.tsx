'use client';
import { useParams } from 'next/navigation';
import { AudioDetail } from '@/features/audios/AudioDetail';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AudioDetail key={id} id={id} />;
}
