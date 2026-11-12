/**
 * A page of the app host (sign-in, sign-up), absolute to APP_ORIGIN, which splits the hosts in production: the
 * marketing host serves none of them. With no APP_ORIGIN one host serves everything, so the path stays relative.
 */
export function appHref(path: string): string {
  const appOrigin = process.env.APP_ORIGIN
  return appOrigin ? new URL(path, appOrigin).toString() : path
}
