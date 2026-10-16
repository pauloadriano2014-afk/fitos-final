import { MASTER_IDS } from '/home/user/fitos-final/lib/masterIds';
export const isMasterId = (id: any) => !!id && MASTER_IDS.includes(id);
export const signAuthToken = () => 'tok';
export const requireAuth = (req: any) => (req as any).__auth ? { user: (req as any).__auth } : { response: { status: 401 } };
export const canActAsCoach = (au: any, target: any) => !!au && (isMasterId(au.id) || au.id === target);
export type AuthUser = any;
export const canAccessStudent = (au: any, studentId: string, coachId: any) => !!au && (isMasterId(au.id) || au.id === studentId || au.id === coachId);
