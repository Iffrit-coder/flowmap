/** Resend is reached over plain HTTP rather than through its SDK: one endpoint,
 * one header, and no dependency to keep current. Swapping providers means
 * rewriting `deliver` and nothing else. */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Resend's shared sender. It only delivers to the address that owns the Resend
 * account, which is enough to test a reset link but not to mail anyone else —
 * that needs a verified domain in AUTH_EMAIL_FROM. */
const DEFAULT_FROM = 'flowmap <onboarding@resend.dev>'

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** Links are built from configuration, never from the request's Host header —
 * a forged Host would otherwise put an attacker's domain into a real reset
 * email sent to a real user. */
export function appUrl(): string {
  return (process.env.APP_URL ?? 'https://flowmap-neon.vercel.app').replace(/\/+$/, '')
}

export type Mail = { to: string; subject: string; text: string }

/** Returns whether the message was accepted. Callers must not vary their
 * response based on this: whether mail went out is not something an
 * unauthenticated caller is entitled to learn. */
export async function deliver(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn(`[email] RESEND_API_KEY unset — dropped "${mail.subject}"`)
    return false
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error(`[email] send failed ${res.status}: ${(await res.text()).slice(0, 300)}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] send threw:', err instanceof Error ? err.message : err)
    return false
  }
}

export function resetEmail(link: string): Pick<Mail, 'subject' | 'text'> {
  return {
    subject: 'Reset your flowmap password',
    text: [
      'Someone asked to reset the password for this flowmap account.',
      '',
      link,
      '',
      'The link works once and expires in 1 hour.',
      "If this wasn't you, ignore this email — your password has not changed.",
    ].join('\n'),
  }
}

export function verifyEmail(link: string): Pick<Mail, 'subject' | 'text'> {
  return {
    subject: 'Confirm your flowmap email',
    text: ['Confirm this address to finish setting up your flowmap account.', '', link, '', 'The link expires in 24 hours.'].join('\n'),
  }
}
