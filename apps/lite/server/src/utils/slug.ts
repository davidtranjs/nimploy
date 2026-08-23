export function slugify(text: string | undefined | null): string {
  if (!text || typeof text !== "string") {
    return "service";
  }

  const cleaned = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned || "service";
}

export function generateUniqueProjectSlug(
  sqliteDb: any,
  name: string,
  excludeId?: string
): string {
  const base = slugify(name);
  let candidate = base;
  let counter = 1;

  while (true) {
    let query = "SELECT id FROM projects WHERE slug = ?";
    const params: any[] = [candidate];
    if (excludeId) {
      query += " AND id != ?";
      params.push(excludeId);
    }
    const row = sqliteDb.prepare(query).get(...params);
    if (!row) {
      return candidate;
    }
    counter++;
    candidate = `${base}-${counter}`;
  }
}

export function generateUniqueAppSlug(
  sqliteDb: any,
  projectId: string,
  name: string,
  excludeId?: string
): string {
  const base = slugify(name);
  let candidate = base;
  let counter = 1;

  while (true) {
    let query = "SELECT id FROM applications WHERE project_id = ? AND slug = ?";
    const params: any[] = [projectId, candidate];
    if (excludeId) {
      query += " AND id != ?";
      params.push(excludeId);
    }
    const row = sqliteDb.prepare(query).get(...params);
    if (!row) {
      return candidate;
    }
    counter++;
    candidate = `${base}-${counter}`;
  }
}
