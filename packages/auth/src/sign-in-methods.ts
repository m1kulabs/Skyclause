import { loadEnv } from '@skyclause/config'
import { emailTransportFromEnv } from '@skyclause/delivery'

export interface SignInMethods {
  /** The email link: mail is on (Resend's sending variables are all set). */
  email: boolean
  /** Google: both OAuth variables are set, as `authSettings` requires before it builds the provider. */
  google: boolean
}

/** The ways in this server can serve, so the sign-in page offers only those. */
export function signInMethods(): SignInMethods {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = loadEnv('web')
  return { email: emailTransportFromEnv('web') !== null, google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) }
}
