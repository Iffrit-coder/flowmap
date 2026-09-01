import { createHash } from 'node:crypto'

export const MIN_LENGTH = 10

/** The passwords a spraying attack tries first. This is a floor, not the real
 * defence — the breach check below is — but it holds when that check can't run. */
const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', '123456789', '1234567890',
  'qwertyuiop', 'qwerty123', 'letmein123', 'welcome123', 'admin123', 'iloveyou',
  'sunshine1', 'princess1', 'football1', 'baseball1', 'trustno1', 'superman1',
  'monkey123', 'dragon123', 'starwars1', 'whatever1', 'freedom11', 'computer1',
  'abc123456', 'a1b2c3d4', 'changeme1', 'secret123', 'test1234', 'temp1234',
])

/** Range-queries Have I Been Pwned by SHA-1 prefix: five hex characters go out,
 * a list of suffixes comes back, and the comparison happens here — the password
 * itself never leaves this process.
 *
 * Fails open. A third party being unreachable must not be able to block signups,
 * and MIN_LENGTH plus COMMON still apply when it does. */
async function isBreached(password: string): Promise<boolean> {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return false
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [hash, count] = line.trim().split(':')
      if (hash === suffix && Number(count) > 0) return true
    }
    return false
  } catch {
    return false
  }
}

/** Returns a message to show the user, or null when the password is acceptable. */
export async function checkPassword(password: string, email: string): Promise<string | null> {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`
  }
  if (password.length > 200) return 'Password must be shorter than 200 characters.'

  const lower = password.toLowerCase()
  if (COMMON.has(lower)) return 'That password is too common. Pick something less guessable.'

  const localPart = email.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 3 && lower.includes(localPart)) {
    return 'Password must not contain your email address.'
  }

  if (await isBreached(password)) {
    return 'That password has appeared in a known data breach. Pick a different one.'
  }
  return null
}
