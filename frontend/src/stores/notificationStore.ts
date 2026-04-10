import { create } from 'zustand'

export interface D4Alert {
  id: string
  orderId: string
  trackingNumber: string
  tenantId: string
  status: string
  assignedPicker: string | null
  assignedPacker: string | null
  receivedAt: number
}

interface NotificationState {
  d4Alerts: D4Alert[]
  addD4Alert: (payload: Omit<D4Alert, 'id' | 'receivedAt'>) => void
  dismissD4Alert: (id: string) => void
  dismissAllD4Alerts: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  d4Alerts: [],

  addD4Alert: (payload) =>
    set((state) => ({
      d4Alerts: [
        ...state.d4Alerts,
        {
          ...payload,
          id: `${payload.orderId}-${Date.now()}`,
          receivedAt: Date.now(),
        },
      ],
    })),

  dismissD4Alert: (id) =>
    set((state) => ({
      d4Alerts: state.d4Alerts.filter((a) => a.id !== id),
    })),

  dismissAllD4Alerts: () => set({ d4Alerts: [] }),
}))
