import { isSupabaseConfigured, supabase } from "./supabaseClient";

const SYSTEM_OPTIONS_KEY = "system_options";
const EXAMPLES_SEEDED_KEY = "examples_seeded";

function ensureSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
}

function ensureOwnerId(ownerId) {
  if (!ownerId) {
    throw new Error("로그인 사용자 정보가 없어 Supabase에 저장할 수 없습니다.");
  }
  return ownerId;
}

function describeError(error) {
  if (!error) return "알 수 없는 Supabase 오류";
  return [error.message, error.details, error.hint].filter(Boolean).join(" ");
}

function toStandardRow(standard, ownerId) {
  return {
    id: standard.id,
    owner_id: ensureOwnerId(ownerId),
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

function toRevisionRow(standardId, revision, ownerId) {
  return {
    id: revision.id,
    owner_id: ensureOwnerId(ownerId),
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

function toWorkRecordRow(record, ownerId) {
  return {
    id: record.id,
    owner_id: ensureOwnerId(ownerId),
    standard_id: record.standardId || null,
    standard_rev: record.standardRev || null,
    work_date: record.workDate || new Date().toISOString().slice(0, 10),
    status: record.status || "recorded",
    result: record,
  };
}

function fromWorkRecordRow(row) {
  const result = row.result || {};
  return {
    ...result,
    id: row.id,
    standardId: row.standard_id || result.standardId || "",
    standardRev: row.standard_rev || result.standardRev || "",
    workDate: row.work_date || result.workDate || "",
    status: row.status || result.status || "recorded",
    savedAt: result.savedAt || row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function getSettingValue(rows, key) {
  return (rows || []).find((row) => row.key === key)?.value;
}

function parseExamplesSeeded(value) {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "seeded" in value) return Boolean(value.seeded);
  return null;
}

export async function loadRemoteState() {
  ensureSupabase();

  const [standardsResult, revisionsResult, settingsResult, workRunsResult] = await Promise.all([
    supabase.from("standards").select("id,title,work_type,equipment,tag,system,rev,saved_at,form,draft").order("saved_at", { ascending: false }),
    supabase.from("standard_revisions").select("id,standard_id,rev,saved_at,author,summary,form,draft").order("saved_at", { ascending: true }),
    supabase.from("app_settings").select("key,value").in("key", [SYSTEM_OPTIONS_KEY, EXAMPLES_SEEDED_KEY]),
    supabase.from("work_runs").select("id,standard_id,standard_rev,work_date,status,result,created_at,updated_at").order("work_date", { ascending: false }),
  ]);

  if (standardsResult.error) throw new Error(describeError(standardsResult.error));
  if (revisionsResult.error) throw new Error(describeError(revisionsResult.error));
  if (settingsResult.error) throw new Error(describeError(settingsResult.error));
  if (workRunsResult.error && workRunsResult.error.code !== "PGRST205") throw new Error(describeError(workRunsResult.error));

  const revisionsByStandard = new Map();
  (revisionsResult.data || []).forEach((row) => {
    const next = revisionsByStandard.get(row.standard_id) || [];
    next.push(fromRevisionRow(row));
    revisionsByStandard.set(row.standard_id, next);
  });

  const settingsRows = settingsResult.data || [];

  return {
    standards: (standardsResult.data || []).map((row) => fromStandardRow(row, revisionsByStandard.get(row.id) || [])),
    systemOptions: getSettingValue(settingsRows, SYSTEM_OPTIONS_KEY) || null,
    examplesSeeded: parseExamplesSeeded(getSettingValue(settingsRows, EXAMPLES_SEEDED_KEY)),
    workRecords: workRunsResult.error ? [] : (workRunsResult.data || []).map(fromWorkRecordRow),
  };
}

export async function saveStandardsToRemote(standards, ownerId) {
  ensureSupabase();
  ensureOwnerId(ownerId);
  const standardRows = standards.map((standard) => toStandardRow(standard, ownerId));
  const revisionRows = standards.flatMap((standard) => (standard.revisions || []).map((revision) => toRevisionRow(standard.id, revision, ownerId)));

  if (standardRows.length) {
    const { error } = await supabase.from("standards").upsert(standardRows, { onConflict: "id" });
    if (error) throw new Error(describeError(error));
  }

  if (revisionRows.length) {
    const { error } = await supabase.from("standard_revisions").upsert(revisionRows, { onConflict: "id" });
    if (error) throw new Error(describeError(error));
  }
}

export async function saveAppSettingsToRemote({ systemOptions, examplesSeeded }, ownerId) {
  ensureSupabase();
  ensureOwnerId(ownerId);
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert(
    [
      {
        key: SYSTEM_OPTIONS_KEY,
        owner_id: ownerId,
        value: systemOptions,
        updated_at: updatedAt,
      },
      {
        key: EXAMPLES_SEEDED_KEY,
        owner_id: ownerId,
        value: { seeded: Boolean(examplesSeeded) },
        updated_at: updatedAt,
      },
    ],
    { onConflict: "owner_id,key" },
  );
  if (error) throw new Error(describeError(error));
}

export async function saveSystemOptionsToRemote(systemOptions, ownerId) {
  ensureSupabase();
  ensureOwnerId(ownerId);
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: SYSTEM_OPTIONS_KEY,
      owner_id: ownerId,
      value: systemOptions,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,key" },
  );
  if (error) throw new Error(describeError(error));
}

export async function saveWorkRecordsToRemote(workRecords, ownerId) {
  ensureSupabase();
  ensureOwnerId(ownerId);
  const rows = workRecords.map((record) => toWorkRecordRow(record, ownerId));
  if (!rows.length) return;

  const { error } = await supabase.from("work_runs").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(describeError(error));
}

export async function deleteStandardFromRemote(id) {
  ensureSupabase();
  const { error } = await supabase.from("standards").delete().eq("id", id);
  if (error) throw new Error(describeError(error));
}

export async function deleteWorkRecordFromRemote(id) {
  ensureSupabase();
  const { error } = await supabase.from("work_runs").delete().eq("id", id);
  if (error) throw new Error(describeError(error));
}
