'use client'

import { AppSidebar } from './app-sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import React, { useState, useEffect, createContext, useContext } from 'react'
import { LeaveType, LeaveBalance, UserProfile } from '@/types/leave'
import AddAbsenceSheet from './AddAbsenceSheet'

interface Organization {
  id: string
  name: string
  brand_color?: string | null
  logo_url?: string | null
  locale?: string | null
}

interface AppLayoutClientProps {
  children: React.ReactNode
  userRole?: string
  userId?: string
  organization?: Organization | null
  userProfile?: UserProfile
  teamInviteCount?: number
  leaveTypes: LeaveType[]
  leaveBalances: LeaveBalance[]
  preloadedEmployees?: any[]
}

// Context for organization updates
interface OrganizationContextType {
  organization: Organization | null
  updateOrganization: (updates: Partial<Organization>) => void
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export const useOrganization = () => {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider')
  }
  return context
}

// Function to generate breadcrumb items based on pathname
function getBreadcrumbItems(pathname: string, organizationName?: string | null, t?: any) {
  const segments = pathname.split('/').filter(Boolean)
  const items = []

  // Always start with organization/home
  items.push({
    href: '/dashboard',
    label: organizationName || 'Leave System',
    isHome: true
  })

  // Map route segments to translated labels
  const getRouteLabel = (segment: string): string => {
    // Try navigation translations first
    const navKey = `navigation.${segment}`
    let label = t?.(navKey)
    if (label === navKey) {
      // Fallback to specific translations
      const translations: Record<string, string> = {
        'dashboard': t?.('navigation.dashboard') || 'Dashboard',
        'leave': t?.('navigation.leave') || 'Leave Requests',
        'leave-requests': t?.('navigation.leaveRequests') || 'Leave Requests',
        'calendar': t?.('navigation.calendar') || 'Calendar',
        'team': t?.('navigation.team') || 'Team',
        'schedule': t?.('navigation.schedule') || 'Schedule',
        'settings': t?.('navigation.settings') || 'Settings',
        'profile': t?.('navigation.profile') || 'Profile',
        'admin': t?.('navigation.admin') || 'Administration',
        'holidays': 'Holidays',
        'fix-balance': 'Fix Balance',
        'setup-holidays': 'Setup Holidays',
        'test-email': 'Test Email',
        'new': t?.('leave.newRequest') || 'New Request',
        'edit': t?.('common.edit') || 'Edit Request',
        'invite': t?.('team.invite') || 'Invite Members',
        'add': 'Nowy pracownik',
        'add-employee': 'Nowy pracownik',
        'team-management': 'Zarządzanie zespołem'
      }
      label = translations[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)
    }
    return label
  }

  // Build breadcrumb trail
  let currentPath = ''
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    currentPath += `/${segment}`
    
    // Skip numeric IDs in breadcrumbs
    if (/^\d+$/.test(segment)) {
      continue
    }
    
    const label = getRouteLabel(segment)
    const isLast = i === segments.length - 1
    
    items.push({
      href: isLast ? undefined : currentPath,
      label,
      isLast
    })
  }

  return items
}

export function AppLayoutClient({ 
  children, 
  userRole, 
  userId, 
  organization: initialOrganization, 
  userProfile, 
  teamInviteCount,
  leaveTypes,
  leaveBalances,
  preloadedEmployees
}: AppLayoutClientProps) {
  const pathname = usePathname()
  const t = useTranslations()
  
  // State for organization that can be updated
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization || null)
  
  // Update organization state when initial prop changes
  useEffect(() => {
    setOrganization(initialOrganization || null)
  }, [initialOrganization])
  
  // Function to update organization
  const updateOrganization = (updates: Partial<Organization>) => {
    setOrganization(prev => prev ? { ...prev, ...updates } : null)
  }
  
  const breadcrumbItems = getBreadcrumbItems(pathname, organization?.name, t)

  return (
    <OrganizationContext.Provider value={{ organization, updateOrganization }}>
      <SidebarProvider>
        <AppSidebar 
          organizationName={organization?.name}
          organizationLogo={organization?.logo_url}
          userProfile={userProfile}
          userRole={userRole}
        />
        <SidebarInset>
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-t-xl">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
                        {item.isLast || !item.href ? (
                          <BreadcrumbPage>{item.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href={item.href}>
                            {item.label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </main>
        </SidebarInset>
        
        {/* Add Absence Sheet */}
        {(userRole === 'admin' || userRole === 'manager') && (
          <AddAbsenceSheet preloadedEmployees={preloadedEmployees} userRole={userRole} />
        )}
      </SidebarProvider>
    </OrganizationContext.Provider>
  )
}