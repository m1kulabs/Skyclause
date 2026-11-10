import { api, setOAuthManagement, setPermissionCheck, setPrincipalResolver, v1 } from '@skyclause/api'
import { can, oauthManagement, resolvePrincipal } from '@skyclause/auth'

// The composition root (#79 §1): packages/api never imports packages/auth, so the web app registers f-auth's resolver
// and matrix check before its Route Handlers serve a request.
setPrincipalResolver(resolvePrincipal)
setPermissionCheck(can)
setOAuthManagement(oauthManagement)

export { api, v1 }
