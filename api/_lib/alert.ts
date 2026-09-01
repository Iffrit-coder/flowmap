import type { IncomingMessage } from 'node:http'
import { deliver } from './email.js'
import { hit } from './rateLimit.js'

/** Alert mail is throttled hard and deliberately: the failure mode that most
 * needs alerting — a handler throwing on every request — is exactly the one
 * that would otherwise send thousands of emails and get the sending domain
 * blocked. Logs keep the full picture; mail is only the nudge to go read them. */
const MAX_EMAILS_PER_HOUR = 4

export async function reportError(context: string, err: unknown, req?: IncomingMessage): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? (err.stack ?? '') : ''

  // Logged first and unconditionally, so a failure to alert never costs the
  // record of what happened.
  console.error(`[error] ${context}: ${message}\n${stack}`)

  const to = process.env.ALERT_EMAIL
  if (!to) return

  try {
    const throttle = await hit({ key: 'alert:error', max: MAX_EMAILS_PER_HOUR, windowSeconds: 3600 })
    if (throttle.limited) return

    await deliver({
      to,
      subject: `flowmap error: ${context}`,
      text: [
        `${context} failed.`,
        '',
        `Message: ${message}`,
        req ? `Path: ${req.method} ${req.url}` : '',
        '',
        stack.split('\n').slice(0, 12).join('\n'),
        '',
        `At most ${MAX_EMAILS_PER_HOUR} of these are sent per hour. Check the platform logs for the rest.`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  } catch {
    // Alerting is best-effort by definition; it must never turn a handled error
    // into a second, unhandled one.
  }
}
