/**
 * Optional sign-up allowlist for self-hosted instances: a comma-separated
 * list of email domains in SIGNUP_ALLOWED_EMAIL_DOMAINS (e.g.
 * "example.com,example.org"). Empty / unset keeps sign-up open to everyone.
 * Anonymous (guest) users are never affected.
 */
const LEADING_AT_RE = /^@/

export const parseAllowedSignupDomains = (
  raw: string | undefined = process.env.SIGNUP_ALLOWED_EMAIL_DOMAINS,
): string[] =>
  (raw ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(LEADING_AT_RE, ""))
    .filter(Boolean)

export const isSignupEmailAllowed = (
  email: string,
  allowedDomains: string[],
): boolean => {
  if (allowedDomains.length === 0) {
    return true
  }
  const domain = email.trim().toLowerCase().split("@").pop() ?? ""
  return allowedDomains.includes(domain)
}
