import { NextRequest, NextResponse } from 'next/server';
import getUserModel from '@/models/User';
import { applySessionCookie, createSessionToken, hashPassword, verifyPassword } from '@/lib/auth';
import { migrateAndSeedCollections } from '@/lib/seed';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'email and password are required' }, { status: 400 });
    }

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
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    await migrateAndSeedCollections(String(user._id));

    const res = NextResponse.json({
      success: true,
      data: { user: { _id: String(user._id), email: user.email, name: user.name || '' } },
    });
    applySessionCookie(res, createSessionToken(String(user._id), user.email));
    return res;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}
