import { brandPlaceholderSvg, svgHeaders } from "@/lib/parts/visual-placeholders";

type RouteParams = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-static";

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  return new Response(brandPlaceholderSvg(slug), {
    headers: svgHeaders(),
  });
}
