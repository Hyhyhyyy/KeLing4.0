export function isBinaryTreeCourse(course?: { code?: string; hasBinaryTreeHistory?: boolean } | null): boolean {
  return Boolean(course && course.code !== 'AI_PLANET' && (course.code === 'SAMPLE' || course.hasBinaryTreeHistory === true));
}
