import { sessionService } from './auth.mjs'
import { sessionRepository } from './session-repository.mjs'
import { loginService, credentialRepository } from './login-service.mjs'
import { loginLimiter } from './login-limiter.mjs'
import { authHttp } from './auth-http.mjs'
import { donationRepository } from './donation-repository.mjs'
import { adminHttp } from './admin-http.mjs'
import { panelUi } from './panel-ui.mjs'

async function checkRole(pool) {
  const {rows}=await pool.query(`SELECT current_user AS name, r.rolsuper, r.rolbypassrls,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='einfak' AND pg_has_role(current_user,c.relowner,'MEMBER')) AS owns_schema_tables
    FROM pg_roles r WHERE r.rolname=current_user`)
  const role=rows[0]
  if(!role || role.rolsuper!==false || role.rolbypassrls!==false || role.owns_schema_tables!==false) throw new Error('Uygulama veritabanı rolü fazla yetkili veya doğrulanamadı.')
  return role.name
}

// Pool creation and secret loading belong to the deployment entrypoint.
// This module neither creates users nor opens a public listening port.
export async function createApplication({authPool,dataPool,origin,limiterSecret}) {
  if(!authPool || !dataPool || authPool===dataPool) throw new Error('Ayrı kimlik ve veri havuzları gereklidir.')
  const url=new URL(origin)
  if(url.protocol!=='https:' || url.origin!==origin) throw new Error('Sabit HTTPS origin gereklidir.')
  const limiter=loginLimiter(authPool,{secret:limiterSecret})
  const authRole=await checkRole(authPool),dataRole=await checkRole(dataPool)
  if(authRole===dataRole) throw new Error('Kimlik ve veri bağlantıları farklı roller kullanmalıdır.')
  const sessions=sessionService(sessionRepository(authPool))
  const login=await loginService({credentials:credentialRepository(authPool),sessions,limiter})
  const donations=donationRepository(dataPool)
  const application = {
    handleAuth:authHttp({origin,login,sessions}),
    async listDonations(token,organizationId,pagination) {
      const principal=await sessions.resolve(token)
      if(!principal) throw Object.assign(new Error('Oturum açmanız gerekiyor.'),{statusCode:401})
      return donations.list(principal,organizationId,pagination)
    },
  }
  application.handleAdmin=adminHttp({origin,listDonations:application.listDonations})
  application.handleUi=panelUi({origin,resolveSession:token=>sessions.resolve(token)})
  return application
}
