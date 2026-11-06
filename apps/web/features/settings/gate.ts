import { notFound } from 'next/navigation'
import { getPrincipal } from '../../lib/principal'
import { maySeeSettings, type SettingsTarget } from './access'

export async function requireSettings(target: SettingsTarget) {
  const principal = await getPrincipal()
  if (!maySeeSettings(principal, target)) notFound()
  return principal
}
