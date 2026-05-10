import { isSupabaseConfigured, supabase } from "./supabaseClient";

const SYSTEM_OPTIONS_KEY = "system_options";

function ensureSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
}

function describeError(error) {
  if (!error) return "알 수 없는 Supabase 오류";
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

function toStandardRow(standard) {
  return {
    id: standard.id,
    title: standard.title || standard.form?.title || "작업명 미입력",
    work_type: standard.form?.workType || "",
    equipment: standard.equipment || standard.form?.equipment || "",
    tag: standard.tag || standard.form?.tag || "",
    system: standard.system || standard.form?.system || "",
    rev: standard.rev || standard.form?.rev || "Rev.01",
    saved_at: standard.savedAt || new Date().toISOString(),
    form: standard.form || {},
    draft: standard.draft || {},
  };
}

function toRevisionRow(standardId, revision) {
  return {
    id: revision.id,
    standard_id: standardId,
    rev: revision.rev || revision.form?.rev || "Rev.01",
    saved_at: revision.savedAt || new Date().toISOString(),
    author: revision.author || revision.form?.author || "",
    summary: revision.summary || "이력 등록",
    form: revision.form || {},
    draft: revision.draft || {},
  };
}

function fromRevisionRow(row) {
  return {
    id: row.id,
    rev: row.rev,
    savedAt: row.saved_at,
    author: row.author || "",
    summary: row.summary || "이력 등록",
    form: row.form || {},
    draft: row.draft || {},
  };
}

function fromStandardRow(row, revisions) {
  return {
    id: row.id,
    title: row.title || row.form?.title || "작업명 미입력",
    tag: row.tag || row.form?.tag || "",
    equipment: row.equipment || row.form?.equipment || "",
    system: row.system || row.form?.system || "",
    rev: row.rev || row.form?.rev || "Rev.01",
    savedAt: row.saved_at,
    form: row.form || {},
    draft: row.draft || {},
    revisions,
  };
}

export async function loadRemoteState() {
  ensureSupabase();

  const [standardsResult, revisionsResult, settingsResult] = await Promise.all([
    supabase.from("standards").select("id,title,work_type,equipment,tag,system,rev,saved_at,form,draft").order("saved_at", { ascending: false }),
    supabase.from("standard_revisions").select("id,standard_id,rev,saved_at,author,summary,form,draft").order("saved_at", { ascending: true }),
    supabase.from("app_settings").select("value").eq("key", SYSTEM_OPTIONS_KEY).maybeSingle(),
  ]);

  if (standardsResult.error) throw new Error(describeError(standardsResult.error));
  if (revisionsResult.error) throw new Error(describeError(revisionsResult.error));
  if (settingsResult.error) throw new Error(describeError(settingsResult.error));

  const revisionsByStandard = new Map();
  (revisionsResult.data || []).forEach((row) => {
    const next = revisionsByStandard.get(row.standard_id) || [];
    next.push(fromRevisionRow(row));
    revisionsByStandard.set(row.standard_id, next);
  });

  return {
    standards: (standardsResult.data || []).map((row) => fromStandardRow(row, revisionsByStandard.get(row.id) || [])),
    systemOptions: settingsResult.data?.value || null,
  };
}

export async function saveStandardsToRemote(standards) {
  ensureSupabase();
  const standardRows = standards.map(toStandardRow);
  const revisionRows = standards.flatMap((standard) => (standard.revisions || []).map((revision) => toRevisionRow(standard.id, revision)));

  if (standardRows.length) {
    const { error } = await supabase.from("standards").upsert(standardRows, { onConflict: "id" });
    if (error) throw new Error(describeError(error));
  }

  if (revisionRows.length) {
    const { error } = await supabase.from("standard_revisions").upsert(revisionRows, { onConflict: "id" });
    if (error) throw new Error(describeError(error));
  }
}

export async function saveSystemOptionsToRemote(systemOptions) {
  ensureSupabase();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SYSTEM_OPTIONS_KEY,
      value: systemOptions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(describeError(error));
}

export async function deleteStandardFromRemote(id) {
  ensureSupabase();
  const { error } = await supabase.from("standards").delete().eq("id", id);
  if (error) throw new Error(describeError(error));
}
