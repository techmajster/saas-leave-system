'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserPlus } from 'lucide-react'

export function InviteTeamDialog() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    role: 'employee',
    personalMessage: ''
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  const isOpen = searchParams.get('invite') === 'true'

  const handleClose = () => {
    router.push('/team')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Get current user and their organization
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id, role')
        .eq('id', user.id)
        .single()

      if (profileError) {
        throw new Error(`Profile error: ${profileError.message}`)
      }

      if (!profile?.organization_id) {
        throw new Error('Organization not found')
      }

      // Check if user has permission to invite
      if (profile.role !== 'admin' && profile.role !== 'manager') {
        throw new Error('You do not have permission to invite team members')
      }

      // Check if email is already a member
      const { data: existingMember } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', formData.email.toLowerCase())
        .eq('organization_id', profile.organization_id)
        .single()

      if (existingMember) {
        throw new Error('This email is already a member of your organization')
      }

      // Check if there's already a pending invitation
      const { data: existingInvitation } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', formData.email.toLowerCase())
        .eq('organization_id', profile.organization_id)
        .eq('status', 'pending')
        .single()

      if (existingInvitation) {
        throw new Error('There is already a pending invitation for this email')
      }

      // Generate invitation token
      const token = btoa(Math.random().toString(36).substring(2) + Date.now().toString(36))
      
      // Set expiry date to 7 days from now
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // Create invitation (invitation_code will be auto-generated by database trigger)
      const { data: newInvitation, error: inviteError } = await supabase
        .from('invitations')
        .insert({
          organization_id: profile.organization_id,
          email: formData.email.toLowerCase(),
          role: formData.role,
          invited_by: user.id,
          token: token,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
          personal_message: formData.personalMessage || null
        })
        .select('invitation_code')
        .single()

      if (inviteError) {
        throw new Error(`Database error: ${inviteError.message || JSON.stringify(inviteError)}`)
      }

      // Get organization details for email
      const { data: organization } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.organization_id)
        .single()

      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      // Send invitation email
      try {
        const response = await fetch('/api/send-invitation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formData.email.toLowerCase(),
            organizationName: organization?.name || 'Your Organization',
            inviterName: inviterProfile?.full_name || user.email,
            inviterEmail: inviterProfile?.email || user.email,
            role: formData.role,
            invitationToken: token,
            personalMessage: formData.personalMessage || undefined
          })
        })

        if (response.ok) {
          setSuccess(`Invitation sent successfully to ${formData.email}! They will receive an email with instructions to join.`)
        } else {
          // Use environment variables in order of preference, fallback to current origin
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                         process.env.NEXT_PUBLIC_SITE_URL || 
                         (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
          setSuccess(`Invitation created for ${formData.email}. Note: Email sending failed, but you can share this link manually: ${baseUrl}/team/invite?token=${token}`)
        }
      } catch (emailError) {
        console.error('Email sending failed:', emailError)
        // Use environment variables in order of preference, fallback to current origin
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                       process.env.NEXT_PUBLIC_SITE_URL || 
                       (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
        setSuccess(`Invitation created for ${formData.email}. Note: Email sending failed, but you can share this link manually: ${baseUrl}/team/invite?token=${token}`)
      }
      
      // Reset form on success
      setFormData({
        email: '',
        role: 'employee',
        personalMessage: ''
      })

      // Close dialog after short delay to show success message
      setTimeout(() => {
        handleClose()
      }, 2000)

    } catch (err) {
      console.error('Error creating invitation:', err)
      
      // Better error handling
      let errorMessage = 'Nie udało się wysłać zaproszenia'
      
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        // Handle Supabase error objects
        if ('message' in err) {
          errorMessage = (err as any).message
        } else if ('error' in err) {
          errorMessage = (err as any).error
        } else {
          errorMessage = JSON.stringify(err)
        }
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Zaproś członka zespołu
          </DialogTitle>
          <DialogDescription>
            Wyślij zaproszenie do dołączenia do Twojej organizacji
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Adres email</Label>
            <Input
              id="email"
              type="email"
              placeholder="jan.kowalski@example.com"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rola w organizacji</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz rolę" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Pracownik</SelectItem>
                <SelectItem value="manager">Menedżer</SelectItem>
                <SelectItem value="admin">Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personalMessage">Wiadomość (opcjonalnie)</Label>
            <Textarea
              id="personalMessage"
              placeholder="Dodaj osobistą wiadomość do zaproszenia..."
              value={formData.personalMessage}
              onChange={(e) => setFormData(prev => ({ ...prev, personalMessage: e.target.value }))}
              disabled={loading}
              rows={3}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Anuluj
            </Button>
            <Button type="submit" disabled={loading} className="">
              {loading ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 