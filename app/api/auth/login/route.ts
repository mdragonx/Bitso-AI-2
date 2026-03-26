import { NextRequest, NextResponse } from 'next/server';
import getUserModel from '@/models/User';
import { applySessionCookie, createSessionToken, hashPassword, verifyPassword } from '@/lib/auth';
import { migrateAndSeedCollections } from '@/lib/seed';
import { loginRequestSchema } from '@/lib/contracts/apiContracts';
import { recordAuthAnomaly, withLifecycleLog } from '@/lib/observability/lifecycle';
import { parseOrThrow } from '@/lib/validation/trading';

export async function POST(req: NextRequest) {
  try {
    const correlationId = req.headers.get('x-correlation-id') || undefined;
    const body = await req.json();
    const { email, password } = parseOrThrow(loginRequestSchema, body);

    const User = await getUserModel();
    const user = await User.findOne({ email });

    const passwordHash = typeof user?.password_hash === 'string' ? user.password_hash : '';
    let isAuthenticated = !!passwordHash && verifyPassword(password, passwordHash);

    if (!isAuthenticated && user && !passwordHash) {
      const legacyPassword = typeof user.password === 'string' ? user.password : '';
      if (legacyPassword && legacyPassword === password) {
        const nextHash = hashPassword(password);
        await User.updateOne(
          { _id: user._id },
          {
            $set: { password_hash: nextHash },
            $unset: { password: '' },
          }
        );
        user.password_hash = nextHash;
        user.password = undefined;
        isAuthenticated = true;
      }
    }

    if (!user || !isAuthenticated) {
      recordAuthAnomaly({ reason: 'LOGIN_INVALID_CREDENTIALS', correlationId });
      withLifecycleLog('warn', 'login_failed', { email, correlation_id: correlationId || null });
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    await migrateAndSeedCollections(String(user._id));

    const res = NextResponse.json({
      success: true,
      data: { user: { _id: String(user._id), email: user.email, name: user.name || '' } },
    });
    withLifecycleLog('info', 'login_success', {
      user_id: String(user._id),
      email: user.email,
      correlation_id: correlationId || null,
    });
    applySessionCookie(res, createSessionToken(String(user._id), user.email));
    return res;
  } catch (error: any) {
    const status = error?.message?.includes('Validation failed') ? 400 : 500;
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status });
  }
}
