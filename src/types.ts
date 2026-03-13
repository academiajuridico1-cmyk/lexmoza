import { Timestamp } from 'firebase/firestore';

export interface Law {
  id: string;
  title: string;
  category: string;
  content: string;
  pdfUrl?: string;
  articleCount?: number;
  year?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  viewCount: number;
  downloadCount: number;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  displayName?: string;
  photoURL?: string;
}

export interface Favorite {
  id: string;
  userId: string;
  lawId: string;
  createdAt: Timestamp;
}
