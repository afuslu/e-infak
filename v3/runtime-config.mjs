export function runtimeConfig(env) {
  const required=['V3_AUTH_DATABASE_URL','V3_DATA_DATABASE_URL','V3_PANEL_ORIGIN','V3_LIMITER_SECRET','V3_TLS_KEY_PATH','V3_TLS_CERT_PATH']
  for(const key of required) if(typeof env[key]!=='string' || !env[key].trim()) throw new Error(`Eksik yapılandırma: ${key}`)
  const origin=new URL(env.V3_PANEL_ORIGIN)
  if(origin.protocol!=='https:' || origin.origin!==env.V3_PANEL_ORIGIN) throw new Error('V3_PANEL_ORIGIN yalnız HTTPS origin olmalıdır.')
  for(const key of required.slice(0,2)) {
    const db=new URL(env[key])
    if(!['postgres:','postgresql:'].includes(db.protocol)) throw new Error(`${key} PostgreSQL adresi olmalıdır.`)
  }
  if(env.V3_AUTH_DATABASE_URL===env.V3_DATA_DATABASE_URL) throw new Error('Kimlik ve veri bağlantıları farklı olmalıdır.')
  if(Buffer.byteLength(env.V3_LIMITER_SECRET)<32) throw new Error('V3_LIMITER_SECRET en az 32 bayt olmalıdır.')
  const port=Number(env.V3_PANEL_PORT || 3443)
  if(!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Geçersiz panel portu.')
  return {origin:origin.origin,port,authUrl:env.V3_AUTH_DATABASE_URL,dataUrl:env.V3_DATA_DATABASE_URL,secret:env.V3_LIMITER_SECRET,keyPath:env.V3_TLS_KEY_PATH,certPath:env.V3_TLS_CERT_PATH}
}
