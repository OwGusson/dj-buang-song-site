export async function onRequestPost(context) {
  try {
    const { password } = await context.request.json();

    const correctPassword = context.env.ADMIN_PASSWORD;

    if (!correctPassword) {
      return new Response(
        JSON.stringify({ error: "Admin password not configured" }),
        { status: 500 }
      );
    }

    if (password === correctPassword) {
      return new Response(JSON.stringify({ success: true }));
    }

    return new Response(
      JSON.stringify({ error: "Invalid password" }),
      { status: 401 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Login failed" }),
      { status: 500 }
    );
  }
}