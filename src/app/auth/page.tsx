'use client';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';

export default function TestPage() {
  const { data: session } = useSession();

  useEffect(() => {
    console.log(session);
  }, [session]);

  if (session) {
    return (
      <>
        <p>Hoşgeldin, {session.user.name}</p>
        <button onClick={() => signOut()}>Çıkış</button>
      </>
    );
  }

  return <button onClick={() => signIn()}>Giriş Yap</button>;
}
