import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,

  // Staff mode
  isStaff: false,
  staffEventId: null,
  staffEventTitle: null,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

  setStaffMode: (eventId, eventTitle) =>
    set({ isStaff: true, staffEventId: eventId, staffEventTitle: eventTitle }),

  clearStaffMode: () =>
    set({ isStaff: false, staffEventId: null, staffEventTitle: null }),

  signOut: () =>
    set({
      user: null,
      profile: null,
      isStaff: false,
      staffEventId: null,
      staffEventTitle: null,
    }),
}));
