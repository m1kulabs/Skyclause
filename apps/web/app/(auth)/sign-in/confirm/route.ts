import { confirmLinkFromForm } from '../../../../features/sign-in/form-post'

// The emailed link's confirmation without JavaScript; the page's script posts JSON to Better Auth instead.
export const POST = (request: Request) => confirmLinkFromForm(request)
