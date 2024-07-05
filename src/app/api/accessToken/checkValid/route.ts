import { options } from "@api/auth/[...nextauth]/options";
import { getServerSession } from "next-auth";

export async function GET() {
  const session = await getServerSession(options);

  try {
    const accounts = session?.user?.accounts || [];
    const isAccessTokenValid = accounts?.length > 0 || false;
    return Response.json({ success: true, isAccessTokenValid });
  } catch (error) {
    console.log(error);
    return Response.json({
      success: false,
      error: error,
    });
  }
}
