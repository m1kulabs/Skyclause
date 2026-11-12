import { resendLinkFromForm } from '../../../../features/sign-in/form-post'

// A new link for an expired one without JavaScript; the page's script posts JSON to Better Auth instead.
export const POST = (request: Request) => resendLinkFromForm(request)
