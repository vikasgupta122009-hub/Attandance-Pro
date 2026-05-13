export type UserRole = 'admin' | 'worker';

export interface Membership {
  companyId: string;
  companyCode: string; // The join code
  companyName: string;
  role: UserRole;
  joinedAt: number;
}

export interface User {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole; // Current active role
  companyId: string | null; // Current active company ID
  companyCode: string | null; // Current active company code
  memberships?: Membership[];
  createdAt: number;
  updatedAt?: number;
}

export interface Company {
  id: string;
  code: string;
  adminId: string;
  name: string;
  createdAt: number;
}

export type AttendanceStatus = 'present' | 'absent';
export type CheckInMethod = 'button' | 'qr' | 'manual';

export interface Attendance {
  id: string; // userId_YYYY-MM-DD
  userId: string;
  companyId: string;
  companyCode: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  checkInTime?: number;
  method?: CheckInMethod;
  location?: {
    lat: number;
    lng: number;
  };
  modifiedByAdmin: boolean;
  updatedAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  receiverId?: string | null;
  companyId: string;
  content: string;
  type: 'direct' | 'group';
  createdAt: number;
  read?: boolean;
  readBy?: string[];
}

declare global {
  interface Window {
    AndroidBridge?: {
      clearCache: () => void;
      showToast: (message: string) => void;
    };
  }
}
