import { NextRequest, NextResponse } from 'next/server';
import { getSessionValidationFromRequest } from '@/lib/auth';
import { findUserById } from '@/lib/repositories/userRepository';

export const dynamic = 'force-dynamic';

const meRouteDependencies = {
  findUserById,
};

export function __setMeRouteTestDependencies(overrides: Partial<typeof meRouteDependencies>) {
  Object.assign(meRouteDependencies, overrides);
}

export function __resetMeRouteTestDependencies() {
  meRouteDependencies.findUserById = findUserById;
}

export async function GET(req: NextRequest) {
  try {
    const validation = getSessionValidationFromRequest(req);
    if (!validation.session) {
      return NextResponse.json(
        {
          success: false,
          error: validation.errorCode === 'SESSION_EXPIRED' ? 'Session expired. Please sign in again.' : 'Unauthorized',
          error_code: validation.errorCode,
        },
        { status: 401 }
      );
    }

    const session = validation.session;

    const user = await meRouteDependencies.findUserById(session.userId);

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      data: { user: { _id: String(user._id), email: user.email, name: user.name || '' } },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}
