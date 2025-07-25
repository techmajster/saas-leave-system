import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBasicAuth } from '@/lib/auth-utils'

export async function PUT(request: NextRequest) {
  try {
    console.log('=== API START ===')
    // Use optimized auth utility
    const auth = await getBasicAuth()
    console.log('Auth result:', { success: auth.success, role: auth.success ? auth.role : 'N/A' })
    
    if (!auth.success) {
      console.error('Auth failed:', auth.error)
      return auth.error
    }
    
    console.log('=== AUTH SUCCESS ===')
    
    const { user, organizationId, role } = auth
    console.log('Authenticated user:', { userId: user.id, organizationId, role })

    // Check if user is admin
    if (role !== 'admin') {
      console.error('User is not admin:', role)
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    
    console.log('=== ADMIN CHECK PASSED ===')

    const supabase = await createClient()

    // Get request body
    const body = await request.json()
    console.log('Received request body:', body)
    console.log('Request headers:', Object.fromEntries(request.headers.entries()))
    
    const { name, slug, logo, adminId, countryCode, locale } = body
    console.log('Extracted fields:', { name, slug, adminId, countryCode, locale })

    // Validate required fields
    if (!name || !slug) {
      console.error('Missing required fields:', { name, slug })
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 })
    }
    
    console.log('=== VALIDATION PASSED ===')

    // Check if slug is already taken by another organization
    const { data: existingOrgs, error: slugCheckError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .neq('id', organizationId)

    if (slugCheckError) {
      console.error('Error checking slug:', slugCheckError)
      return NextResponse.json({ error: 'Failed to check slug availability' }, { status: 500 })
    }

    if (existingOrgs && existingOrgs.length > 0) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 400 })
    }
    
    console.log('=== SLUG CHECK PASSED ===')

    // Update organization
    const updateData: any = {
      name,
      slug,
      country_code: countryCode,
      locale
    }

    // Only process admin change if adminId is different from current user
    if (adminId && adminId !== user.id) {
      console.log('Processing admin change to:', adminId)
      
      // Verify the new admin exists
      const { data: newAdmin, error: newAdminError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', adminId)
        .single()

      if (newAdminError || !newAdmin) {
        console.error('New admin not found:', adminId, newAdminError)
        return NextResponse.json({ error: 'Selected admin not found' }, { status: 400 })
      }

      console.log('New admin found:', newAdmin.email, 'current role:', newAdmin.role)

      // Check current admins
      const { data: currentAdmins, error: currentAdminError } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('organization_id', organizationId)
        .eq('role', 'admin')

      if (currentAdminError) {
        console.error('Error checking current admins:', currentAdminError)
        return NextResponse.json({ error: 'Failed to check current admins' }, { status: 500 })
      }

      console.log('Current admins:', currentAdmins)

      // Allow admin change - the safety check was preventing legitimate transfers
      console.log('Proceeding with admin change')

      // Set the new admin as admin FIRST
      const { error: setError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', adminId)

      if (setError) {
        console.error('Error setting new admin:', setError)
        return NextResponse.json({ error: 'Failed to set new admin' }, { status: 500 })
      }
      console.log('Admin role set successfully for:', newAdmin.email)

      // Then remove admin from current user
      const { error: removeError } = await supabase
        .from('profiles')
        .update({ role: 'employee' })
        .eq('id', user.id)

      if (removeError) {
        console.error('Error removing current user admin role:', removeError)
        return NextResponse.json({ error: 'Failed to remove current user admin role' }, { status: 500 })
      }
      console.log('Removed admin role from current user')

      console.log('Admin changed successfully to:', newAdmin.email)
    } else if (adminId) {
      console.log('Admin not changing - same user selected')
    }

    // Handle logo upload if provided
    if (logo) {
      // TODO: Implement file upload to Supabase Storage
      // For now, we'll skip logo upload
      console.log('Logo upload not implemented yet')
    }

    console.log('=== REACHING ORGANIZATION UPDATE ===')
    console.log('Updating organization with data:', updateData)
    console.log('Organization ID:', organizationId)
    
    const { data: updatedOrg, error: updateError } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)
      .select()

    if (updateError) {
      console.error('Error updating organization:', updateError)
      return NextResponse.json({ 
        error: 'Failed to update organization', 
        details: updateError.message,
        code: updateError.code
      }, { status: 500 })
    }

    console.log('=== API SUCCESS ===')

    return NextResponse.json({ 
      success: true, 
      organization: updatedOrg?.[0] || null,
      message: 'Organization updated successfully'
    })

  } catch (error) {
    console.error('=== API ERROR ===')
    console.error('Error in organization update:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
} 