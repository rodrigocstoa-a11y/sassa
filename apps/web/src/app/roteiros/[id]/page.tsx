'use client';
import { useParams } from 'next/navigation';
import { EditScriptPage } from '@/features/scripts/ScriptPages';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <EditScriptPage key={id} id={id} />;
}
