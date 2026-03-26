import { NextRequest, NextResponse } from 'next/server';
import getUserModel from '@/models/User';
import { applySessionCookie, createSessionToken, hashPassword } from '@/lib/auth';
import { migrateAndSeedCollections } from '@/lib/seed';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim();

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'email and password are required' }, { status: 400 });
    }

    const User = await getUserModel();
    const exists = await User.findOne({ email });
    if (exists) {
      return NextResponse.json({ success: false, error: 'User already exists' }, { status: 409 });
    }

    const user = await User.create({
      email,
      name,
      password_hash: hashPassword(password),
    });

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
