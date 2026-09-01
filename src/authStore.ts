import { create } from 'zustand'
import * as api from './api'

type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in'
  email: string | null
  emailVerified: boolean
  error: string | null
  checkSession: () => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  markVerified: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  email: null,
  emailVerified: false,
  error: null,

  checkSession: async () => {
    try {
      const { email, emailVerified } = await api.me()
      set({ status: 'signed-in', email, emailVerified, error: null })
    } catch {
      set({ status: 'signed-out', email: null })
    }
  },

  signup: async (email, password) => {
    set({ error: null })
    try {
      const result = await api.signup(email, password)
      set({ status: 'signed-in', email: result.email, emailVerified: result.emailVerified })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong.' })
      throw err
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const result = await api.login(email, password)
      set({ status: 'signed-in', email: result.email, emailVerified: result.emailVerified })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong.' })
      throw err
    }
  },

  logout: async () => {
    await api.logout()
    set({ status: 'signed-out', email: null, emailVerified: false })
  },

  markVerified: () => set({ emailVerified: true }),
}))
