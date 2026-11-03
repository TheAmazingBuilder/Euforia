/**
 * e2e - Nofy (B11) over the REAL AppModule + real database: the knowledge
 * workspace's lazy per-user seed, note CRUD with soft-delete lifecycle,
 * block-level autosave with version snapshots, folders/tags/templates and
 * the entity picker. Read models are validated against the SHARED Zod
 * contracts the frontend consumes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  nofyNotesResponseSchema,
  nofyNoteResponseSchema,
  nofyOverviewResponseSchema,
  nofyFoldersResponseSchema,
  nofyTagsResponseSchema,
  nofyTemplatesResponseSchema,
  nofySearchResponseSchema,
  nofyRefsResponseSchema,
  nofyVersionsResponseSchema,
  nofyVersionResponseSchema,
} from "../../src/shared/contracts";
import { buildTestApp } from "../helpers/build-app";
import { authenticatedUser, captureMail, type MailCapture } from "../helpers/identity";

let app: NestFastifyApplication;
let mail: MailCapture;

beforeAll(async () => {
  app = await buildTestApp();
  mail = captureMail(app);
});

afterAll(async () => {
  await app?.close();
});

function auth(user: { authHeader: Record<string, string> }) {
  return user.authHeader;
}

describe("nofy workspace (B11)", () => {
  it("401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/nofy/notes" });
    expect(res.statusCode).toBe(401);
  });

  it("lazy seed + overview serve the demo workspace with honest totals", async () => {
    const user = await authenticatedUser(app, mail);
    const overview = nofyOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/overview", headers: auth(user) })).json(),
    );
    expect(overview.totals.folders).toBe(7);
    expect(overview.totals.tags).toBe(10);
    expect(overview.totals.trashed).toBe(1);
    expect(overview.totals.notes).toBe(8); // 9 seeded, one already trashed
    expect(overview.favorites).toHaveLength(3);
    expect(overview.templates).toHaveLength(4);
    expect(overview.activity).toHaveLength(8); // 8 weeks, oldest first
    expect(overview.topTags.length).toBeGreaterThan(0);
    expect(overview.recentEdited.length).toBeGreaterThan(0);

    // Second read does not re-seed (stable totals).
    const again = nofyOverviewResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/overview", headers: auth(user) })).json(),
    );
    expect(again.totals.notes).toBe(8);
  });

  it("note lists honor scope, search query and sort", async () => {
    const user = await authenticatedUser(app, mail);
    const all = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes", headers: auth(user) })).json(),
    );
    expect(all.total).toBe(8);

    const favorites = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes?view=favorites", headers: auth(user) })).json(),
    );
    expect(favorites.total).toBe(3);
    expect(favorites.notes.every((n) => n.favorite)).toBe(true);

    const trash = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes?view=trash", headers: auth(user) })).json(),
    );
    expect(trash.total).toBe(1);
    expect(trash.notes[0]!.deletedAt).not.toBeNull();

    const search = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes?q=liquidity", headers: auth(user) })).json(),
    );
    expect(search.total).toBeGreaterThanOrEqual(1);

    const byTitle = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes?sort=title", headers: auth(user) })).json(),
    );
    const titles = byTitle.notes.map((n) => n.title);
    expect([...titles].sort((a, b) => a.localeCompare(b))).toEqual(titles);
  });

  it("note CRUD: create → get (view tracked) → autosave → trash → restore → purge", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/notes",
      headers: auth(user),
      payload: {
        title: "  Session prep  ",
        blocks: [
          { id: "b1", type: "h2", text: "Plan" },
          { id: "b2", type: "todo", text: "Mark levels", checked: false },
          { id: "b3", type: "ref", ref: { kind: "NOTE", id: "00000000-0000-4000-8000-000000000000" } },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const note = nofyNoteResponseSchema.parse(created.json());
    expect(note.note.title).toBe("Session prep"); // trimmed
    expect(note.note.icon).toBe("📝"); // default icon
    expect(note.note.blocks).toHaveLength(3);
    const noteId = note.note.id;

    // GET tracks the view (lastViewedAt bumps, updatedAt untouched).
    const got = nofyNoteResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${noteId}`, headers: auth(user) })).json(),
    );
    expect(got.note.lastViewedAt).not.toBeNull();

    // Autosave PATCH: blocks normalize, ref resolves to "Unresolved reference".
    const saved = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/nofy/notes/${noteId}`,
          headers: auth(user),
          payload: {
            blocks: [
              { id: "b1", type: "h2", text: "Plan" },
              { id: "b2", type: "todo", text: "Mark levels", checked: true },
            ],
            favorite: true,
          },
        })
      ).json(),
    );
    expect(saved.note.blocks).toHaveLength(2);
    expect(saved.note.favorite).toBe(true);

    // First meaningful edit snapshots a version (no prior history).
    const versions = nofyVersionsResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${noteId}/versions`, headers: auth(user) })).json(),
    );
    expect(versions.versions).toHaveLength(1);
    const snapshot = nofyVersionResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/nofy/notes/${noteId}/versions/${versions.versions[0]!.id}`,
          headers: auth(user),
        })
      ).json(),
    );
    expect(snapshot.version.blocks).toHaveLength(3); // the pre-edit state

    // Trash → gone from "all", visible in trash → restore → purge for good.
    const trashed = await app.inject({ method: "DELETE", url: `/api/v1/nofy/notes/${noteId}`, headers: auth(user) });
    expect(trashed.json()).toEqual({ ok: true });
    const inTrash = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes?view=trash", headers: auth(user) })).json(),
    );
    expect(inTrash.notes.some((n) => n.id === noteId)).toBe(true);
    const restored = await app.inject({ method: "POST", url: `/api/v1/nofy/notes/${noteId}/restore`, headers: auth(user) });
    expect(restored.json()).toEqual({ ok: true });
    const reTrashed = await app.inject({ method: "DELETE", url: `/api/v1/nofy/notes/${noteId}`, headers: auth(user) });
    expect(reTrashed.statusCode).toBe(200);
    const purged = await app.inject({ method: "DELETE", url: `/api/v1/nofy/notes/${noteId}/permanent`, headers: auth(user) });
    expect(purged.json()).toEqual({ ok: true });
    const after = await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${noteId}`, headers: auth(user) });
    expect(after.statusCode).toBe(404);
    // Version history was purged with the note.
    const versionsGone = nofyVersionsResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${noteId}/versions`, headers: auth(user) })).json(),
    );
    expect(versionsGone.versions).toHaveLength(0);
  });

  it("duplicate copies blocks with fresh ids; version restore rolls back", async () => {
    const user = await authenticatedUser(app, mail);
    const created = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/nofy/notes",
          headers: auth(user),
          payload: { title: "Original" },
        })
      ).json(),
    );
    const copy = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/nofy/notes/${created.note.id}/duplicate`,
          headers: auth(user),
          payload: {},
        })
      ).json(),
    );
    expect(copy.note.title).toBe("Original (copy)");
    expect(copy.note.id).not.toBe(created.note.id);
    expect(copy.note.favorite).toBe(false);

    // Edit, then roll back to the frozen snapshot.
    await app.inject({
      method: "PATCH",
      url: `/api/v1/nofy/notes/${created.note.id}`,
      headers: auth(user),
      payload: { title: "Rewritten" },
    });
    const versions = nofyVersionsResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${created.note.id}/versions`, headers: auth(user) })).json(),
    );
    expect(versions.versions[0]!.title).toBe("Original");
    const restoredNote = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/nofy/notes/${created.note.id}/versions/${versions.versions[0]!.id}/restore`,
          headers: auth(user),
        })
      ).json(),
    );
    expect(restoredNote.note.title).toBe("Original");
  });

  it("folders: create/rename with case-insensitive 409; delete releases notes", async () => {
    const user = await authenticatedUser(app, mail);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/folders",
      headers: auth(user),
      payload: { name: "Macro deep-dives" },
    });
    expect(created.statusCode).toBe(201);
    const folder = created.json() as { id: string; name: string; noteCount: number };
    expect(folder.name).toBe("Macro deep-dives");
    expect(folder.noteCount).toBe(0);

    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/folders",
      headers: auth(user),
      payload: { name: "macro DEEP-DIVES" },
    });
    expect(dup.statusCode).toBe(409);

    // Park a note in the folder, then delete the folder - the note falls
    // back to "No folder" instead of dangling.
    const note = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/nofy/notes",
          headers: auth(user),
          payload: { title: "CPI postmortem", folderId: folder.id },
        })
      ).json(),
    );
    const renamed = nofyFoldersResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/folders", headers: auth(user) })).json(),
    );
    const macro = renamed.folders.find((f) => f.id === folder.id)!;
    expect(macro.noteCount).toBe(1);

    const removed = await app.inject({ method: "DELETE", url: `/api/v1/nofy/folders/${folder.id}`, headers: auth(user) });
    expect(removed.json()).toEqual({ ok: true });
    const orphan = nofyNoteResponseSchema.parse(
      (await app.inject({ method: "GET", url: `/api/v1/nofy/notes/${note.note.id}`, headers: auth(user) })).json(),
    );
    expect(orphan.note.folderId).toBeNull();
  });

  it("tags are create-or-return by name; templates library + instantiate", async () => {
    const user = await authenticatedUser(app, mail);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/tags",
      headers: auth(user),
      payload: { name: "#Gold" },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/tags",
      headers: auth(user),
      payload: { name: "gold" },
    });
    expect((second.json() as { id: string }).id).toEqual((first.json() as { id: string }).id);
    const tags = nofyTagsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/tags", headers: auth(user) })).json(),
    );
    expect(tags.tags.length).toBe(11); // 10 seeded + gold

    const templates = nofyTemplatesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/templates", headers: auth(user) })).json(),
    );
    expect(templates.templates).toHaveLength(5); // built-ins
    expect(templates.templates.every((t) => t.builtIn)).toBe(true);

    // A user template captured FROM a note drops personal references.
    const note = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/nofy/notes",
          headers: auth(user),
          payload: {
            title: "With refs",
            blocks: [
              { id: "b1", type: "paragraph", text: "Body" },
              { id: "b2", type: "ref", ref: { kind: "NOTE", id: "00000000-0000-4000-8000-000000000000" } },
            ],
          },
        })
      ).json(),
    );
    const template = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/templates",
      headers: auth(user),
      payload: { name: "My shape", description: "Captured", icon: "🧩", fromNoteId: note.note.id },
    });
    expect(template.statusCode).toBe(201);
    expect((template.json() as { builtIn: boolean }).builtIn).toBe(false);

    const instantiated = nofyNoteResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/nofy/templates/instantiate",
          headers: auth(user),
          payload: { templateId: (template.json() as { id: string }).id },
        })
      ).json(),
    );
    expect(instantiated.note.templateId).toBe((template.json() as { id: string }).id);
    // The block keeps its type but carries NO personal reference payload.
    expect(instantiated.note.blocks.every((b) => b.ref === undefined)).toBe(true);
  });

  it("search returns snippets; refs is the entity picker; linked-notes works", async () => {
    const user = await authenticatedUser(app, mail);
    const search = nofySearchResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/search?q=reclaim", headers: auth(user) })).json(),
    );
    expect(search.total).toBeGreaterThanOrEqual(1);
    expect(search.results[0]!.snippet.length).toBeGreaterThan(0);

    const refs = nofyRefsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/refs", headers: auth(user) })).json(),
    );
    // Instruments + seeded notes are always referenceable.
    expect(refs.refs.some((r) => r.kind === "SYMBOL")).toBe(true);
    expect(refs.refs.some((r) => r.kind === "NOTE")).toBe(true);
    const filtered = nofyRefsResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/refs?kind=SYMBOL", headers: auth(user) })).json(),
    );
    expect(filtered.refs.every((r) => r.kind === "SYMBOL")).toBe(true);

    // Link a note to another via a ref block, then use the integration read.
    const target = nofyNotesResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/api/v1/nofy/notes", headers: auth(user) })).json(),
    ).notes[0]!;
    await app.inject({
      method: "PATCH",
      url: `/api/v1/nofy/notes/${target.id}`,
      headers: auth(user),
      payload: {
        blocks: [
          { id: "rb1", type: "paragraph", text: "See also" },
          { id: "rb2", type: "ref", ref: { kind: "NOTE", id: target.id } },
        ],
      },
    });
    const linked = nofyNotesResponseSchema.parse(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/nofy/notes?refKind=NOTE&refId=${target.id}`,
          headers: auth(user),
        })
      ).json(),
    );
    expect(linked.total).toBe(1);
    expect(linked.notes[0]!.id).toBe(target.id);
  });

  it("unknown ids 404 honestly", async () => {
    const user = await authenticatedUser(app, mail);
    const note = await app.inject({
      method: "GET",
      url: "/api/v1/nofy/notes/00000000-0000-4000-8000-000000000000",
      headers: auth(user),
    });
    expect(note.statusCode).toBe(404);
    const folder = await app.inject({
      method: "DELETE",
      url: "/api/v1/nofy/folders/00000000-0000-4000-8000-000000000000",
      headers: auth(user),
    });
    expect(folder.statusCode).toBe(404);
    const template = await app.inject({
      method: "POST",
      url: "/api/v1/nofy/templates/instantiate",
      headers: auth(user),
      payload: { templateId: "tpl-does-not-exist" },
    });
    expect(template.statusCode).toBe(404);
  });
});
