'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { CalendarDays, Clock, User, Loader2, CheckCircle, ChevronsUpDown, Info, X, Calendar, TreePalm, ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { format, addDays, differenceInDays, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { getApplicableLeaveTypes, isLeaveTypeDisabled } from '@/lib/leave-validation'
import { LeaveType, LeaveBalance } from '@/types/leave'

interface Employee {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  team_id: string | null
}

interface OverlapUser {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
  leave_type_name: string
  end_date: string
  color: string
}

interface AddAbsenceSheetProps {
  preloadedEmployees?: Employee[]
  userRole?: string
  isOpen: boolean
  onClose: () => void
}

// Vacation icon component matching Figma design
function VacationIcon() {
  return (
    <div className="bg-cyan-200 relative rounded-lg size-10 flex items-center justify-center">
      <TreePalm className="h-6 w-6 text-gray-800" />
    </div>
  )
}

// Employee dropdown trigger component matching Figma design
function EmployeeSelectTrigger({ 
  employee, 
  placeholder = "Wybierz pracownika" 
}: { 
  employee?: Employee | null
  placeholder?: string 
}) {
  if (!employee) {
    return (
      <div className="flex flex-row items-center gap-2 h-12 px-3 py-2 w-full">
        <div className="bg-neutral-100 rounded-full size-8 flex items-center justify-center">
          <User className="h-4 w-4 text-neutral-500" />
        </div>
        <div className="flex-1 flex flex-col">
          <span className="text-sm text-neutral-500">{placeholder}</span>
        </div>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </div>
    )
  }

  return (
    <div className="flex flex-row items-center gap-2 h-12 px-3 py-2 w-full">
      <Avatar className="size-8">
        <AvatarImage src={employee.avatar_url || undefined} />
        <AvatarFallback className="bg-neutral-100 text-neutral-950 text-sm font-normal">
          {(employee.full_name || employee.email)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 flex flex-col items-start justify-center">
        <div className="font-medium text-sm text-neutral-950 leading-5 truncate w-full">
          {employee.full_name || employee.email}
        </div>
        <div className="font-normal text-xs text-neutral-500 leading-4 truncate w-full">
          {employee.email}
        </div>
      </div>
      <ChevronsUpDown className="h-4 w-4 opacity-50" />
    </div>
  )
}

// Leave type dropdown trigger component
function LeaveTypeSelectTrigger({ 
  leaveType, 
  balance,
  placeholder = "Wybierz typ nieobecności" 
}: { 
  leaveType?: LeaveType | null
  balance?: number
  placeholder?: string 
}) {
  if (!leaveType) {
    return (
      <div className="flex flex-row items-center gap-2 h-12 px-3 py-2 w-full">
        <div className="flex-1 flex flex-col items-start justify-center">
          <span className="text-sm text-neutral-500">{placeholder}</span>
        </div>
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </div>
    )
  }

  return (
    <div className="flex flex-row items-center gap-2 h-12 px-3 py-2 w-full">
      <div className="flex-1 flex flex-col items-start justify-center">
        <div className="font-medium text-sm text-neutral-950 leading-5 truncate w-full">
          {leaveType.name}
          {typeof balance === 'number' && ` (${balance} dni dostępne)`}
        </div>
      </div>
      <ChevronsUpDown className="h-4 w-4 opacity-50" />
    </div>
  )
}

// Overlap warning user item component
function OverlapUserItem({ user }: { user: OverlapUser }) {
  return (
    <div className="flex flex-row gap-4 items-center justify-start w-full min-w-[85px]">
      <Avatar className="size-10">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback className="bg-neutral-100 text-neutral-950">
          {(user.full_name || user.email)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 flex flex-col items-start justify-start">
        <div className="font-medium text-sm text-neutral-950 leading-5 truncate w-full">
          {user.full_name || user.email}
        </div>
        <div className="font-normal text-sm text-neutral-500 leading-5 truncate w-full">
          {user.email}
        </div>
      </div>
      <div className="flex flex-col items-end justify-center text-sm">
        <div className="font-medium text-neutral-950 leading-5">
          {user.leave_type_name}
        </div>
        <div className="font-normal text-neutral-500 leading-5">
          do {format(parseISO(user.end_date), 'dd.MM', { locale: pl })}
        </div>
      </div>
      <VacationIcon />
    </div>
  )
}

function AddAbsenceSheetContent({ preloadedEmployees, userRole, isOpen, onClose }: AddAbsenceSheetProps) {
  const supabase = createClient()
  
  // State
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>(preloadedEmployees || [])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [overlapUsers, setOverlapUsers] = useState<OverlapUser[]>([])
  const [employeesLoaded, setEmployeesLoaded] = useState(!!preloadedEmployees)
  const [organizationId, setOrganizationId] = useState<string>('')
  
  const [formData, setFormData] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: '',
    end_date: '',
    notes: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Computed values
  const selectedEmployee = employees.find(emp => emp.id === formData.employee_id)
  const selectedLeaveType = leaveTypes.find(lt => lt.id === formData.leave_type_id)
  const selectedBalance = leaveBalances.find(lb => lb.leave_type_id === formData.leave_type_id)
  
  // Calculate selected days
  const selectedDays = formData.start_date && formData.end_date 
    ? differenceInDays(parseISO(formData.end_date), parseISO(formData.start_date)) + 1
    : 0
  
  // Calculate remaining days after this request
  const remainingAfter = selectedBalance 
    ? Math.max(0, selectedBalance.remaining_days - selectedDays)
    : 0

  // Load employees when sheet is opened (either preloaded or fresh load)
  useEffect(() => {
    if (isOpen) {
      if (!employeesLoaded) {
        console.log('🔍 AddAbsenceSheet - Loading employees from API')
        loadEmployees()
      } else {
        console.log('🔍 AddAbsenceSheet - Using preloaded employees:', {
          count: preloadedEmployees?.length,
          userRole,
          employees: preloadedEmployees
        })
      }
    }
  }, [isOpen, employeesLoaded])

  // Load leave types and balances when employee is selected
  useEffect(() => {
    if (formData.employee_id) {
      loadEmployeeLeaveData(formData.employee_id)
    }
  }, [formData.employee_id])

  // Check for overlaps when dates change
  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      checkOverlaps()
    } else {
      setOverlapUsers([])
    }
  }, [formData.start_date, formData.end_date])

  const loadEmployees = async () => {
    try {
      setLoading(true)
      
      // Get current user profile if we don't have role
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // MULTI-ORG UPDATE: Get user's organization from user_organizations
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('is_default', true)
        .single()

      if (!userOrg?.organization_id) return

      let query = supabase
        .from('user_organizations')
        .select(`
          user_id,
          role,
          team_id,
          profiles!user_organizations_user_id_fkey (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('organization_id', userOrg.organization_id)
        .eq('is_active', true)

      // If manager, show team members (including themselves for self-absence requests)
      if (userRole === 'manager') {
        console.log('🔍 AddAbsenceSheet - Manager loading team members for user:', user.id)
        
        const { data: managerOrg, error: managerOrgError } = await supabase
          .from('user_organizations')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .eq('is_default', true)
          .single()
        
        console.log('🔍 AddAbsenceSheet - Manager org lookup:', { managerOrg, managerOrgError })
        
        if (managerOrg?.team_id) {
          console.log('🔍 AddAbsenceSheet - Filtering by team_id:', managerOrg.team_id)
          query = query.eq('team_id', managerOrg.team_id)
        } else {
          // Manager has no team assigned - show only themselves
          query = query.eq('user_id', user.id)
        }
        
        // Note: We include the manager themselves so they can create their own absence requests
      }

      const { data: employeesData, error } = await query

      console.log('🔍 AddAbsenceSheet - Query result:', { 
        count: employeesData?.length, 
        error,
        data: employeesData 
      })

      if (error) throw error

      // Transform the data to match the Employee interface
      const transformedEmployees = employeesData?.map(userOrg => {
        const profile = Array.isArray(userOrg.profiles) ? userOrg.profiles[0] : userOrg.profiles
        return {
          id: profile?.id || userOrg.user_id,
          email: profile?.email || '',
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
          role: userOrg.role,
          team_id: userOrg.team_id
        }
      }) || []

      console.log('🔍 AddAbsenceSheet - Transformed employees:', transformedEmployees)

      setEmployees(transformedEmployees)
      setEmployeesLoaded(true)
    } catch (error) {
      console.error('Error loading employees:', error)
      toast.error('Błąd ładowania pracowników')
    } finally {
      setLoading(false)
    }
  }

  const loadEmployeeLeaveData = async (employeeId: string) => {
    try {
      setLoading(true)

      console.log('🔍 AddAbsenceSheet - Loading leave data for employee:', employeeId)

      // MULTI-ORG UPDATE: Get employee's organization_id from user_organizations
      const { data: userOrgData, error: userOrgError } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', employeeId)
        .eq('is_active', true)
        .eq('is_default', true)
        .single()
      
      console.log('🔍 AddAbsenceSheet - Employee org lookup:', {
        employeeId,
        userOrgData,
        userOrgError
      })
      
      const empOrgId = userOrgData?.organization_id
      if (empOrgId) {
        setOrganizationId(empOrgId)
      }

      if (!empOrgId) {
        console.error('❌ No organization found for employee:', employeeId)
        return
      }

      // Load leave types
      const { data: leaveTypesData, error: leaveTypesError } = await supabase
        .from('leave_types')
        .select('*')
        .eq('organization_id', empOrgId)
        .order('name')

      console.log('🔍 AddAbsenceSheet - Leave types query:', {
        empOrgId,
        count: leaveTypesData?.length,
        error: leaveTypesError,
        leaveTypes: leaveTypesData
      })

      if (leaveTypesError) throw leaveTypesError

      // Load employee's leave balances for current year
      const currentYear = new Date().getFullYear()
      const { data: balancesData, error: balancesError } = await supabase
        .from('leave_balances')
        .select(`
          *,
          leave_types (*)
        `)
        .eq('user_id', employeeId)
        .eq('year', currentYear)

      console.log('🔍 AddAbsenceSheet - Leave balances query:', {
        employeeId,
        currentYear,
        count: balancesData?.length,
        error: balancesError,
        balances: balancesData
      })

      if (balancesError) throw balancesError

      setLeaveTypes(leaveTypesData || [])
      setLeaveBalances(balancesData || [])
      
      console.log('🔍 AddAbsenceSheet - Data loaded successfully:', {
        leaveTypesCount: leaveTypesData?.length || 0,
        leaveBalancesCount: balancesData?.length || 0
      })
      
    } catch (error) {
      console.error('Error loading leave data:', error)
      toast.error('Błąd ładowania danych urlopowych')
    } finally {
      setLoading(false)
    }
  }

  const checkOverlaps = async () => {
    if (!formData.start_date || !formData.end_date || !formData.employee_id) return

    try {
      const { data: overlaps, error } = await supabase
        .from('leave_requests')
        .select(`
          id,
          start_date,
          end_date,
          status,
          user_id,
          profiles!leave_requests_user_id_fkey (
            id,
            full_name,
            email,
            avatar_url
          ),
          leave_types (
            name,
            color
          )
        `)
        .gte('end_date', formData.start_date)
        .lte('start_date', formData.end_date)
        .in('status', ['pending', 'approved'])
        .neq('user_id', formData.employee_id)

      if (error) {
        console.error('Supabase error:', error)
        throw error
      }

      const formattedOverlaps: OverlapUser[] = (overlaps || []).map(request => ({
        id: (request.profiles as any)?.id || '',
        full_name: (request.profiles as any)?.full_name || null,
        email: (request.profiles as any)?.email || '',
        avatar_url: (request.profiles as any)?.avatar_url || null,
        leave_type_name: (request.leave_types as any)?.name || 'Nieobecność',
        end_date: request.end_date,
        color: (request.leave_types as any)?.color || '#22d3ee'
      }))

      setOverlapUsers(formattedOverlaps)
    } catch (error) {
      console.error('Error checking overlaps:', error instanceof Error ? error.message : error)
      setOverlapUsers([])
    }
  }

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {}

    // Validation
    if (!formData.employee_id) newErrors.employee_id = 'Wybierz pracownika'
    if (!formData.leave_type_id) newErrors.leave_type_id = 'Wybierz typ nieobecności'
    if (!formData.start_date) newErrors.start_date = 'Wybierz datę rozpoczęcia'
    if (!formData.end_date) newErrors.end_date = 'Wybierz datę zakończenia'

    // Check if employee has conflicts
    if (formData.start_date && formData.end_date && formData.employee_id) {
      const { data: conflictCheck } = await supabase
        .from('leave_requests')
        .select('id')
        .eq('user_id', formData.employee_id)
        .or(`
          and(start_date.lte.${formData.end_date},end_date.gte.${formData.start_date}),
          and(start_date.gte.${formData.start_date},start_date.lte.${formData.end_date}),
          and(end_date.gte.${formData.start_date},end_date.lte.${formData.end_date})
        `)
        .in('status', ['pending', 'approved'])

      if (conflictCheck && conflictCheck.length > 0) {
        newErrors.dates = 'Pracownik ma już zaplanowaną nieobecność w tym okresie'
      }
    }

    // Check balance
    if (selectedBalance && selectedDays > selectedBalance.remaining_days) {
      newErrors.balance = `Niewystarczające saldo. Dostępne: ${selectedBalance.remaining_days} dni`
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      setLoading(true)

      const requestData = {
        user_id: formData.employee_id,
        leave_type_id: formData.leave_type_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        notes: formData.notes || null,
        status: 'approved',

        auto_approve: true,
        employee_id: formData.employee_id
      }

      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Błąd tworzenia nieobecności')
      }

      toast.success('Nieobecność została dodana')
      onClose()
      
      // Reset form
      setFormData({
        employee_id: '',
        leave_type_id: '',
        start_date: '',
        end_date: '',
        notes: ''
      })
      setErrors({})
      
    } catch (error) {
      console.error('Error creating absence:', error)
      toast.error(error instanceof Error ? error.message : 'Błąd tworzenia nieobecności')
    } finally {
      setLoading(false)
    }
  }

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setFormData(prev => ({
        ...prev,
        start_date: format(range.from!, 'yyyy-MM-dd'),
        end_date: format(range.to!, 'yyyy-MM-dd')
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        start_date: '',
        end_date: ''
      }))
    }
    setErrors(prev => ({ ...prev, start_date: '', end_date: '', dates: '' }))
  }

  return (
    <SheetContent size="content" className="overflow-y-auto">
      <div className="flex flex-col h-full">
        <div className="flex flex-col p-6 flex-1 overflow-y-auto">
          <div className="flex flex-col space-y-1.5">
            <SheetTitle className="text-lg font-semibold">Dodaj nieobecność</SheetTitle>
            <SheetDescription>
              Dodaj nieobecność dla wybranego pracownika. Wniosek zostanie automatycznie zatwierdzony.
            </SheetDescription>
          </div>

          <Separator className="my-6" />

          <div className="space-y-6">
            {/* Employee Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Wybierz pracownika
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-auto min-h-9 px-3 py-2"
                  >
                    {formData.employee_id ? (
                      (() => {
                        const selectedEmployee = employees.find(emp => emp.id === formData.employee_id)
                        return selectedEmployee ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarImage src={selectedEmployee.avatar_url || undefined} />
                              <AvatarFallback className="bg-neutral-100 text-neutral-950 text-xs">
                                {(selectedEmployee.full_name || selectedEmployee.email)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col items-start">
                              <span className="font-medium text-sm">{selectedEmployee.full_name || selectedEmployee.email}</span>
                              <span className="text-xs text-muted-foreground">{selectedEmployee.email}</span>
                            </div>
                          </div>
                        ) : null
                      })()
                    ) : (
                      <span className="text-muted-foreground">Wybierz pracownika</span>
                    )}
                    <ChevronDownIcon className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {employees.map((employee) => (
                    <DropdownMenuItem
                      key={employee.id}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, employee_id: employee.id, leave_type_id: '' }))
                        setErrors(prev => ({ ...prev, employee_id: '' }))
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarImage src={employee.avatar_url || undefined} />
                          <AvatarFallback className="bg-neutral-100 text-neutral-950 text-xs">
                            {(employee.full_name || employee.email)?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{employee.full_name || employee.email}</span>
                          <span className="text-xs text-muted-foreground">{employee.email}</span>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {errors.employee_id && <p className="text-sm text-destructive">{errors.employee_id}</p>}
            </div>

            {/* Leave Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Jaki typ nieobecności
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between h-auto min-h-9 px-3 py-2"
                    disabled={!formData.employee_id}
                  >
                    {formData.leave_type_id ? (
                      (() => {
                        const selectedLeaveType = leaveTypes.find(lt => lt.id === formData.leave_type_id)
                        const balance = leaveBalances.find(lb => lb.leave_type_id === formData.leave_type_id)
                        return selectedLeaveType ? (
                          <div className="flex flex-col items-start">
                            <span className="font-medium text-sm">{selectedLeaveType.name}</span>
                            {balance && (
                              <span className="text-xs text-muted-foreground">
                                Dostępne {balance.remaining_days} dni
                              </span>
                            )}
                          </div>
                        ) : null
                      })()
                    ) : (
                      <span className="text-muted-foreground">Wybierz typ nieobecności</span>
                    )}
                    <ChevronDownIcon className="size-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {(() => {
                    // For AddAbsenceSheet, we need to create a user profile for the selected employee
                    if (!selectedEmployee || !organizationId) return leaveTypes.map((type, index, array) => (
                      <React.Fragment key={type.id}>
                        <DropdownMenuItem
                          onClick={() => setFormData({ ...formData, leave_type_id: type.id })}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{type.name}</span>
                            <span className="text-xs text-muted-foreground">Bez limitu</span>
                          </div>
                        </DropdownMenuItem>
                        {index < array.length - 1 && <DropdownMenuSeparator />}
                      </React.Fragment>
                    ))
                    
                    const employeeProfile = {
                      id: selectedEmployee.id,
                      full_name: selectedEmployee.full_name,
                      email: selectedEmployee.email,
                      role: selectedEmployee.role,
                      organization_id: organizationId,
                      team_id: selectedEmployee.team_id,
                    }
                    
                    const employeeBalances = leaveBalances.filter(balance => balance.user_id === selectedEmployee.id)
                    
                    return getApplicableLeaveTypes(employeeProfile, leaveTypes, employeeBalances, organizationId).map((type, index, array) => {
                      const balance = employeeBalances.find(lb => lb.leave_type_id === type.id)
                      const disabledState = isLeaveTypeDisabled(type, balance)
                      
                      return (
                        <React.Fragment key={type.id}>
                          <DropdownMenuItem
                            onClick={() => !disabledState.disabled && setFormData({ ...formData, leave_type_id: type.id })}
                            className={`${disabledState.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            disabled={disabledState.disabled}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{type.name}</span>
                              {balance && (
                                <span className="text-xs text-muted-foreground">
                                  Dostępne {Math.max(0, balance.remaining_days)} dni
                                </span>
                              )}
                              {!balance && (
                                <span className="text-xs text-muted-foreground">
                                  Bez limitu
                                </span>
                              )}
                              {disabledState.reason && (
                                <span className="text-xs text-red-500">
                                  {disabledState.reason}
                                </span>
                              )}
                            </div>
                          </DropdownMenuItem>
                          {index < array.length - 1 && <DropdownMenuSeparator />}
                        </React.Fragment>
                      )
                    })
                  })()}
                </DropdownMenuContent>
              </DropdownMenu>
              {errors.leave_type_id && <p className="text-sm text-destructive">{errors.leave_type_id}</p>}
            </div>

            {/* Date Range and Days */}
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label className="text-sm font-medium">
                  Termin nieobecności
                </Label>
                <DateRangePicker
                  value={formData.start_date && formData.end_date ? {
                    from: parseISO(formData.start_date),
                    to: parseISO(formData.end_date)
                  } : undefined}
                  onDateRangeChange={handleDateRangeChange}
                />
                {(errors.start_date || errors.end_date || errors.dates) && (
                  <p className="text-sm text-destructive">
                    {errors.dates || errors.start_date || errors.end_date}
                  </p>
                )}
              </div>
              
              <div className="w-fit space-y-2">
                <Label className="text-sm font-medium">
                  Urlop
                </Label>
                <Input
                  value={selectedDays > 0 ? `${selectedDays} dni` : '0 dni'}
                  disabled
                  className="text-center w-16"
                />
              </div>
              
              <div className="w-fit space-y-2">
                <Label className="text-sm font-medium">
                  Zostanie
                </Label>
                <Input
                  value={selectedBalance ? `${remainingAfter} dni` : '0 dni'}
                  disabled
                  className="text-center w-16"
                />
              </div>
            </div>
            {errors.balance && <p className="text-sm text-destructive">{errors.balance}</p>}

            {/* Overlap Warning */}
            {overlapUsers.length > 0 && (
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="flex items-start gap-3 mb-3">
                  <Info className="h-4 w-4 mt-0.5" />
                  <div className="font-medium text-sm">
                    W tym terminie urlop planują
                  </div>
                </div>
                <div className="space-y-3">
                  {overlapUsers.map((user, index) => (
                    <OverlapUserItem key={`${user.id}-${index}`} user={user} />
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm font-medium">
                Chcesz coś dodać?
              </Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Wpisz opcjonalny komentarz"
                className="min-h-[60px] resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer with buttons at bottom */}
        <div className="p-6">
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Zamknij
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Dodawanie...
                </>
              ) : (
                'Dodaj nieobecność'
              )}
            </Button>
          </div>
        </div>
      </div>
    </SheetContent>
  )
}

// Main component with global event listener
export default function AddAbsenceSheet({ preloadedEmployees, userRole }: Omit<AddAbsenceSheetProps, 'isOpen' | 'onClose'>) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleOpenAddAbsence = () => {
      setIsOpen(true)
    }

    window.addEventListener('openAddAbsence', handleOpenAddAbsence)
    return () => window.removeEventListener('openAddAbsence', handleOpenAddAbsence)
  }, [])

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <Suspense fallback={<div>Loading...</div>}>
        <AddAbsenceSheetContent
          preloadedEmployees={preloadedEmployees}
          userRole={userRole}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      </Suspense>
    </Sheet>
  )
} 