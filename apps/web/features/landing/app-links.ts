import { hrefOn } from '../../lib/origins'

/**
 * A page of the app host (sign-in, sign-up), absolute to APP_ORIGIN under HOST_MODE=multi, which splits the hosts in
 * production: the marketing host serves none of them. On one host the path stays relative.
 */
export function appHref(path: string): string {
  return hrefOn('app', path)
}
