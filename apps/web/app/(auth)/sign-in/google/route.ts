import { startGoogleFromForm } from '../../../../features/sign-in/form-post'

// The Google form's no-JavaScript path; the page's script calls Better Auth directly instead.
export const POST = (request: Request) => startGoogleFromForm(request)
