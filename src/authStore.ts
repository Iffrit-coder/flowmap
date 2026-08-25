import { create } from 'zustand'
import * as api from './api'

type AuthState = {
  status: 'loading' | 'signed-out' | 'signed-in'
  email: string | null
  error: string | null
  checkSession: () => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  email: null,
  error: null,

  checkSession: async () => {
    try {
      const { email } = await api.me()
      set({ status: 'signed-in', email, error: null })
    } catch {
      set({ status: 'signed-out', email: null })
    }
  },

  signup: async (email, password) => {
    set({ error: null })
    try {
      const result = await api.signup(email, password)
      set({ status: 'signed-in', email: result.email })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong.' })
      throw err
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const result = await api.login(email, password)
      set({ status: 'signed-in', email: result.email })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Something went wrong.' })
      throw err
    }
  },

  logout: async () => {
    await api.logout()
    set({ status: 'signed-out', email: null })
  },
}))
