import { createClient } from '@/lib/supabase/server'

export interface TeamScope {
  type: 'organization' | 'team'
  teamId?: string
  organizationId: string
}

/**
 * Determines the user's team scope for filtering data
 * If user has team_id: filter by team
 * If user has no team_id: show all organization data (fallback)
 * If user is admin: always see all organization data (override)
 */
export async function getUserTeamScope(userId: string): Promise<TeamScope> {
  const supabase = await createClient()
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id, team_id, role')
    .eq('id', userId)
    .single()

  if (error || !profile?.organization_id) {
    throw new Error('User profile not found')
  }

  // Admins always see all organization data
  if (profile.role === 'admin') {
    return {
      type: 'organization',
      organizationId: profile.organization_id
    }
  }

  // If user has team_id, filter by team
  if (profile.team_id) {
    return {
      type: 'team',
      teamId: profile.team_id,
      organizationId: profile.organization_id
    }
  }

  // Fallback: show all organization data (no teams exist or user not assigned)
  return {
    type: 'organization',
    organizationId: profile.organization_id
  }
}

/**
 * Gets team member IDs for filtering queries
 * Returns array of user IDs that should be visible to the current user
 */
export async function getTeamMemberIds(scope: TeamScope): Promise<string[]> {
  const supabase = await createClient()

  if (scope.type === 'organization') {
    // Show all organization members
    const { data: members } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', scope.organizationId)

    return members?.map(m => m.id) || []
  }

  if (scope.type === 'team' && scope.teamId) {
    // Show only team members
    const { data: members } = await supabase
      .from('profiles')
      .select('id')
      .eq('team_id', scope.teamId)

    return members?.map(m => m.id) || []
  }

  return []
}

/**
 * Applies team filtering to a Supabase query builder
 * Use this to filter queries by team membership
 */
export function applyTeamFilter(
  query: any, 
  scope: TeamScope, 
  userIdColumn: string = 'user_id'
) {
  if (scope.type === 'organization') {
    // Filter by organization (fallback or admin)
    return query.eq('organization_id', scope.organizationId)
  }

  if (scope.type === 'team' && scope.teamId) {
    // Filter by team members
    return query.in(userIdColumn, `(
      SELECT id FROM profiles 
      WHERE team_id = '${scope.teamId}'
    )`)
  }

  return query
}

/**
 * Checks if current user can manage a specific team
 */
export async function canManageTeam(userId: string, teamId: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', userId)
    .single()

  if (!profile) return false

  // Admins can manage any team
  if (profile.role === 'admin') return true

  // Team managers can manage their own team
  const { data: team } = await supabase
    .from('teams')
    .select('manager_id')
    .eq('id', teamId)
    .single()

  return team?.manager_id === userId
} 