import { sendLinkFromForm } from '../../../../features/sign-in/form-post'

// The email form's no-JavaScript path; the page's script calls Better Auth directly instead.
export const POST = (request: Request) => sendLinkFromForm(request)
