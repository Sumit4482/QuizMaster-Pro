// Express type extensions
import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        role: UserRole;
        jti: string;
      };
      correlationId?: string;
    }
  }
}

export {};
