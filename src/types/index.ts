export type UserRole = 'admin' | 'worker';

export interface User {
  uid: string;
  name: string;
  email: string | null;
  role: UserRole;
  companyCode: string | null;
  createdAt: number;
}

export interface Company {
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
  receiverId: string;
  companyCode: string;
  content: string;
  createdAt: number;
  read: boolean;
}
