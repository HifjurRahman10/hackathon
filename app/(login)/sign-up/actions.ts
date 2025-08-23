import { getBaseUrl } from '@/lib/utils';

export async function signUpAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const name = String(formData.get('name') || '').trim();
  if (!email || !password) return { error: 'Email & password required' };

  const supabase = createServerSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${getBaseUrl()}/auth/callback`
    }
  });

  if (error) return { error: error.message };

  // If confirmation required, no session yet:
  if (!data.session) {
    return { success: 'Check your email to confirm your account.' };
  }

  await syncUser(data.user!);

  cookies().set(
    'session',
    JSON.stringify({
      user: { id: data.user!.id },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    }
  );

  redirect('/dashboard');
}