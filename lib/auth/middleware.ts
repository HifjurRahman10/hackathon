import { z } from 'zod'
import { getTeamForUser, getUser } from '@/lib/db/queries'
import { redirect } from 'next/navigation'

// Update the type to match what getTeamForUser() actually returns
export type TeamDataWithMembers = {
  id: number
  name: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  planName: string | null
  subscriptionStatus: string
  teamMembers: {
    id: number
    name: string | null
    email: string
  }[]
}

export type ActionState = {
  error?: string
  success?: string
  [key: string]: any
}

type ValidatedActionFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData
) => Promise<T>

export function validatedAction<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionFunction<S, T>
) {
  return async (prevState: ActionState, formData: FormData) => {
    const result = schema.safeParse(Object.fromEntries(formData))
    if (!result.success) {
      return { error: result.error.errors[0].message }
    }

    return action(result.data, formData)
  }
}

type ValidatedActionWithUserFunction<S extends z.ZodType<any, any>, T> = (
  data: z.infer<S>,
  formData: FormData,
  user: NonNullable<Awaited<ReturnType<typeof getUser>>>
) => Promise<T>

export function validatedActionWithUser<S extends z.ZodType<any, any>, T>(
  schema: S,
  action: ValidatedActionWithUserFunction<S, T>
) {
  return async (prevState: ActionState, formData: FormData) => {
    const user = await getUser()
    if (!user) {
      redirect('/sign-in')
    }

    const result = schema.safeParse(Object.fromEntries(formData))
    if (!result.success) {
      return { error: result.error.errors[0].message }
    }

    return action(result.data, formData, user)
  }
}

// Use the actual return type from getTeamForUser
export type TeamWithMembers = {
  id: number
  name: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeProductId: string | null
  planName: string | null
  subscriptionStatus: string | null
  createdAt: Date
  updatedAt: Date
  teamMembers: {
    id: number
    name: string | null
    email: string
  }[]
}

type ActionWithTeamFunction<T> = (
  formData: FormData,
  team: TeamWithMembers
) => Promise<T>

export function withTeam<T>(action: ActionWithTeamFunction<T>) {
  return async (formData: FormData): Promise<T> => {
    const team = await getTeamForUser()
    if (!team) throw new Error('Team not found')
    return action(formData, team as TeamWithMembers)
  }
}