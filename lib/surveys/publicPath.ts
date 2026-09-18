export function surveyPublicPath(slug: string, organizationId: string, isPublished: boolean): string {
  const preview = isPublished ? "" : "&preview=1";
  return `/surveys/${slug}?org=${encodeURIComponent(organizationId)}${preview}`;
}
