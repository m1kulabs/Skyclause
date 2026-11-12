// Safe for the browser: no imports. The sign-in page draws a sent link's window from this, and the server sets the
// link's lifetime (Better Auth's magic-link `expiresIn`) and the email's "valid until" from the same number.

/** How long an emailed sign-in link works, in seconds. */
export const SIGN_IN_LINK_EXPIRY_S = 15 * 60
