import {
  BarChart3Icon,
  CircleHelpIcon,
  CodeIcon,
  FolderIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SettingsIcon,
  SparklesIcon,
  UserIcon
} from 'lucide-react'

export const projectTabs = [
  'overview',
  'windows',
  'signals',
  'clauses',
  'calls',
  'ledger',
  'analysis',
  'subscribers',
  'settings'
] as const

export function shellNavigation(org?: string) {
  const base = org ? `/${encodeURIComponent(org)}` : '/new'
  return [
    { key: 'dashboard', href: base, icon: LayoutDashboardIcon },
    { key: 'approvals', href: org ? `${base}/approvals` : '/new', icon: ListChecksIcon },
    { key: 'projects', href: org ? `${base}/projects` : '/new', icon: FolderIcon },
    { key: 'analysis', href: org ? `${base}/analysis` : '/new', icon: BarChart3Icon },
    { key: 'developers', href: '/developers', icon: CodeIcon },
    { key: 'connect', href: '/connect', icon: SparklesIcon },
    { key: 'settings', href: org ? `${base}/settings/general` : '/account/appearance', icon: SettingsIcon },
    { key: 'account', href: '/account/profile', icon: UserIcon },
    { key: 'help', href: '/docs', icon: CircleHelpIcon }
  ] as const
}
