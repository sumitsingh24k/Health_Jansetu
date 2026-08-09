import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";
import { createAshaUser } from "@/app/lib/auth/worker-id";

/**
 * Self-signup for ASHA workers.
 *
 * Created PENDING, not APPROVED. An ASHA's reports are what paint the outbreak map,
 * so an unverified account could raise a fake cluster for a whole village — the admin
 * approval step is the only thing standing between the map and anyone with an email
 * address. The worker id is allocated up front so the admin sees the same identity
 * they would have issued manually.
 */
export async function POST(request) {
  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const name = normalizeRequiredString(body?.name);
    const email = normalizeEmail(body?.email);
    const password = normalizeRequiredString(body?.password);

    if (!name || !email || !password) {
      return Response.json(
        { message: "Naam, email aur password teeno chahiye." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { message: "Password kam se kam 6 characters ka rakhiye." },
        { status: 400 }
      );
    }

    const { location: normalizedLocation, error: locationError } = buildLocation(body?.location);
    if (locationError) {
      return Response.json({ message: locationError }, { status: 400 });
    }

    if (!normalizedLocation?.district || !normalizedLocation?.village) {
      return Response.json(
        { message: "Apna gaon aur zila bhariye — aapki report isi area par darj hogi." },
        { status: 400 }
      );
    }

    await dbConnect();

    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
      return Response.json({ message: "Ye email pehle se registered hai." }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password, 10);

    const user = await createAshaUser({
      name,
      email,
      password: hashedPassword,
      location: normalizedLocation,
      status: "PENDING",
    });

    return Response.json(
      {
        message: `Registration bhej diya gaya. Aapka worker ID ${user.workerId} hai. Admin approve karega tabhi login hoga.`,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          workerId: user.workerId,
          location: user.location,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/asha/register", error);
    return Response.json({ message: "Registration nahi ho paaya." }, { status: 500 });
  }
}
