import React, { useEffect, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Chrome,
  CloudOff,
  ClipboardCheck,
  Database,
  Edit3,
  FileText,
  History,
  KeyRound,
  Library,
  ListChecks,
  LogOut,
  Mail,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { getAuthSession, isSupabaseConfigured, onAuthSessionChange, sendLoginLink, signInWithGoogle, signOut } from "./supabaseClient";
import {
  deleteStandardFromRemote,
  deleteWorkRecordFromRemote,
  loadRemoteState,
  saveStandardsToRemote,
  saveSystemOptionsToRemote,
  saveWorkRecordsToRemote,
} from "./sopRepository";

const WORK_TYPES = ["점검", "교체", "운전", "기타"];
const DEFAULT_SYSTEMS = ["용수", "에어", "산소/질소", "DIW", "배관", "시설물", "전기", "공조", "기타"];
const LEGACY_SYSTEM_LABELS = {
  냉각수: "용수",
  스팀: "배관",
  압축공기: "에어",
  HVAC: "공조",
  수처리: "DIW",
  계장: "기타",
};
const SHUTDOWN_MODES = ["운전 중 가능", "예비기 전환 후 가능", "부분정지 필요", "전체정지 필요"];
const PERMIT_OPTIONS = ["불필요", "일반작업허가", "화기작업허가", "밀폐공간허가", "전기작업허가", "고소작업허가"];
const LOTO_OPTIONS = ["불필요", "필요", "조건부 필요"];
const JUDGEMENT_OPTIONS = ["즉시조치", "계획정비 반영", "모니터링 유지", "외부전문가 확인"];
const RISK_OPTIONS = ["전기", "압력", "고온", "저온", "회전체", "화학물질", "고소", "중량물", "누출", "소음", "협착"];
const PPE_OPTIONS = ["안전모", "안전화", "보안경", "보안면", "방진마스크", "방독마스크", "귀마개", "안전조끼", "안전벨트", "장갑", "내화학장갑", "절연장갑", "방열장갑", "보온장갑"];
const PPE_BY_RISK = {
  전기: ["안전모", "안전화", "보안경", "절연장갑", "안전조끼"],
  압력: ["안전모", "안전화", "보안경", "보안면", "장갑"],
  고온: ["안전모", "안전화", "보안면", "방열장갑"],
  저온: ["안전모", "안전화", "보안경", "보온장갑"],
  회전체: ["안전모", "안전화", "보안경", "장갑"],
  화학물질: ["안전모", "안전화", "보안경", "보안면", "방독마스크", "내화학장갑"],
  고소: ["안전모", "안전화", "안전벨트", "안전조끼", "장갑"],
  중량물: ["안전모", "안전화", "안전조끼", "장갑"],
  누출: ["안전모", "안전화", "보안경", "보안면", "장갑"],
  소음: ["안전모", "안전화", "귀마개"],
  협착: ["안전모", "안전화", "장갑"],
};
const PROC_TAGS = ["확인", "측정", "안전주의", "조작"];
const LEGACY_TAG_LABELS = {
  CHECK: "확인",
  MEAS: "측정",
  WARN: "안전주의",
  OP: "조작",
};
const DOC_TABS = [
  { key: "standard", label: "표준서", icon: FileText },
  { key: "tbm", label: "TBM", icon: ShieldCheck },
  { key: "checklist", label: "체크리스트", icon: ClipboardCheck },
  { key: "record", label: "결과기록", icon: ListChecks },
];

const STORAGE_KEY = "plant-work-standard-builder:v1";
const AUTH_BYPASS_EMAILS = ["jisun_1@naver.com"];
const AUTH_BYPASS_STORAGE_KEY = `${STORAGE_KEY}:auth-bypass`;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function authBypassEmail(value) {
  const email = normalizeEmail(value);
  return AUTH_BYPASS_EMAILS.includes(email) ? email : "";
}

function authFailureMessage(error) {
  const message = error?.message || "알 수 없는 오류";
  if (message.toLowerCase().includes("rate limit")) {
    return "로그인 링크 전송 실패: Supabase 기본 메일 발송 한도에 걸렸습니다. 잠시 후 다시 시도하거나, 테스트 계정이면 임시 통과로 접속하세요.";
  }
  return `로그인 링크 전송 실패: ${message}`;
}

function stepTagLabel(tag) {
  return LEGACY_TAG_LABELS[tag] || tag || "확인";
}

const riskLibrary = {
  전기: {
    check: "전원 차단 범위, 차단기 라벨, 검전 결과를 확인한다.",
    control: "전원 차단, LOTO, 검전 완료 후 작업한다.",
    stop: "차단 범위가 불명확하거나 전기 이상 냄새/열감이 있으면 작업을 중단한다.",
    ppe: "절연장갑",
  },
  압력: {
    check: "밸브 차단 상태, 잔압, 드레인 가능 여부를 확인한다.",
    control: "격리 후 잔압을 제거하고 압력계 0점을 확인한다.",
    stop: "잔압 제거가 되지 않거나 압력 상승이 지속되면 작업을 중단한다.",
    ppe: "보안경",
  },
  고온: {
    check: "표면온도와 배관 내 잔열을 확인한다.",
    control: "냉각 시간을 확보하고 방열장갑을 착용한다.",
    stop: "접촉 화상 위험 온도이거나 단열재 손상이 확인되면 작업을 중단한다.",
    ppe: "방열장갑",
  },
  저온: {
    check: "결빙, 성에, 저온 유체 잔류 여부를 확인한다.",
    control: "보온 보호구를 착용하고 직접 접촉을 피한다.",
    stop: "저온 화상 위험 또는 결빙으로 조작이 불안정하면 작업을 중단한다.",
    ppe: "보온장갑",
  },
  회전체: {
    check: "회전 정지, 커버 상태, 자동기동 조건을 확인한다.",
    control: "정지 확인 후 접근하고 커버 개방 전 자동기동을 차단한다.",
    stop: "회전 관성이 남아 있거나 예기치 않은 기동 가능성이 있으면 작업을 중단한다.",
    ppe: "밀착형 장갑",
  },
  화학물질: {
    check: "MSDS, 누출 흔적, 세척 가능 여부를 확인한다.",
    control: "내화학 장갑, 보안경을 착용하고 세척/중화 조건을 확보한다.",
    stop: "물질명 미확인, 냄새 확산, 피부 접촉 우려가 있으면 작업을 중단한다.",
    ppe: "내화학 장갑",
  },
  고소: {
    check: "작업발판, 난간, 추락방지구 체결 위치를 확인한다.",
    control: "안전대 체결과 하부 출입통제를 완료한다.",
    stop: "발판 흔들림, 체결점 불량, 하부 통제가 안 되면 작업을 중단한다.",
    ppe: "안전대",
  },
  중량물: {
    check: "중량, 인양점, 체인블록/호이스트 상태를 확인한다.",
    control: "인양 계획을 공유하고 손 끼임 구간을 분리한다.",
    stop: "중량 정보가 없거나 인양 경로에 장애물이 있으면 작업을 중단한다.",
    ppe: "안전화",
  },
  누출: {
    check: "누출 위치, 확산 범위, 배수/회수 가능 여부를 확인한다.",
    control: "격리, 받침 용기, 흡착포를 준비하고 주변 접근을 제한한다.",
    stop: "누출량이 증가하거나 배수로 유입 우려가 있으면 작업을 중단한다.",
    ppe: "보안경",
  },
  소음: {
    check: "소음 발생 위치와 청력 보호구 필요 여부를 확인한다.",
    control: "귀마개를 착용하고 소음원 근접 시간을 제한한다.",
    stop: "소음이 급격히 커지거나 진동을 동반하면 운전을 중지하고 재판단한다.",
    ppe: "귀마개",
  },
  협착: {
    check: "끼임 지점, 자동동작 부위, 접근 제한 필요 여부를 확인한다.",
    control: "가동부 차단, 지그 고정, 2인 확인 후 작업한다.",
    stop: "작동부 고정이 불완전하거나 신호체계가 불명확하면 작업을 중단한다.",
    ppe: "안전장갑",
  },
};

const defaultForm = {
  title: "냉각수 펌프 이상소음 점검 및 조치",
  workType: "점검",
  equipment: "냉각수 순환펌프",
  tag: "CTW-P-101A",
  system: "용수",
  team: "유틸리티P",
  author: "",
  date: new Date().toISOString().slice(0, 10),
  rev: "Rev.01",
  duration: "1~2시간",
  people: "2인 1조",
  shutdownMode: "예비기 전환 후 가능",
  permit: "일반작업허가",
  loto: "조건부 필요",
  judgement: "즉시조치",
  operationState: "운전 중 이상소음 발생, 누설 없음, 진동 증가 의심",
  purpose: "이상소음 원인을 확인하고 운전 안정성을 확보한다.",
  risks: ["전기", "압력", "회전체", "소음"],
  ppe: ["안전모", "안전화", "보안경", "장갑"],
  toolsText: "진동계, 적외선 온도계, 청진봉, 렌치, 휴대용 조명",
  sparesText: "그리스, 커플링 고무, 패킹, 베어링",
  notes: "운전부서와 예비펌프 전환 가능 여부를 먼저 협의한다.",
};

function makeBlankForm() {
  return {
    title: "",
    workType: "점검",
    equipment: "",
    tag: "",
    system: "용수",
    team: "유틸리티P",
    author: "",
    date: new Date().toISOString().slice(0, 10),
    rev: "Rev.01",
    duration: "",
    people: "2인 1조",
    shutdownMode: "운전 중 가능",
    permit: "불필요",
    loto: "불필요",
    judgement: "모니터링 유지",
    operationState: "",
    purpose: "",
    risks: [],
    ppe: ["안전모", "안전화"],
    toolsText: "",
    sparesText: "",
    notes: "",
  };
}

function makeUuid() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeBlankWorkRecord() {
  return {
    id: "",
    workDate: new Date().toISOString().slice(0, 10),
    title: "",
    workType: "점검",
    equipment: "",
    tag: "",
    system: "용수",
    team: "유틸리티P",
    author: "",
    shutdownMode: "운전 중 가능",
    symptom: "",
    cause: "",
    action: "",
    result: "",
    risks: [],
    notes: "",
    standardId: "",
    standardRev: "",
    status: "recorded",
    savedAt: "",
  };
}

const EXAMPLE_FORM_OVERRIDES = [
  {
    title: "냉각수 펌프 이상소음 점검 및 조치",
    workType: "점검",
    equipment: "냉각수 순환펌프",
    tag: "CTW-P-101A",
    system: "용수",
    duration: "1~2시간",
    shutdownMode: "예비기 전환 후 가능",
    permit: "일반작업허가",
    loto: "조건부 필요",
    operationState: "운전 중 이상소음 발생, 누설 없음, 진동 증가 의심",
    risks: ["전기", "압력", "회전체", "소음"],
    toolsText: "진동계, 적외선 온도계, 청진봉, 렌치",
    sparesText: "그리스, 커플링 고무, 패킹, 베어링",
  },
  {
    title: "스팀 트랩 배출불량 점검 및 교체",
    workType: "교체",
    equipment: "스팀 트랩",
    tag: "STM-TR-204",
    system: "배관",
    duration: "1시간",
    shutdownMode: "부분정지 필요",
    permit: "일반작업허가",
    loto: "필요",
    operationState: "응축수 배출 불량 및 배관 워터해머 가능성 확인",
    purpose: "스팀 트랩 작동상태를 확인하고 응축수 배출 기능을 복구한다.",
    risks: ["압력", "고온", "누출"],
    toolsText: "스패너, 비접촉 온도계, 청진봉, 보온재 절개공구",
    sparesText: "동일 규격 스팀 트랩, 가스켓, 테프론 테이프",
    notes: "격리 후 잔압과 표면온도 확인을 완료한 뒤 분해한다.",
  },
  {
    title: "압축공기 라인 압력저하 원인 점검",
    workType: "점검",
    equipment: "압축공기 메인 헤더",
    tag: "AIR-H-301",
    system: "에어",
    duration: "2시간",
    shutdownMode: "운전 중 가능",
    permit: "불필요",
    loto: "불필요",
    operationState: "사용처 압력 저하 신고, 컴프레서 알람 없음",
    purpose: "압축공기 계통의 압력저하 원인을 확인하고 누기 또는 사용량 증가 여부를 판단한다.",
    risks: ["압력", "소음", "누출"],
    toolsText: "휴대용 압력계, 누기 탐지기, 비눗물, 청진봉",
    sparesText: "피팅, 튜브, 밸브 패킹",
    notes: "생산 사용처 밸브 조작은 운전부서 승인 후 진행한다.",
  },
  {
    title: "냉동기 냉수 출구온도 상승 점검",
    workType: "점검",
    equipment: "터보 냉동기",
    tag: "CH-101",
    system: "공조",
    duration: "2~3시간",
    shutdownMode: "운전 중 가능",
    permit: "일반작업허가",
    loto: "불필요",
    operationState: "냉수 출구온도 상승, 냉각수 유량 저하 가능성 있음",
    purpose: "냉동기 운전값을 비교하여 온도 상승 원인을 구분한다.",
    risks: ["전기", "압력", "회전체"],
    toolsText: "온도계, 압력계, 클램프미터, 운전로그",
    sparesText: "스트레이너 가스켓, 센서 예비품",
    notes: "냉동기 보호인터록 해제 또는 강제운전은 금지한다.",
  },
  {
    title: "수처리 약품펌프 토출불량 점검",
    workType: "점검",
    equipment: "약품 주입펌프",
    tag: "WTP-DP-052",
    system: "DIW",
    duration: "1시간",
    shutdownMode: "부분정지 필요",
    permit: "일반작업허가",
    loto: "필요",
    operationState: "토출 유량 저하, 흡입측 에어 혼입 가능성 있음",
    purpose: "약품 주입펌프 흡입/토출 상태를 확인하고 정상 주입을 복구한다.",
    risks: ["전기", "화학물질", "누출", "압력"],
    toolsText: "보안경, 내화학 장갑, 렌치, 메스실린더",
    sparesText: "다이어프램, 체크밸브, 튜브, 오링",
    notes: "MSDS 확인 후 세척수와 누출 회수 용기를 준비한다.",
  },
  {
    title: "MCC 차단기 트립 원인 점검",
    workType: "점검",
    equipment: "MCC 차단기",
    tag: "MCC-2B-F12",
    system: "전기",
    duration: "1~2시간",
    shutdownMode: "부분정지 필요",
    permit: "전기작업허가",
    loto: "필요",
    operationState: "펌프 기동 중 차단기 트립, 부하측 절연저하 의심",
    purpose: "차단기 트립 원인을 확인하고 재투입 가능 여부를 판단한다.",
    risks: ["전기", "화재", "협착"].filter((risk) => RISK_OPTIONS.includes(risk)),
    toolsText: "절연저항계, 클램프미터, 멀티미터, 절연공구",
    sparesText: "퓨즈, 보조접점, 차단기 예비품",
    notes: "원인 확인 전 반복 투입을 금지한다.",
  },
  {
    title: "배관 플랜지 미세누설 응급조치",
    workType: "기타",
    equipment: "냉각수 공급배관",
    tag: "CTW-L-18F",
    system: "배관",
    duration: "1시간",
    shutdownMode: "운전 중 가능",
    permit: "일반작업허가",
    loto: "조건부 필요",
    operationState: "플랜지부 미세누설, 바닥 고임은 없음",
    purpose: "누설 확대를 방지하고 계획정비 전까지 안전한 임시조치 가능 여부를 판단한다.",
    risks: ["압력", "누출", "협착"],
    toolsText: "토크렌치, 스패너, 흡착포, 누설 마킹펜",
    sparesText: "가스켓, 볼트/너트, 클램프",
    notes: "운전 중 무리한 증체결은 금지하고 누설량 증가 시 즉시 중단한다.",
  },
  {
    title: "공조기 팬 벨트 장력 점검 및 조정",
    workType: "점검",
    equipment: "공조기 급기팬",
    tag: "AHU-03-SF",
    system: "공조",
    duration: "1시간",
    shutdownMode: "부분정지 필요",
    permit: "일반작업허가",
    loto: "필요",
    operationState: "팬 운전 중 슬립음 발생, 풍량 저하 신고",
    purpose: "팬 벨트 장력과 마모상태를 확인하고 슬립을 해소한다.",
    risks: ["전기", "회전체", "협착"],
    toolsText: "장력계, 렌치, 직각자, 휴대용 조명",
    sparesText: "V벨트, 풀리 고정볼트",
    notes: "팬 완전 정지와 자동기동 차단 확인 후 커버를 개방한다.",
  },
  {
    title: "계장 압력센서 지시값 불일치 점검",
    workType: "점검",
    equipment: "압력 트랜스미터",
    tag: "PT-4407",
    system: "기타",
    duration: "1~2시간",
    shutdownMode: "운전 중 가능",
    permit: "일반작업허가",
    loto: "불필요",
    operationState: "현장 압력계와 DCS 지시값 차이 발생",
    purpose: "계장 지시값 불일치 원인을 확인하고 보정 또는 교체 필요 여부를 판단한다.",
    risks: ["압력", "전기", "누출"],
    toolsText: "휴대용 압력계, HART 통신기, 멀티미터",
    sparesText: "압력센서, 임펄스 배관 피팅, 오링",
    notes: "계장 밸브 조작 전 공정 영향과 인터록 연동 여부를 확인한다.",
  },
  {
    title: "고소 위치 배기팬 진동 점검",
    workType: "점검",
    equipment: "옥상 배기팬",
    tag: "EF-R-07",
    system: "공조",
    duration: "2시간",
    shutdownMode: "부분정지 필요",
    permit: "고소작업허가",
    loto: "필요",
    operationState: "옥상 배기팬 운전 중 진동 증가 및 베이스 볼트 이완 의심",
    purpose: "배기팬 진동 원인과 구조물 체결상태를 확인한다.",
    risks: ["전기", "회전체", "고소", "소음"],
    toolsText: "진동계, 토크렌치, 안전대, 무전기",
    sparesText: "앵커볼트, 방진고무, 베어링",
    notes: "강풍 또는 우천 시 작업을 연기하고 하부 출입통제를 먼저 시행한다.",
  },
];

const emptyDraft = {
  preChecks: [],
  safetyRisks: [],
  tools: [],
  steps: [],
  inspectionCriteria: [],
  stopCriteria: [],
  abnormalActions: [],
  completionCriteria: [],
  resultRecords: [],
};

function splitText(value) {
  return value
    .split(/,|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeDefaultInspection(form) {
  const base = [
    {
      item: "운전 전류",
      type: "전류",
      criteria: "정격전류 이하이며 평상시 대비 급격한 상승이 없을 것",
      method: "MCC 또는 현장 계측값 확인",
    },
    {
      item: "베어링 온도",
      type: "온도",
      criteria: "평상시 대비 10도 이상 상승 시 주의, 20도 이상 상승 시 NG",
      method: "비접촉 온도계로 구동측/반구동측 비교",
    },
    {
      item: "진동/소음",
      type: "진동",
      criteria: "평상시보다 뚜렷한 증가, 금속 마찰음, 주기적 충격음 발생 시 NG",
      method: "진동계 측정 및 청감 확인",
    },
    {
      item: "누설",
      type: "누수",
      criteria: "패킹부 연속 누수, 플랜지부 방울 맺힘 또는 바닥 고임이 없을 것",
      method: "육안 확인 후 필요 시 마킹하여 변화 확인",
    },
  ];

  if (form.system === "배관") {
    return [
      { item: "트랩/밸브 누설", type: "압력", criteria: "증기 누출음, 백연, 응축수 과다 배출이 없을 것", method: "육안 및 청음 확인" },
      { item: "배관 지지상태", type: "외관", criteria: "행거 이탈, 열팽창 간섭, 보온재 손상이 없을 것", method: "운전상태에서 접근 가능 범위 확인" },
      { item: "표면온도", type: "온도", criteria: "접근부 화상 위험 표시 및 차폐 상태가 확보될 것", method: "비접촉 온도계 측정" },
      ...base.slice(2, 3),
    ];
  }

  if (form.system === "에어") {
    return [
      { item: "토출압력", type: "압력", criteria: "관리압력 범위 이탈 또는 급격한 압력강하가 없을 것", method: "현장 압력계와 DCS 값 비교" },
      { item: "드레인 상태", type: "외관", criteria: "드레인 막힘, 오일/수분 과다 배출이 없을 것", method: "드레인 트랩 작동 확인" },
      { item: "누기", type: "소음", criteria: "연속 누기음 또는 피팅부 누출이 없을 것", method: "청음 및 비눗물 확인" },
      ...base.slice(0, 2),
    ];
  }

  return base;
}

function getProcedureFocus(form) {
  const focusBySystem = {
    용수: {
      baseline: "흡입/토출압력, 운전전류, 베어링 온도, 진동, 누수 상태를 작업 전 기준값으로 남긴다.",
      cause: "흡입측 밸브 개도, 스트레이너 막힘, 에어 혼입, 커플링/베어링 이상, 기초볼트 이완을 순서대로 확인한다.",
      recovery: "예비기 전환 상태, 밸브 원위치, 누수 여부, 펌프 운전값 안정화를 운전부서와 함께 확인한다.",
    },
    에어: {
      baseline: "헤더 압력, 컴프레서 로딩률, 드레인 상태, 주요 사용처 밸브 상태를 기준값으로 남긴다.",
      cause: "누기음, 피팅/밸브 누설, 드레인 트랩 막힘, 사용처 급증, 필터 차압 상승을 순서대로 확인한다.",
      recovery: "압력 회복 추이와 누기 재발 여부를 확인하고 사용처 조작 사항을 운전부서에 인계한다.",
    },
    "산소/질소": {
      baseline: "공급압력, 퍼지 상태, 산소농도 또는 질소 치환 영향, 밸브 라인업을 기준값으로 남긴다.",
      cause: "압력조정기, 체크밸브, 퍼지 라인, 사용처 밸브 개도, 누설 가능 지점을 순서대로 확인한다.",
      recovery: "가스 방출 위험이 없는지 확인하고 공급압력 안정화 후 주변 출입통제를 해제한다.",
    },
    DIW: {
      baseline: "토출유량, 압력, 수질 영향 가능성, 약품/필터 상태, 누수 상태를 기준값으로 남긴다.",
      cause: "흡입측 에어 혼입, 체크밸브 막힘, 다이어프램 손상, 필터 차압, 약품 잔량을 순서대로 확인한다.",
      recovery: "수질 영향 여부와 약품 주입량 회복을 확인하고 필요 시 재샘플링 계획을 남긴다.",
    },
    배관: {
      baseline: "밸브 개도, 라인 압력, 온도, 지지대 상태, 누설 위치와 누설량을 기준값으로 남긴다.",
      cause: "플랜지 체결, 가스켓 손상, 열팽창 간섭, 행거 이탈, 밸브 패킹 상태를 순서대로 확인한다.",
      recovery: "누설 확대 여부와 배관 지지상태를 재확인하고 임시조치 한계를 명확히 인계한다.",
    },
    시설물: {
      baseline: "주변 접근성, 구조물 손상, 배수/누수 흔적, 작업공간 장애물을 기준 상태로 남긴다.",
      cause: "고정상태, 균열, 배수 불량, 부식, 외력 흔적을 순서대로 확인한다.",
      recovery: "임시 통제, 보강 필요 여부, 후속 보수 일정을 기록한다.",
    },
    전기: {
      baseline: "전압, 전류, 절연상태, 차단기/계전기 표시, 이상 냄새나 열감을 기준값으로 남긴다.",
      cause: "부하측 절연저하, 단자 이완, 과부하, 보조접점 이상, 반복 트립 이력을 순서대로 확인한다.",
      recovery: "무부하/부하 투입 조건과 재투입 가능 여부를 전기 담당자와 확인한다.",
    },
    공조: {
      baseline: "팬 전류, 벨트 장력, 풍량, 온습도, 진동/소음을 기준값으로 남긴다.",
      cause: "필터 차압, 벨트 마모/장력, 댐퍼 개도, 베어링, 응축수 배수 상태를 순서대로 확인한다.",
      recovery: "풍량과 온습도 회복, 커버 복구, 자동기동 조건을 확인한다.",
    },
    기타: {
      baseline: "현장 운전값, 알람, 외관, 작업 전 사진을 기준 상태로 남긴다.",
      cause: "최근 변경사항, 체결상태, 오염/막힘, 센서 이상, 운전조건 변화를 순서대로 확인한다.",
      recovery: "작업 전후 차이를 비교하고 잔여 리스크와 후속 확인 항목을 남긴다.",
    },
  };
  return focusBySystem[form.system] || focusBySystem.기타;
}

function getWorkTypeAction(form, spares) {
  if (form.workType === "교체") {
    return {
      action: "교체 대상 부품의 규격, 방향, 체결면 상태를 확인한 뒤 기존품을 분리하고 신품을 조립한다.",
      note: spares.length ? `적용 예비품: ${spares.join(", ")}. 가스켓/오링/체결부 손상 여부를 조립 전 재확인` : "기존품 상태를 사진으로 남기고 신품 규격과 방향성을 대조",
    };
  }
  if (form.workType === "운전") {
    return {
      action: "운전 조건을 단계적으로 변경하면서 설비 반응값을 확인한다.",
      note: "밸브 개도, 기동/정지, 부하 변경은 운전부서 지시와 현장 신호체계를 맞춘 뒤 수행",
    };
  }
  if (form.workType === "기타") {
    return {
      action: "승인된 작업 범위 안에서 응급조치 또는 임시조치를 수행한다.",
      note: "임시조치 한계, 재발 가능성, 계획정비 전환 필요 여부를 작업 중 판단",
    };
  }
  return {
    action: "원인 후보별로 점검 순서를 정하고 측정값과 육안 상태를 대조한다.",
    note: "정상 기준, 평상시 값, 동일 계통 설비와 비교하여 원인을 좁혀감",
  };
}

function makeDetailedProcedureSteps(form, spares, selectedPpe) {
  const focus = getProcedureFocus(form);
  const workAction = getWorkTypeAction(form, spares);
  const target = [form.equipment, form.tag].filter(Boolean).join(" / ") || "작업 대상 설비";

  return [
    { tag: "확인", action: "작업 요청 내용, 최근 알람, 이전 작업 이력, 운전 로그를 확인한다.", note: form.operationState || "증상 발생 시점, 반복 여부, 운전 조건 변화 여부 확인" },
    { tag: "확인", action: `${target}와 현장 설비 TAG를 대조하고 작업 경계를 표시한다.`, note: "동일 계통 예비기, 병렬 라인, 인접 설비와 혼동되지 않도록 작업 범위 지정" },
    { tag: "안전주의", action: "TBM을 실시하고 작업자 역할, 연락수단, 중단 기준을 공유한다.", note: `필수 보호구: ${selectedPpe.join(", ") || "현장 위험성 평가 기준 적용"}` },
    { tag: "안전주의", action: "운전부서와 정지, 전환, 복구 조건을 합의하고 작업허가 조건을 확인한다.", note: `${form.shutdownMode} / ${form.permit} / LOTO ${form.loto}` },
    { tag: "안전주의", action: "전기, 압력, 자동기동, 잔류에너지 차단 상태를 확인한다.", note: "격리 지점, 잠금/표지, 잔압 제거, 검전 또는 무압 상태를 2인 확인" },
    { tag: "측정", action: "작업 전 기준값을 측정하고 사진 또는 수치로 기록한다.", note: focus.baseline },
    { tag: "확인", action: "외관, 체결, 누설, 오염, 이물질, 커버 상태를 무분해 범위에서 먼저 확인한다.", note: "분해 전 확인 가능한 원인을 먼저 제거하여 불필요한 정지를 줄임" },
    { tag: "측정", action: "계통 특성에 맞는 원인 후보를 순서대로 점검한다.", note: focus.cause },
    { tag: "조작", action: workAction.action, note: workAction.note },
    { tag: "확인", action: "조립 전 체결면, 방향성, 이물질, 공구 회수, 보호커버 복구 상태를 확인한다.", note: "분해 부위는 체결 순서와 토크 편차를 확인하고 미체결 지점이 없도록 표시" },
    { tag: "조작", action: "시운전 또는 운전 복귀를 단계적으로 수행한다.", note: "급격한 부하 투입을 피하고 초기 5~10분 동안 이상음, 진동, 누설, 온도 상승을 관찰" },
    { tag: "측정", action: "작업 후 운전값을 재측정하고 작업 전 기준값과 비교한다.", note: "전류, 압력, 온도, 진동, 유량 등 핵심값이 정상 범위 또는 개선 방향인지 확인" },
    { tag: "확인", action: "운전부서에 결과를 인계하고 후속 관찰 기준을 등록한다.", note: focus.recovery },
    { tag: "확인", action: "원인, 조치내용, 교체품, 측정값, 잔여 리스크, 다음 점검일을 결과지에 기록한다.", note: "유사작업 분석과 SOP 개정 재료로 활용할 수 있게 구체적으로 남김" },
  ];
}

function generateDraft(form) {
  const risks = Array.isArray(form.risks) ? form.risks : [];
  const selectedPpe = normalizePpeSelection(form.ppe).length ? normalizePpeSelection(form.ppe) : getRecommendedPpeForRisks(risks, form.permit);
  const riskItems = risks.map((risk) => ({
    risk,
    check: riskLibrary[risk]?.check || `${risk} 관련 위험요인을 확인한다.`,
    control: riskLibrary[risk]?.control || `${risk} 위험 저감 조치를 완료한다.`,
    ppe: (PPE_BY_RISK[risk] || selectedPpe).join(", "),
  }));

  const tools = [...splitText(form.toolsText), ...selectedPpe].filter(Boolean);
  const spares = splitText(form.sparesText);

  return {
    preChecks: [
      { item: "작업 필요성", criteria: `${form.judgement} 대상으로 판단하고, 운전 안정성 영향 여부를 확인한다.` },
      { item: "운전 영향", criteria: `${form.shutdownMode}. 운전부서와 전환/정지 시점 및 복구 기준을 합의한다.` },
      { item: "작업허가", criteria: `${form.permit} 적용 여부를 확인하고 허가서 조건을 작업 전에 공유한다.` },
      { item: "LOTO", criteria: `${form.loto}. 전기/압력/자동기동 등 잔류에너지 차단 범위를 명확히 한다.` },
      { item: "필수 보호구", criteria: selectedPpe.length ? `${selectedPpe.join(", ")} 착용 상태를 TBM에서 확인한다.` : "현장 위험성 평가에 따라 필수 보호구를 지정한다." },
      { item: "예비품", criteria: spares.length ? `${spares.join(", ")} 보유 여부와 규격 일치 여부를 확인한다.` : "필요 예비품과 대체 가능 여부를 확인한다." },
      { item: "중단 권한", criteria: "현장 조건이 표준서와 다르거나 위험이 증가하면 작업자가 즉시 중단할 수 있다." },
    ],
    safetyRisks: riskItems,
    tools,
    steps: makeDetailedProcedureSteps(form, spares, selectedPpe),
    inspectionCriteria: makeDefaultInspection(form),
    stopCriteria: [
      ...risks.map((risk) => riskLibrary[risk]?.stop).filter(Boolean),
      "작업 대상 설비 TAG 또는 차단 범위가 불명확한 경우",
      "누설, 이상진동, 이상음, 온도 또는 전류가 작업 전보다 악화되는 경우",
      "예비품 규격이 불일치하거나 임시조치 승인 기준이 없는 경우",
      "작업자 간 역할/신호가 불명확하거나 2인 작업 조건을 만족하지 못하는 경우",
    ],
    abnormalActions: [
      "즉시 작업을 중지하고 설비를 안전상태로 유지한다.",
      "운전부서, 팀장, 관련 전문 담당자에게 현장 상태와 측정값을 공유한다.",
      "누설 또는 에너지 방출 위험이 있으면 접근통제선을 설정하고 격리 상태를 재확인한다.",
      "원인 불명 상태에서 임의 조정, 강제 운전, 대체품 조립을 하지 않는다.",
      "재작업이 필요한 경우 변경된 작업 범위로 작업허가와 위험성 평가를 갱신한다.",
    ],
    completionCriteria: [
      "설비가 합의된 운전 조건에서 정상 운전될 것",
      "누설, 과열, 이상진동, 이상음, 경보가 없을 것",
      "전류, 압력, 온도 등 주요 운전값이 관리 기준 또는 평상시 범위에 있을 것",
      "보호커버, 밸브 위치, 전원 상태, LOTO 해제 절차가 정상 복구될 것",
      "공구와 잔여 자재를 회수하고 현장을 정리할 것",
      "원인, 조치내용, 교체품, 측정값, 잔여 리스크, 후속조치를 기록할 것",
    ],
    resultRecords: [
      { field: "발견 현상", value: form.operationState || "" },
      { field: "추정 원인", value: "베어링 마모, 윤활 부족, 축정렬 불량, 체결부 이완 등 가능성 검토" },
      { field: "조치 내용", value: "측정, 체결 확인, 윤활, 부품 상태 확인 및 필요 시 교체" },
      { field: "교체 부품", value: spares.join(", ") },
      { field: "주요 측정값", value: "전류: / 온도: / 진동: / 압력: / 누설: " },
      { field: "잔여 리스크", value: "재발 가능성 및 추가 관찰 필요 여부 기재" },
      { field: "후속조치", value: "1주일 이내 재점검 또는 계획정비 반영 여부 결정" },
    ],
  };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDraft(draft) {
  return {
    preChecks: draft.preChecks?.map((row) => ({ id: row.id || makeId(), ...row })) || [],
    safetyRisks: draft.safetyRisks?.map((row) => ({ id: row.id || makeId(), ...row })) || [],
    tools: draft.tools?.map((name) => (typeof name === "string" ? { id: makeId(), name } : { id: name.id || makeId(), ...name })) || [],
    steps: draft.steps?.map((row) => ({ id: row.id || makeId(), ...row, tag: stepTagLabel(row.tag) })) || [],
    inspectionCriteria: draft.inspectionCriteria?.map((row) => ({ id: row.id || makeId(), ...row })) || [],
    stopCriteria: draft.stopCriteria?.map((text) => (typeof text === "string" ? { id: makeId(), text } : { id: text.id || makeId(), ...text })) || [],
    abnormalActions: draft.abnormalActions?.map((text) => (typeof text === "string" ? { id: makeId(), text } : { id: text.id || makeId(), ...text })) || [],
    completionCriteria: draft.completionCriteria?.map((text) => (typeof text === "string" ? { id: makeId(), text } : { id: text.id || makeId(), ...text })) || [],
    resultRecords: draft.resultRecords?.map((row) => ({ id: row.id || makeId(), ...row })) || [],
  };
}

function moveRow(list, id, direction) {
  const index = list.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return list;
  const next = [...list];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function normalizeSystemOptions(options) {
  const source = Array.isArray(options) && options.length ? options : DEFAULT_SYSTEMS;
  const normalized = [...new Set(source.map((item) => LEGACY_SYSTEM_LABELS[String(item || "").trim()] || String(item || "").trim()).filter(Boolean))];
  return normalized.length ? normalized : ["기타"];
}

function normalizeWorkType(value, title = "") {
  if (WORK_TYPES.includes(value)) return value;
  if (title.includes("교체")) return "교체";
  if (title.includes("운전")) return "운전";
  if (title.includes("점검") || title.includes("원인")) return "점검";
  return "기타";
}

function normalizeSystemValue(value) {
  return LEGACY_SYSTEM_LABELS[value] || value || "기타";
}

function normalizePpeSelection(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => PPE_OPTIONS.includes(item)))];
}

function getRecommendedPpeForRisks(risks = [], permit = "") {
  const selected = new Set(["안전모", "안전화"]);
  risks.forEach((risk) => {
    (PPE_BY_RISK[risk] || []).forEach((item) => selected.add(item));
  });
  if (permit === "고소작업허가") {
    ["안전벨트", "안전조끼", "장갑"].forEach((item) => selected.add(item));
  }
  return PPE_OPTIONS.filter((item) => selected.has(item));
}

function normalizeFormValues(form) {
  const next = { ...form };
  next.workType = normalizeWorkType(next.workType, next.title);
  next.system = normalizeSystemValue(next.system);
  next.risks = Array.isArray(next.risks) ? next.risks.filter((risk) => RISK_OPTIONS.includes(risk)) : [];
  next.ppe = Array.isArray(next.ppe) ? normalizePpeSelection(next.ppe) : getRecommendedPpeForRisks(next.risks, next.permit);
  return next;
}

function normalizeWorkRecord(record) {
  const base = { ...makeBlankWorkRecord(), ...record };
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return {
    ...base,
    id: uuidPattern.test(base.id) ? base.id : makeUuid(),
    workType: normalizeWorkType(base.workType, base.title),
    system: normalizeSystemValue(base.system),
    risks: Array.isArray(base.risks) ? base.risks.filter((risk) => RISK_OPTIONS.includes(risk)) : [],
    savedAt: base.savedAt || new Date().toISOString(),
  };
}

function keywordTokens(value) {
  return String(value || "")
    .split(/[\s,./·|()[\]{}:;!?~+-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !["점검", "조치", "확인", "작업", "발생", "관련", "원인", "결과"].includes(item));
}

function mostFrequent(values, fallback = "") {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
}

function uniqueTextRows(values, limit = 6) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].slice(0, limit);
}

function buildWorkRecordGroups(records, standards) {
  const groups = new Map();

  records.map(normalizeWorkRecord).forEach((record) => {
    const titleKeyword = keywordTokens(`${record.title} ${record.symptom}`)[0] || "작업";
    const equipmentKey = (record.tag || record.equipment || titleKeyword || "설비 미입력").toLowerCase();
    const key = `${record.system}|${equipmentKey}`;
    const existing = groups.get(key) || {
      id: key,
      system: record.system,
      equipment: record.equipment,
      tag: record.tag,
      keyword: titleKeyword,
      records: [],
    };
    existing.records.push(record);
    groups.set(key, existing);
  });

  return [...groups.values()]
    .map((group) => {
      const label = group.equipment || group.tag || `${group.system} ${group.keyword}`;
      const tokens = new Set(group.records.flatMap((record) => keywordTokens(`${record.title} ${record.symptom} ${record.action}`)));
      const matchedStandards = standards.filter((standard) => {
        const sameSystem = normalizeSystemValue(standard.system || standard.form?.system) === group.system;
        const standardText = `${standard.title} ${standard.equipment} ${standard.tag}`.toLowerCase();
        const sameTarget = [group.equipment, group.tag].filter(Boolean).some((value) => standardText.includes(String(value).toLowerCase()));
        const keywordHit = [...tokens].some((token) => standardText.includes(token.toLowerCase()));
        return sameSystem && (sameTarget || keywordHit);
      });
      return {
        ...group,
        label,
        tokens: [...tokens].slice(0, 8),
        matchedStandards,
        latestDate: group.records.map((record) => record.workDate).sort().at(-1) || "",
        recommendation: group.records.length >= 3 ? "정식 SOP 후보" : group.records.length === 2 ? "묶음 검토" : "기록 누적 필요",
      };
    })
    .sort((a, b) => b.records.length - a.records.length || String(b.latestDate).localeCompare(String(a.latestDate)));
}

function buildStandardFromWorkGroup(group) {
  const records = group.records.map(normalizeWorkRecord);
  const first = records[0] || makeBlankWorkRecord();
  const risks = [...new Set(records.flatMap((record) => record.risks))];
  const symptoms = uniqueTextRows(records.map((record) => record.symptom), 4);
  const causes = uniqueTextRows(records.map((record) => record.cause), 4);
  const actions = uniqueTextRows(records.flatMap((record) => String(record.action || "").split(/\n+/)), 7);
  const results = uniqueTextRows(records.map((record) => record.result), 4);
  const titleKeyword = group.keyword && group.keyword !== "작업" ? group.keyword : "반복작업";
  const form = normalizeFormValues({
    ...makeBlankForm(),
    title: `${group.label} ${titleKeyword} 표준`,
    workType: mostFrequent(records.map((record) => record.workType), "점검"),
    equipment: mostFrequent(records.map((record) => record.equipment), first.equipment),
    tag: mostFrequent(records.map((record) => record.tag), first.tag),
    system: group.system || first.system,
    team: mostFrequent(records.map((record) => record.team), "유틸리티P"),
    author: mostFrequent(records.map((record) => record.author), ""),
    shutdownMode: mostFrequent(records.map((record) => record.shutdownMode), "운전 중 가능"),
    operationState: symptoms.join("\n"),
    purpose: `${group.label} 관련 반복 작업을 동일한 판단 기준과 절차로 수행하기 위해 표준화한다.`,
    risks,
    ppe: getRecommendedPpeForRisks(risks, first.permit),
    notes: `작업기록 ${records.length}건 기반 SOP 후보입니다.\n주요 원인: ${causes.join(" / ") || "추가 확인 필요"}\n주요 결과: ${results.join(" / ") || "추가 확인 필요"}`,
  });
  const generated = normalizeDraft(generateDraft(form));

  return {
    form,
    draft: {
      ...generated,
      preChecks: [
        { id: makeId(), item: "최근 유사 작업 확인", criteria: `작업기록 ${records.length}건의 공통 증상과 조치 이력을 확인한다.` },
        ...generated.preChecks,
      ],
      steps: actions.length
        ? [
            ...generated.steps.slice(0, 8),
            ...actions.map((action) => ({ id: makeId(), tag: "조작", action, note: "작업기록 기반 후보 절차" })),
            ...generated.steps.slice(-4),
          ]
        : generated.steps,
      abnormalActions: [
        ...generated.abnormalActions,
        ...causes.map((cause) => ({ id: makeId(), text: `유사 원인 재발 시 확인: ${cause}` })),
      ],
      resultRecords: [
        ...generated.resultRecords,
        { id: makeId(), field: "참조 작업기록", value: records.map((record) => `${record.workDate} ${record.title || record.equipment}`).join("\n") },
      ],
    },
  };
}

function makeRevision(form, draft, savedAt, summary) {
  const normalizedForm = normalizeFormValues(form);
  return {
    id: `${normalizedForm.rev || "Rev.01"}-${savedAt}`,
    rev: normalizedForm.rev || "Rev.01",
    savedAt,
    author: normalizedForm.author || "",
    summary,
    form: normalizedForm,
    draft: normalizeDraft(draft),
  };
}

function normalizeRevision(revision) {
  const form = normalizeFormValues({ ...defaultForm, ...revision.form, rev: revision.rev || revision.form?.rev || "Rev.01" });
  return {
    ...revision,
    id: revision.id || `${revision.rev || "Rev.01"}-${revision.savedAt || makeId()}`,
    rev: form.rev || revision.rev || "Rev.01",
    savedAt: revision.savedAt || new Date().toISOString(),
    author: revision.author || form.author || "",
    summary: revision.summary || "이력 등록",
    form,
    draft: normalizeDraft(revision.draft || emptyDraft),
  };
}

function getRevisionHistory(standard) {
  if (standard?.revisions?.length) return standard.revisions.map(normalizeRevision);
  if (!standard) return [];
  const form = { ...defaultForm, ...standard.form, rev: standard.rev || standard.form?.rev || "Rev.01" };
  return [makeRevision(form, normalizeDraft(standard.draft || emptyDraft), standard.savedAt || new Date().toISOString(), "기존 표준서 이력 생성")];
}

function summarizeChange(previous, nextForm, nextDraft) {
  if (!previous) return "최초 등록";
  const changes = [];
  if (previous.form?.title !== nextForm.title) changes.push("작업명 변경");
  if (previous.form?.equipment !== nextForm.equipment || previous.form?.tag !== nextForm.tag) changes.push("대상 설비/TAG 변경");
  if (previous.form?.system !== nextForm.system) changes.push("관련 계통 변경");
  if (previous.form?.shutdownMode !== nextForm.shutdownMode || previous.form?.permit !== nextForm.permit || previous.form?.loto !== nextForm.loto) changes.push("작업 조건 변경");
  if (JSON.stringify(previous.form?.risks || []) !== JSON.stringify(nextForm.risks || [])) changes.push("위험요인 변경");
  const previousDraft = normalizeDraft(previous.draft || emptyDraft);
  const draftChecks = [
    ["preChecks", "작업 전 판단 기준 변경"],
    ["steps", "작업 절차 변경"],
    ["inspectionCriteria", "점검/판정 기준 변경"],
    ["stopCriteria", "작업 중단 기준 변경"],
    ["completionCriteria", "완료 기준 변경"],
    ["abnormalActions", "비정상 대응 변경"],
    ["resultRecords", "결과 기록 항목 변경"],
  ];
  draftChecks.forEach(([key, label]) => {
    if (JSON.stringify(stripIds(previousDraft[key])) !== JSON.stringify(stripIds(normalizeDraft(nextDraft)[key]))) changes.push(label);
  });
  return changes.length ? changes.join(", ") : "표준서 내용 변경";
}

function makeStandardRecord(form, draft, id, options = {}) {
  const now = options.savedAt || new Date().toISOString();
  const previous = options.previous;
  const normalizedForm = normalizeFormValues(form);
  const normalizedDraft = normalizeDraft(draft);
  const revision = makeRevision(normalizedForm, normalizedDraft, now, options.summary || summarizeChange(previous, normalizedForm, normalizedDraft));
  const previousRevisions = previous ? getRevisionHistory(previous) : [];
  const revisions = [...previousRevisions.filter((item) => item.rev !== revision.rev), revision];
  return {
    id: id || makeId(),
    title: normalizedForm.title || "작업명 미입력",
    tag: normalizedForm.tag || "",
    equipment: normalizedForm.equipment || "",
    system: normalizedForm.system || "",
    rev: normalizedForm.rev || "Rev.01",
    savedAt: now,
    form: normalizedForm,
    draft: normalizedDraft,
    revisions,
  };
}

function buildExampleStandards() {
  return EXAMPLE_FORM_OVERRIDES.map((override, index) => {
    const savedAt = `2026-05-${String(Math.min(index + 1, 10)).padStart(2, "0")}T09:00:00.000Z`;
    const form = {
      ...defaultForm,
      ...override,
      date: "2026-05-10",
      rev: override.rev || "Rev.01",
    };
    form.ppe = Array.isArray(override.ppe) ? override.ppe : getRecommendedPpeForRisks(form.risks, form.permit);
    return makeStandardRecord(form, normalizeDraft(generateDraft(form)), `example-${String(index + 1).padStart(2, "0")}`, {
      savedAt,
      summary: "예시 표준서 최초 등록",
    });
  });
}

function mergeExampleStandards(savedStandards) {
  const existingIds = new Set(savedStandards.map((standard) => standard.id));
  const examples = buildExampleStandards().filter((standard) => !existingIds.has(standard.id));
  return [...savedStandards, ...examples];
}

function syncExistingExampleStandards(savedStandards) {
  return savedStandards.map((standard) => {
    const form = normalizeFormValues({ ...defaultForm, ...standard.form, rev: standard.rev || standard.form?.rev || "Rev.01" });
    if (!Array.isArray(standard.form?.ppe)) form.ppe = getRecommendedPpeForRisks(form.risks, form.permit);
    const draft = normalizeDraft(standard.draft || emptyDraft);
    return {
      ...standard,
      title: standard.title || form.title || "작업명 미입력",
      tag: form.tag || standard.tag || "",
      equipment: form.equipment || standard.equipment || "",
      system: form.system || standard.system || "",
      rev: standard.rev || form.rev || "Rev.01",
      savedAt: standard.savedAt || new Date().toISOString(),
      form,
      draft,
      revisions: getRevisionHistory({ ...standard, form, draft }),
    };
  });
}

function parseRevNumber(rev) {
  const match = String(rev || "").match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function formatRev(number) {
  return `Rev.${String(Math.max(1, number)).padStart(2, "0")}`;
}

function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id").map(([key, item]) => [key, stripIds(item)]));
  }
  return value;
}

function standardSignature(form, draft) {
  const { rev, date, ...versionedForm } = form;
  return JSON.stringify({
    form: versionedForm,
    draft: stripIds(normalizeDraft(draft)),
  });
}

function makeEmptyRuntimeState() {
  return {
    form: makeBlankForm(),
    draft: normalizeDraft(emptyDraft),
    docTab: "standard",
    standards: mergeExampleStandards([]),
    workRecords: [],
    activeStandardId: null,
    examplesSeeded: true,
    systemOptions: DEFAULT_SYSTEMS,
  };
}

function readLocalState() {
  const fallback = makeEmptyRuntimeState();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallback;

  try {
    const parsed = JSON.parse(saved);
    const parsedStandards = syncExistingExampleStandards(parsed.standards || []);
    const seeded = Boolean(parsed.examplesSeeded);
    return {
      ...fallback,
      standards: seeded ? parsedStandards : mergeExampleStandards(parsedStandards),
      workRecords: (parsed.workRecords || []).map(normalizeWorkRecord),
      systemOptions: normalizeSystemOptions(parsed.systemOptions),
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return fallback;
  }
}

function buildRemoteRuntimeState(remoteState, localState) {
  const remoteStandards = syncExistingExampleStandards(remoteState.standards || []);
  const localStandards = syncExistingExampleStandards(localState.standards || []);
  const sourceStandards = remoteStandards.length ? remoteStandards : localStandards;

  return {
    ...makeEmptyRuntimeState(),
    standards: mergeExampleStandards(sourceStandards),
    workRecords: (remoteState.workRecords?.length ? remoteState.workRecords : localState.workRecords || []).map(normalizeWorkRecord),
    systemOptions: normalizeSystemOptions(remoteState.systemOptions || localState.systemOptions),
  };
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Field({ label, children, span = 1 }) {
  return (
    <label className="field" style={{ gridColumn: `span ${span}` }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SelectField({ label, value, onChange, options, span }) {
  return (
    <Field label={label} span={span}>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </Field>
  );
}

function TextInput({ label, value, onChange, placeholder, span, type = "text" }) {
  return (
    <Field label={label} span={span}>
      <input className="input" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function VersionDisplay({ value, activeStandard }) {
  return (
    <Field label="버전(자동)">
      <div className="version-display">
        <strong>{value || "Rev.01"}</strong>
        <span>{activeStandard ? "수정 후 저장 시 자동 승격" : "신규 표준서는 Rev.01"}</span>
      </div>
    </Field>
  );
}

function TextArea({ label, value, onChange, placeholder, span, rows = 4 }) {
  return (
    <Field label={label} span={span}>
      <textarea className="textarea" rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function RiskSelector({ selected, onToggle }) {
  return (
    <div className="risk-grid">
      {RISK_OPTIONS.map((risk) => (
        <button key={risk} type="button" className={`risk-chip ${selected.includes(risk) ? "selected" : ""}`} onClick={() => onToggle(risk)}>
          {risk}
        </button>
      ))}
    </div>
  );
}

function PpeCharacter({ selected, compact = false }) {
  const safeSelected = Array.isArray(selected) ? selected : [];
  const gradientId = useId().replace(/:/g, "");
  const skyId = `ppeSky-${gradientId}`;
  const bodyId = `ppeBody-${gradientId}`;
  const has = (item) => safeSelected.includes(item);
  const gloveType = ["내화학장갑", "절연장갑", "방열장갑", "보온장갑", "장갑"].find((item) => has(item));
  const gloveColor = {
    내화학장갑: "#2fb7a3",
    절연장갑: "#f5cf42",
    방열장갑: "#e85c43",
    보온장갑: "#8f80d8",
    장갑: "#486fd8",
  }[gloveType];
  const showMask = has("방진마스크") || has("방독마스크");

  return (
    <div className={`ppe-character-stage ${compact ? "compact" : ""}`} aria-hidden="true">
      <svg className="ppe-character-svg" viewBox="0 0 260 260" role="img">
        <defs>
          <linearGradient id={skyId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#c9f2f7" />
            <stop offset="55%" stopColor="#edfafa" />
            <stop offset="56%" stopColor="#f5e5aa" />
            <stop offset="100%" stopColor="#f7d881" />
          </linearGradient>
          <linearGradient id={bodyId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#b5e5f7" />
            <stop offset="100%" stopColor="#78c5e8" />
          </linearGradient>
        </defs>

        <rect width="260" height="260" rx="18" fill={`url(#${skyId})`} />
        <path d="M0 211c38-17 66-11 105-1 45 11 83 8 155-13v63H0Z" fill="#e8c776" opacity=".55" />
        <path d="M28 53c22-16 44-12 58 3 21-13 48-6 58 13 18-7 39-1 48 16" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".75" />

        <g className="ppe-base">
          <circle cx="84" cy="92" r="31" fill={`url(#${bodyId})`} stroke="#315aa7" strokeWidth="6" />
          <circle cx="176" cy="92" r="31" fill={`url(#${bodyId})`} stroke="#315aa7" strokeWidth="6" />
          <ellipse cx="130" cy="151" rx="76" ry="72" fill={`url(#${bodyId})`} stroke="#315aa7" strokeWidth="7" />
          <path d="M78 122c-10 8-17 20-20 35" fill="none" stroke="#315aa7" strokeWidth="7" strokeLinecap="round" opacity=".85" />
          <path d="M182 122c10 8 17 20 20 35" fill="none" stroke="#315aa7" strokeWidth="7" strokeLinecap="round" opacity=".85" />
          <circle cx="130" cy="139" r="54" fill="#fff" stroke="#315aa7" strokeWidth="6" />
          <circle cx="88" cy="151" r="14" fill="#f6c7c9" opacity=".75" />
          <circle cx="172" cy="151" r="14" fill="#f6c7c9" opacity=".75" />
          <ellipse cx="111" cy="134" rx="7" ry="12" fill="#315aa7" />
          <ellipse cx="149" cy="134" rx="7" ry="12" fill="#315aa7" />
          <path d="M122 154c5 7 11 7 16 0" fill="none" stroke="#315aa7" strokeWidth="5" strokeLinecap="round" />
          <path d="M117 101h26M107 89l14 8M153 89l-14 8" stroke="#315aa7" strokeWidth="6" strokeLinecap="round" />
          <path d="M73 163c-24 8-32 26-21 38 10 12 30 4 36-18" fill={`url(#${bodyId})`} stroke="#315aa7" strokeWidth="6" strokeLinecap="round" />
          <path d="M187 163c24 8 32 26 21 38-10 12-30 4-36-18" fill={`url(#${bodyId})`} stroke="#315aa7" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="103" cy="218" rx="25" ry="13" fill="#6fceea" stroke="#315aa7" strokeWidth="6" />
          <ellipse cx="157" cy="218" rx="25" ry="13" fill="#6fceea" stroke="#315aa7" strokeWidth="6" />
        </g>

        {has("안전조끼") && (
          <g>
            <path d="M84 158c15 12 77 12 92 0l-8 54H92Z" fill="#ff9d2d" stroke="#315aa7" strokeWidth="5" />
            <path d="M111 162v47M149 162v47M92 186h76" stroke="#fff6a8" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}

        {has("안전벨트") && (
          <g>
            <path d="M87 159l82 54M173 159l-82 54" stroke="#24415d" strokeWidth="8" strokeLinecap="round" />
            <path d="M96 208h68" stroke="#24415d" strokeWidth="9" strokeLinecap="round" />
            <rect x="118" y="194" width="24" height="18" rx="5" fill="#ffd44f" stroke="#24415d" strokeWidth="5" />
          </g>
        )}

        {has("안전화") && (
          <g>
            <path d="M78 216h43c5 0 9 4 9 9v4H79c-8 0-12-4-12-9 0-3 4-4 11-4Z" fill="#2f3440" stroke="#315aa7" strokeWidth="5" />
            <path d="M139 216h43c7 0 11 1 11 4 0 5-4 9-12 9h-51v-4c0-5 4-9 9-9Z" fill="#2f3440" stroke="#315aa7" strokeWidth="5" />
            <path d="M84 222h34M142 222h34" stroke="#8fa2b3" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {gloveType && (
          <g>
            <path d="M54 178c11-8 28 0 27 15-1 14-18 22-31 14-11-7-7-21 4-29Z" fill={gloveColor} stroke="#315aa7" strokeWidth="5" />
            <path d="M206 178c-11-8-28 0-27 15 1 14 18 22 31 14 11-7 7-21-4-29Z" fill={gloveColor} stroke="#315aa7" strokeWidth="5" />
            <path d="M61 185l15 8M199 185l-15 8" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".65" />
          </g>
        )}

        {has("귀마개") && (
          <g>
            <path d="M67 98c-11 6-17 18-16 32M193 98c11 6 17 18 16 32" fill="none" stroke="#293a55" strokeWidth="6" strokeLinecap="round" />
            <circle cx="70" cy="117" r="12" fill="#ff8a3d" stroke="#293a55" strokeWidth="5" />
            <circle cx="190" cy="117" r="12" fill="#ff8a3d" stroke="#293a55" strokeWidth="5" />
          </g>
        )}

        {has("안전모") && (
          <g>
            <path d="M75 91c4-33 28-53 55-53s51 20 55 53Z" fill="#ffd44f" stroke="#315aa7" strokeWidth="6" strokeLinejoin="round" />
            <path d="M63 91h134" stroke="#315aa7" strokeWidth="10" strokeLinecap="round" />
            <path d="M130 41v44M102 52c9 8 12 20 12 34M158 52c-9 8-12 20-12 34" stroke="#fff6a8" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          </g>
        )}

        {has("보안경") && (
          <g>
            <rect x="95" y="122" width="31" height="22" rx="9" fill="#bfe7f5" stroke="#263140" strokeWidth="5" />
            <rect x="134" y="122" width="31" height="22" rx="9" fill="#bfe7f5" stroke="#263140" strokeWidth="5" />
            <path d="M126 133h8" stroke="#263140" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}

        {has("보안면") && (
          <path d="M82 104c9-13 27-20 48-20s39 7 48 20v55c-9 22-25 33-48 33s-39-11-48-33Z" fill="#d9f4ff" stroke="#315aa7" strokeWidth="5" opacity=".58" />
        )}

        {showMask && (
          <g>
            <path d="M101 153c13 13 45 13 58 0v23c-13 13-45 13-58 0Z" fill={has("방독마스크") ? "#50606b" : "#eef4f7"} stroke="#315aa7" strokeWidth="5" strokeLinejoin="round" />
            <path d="M111 163h38" stroke={has("방독마스크") ? "#93a4af" : "#b9cbd4"} strokeWidth="4" strokeLinecap="round" />
            {has("방독마스크") && (
              <>
                <circle cx="97" cy="174" r="12" fill="#6d7a83" stroke="#315aa7" strokeWidth="4" />
                <circle cx="163" cy="174" r="12" fill="#6d7a83" stroke="#315aa7" strokeWidth="4" />
                <path d="M92 174h10M158 174h10" stroke="#c7d3da" strokeWidth="3" strokeLinecap="round" />
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

function PpeSelector({ selected, recommended, onToggle }) {
  return (
    <div className="ppe-panel">
      <PpeCharacter selected={selected} />
      <div className="ppe-control">
        <div>
          <div className="field-label">필수 안전보호구</div>
          <p>작업에 필요한 보호구를 클릭하면 표준서, TBM, 체크리스트에 같이 반영됩니다.</p>
        </div>
        <div className="ppe-grid">
          {PPE_OPTIONS.map((item) => (
            <button key={item} type="button" className={`ppe-chip ${selected.includes(item) ? "selected" : ""}`} onClick={() => onToggle(item)}>
              <span>{item}</span>
              {recommended.includes(item) && <em>권장</em>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PpeBadgeList({ items }) {
  const list = normalizePpeSelection(items);
  if (!list.length) return <p className="doc-text">현장 위험성 평가에 따라 지정</p>;
  return (
    <div className="ppe-badge-list">
      {list.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function SystemOptionsEditor({ options, selected, newValue, onNewValueChange, onAdd, onDelete }) {
  return (
    <div className="option-manager">
      <div className="option-manager-head">
        <div>
          <strong>관련계통 항목 관리</strong>
          <span>현재 선택: {selected || "-"}</span>
        </div>
        <div className="option-add-row">
          <input className="input" value={newValue} placeholder="계통명 추가" onChange={(event) => onNewValueChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onAdd()} />
          <button type="button" className="button ghost" onClick={onAdd}>
            <Plus size={15} />
            추가
          </button>
        </div>
      </div>
      <div className="option-chip-row">
        {options.map((option) => (
          <span className={`managed-chip ${option === selected ? "selected" : ""}`} key={option}>
            {option}
            <button type="button" onClick={() => onDelete(option)} aria-label={`${option} 삭제`} title={`${option} 삭제`}>
              <Trash2 size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function StorageStatus({ mode, message }) {
  const isRemote = mode === "remote";
  const isLoading = mode === "loading";
  const isAuth = mode === "auth";
  const isBypass = mode === "bypass";
  const Icon = isRemote ? Database : isAuth || isBypass ? KeyRound : CloudOff;

  return (
    <div className={`storage-status ${isRemote ? "remote" : ""} ${isAuth || isBypass ? "auth" : ""} ${isLoading ? "loading" : ""}`}>
      <Icon size={15} />
      <div>
        <strong>{isLoading ? "저장소 확인 중" : isRemote ? "Supabase 저장" : isBypass ? "임시 통과" : isAuth ? "로그인 필요" : "브라우저 저장"}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}

function AuthPanel({ email, message, loading, onEmailChange, onGoogleLogin, onSendLink }) {
  const isLoading = Boolean(loading);
  return (
    <section className="auth-panel">
      <div className="auth-card">
        <div className="auth-icon">
          <KeyRound size={24} />
        </div>
        <div>
          <span className="eyebrow">Supabase Auth</span>
          <h3>로그인 후 SOP 저장소를 사용합니다.</h3>
          <p>Google 로그인을 기본으로 사용하고, 필요할 때 이메일 인증 링크를 보조로 사용할 수 있습니다.</p>
        </div>
        <div className="auth-primary-login">
          <button type="button" className="button primary google-login-button" onClick={onGoogleLogin} disabled={isLoading}>
            <Chrome size={18} />
            {loading === "google" ? "Google로 이동 중" : "Google로 로그인"}
          </button>
          <p>같은 Google 계정으로 로그인하면 다른 기기에서도 같은 SOP 저장소를 사용할 수 있습니다.</p>
        </div>
        <div className="auth-divider">
          <span>또는 이메일 링크로 로그인</span>
        </div>
        <div className="auth-form">
          <label className="field">
            <span>이메일</span>
            <input
              className="input"
              type="text"
              inputMode="email"
              value={email}
              placeholder="name@company.com"
              onChange={(event) => onEmailChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSendLink()}
            />
          </label>
          <button type="button" className="button ghost" onClick={onSendLink} disabled={isLoading}>
            <Mail size={16} />
            {loading === "email" ? "전송 중" : "로그인 링크 받기"}
          </button>
        </div>
        {message && <div className="auth-message">{message}</div>}
      </div>
    </section>
  );
}

function StepRail({ currentStep, setCurrentStep, isDraftReady, standardsCount, workRecordsCount, storageMode, storageMessage }) {
  const navGroups = [
    {
      title: "SOP 관리",
      items: [
        { index: 3, number: 1, label: "SOP 보관함" },
        { index: 4, number: 2, label: "기본 정보" },
        { index: 5, number: 3, label: "작업 조건" },
        { index: 6, number: 4, label: "초안 생성" },
        { index: 7, number: 5, label: "상세 편집" },
        { index: 8, number: 6, label: "출력" },
      ],
    },
    {
      title: "SOP 개선 재료",
      items: [
        { index: 0, number: 7, label: "오늘 업무 기록" },
        { index: 1, number: 8, label: "작업기록함" },
        { index: 2, number: 9, label: "SOP 후보 분석" },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <button className="sidebar-home" type="button" onClick={() => setCurrentStep(3)} aria-label="SOP 보관함으로 이동">
        <div className="sidebar-logo">Plant Utility</div>
        <h1>작업표준서 생성기</h1>
      </button>

      <nav className="steps">
        {navGroups.map((group) => (
          <div className="step-group" key={group.title}>
            <div className="step-group-label">{group.title}</div>
            {group.items.map((item) => (
              <button
                key={item.label}
                className={`step-button ${currentStep === item.index ? "active" : ""}`}
                onClick={() => setCurrentStep(item.index)}
                type="button"
              >
                <span>{item.number}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={`status-box ${isDraftReady ? "ready" : ""}`}>
        <Sparkles size={16} />
        <div>
          <strong>{isDraftReady ? "SOP 편집 중" : `${standardsCount}건 SOP · ${workRecordsCount}건 기록`}</strong>
          <p>{isDraftReady ? "저장 후 오늘 작업 문서를 바로 출력할 수 있습니다." : "SOP가 중심이고, 기록은 후보와 개정 재료로 활용합니다."}</p>
        </div>
      </div>

      <StorageStatus mode={storageMode} message={storageMessage} />
    </aside>
  );
}

function Section({ title, icon: Icon, children, actions }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title">
          {Icon && <Icon size={18} />}
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function WorkRecordPanel({ record, systemOptions, message, onChange, onToggleRisk, onSave, onReset }) {
  const visibleSystemOptions = record.system && !systemOptions.includes(record.system) ? [record.system, ...systemOptions] : systemOptions;

  return (
    <Section
      title="오늘 업무 기록"
      icon={CalendarCheck}
      actions={
        <button type="button" className="button primary" onClick={onSave}>
          <Save size={16} />
          기록 저장
        </button>
      }
    >
      {message && <div className="save-message">{message}</div>}
      <div className="library-intro">
        <div>
          <h3>오늘 한 일을 가볍게 남기고, 나중에 SOP 재료로 씁니다.</h3>
          <p>현상, 원인, 조치, 결과만 남겨도 주간/월간 분석에서 유사작업을 묶을 수 있습니다.</p>
        </div>
      </div>
      <div className="form-grid">
        <TextInput label="작업일" type="date" value={record.workDate} onChange={(value) => onChange("workDate", value)} />
        <SelectField label="작업 유형" value={record.workType} onChange={(value) => onChange("workType", value)} options={WORK_TYPES} />
        <TextInput label="작업명" value={record.title} onChange={(value) => onChange("title", value)} placeholder="예: 냉각수 펌프 이상소음 확인" span={2} />
        <TextInput label="대상 설비" value={record.equipment} onChange={(value) => onChange("equipment", value)} placeholder="예: 냉각수 순환펌프" />
        <TextInput label="설비 TAG" value={record.tag} onChange={(value) => onChange("tag", value)} placeholder="예: CTW-P-101A" />
        <SelectField label="관련 계통" value={record.system} onChange={(value) => onChange("system", value)} options={visibleSystemOptions} />
        <TextInput label="담당팀" value={record.team} onChange={(value) => onChange("team", value)} />
        <TextInput label="작성자" value={record.author} onChange={(value) => onChange("author", value)} />
        <SelectField label="정지/전환 조건" value={record.shutdownMode} onChange={(value) => onChange("shutdownMode", value)} options={SHUTDOWN_MODES} />
        <TextArea label="현상/증상" value={record.symptom} onChange={(value) => onChange("symptom", value)} placeholder="작업 전 확인된 이상 현상, 요청 내용, 운전 상태" span={3} rows={3} />
        <TextArea label="원인/추정" value={record.cause} onChange={(value) => onChange("cause", value)} placeholder="확인된 원인 또는 추정 원인" />
        <TextArea label="조치내용" value={record.action} onChange={(value) => onChange("action", value)} placeholder="실제로 수행한 조치" />
        <TextArea label="결과/후속조치" value={record.result} onChange={(value) => onChange("result", value)} placeholder="정상화 여부, 재점검 필요, 계획정비 반영 등" />
        <TextArea label="메모" value={record.notes} onChange={(value) => onChange("notes", value)} span={3} rows={3} />
      </div>

      <div className="risk-block">
        <div className="field-label">주요 위험요인</div>
        <RiskSelector selected={record.risks} onToggle={onToggleRisk} />
      </div>

      <div className="panel-actions">
        <button type="button" className="button ghost" onClick={onReset}>
          새 기록
        </button>
        <button type="button" className="button primary" onClick={onSave}>
          <Save size={16} />
          기록 저장
        </button>
      </div>
    </Section>
  );
}

function WorkRecordLibrary({ records, onEdit, onDelete }) {
  return (
    <Section title="작업기록함" icon={ListChecks}>
      <div className="library-intro">
        <div>
          <h3>하루하루의 작업을 표준서 후보 재료로 보관합니다.</h3>
          <p>기록이 쌓이면 SOP 후보 분석에서 반복 패턴을 찾아 신규 SOP나 개정 후보로 만들 수 있습니다.</p>
        </div>
      </div>
      {records.length === 0 ? (
        <div className="empty-card">
          <CalendarCheck size={24} />
          <p>아직 저장된 작업기록이 없습니다.</p>
        </div>
      ) : (
        <div className="work-record-list">
          {records.map((record) => (
            <article className="work-record-card" key={record.id}>
              <div>
                <span>{record.workDate} · {record.workType} · {record.system}</span>
                <h3>{record.title || record.symptom || "작업명 미입력"}</h3>
                <p>{record.equipment || "설비 미입력"} {record.tag ? `· ${record.tag}` : ""}</p>
              </div>
              <div>
                <strong>조치</strong>
                <p>{record.action || "조치내용 미입력"}</p>
              </div>
              <div className="work-record-actions">
                <button type="button" className="button ghost" onClick={() => onEdit(record)}>
                  <Edit3 size={16} />
                  수정
                </button>
                <button type="button" className="icon-button danger" onClick={() => onDelete(record.id)} aria-label="삭제" title="삭제">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function WorkAnalysisPanel({ groups, recordsCount, onPromote }) {
  return (
    <Section title="SOP 후보 분석" icon={Sparkles}>
      <div className="analysis-summary">
        <div>
          <span>누적 작업기록</span>
          <strong>{recordsCount}건</strong>
        </div>
        <div>
          <span>분석 묶음</span>
          <strong>{groups.length}개</strong>
        </div>
        <div>
          <span>SOP 후보</span>
          <strong>{groups.filter((group) => group.records.length >= 2).length}개</strong>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-card">
          <Sparkles size={24} />
          <p>분석할 작업기록이 아직 없습니다.</p>
        </div>
      ) : (
        <div className="analysis-list">
          {groups.map((group) => (
            <article className={`analysis-card ${group.records.length >= 2 ? "candidate" : ""}`} key={group.id}>
              <div className="analysis-card-head">
                <div>
                  <span>{group.system} · {group.recommendation}</span>
                  <h3>{group.label}</h3>
                  <p>{group.records.length}건 · 최근 {group.latestDate || "-"} · 키워드 {group.tokens.join(", ") || "-"}</p>
                </div>
                <button type="button" className="button primary" onClick={() => onPromote(group)} disabled={group.records.length < 1}>
                  SOP 후보 만들기
                </button>
              </div>
              {group.matchedStandards.length > 0 && (
                <div className="matched-standards">
                  기존 SOP와 연결 가능: {group.matchedStandards.slice(0, 3).map((standard) => standard.title).join(" / ")}
                </div>
              )}
              <div className="analysis-records">
                {group.records.slice(0, 4).map((record) => (
                  <div key={record.id}>
                    <strong>{record.workDate}</strong>
                    <span>{record.title || record.symptom || "작업명 미입력"}</span>
                    <p>{record.action || record.result || "조치/결과 미입력"}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function StandardLibrary({ standards, onCreateNew, onView, onLoadToday, onEdit, onDelete }) {
  return (
    <Section
      title="표준서 보관함"
      icon={Library}
      actions={
        <button type="button" className="button primary" onClick={onCreateNew}>
          <Plus size={16} />
          새 표준서
        </button>
      }
    >
      <div className="library-intro">
        <div>
          <h3>표준서는 보관하고, 오늘 작업 문서는 선택해서 출력합니다.</h3>
          <p>작성한 표준서를 저장해두면 이후 작업일에는 해당 표준서를 클릭해 체크리스트, TBM, 결과지를 바로 만들 수 있습니다.</p>
        </div>
      </div>

      {standards.length === 0 ? (
        <div className="empty-card">
          <Library size={24} />
          <p>아직 보관된 표준서가 없습니다.</p>
          <button type="button" className="button primary" onClick={onCreateNew}>
            새 표준서 작성
          </button>
        </div>
      ) : (
        <div className="standard-list" role="table" aria-label="표준서 목록">
          <div className="standard-list-head" role="row">
            <span>작업명</span>
            <span>설비 / TAG</span>
            <span>계통</span>
            <span>버전(REV)</span>
            <span>저장일</span>
            <span>작업</span>
          </div>
          {standards.map((standard) => (
            <article className="standard-row" key={standard.id} role="row">
              <div className="standard-title-cell">
                <strong>{standard.title}</strong>
                <span>{standard.form?.workType || "작업유형 미입력"} · {standard.form?.shutdownMode || "작업조건 미입력"}</span>
              </div>
              <div className="standard-sub-cell">
                <strong>{standard.equipment || "대상 설비 미입력"}</strong>
                <span>{standard.tag || "TAG 미입력"}</span>
              </div>
              <div className="standard-system-cell">{standard.system || "계통 미입력"}</div>
              <div className="standard-rev-cell">
                <strong>{standard.rev || "Rev.01"}</strong>
                <span>이력 {getRevisionHistory(standard).length}건</span>
              </div>
              <div className="standard-date-cell">{formatDateTime(standard.savedAt)}</div>
              <div className="standard-list-actions">
                <button type="button" className="button ghost" onClick={() => onView(standard)}>
                  <FileText size={16} />
                  표준서 보기
                </button>
                <button type="button" className="button primary" onClick={() => onLoadToday(standard)}>
                  <CalendarCheck size={16} />
                  오늘 작업 시작
                </button>
                <button type="button" className="icon-button" onClick={() => onEdit(standard)} aria-label="편집" title="편집">
                  <Edit3 size={16} />
                </button>
                <button type="button" className="icon-button danger" onClick={() => onDelete(standard.id)} aria-label="삭제" title="삭제">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function RevisionHistoryPanel({ standard, currentRev, selectedRevisionRev, onSelect }) {
  if (!standard) return null;
  const revisions = getRevisionHistory(standard).sort((a, b) => parseRevNumber(b.rev) - parseRevNumber(a.rev));

  return (
    <div className="revision-panel">
      <div className="revision-panel-head">
        <div>
          <h3>개정 이력</h3>
          <p>각 버전의 저장 시점과 변경 내용을 보관합니다.</p>
        </div>
        <span>{revisions.length}건</span>
      </div>
      <div className="revision-list">
        {revisions.map((revision) => {
          const isLatest = revision.rev === standard.rev;
          const isSelected = (selectedRevisionRev || currentRev) === revision.rev;
          return (
            <button key={revision.id} type="button" className={`revision-row ${isSelected ? "selected" : ""}`} onClick={() => onSelect(revision)}>
              <strong>{revision.rev}</strong>
              <span>{formatDateTime(revision.savedAt)}</span>
              <p>{revision.summary || "변경 내용 기록 없음"}</p>
              <em>{isLatest ? "최신" : "이전"}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EditableTable({ columns, rows, onChange, onAdd, onRemove, onMove }) {
  return (
    <div className="edit-table">
      <div className="edit-table-head" style={{ gridTemplateColumns: `42px ${columns.map((col) => col.width || "1fr").join(" ")} 104px` }}>
        <span>No</span>
        {columns.map((col) => (
          <span key={col.key}>{col.label}</span>
        ))}
        <span />
      </div>

      {rows.map((row, index) => (
        <div key={row.id} className="edit-table-row" style={{ gridTemplateColumns: `42px ${columns.map((col) => col.width || "1fr").join(" ")} 104px` }}>
          <div className="row-num">{String(index + 1).padStart(2, "0")}</div>
          {columns.map((col) =>
            col.type === "select" ? (
              <select key={col.key} className="input" value={stepTagLabel(row[col.key]) || col.options[0]} onChange={(event) => onChange(row.id, col.key, event.target.value)}>
                {col.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <textarea
                key={col.key}
                className="table-textarea"
                value={row[col.key] || ""}
                rows={col.rows || 1}
                onChange={(event) => onChange(row.id, col.key, event.target.value)}
              />
            ),
          )}
          <div className="row-actions">
            <button type="button" className="icon-button" onClick={() => onMove(row.id, -1)} aria-label="위로 이동" title="위로 이동">
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-button" onClick={() => onMove(row.id, 1)} aria-label="아래로 이동" title="아래로 이동">
              <ArrowDown size={14} />
            </button>
            <button type="button" className="icon-button danger" onClick={() => onRemove(row.id)} aria-label="삭제" title="삭제">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="add-line" onClick={onAdd}>
        <Plus size={15} />
        항목 추가
      </button>
    </div>
  );
}

function EditableList({ rows, onChange, onAdd, onRemove, onMove }) {
  return (
    <div className="editable-list">
      {rows.map((row, index) => (
        <div className="list-row" key={row.id}>
          <span className="row-num">{String(index + 1).padStart(2, "0")}</span>
          <textarea className="table-textarea" rows={1} value={row.text || ""} onChange={(event) => onChange(row.id, "text", event.target.value)} />
          <div className="row-actions">
            <button type="button" className="icon-button" onClick={() => onMove(row.id, -1)} aria-label="위로 이동" title="위로 이동">
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-button" onClick={() => onMove(row.id, 1)} aria-label="아래로 이동" title="아래로 이동">
              <ArrowDown size={14} />
            </button>
            <button type="button" className="icon-button danger" onClick={() => onRemove(row.id)} aria-label="삭제" title="삭제">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="add-line" onClick={onAdd}>
        <Plus size={15} />
        항목 추가
      </button>
    </div>
  );
}

function DocHeader({ form, docType = "비정형 작업 표준서", showPpePreview = false }) {
  const headerPpe = normalizePpeSelection(form.ppe);
  return (
    <>
      <div className="doc-header">
        <div className="doc-header-title">
          <div className="doc-kicker">Work Standard · {docType}</div>
          <h2>{form.title || "작업명 미입력"}</h2>
          <p>
            {form.equipment || "대상 설비"} · {form.tag || "TAG 미입력"}
          </p>
        </div>
        <div className="doc-header-aside">
          {showPpePreview && (
            <div className="doc-ppe-preview" aria-label="필수 보호구 착용 예시">
              <span>필수 보호구</span>
              <PpeCharacter selected={headerPpe} compact />
            </div>
          )}
          <div className="rev-badge">
            <span>REV</span>
            <strong>{form.rev}</strong>
          </div>
        </div>
      </div>
      <div className="doc-meta">
        {[
          ["작업유형", form.workType],
          ["관련계통", form.system],
          ["정지조건", form.shutdownMode],
          ["작업허가", form.permit],
          ["LOTO", form.loto],
          ["작업인원", form.people],
          ["소요시간", form.duration],
          ["작성일", form.date],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value || "-"}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

function StandardDoc({ form, draft }) {
  return (
    <article className="document">
      <DocHeader form={form} docType="비정형 작업 표준서" showPpePreview />

      <div className="doc-body">
        <DocSection title="작업 목적">
          <p className="doc-text">{form.purpose || "-"}</p>
          {form.notes && <p className="doc-note">{form.notes}</p>}
        </DocSection>

        <DocSection title="필수 안전보호구">
          <PpeBadgeList items={form.ppe} />
        </DocSection>

        <DocSection title="작업 전 판단 기준">
          <SimpleTable
            columns={["확인 항목", "판단 기준"]}
            rows={draft.preChecks.map((row) => [row.item, row.criteria])}
          />
        </DocSection>

        <DocSection title="주요 위험요인 및 안전조치">
          <SimpleTable
            columns={["위험요인", "확인 내용", "조치", "관련 보호구"]}
            rows={draft.safetyRisks.map((row) => [row.risk, row.check, row.control, row.ppe || "-"])}
          />
        </DocSection>

        <DocSection title="표준 작업 흐름">
          <div className="doc-steps">
            {draft.steps.map((step, index) => (
              <div key={step.id} className="doc-step">
                <span>{index + 1}</span>
                <div>
                  <strong>{step.action}</strong>
                  {step.note && <p>{step.note}</p>}
                </div>
                <em>{stepTagLabel(step.tag)}</em>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection title="점검 항목 및 판정 기준">
          <SimpleTable
            columns={["점검 항목", "유형", "판정 기준", "확인 방법"]}
            rows={draft.inspectionCriteria.map((row) => [row.item, row.type, row.criteria, row.method])}
          />
        </DocSection>

        <div className="doc-grid">
          <DocSection title="작업 중단 기준">
            <NumberList rows={draft.stopCriteria.map((row) => row.text)} />
          </DocSection>
          <DocSection title="완료 기준">
            <NumberList rows={draft.completionCriteria.map((row) => row.text)} />
          </DocSection>
        </div>

        <DocSection title="비정상 상황 대응">
          <NumberList rows={draft.abnormalActions.map((row) => row.text)} />
        </DocSection>
      </div>
      <DocFooter form={form} label="작업 표준서" />
    </article>
  );
}

function TbmDoc({ form, draft }) {
  return (
    <article className="document compact-doc">
      <DocHeader form={form} docType="TBM 회의자료" />
      <div className="doc-body">
        <DocSection title="오늘 작업 핵심">
          <div className="tbm-summary">
            <div>
              <span>작업 목적</span>
              <strong>{form.purpose || "-"}</strong>
            </div>
            <div>
              <span>작업 조건</span>
              <strong>{form.shutdownMode} · {form.people}</strong>
            </div>
            <div>
              <span>작업허가</span>
              <strong>{form.permit} · LOTO {form.loto}</strong>
            </div>
            <div>
              <span>필수 보호구</span>
              <strong>{normalizePpeSelection(form.ppe).join(", ") || "-"}</strong>
            </div>
          </div>
        </DocSection>

        <DocSection title="TBM 확인 사항">
          <CheckRows
            rows={[
              "작업 대상 설비 TAG와 차단 범위를 전원이 확인했다.",
              "운전부서와 정지, 전환, 복구 조건을 공유했다.",
              `필수 보호구(${normalizePpeSelection(form.ppe).join(", ") || "현장 지정"}) 착용 상태를 확인했다.`,
              "작업 중단 기준과 즉시 보고 대상을 공유했다.",
              "필요 보호구, 공구, 예비품을 현장에서 확인했다.",
              "현장 조건이 변경되면 작업을 멈추고 재판단한다.",
            ]}
          />
        </DocSection>

        <DocSection title="주요 위험과 조치">
          <SimpleTable
            columns={["위험", "조치"]}
            rows={draft.safetyRisks.map((row) => [row.risk, row.control])}
          />
        </DocSection>

        <DocSection title="작업 중단 기준">
          <NumberList rows={draft.stopCriteria.slice(0, 6).map((row) => row.text)} />
        </DocSection>

        <SignatureGrid labels={["작업자", "입회자", "운전담당", "TBM 일시"]} />
      </div>
      <DocFooter form={form} label="TBM" />
    </article>
  );
}

function ChecklistDoc({ form, draft }) {
  return (
    <article className="document compact-doc">
      <DocHeader form={form} docType="오늘 작업 체크리스트" />
      <div className="doc-body">
        <DocSection title="작업 전 체크">
          <CheckRows rows={[`필수 보호구 착용: ${normalizePpeSelection(form.ppe).join(", ") || "현장 지정"}`, ...draft.preChecks.map((row) => `${row.item}: ${row.criteria}`)]} />
        </DocSection>

        <DocSection title="작업 절차 체크">
          <CheckRows rows={draft.steps.map((step, index) => `${index + 1}. ${step.action}${step.note ? ` (${step.note})` : ""}`)} />
        </DocSection>

        <DocSection title="시운전 및 완료 체크">
          <CheckRows rows={draft.completionCriteria.map((row) => row.text)} />
        </DocSection>

        <SignatureGrid labels={["작업자", "확인자", "운전인계", "완료 일시"]} />
      </div>
      <DocFooter form={form} label="체크리스트" />
    </article>
  );
}

function RecordDoc({ form, draft }) {
  return (
    <article className="document compact-doc">
      <DocHeader form={form} docType="작업 결과 기록지" />
      <div className="doc-body">
        <DocSection title="작업 결과 기록">
          <SimpleTable
            columns={["항목", "기록 내용"]}
            rows={draft.resultRecords.map((row) => [row.field, row.value || ""])}
          />
        </DocSection>

        <DocSection title="측정값 기록">
          <SimpleTable
            columns={["구분", "작업 전", "작업 후", "판정", "비고"]}
            rows={draft.inspectionCriteria.map((row) => [row.item, "", "", "", row.criteria])}
          />
        </DocSection>

        <DocSection title="후속조치">
          <div className="blank-box" />
        </DocSection>

        <SignatureGrid labels={["작성자", "확인자", "팀장", "등록 일시"]} />
      </div>
      <DocFooter form={form} label="결과 기록지" />
    </article>
  );
}

function DocSection({ title, children }) {
  return (
    <section className="doc-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SimpleTable({ columns, rows }) {
  return (
    <table className="simple-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex}>{cell || "-"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NumberList({ rows }) {
  return (
    <ol className="number-list">
      {rows.map((row, index) => (
        <li key={index}>{row}</li>
      ))}
    </ol>
  );
}

function CheckRows({ rows }) {
  return (
    <div className="check-rows">
      {rows.map((row, index) => (
        <div key={index} className="check-row">
          <span />
          <p>{row}</p>
        </div>
      ))}
    </div>
  );
}

function SignatureGrid({ labels }) {
  return (
    <div className="signature-grid">
      {labels.map((label) => (
        <div key={label}>
          <span>{label}</span>
          <i />
        </div>
      ))}
    </div>
  );
}

function DocFooter({ form, label = "작업 표준서" }) {
  return (
    <footer className="doc-footer">
      <span>{form.team} · {label}</span>
      <span>{form.rev} · {form.date}</span>
      <span>{form.author || "작성자"} · PAGE 1/1</span>
    </footer>
  );
}

export default function App() {
  const [currentStep, setCurrentStep] = useState(3);
  const [form, setForm] = useState(makeBlankForm);
  const [draft, setDraft] = useState(normalizeDraft(emptyDraft));
  const [docTab, setDocTab] = useState("standard");
  const [standards, setStandards] = useState([]);
  const [workRecords, setWorkRecords] = useState([]);
  const [workRecordForm, setWorkRecordForm] = useState(makeBlankWorkRecord);
  const [activeWorkRecordId, setActiveWorkRecordId] = useState(null);
  const [workRecordMessage, setWorkRecordMessage] = useState("");
  const [activeStandardId, setActiveStandardId] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [selectedRevisionRev, setSelectedRevisionRev] = useState(null);
  const [systemOptions, setSystemOptions] = useState(DEFAULT_SYSTEMS);
  const [newSystemOption, setNewSystemOption] = useState("");
  const [examplesSeeded, setExamplesSeeded] = useState(false);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState("");
  const [authBypass, setAuthBypass] = useState(() => authBypassEmail(localStorage.getItem(AUTH_BYPASS_STORAGE_KEY)));
  const [loaded, setLoaded] = useState(false);
  const [storageMode, setStorageMode] = useState(isSupabaseConfigured ? "loading" : "local");
  const [storageMessage, setStorageMessage] = useState(
    isSupabaseConfigured ? "로그인 상태와 공용 데이터 저장소를 확인하고 있습니다." : "공용 저장소 연결값이 없어 이 브라우저에만 저장됩니다.",
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let isMounted = true;

    getAuthSession()
      .then((nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        setAuthReady(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        setAuthReady(true);
        setAuthMessage(`로그인 상태 확인이 필요합니다. (${error.message})`);
      });

    const unsubscribe = onAuthSessionChange((nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applyState = (nextState) => {
      setForm(nextState.form);
      setDraft(nextState.draft);
      setDocTab(nextState.docTab);
      setStandards(nextState.standards);
      setWorkRecords(nextState.workRecords);
      setActiveStandardId(nextState.activeStandardId);
      setExamplesSeeded(nextState.examplesSeeded);
      setSystemOptions(nextState.systemOptions);
    };

    async function loadInitialState() {
      if (isSupabaseConfigured && !authReady) return;

      setLoaded(false);
      const localState = readLocalState();

      if (!isSupabaseConfigured) {
        applyState(localState);
        setStorageMode("local");
        setStorageMessage("공용 저장소 연결값이 없어 이 브라우저에만 저장됩니다.");
        setLoaded(true);
        return;
      }

      if (!session?.user?.id && authBypass) {
        applyState(localState);
        setStorageMode("bypass");
        setStorageMessage(`${authBypass} 임시 통과 중입니다. 인증 세션이 없어 이 브라우저에만 저장됩니다.`);
        setLoaded(true);
        return;
      }

      if (!session?.user?.id) {
        applyState(localState);
        setStorageMode("auth");
        setStorageMessage("로그인하면 Supabase 저장소에 안전하게 동기화됩니다. 지금은 이 브라우저 임시 데이터만 표시됩니다.");
        setLoaded(true);
        return;
      }

      try {
        const remoteState = await loadRemoteState();
        if (!isMounted) return;
        applyState(buildRemoteRuntimeState(remoteState, localState));
        setStorageMode("remote");
        setStorageMessage(`${session.user.email || "로그인 사용자"} 계정으로 Supabase와 연결되었습니다.`);
      } catch (error) {
        if (!isMounted) return;
        applyState(localState);
        setStorageMode("local");
        setStorageMessage(`공용 저장소 연결 확인이 필요합니다. 지금은 이 브라우저에만 저장됩니다. (${error.message})`);
      }
      setLoaded(true);
    }

    loadInitialState();

    return () => {
      isMounted = false;
    };
  }, [authReady, session?.user?.id, authBypass]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, draft, docTab, standards, workRecords, activeStandardId, examplesSeeded, systemOptions }));
  }, [form, draft, docTab, standards, workRecords, activeStandardId, examplesSeeded, systemOptions, loaded]);

  useEffect(() => {
    if (!loaded || storageMode !== "remote" || !session?.user?.id) return undefined;

    const timeoutId = window.setTimeout(async () => {
      const [standardsResult, workRecordsResult, settingsResult] = await Promise.allSettled([
        saveStandardsToRemote(standards, session.user.id),
        saveWorkRecordsToRemote(workRecords, session.user.id),
        saveSystemOptionsToRemote(systemOptions, session.user.id),
      ]);
      const criticalFailure = [standardsResult, workRecordsResult].find((result) => result.status === "rejected");
      if (criticalFailure) {
        setStorageMode("local");
        setStorageMessage(`공용 저장소 저장 실패로 브라우저 저장으로 전환했습니다. (${criticalFailure.reason?.message || "알 수 없는 오류"})`);
        return;
      }
      if (settingsResult.status === "rejected") {
        setStorageMessage(`Supabase 저장 완료 · 관련계통 사용자 옵션은 브라우저에만 저장됩니다. (${settingsResult.reason?.message || "설정 저장 오류"})`);
        return;
      }
      setStorageMessage(`Supabase 동기화 완료 · ${formatDateTime(new Date().toISOString())}`);
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [standards, workRecords, systemOptions, loaded, storageMode, session?.user?.id]);

  const isDraftReady = draft.steps.length > 0 || draft.preChecks.length > 0;
  const activeStandard = standards.find((standard) => standard.id === activeStandardId);
  const isViewingPastRevision = Boolean(selectedRevisionRev && activeStandard && selectedRevisionRev !== activeStandard.rev);
  const visibleSystemOptions = form.system && !systemOptions.includes(form.system) ? [form.system, ...systemOptions] : systemOptions;
  const workGroups = useMemo(() => buildWorkRecordGroups(workRecords, standards), [workRecords, standards]);
  const recommendedPpe = useMemo(() => getRecommendedPpeForRisks(form.risks, form.permit), [form.risks, form.permit]);
  const bypassLabel = authBypass && !session?.user?.id ? `${authBypass} · 임시` : "";
  const needsLogin = isSupabaseConfigured && authReady && !session?.user?.id && !authBypass;

  const handleGoogleLogin = async () => {
    setAuthLoading("google");
    setAuthMessage("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthMessage(`Google 로그인 시작 실패: ${error.message}`);
      setAuthLoading("");
    }
  };

  const sendAuthLink = async () => {
    const email = authEmail.trim();
    if (!email) {
      setAuthMessage("로그인 링크를 받을 이메일을 입력해주세요.");
      return;
    }

    const bypassEmail = authBypassEmail(email);
    if (bypassEmail) {
      localStorage.setItem(AUTH_BYPASS_STORAGE_KEY, bypassEmail);
      setAuthBypass(bypassEmail);
      setAuthMessage(`${bypassEmail} 임시 통과를 적용했습니다. 인증 전까지 이 브라우저에만 저장됩니다.`);
      setStorageMode("bypass");
      setStorageMessage(`${bypassEmail} 임시 통과 중입니다. 인증 세션이 없어 이 브라우저에만 저장됩니다.`);
      return;
    }

    setAuthLoading("email");
    setAuthMessage("");
    try {
      await sendLoginLink(email);
      setAuthMessage("이메일로 로그인 링크를 보냈습니다. 메일의 링크를 열면 이 기기에서 로그인됩니다.");
    } catch (error) {
      setAuthMessage(authFailureMessage(error));
    } finally {
      setAuthLoading("");
    }
  };

  const handleSignOut = async () => {
    try {
      if (session?.user?.id) await signOut();
      localStorage.removeItem(AUTH_BYPASS_STORAGE_KEY);
      setAuthBypass("");
      setSession(null);
      setStorageMode("auth");
      setStorageMessage("로그아웃되었습니다. 다시 로그인하면 Supabase 데이터를 불러옵니다.");
    } catch (error) {
      setAuthMessage(`로그아웃 실패: ${error.message}`);
    }
  };

  const updateForm = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "permit" && value === "고소작업허가") {
        next.ppe = normalizePpeSelection([...normalizePpeSelection(prev.ppe), "안전모", "안전화", "안전벨트", "안전조끼", "장갑"]);
      }
      return next;
    });
    setSaveMessage("");
  };

  const toggleRisk = (risk) => {
    setForm((prev) => {
      const currentRisks = Array.isArray(prev.risks) ? prev.risks : [];
      const currentPpe = normalizePpeSelection(prev.ppe);
      const isSelected = currentRisks.includes(risk);
      return {
        ...prev,
        risks: isSelected ? currentRisks.filter((item) => item !== risk) : [...currentRisks, risk],
        ppe: isSelected ? currentPpe : normalizePpeSelection([...currentPpe, ...(PPE_BY_RISK[risk] || [])]),
      };
    });
    setSaveMessage("");
  };

  const togglePpe = (item) => {
    setForm((prev) => ({
      ...prev,
      ppe: normalizePpeSelection(prev.ppe).includes(item) ? normalizePpeSelection(prev.ppe).filter((value) => value !== item) : [...normalizePpeSelection(prev.ppe), item],
    }));
    setSaveMessage("");
  };

  const createDraft = () => {
    setDraft(normalizeDraft(generateDraft(form)));
    setSaveMessage("");
    setCurrentStep(7);
  };

  const createNewStandard = () => {
    setForm(makeBlankForm());
    setDraft(normalizeDraft(emptyDraft));
    setActiveStandardId(null);
    setSelectedRevisionRev(null);
    setDocTab("standard");
    setSaveMessage("");
    setCurrentStep(4);
  };

  const updateWorkRecord = (key, value) => {
    setWorkRecordForm((prev) => ({ ...prev, [key]: value }));
    setWorkRecordMessage("");
  };

  const toggleWorkRecordRisk = (risk) => {
    setWorkRecordForm((prev) => ({
      ...prev,
      risks: prev.risks.includes(risk) ? prev.risks.filter((item) => item !== risk) : [...prev.risks, risk],
    }));
    setWorkRecordMessage("");
  };

  const resetWorkRecord = () => {
    setWorkRecordForm(makeBlankWorkRecord());
    setActiveWorkRecordId(null);
    setWorkRecordMessage("");
    setCurrentStep(0);
  };

  const saveWorkRecord = () => {
    if (!workRecordForm.title.trim() && !workRecordForm.symptom.trim() && !workRecordForm.action.trim()) {
      setWorkRecordMessage("작업명, 현상, 조치내용 중 하나는 입력해야 저장할 수 있습니다.");
      return;
    }
    const now = new Date().toISOString();
    const record = normalizeWorkRecord({
      ...workRecordForm,
      id: activeWorkRecordId || workRecordForm.id || makeUuid(),
      savedAt: now,
    });
    setWorkRecords((prev) => {
      const exists = prev.some((item) => item.id === record.id);
      if (exists) return prev.map((item) => (item.id === record.id ? record : item));
      return [record, ...prev];
    });
    setWorkRecordForm(makeBlankWorkRecord());
    setActiveWorkRecordId(null);
    setWorkRecordMessage("작업기록을 저장했습니다. SOP 후보 분석에 바로 반영됩니다.");
  };

  const editWorkRecord = (record) => {
    const normalized = normalizeWorkRecord(record);
    setWorkRecordForm(normalized);
    setActiveWorkRecordId(normalized.id);
    setWorkRecordMessage("작업기록 수정 중입니다.");
    setCurrentStep(0);
  };

  const deleteWorkRecord = (id) => {
    setWorkRecords((prev) => prev.filter((record) => record.id !== id));
    if (activeWorkRecordId === id) resetWorkRecord();
    if (storageMode === "remote") {
      deleteWorkRecordFromRemote(id)
        .then(() => setStorageMessage("Supabase에서 작업기록을 삭제했습니다."))
        .catch((error) => setStorageMessage(`Supabase 작업기록 삭제 실패: ${error.message}`));
    }
  };

  const promoteWorkGroup = (group) => {
    const candidate = buildStandardFromWorkGroup(group);
    setForm(candidate.form);
    setDraft(candidate.draft);
    setActiveStandardId(null);
    setSelectedRevisionRev(null);
    setDocTab("standard");
    setSaveMessage(`작업기록 ${group.records.length}건을 바탕으로 SOP 후보를 만들었습니다. 검토 후 저장하면 Rev.01로 등록됩니다.`);
    setCurrentStep(7);
  };

  const loadStandard = (standard, mode) => {
    const loadedForm = normalizeFormValues({ ...defaultForm, ...standard.form });
    if (!Array.isArray(standard.form?.ppe)) loadedForm.ppe = getRecommendedPpeForRisks(loadedForm.risks, loadedForm.permit);
    if (mode === "today") {
      loadedForm.date = new Date().toISOString().slice(0, 10);
    }
    setForm(loadedForm);
    if (loadedForm.system && !systemOptions.includes(loadedForm.system)) {
      setSystemOptions((prev) => normalizeSystemOptions([loadedForm.system, ...prev]));
    }
    setDraft(normalizeDraft(standard.draft || emptyDraft));
    setActiveStandardId(standard.id);
    setSelectedRevisionRev(null);
    setSaveMessage("");
    if (mode === "today" || mode === "view") {
      setDocTab("standard");
      setCurrentStep(8);
    } else {
      setDocTab("standard");
      setCurrentStep(7);
    }
  };

  const loadRevision = (revision) => {
    const revisionForm = normalizeFormValues({ ...defaultForm, ...revision.form });
    if (!Array.isArray(revision.form?.ppe)) revisionForm.ppe = getRecommendedPpeForRisks(revisionForm.risks, revisionForm.permit);
    setForm(revisionForm);
    if (revisionForm.system && !systemOptions.includes(revisionForm.system)) {
      setSystemOptions((prev) => normalizeSystemOptions([revisionForm.system, ...prev]));
    }
    setDraft(normalizeDraft(revision.draft || emptyDraft));
    setSelectedRevisionRev(revision.rev);
    setDocTab("standard");
    setCurrentStep(8);
    setSaveMessage(`${revision.rev} 이력을 조회 중입니다. 과거 이력은 저장할 수 없고 최신 버전에서 편집해야 합니다.`);
  };

  const saveStandard = () => {
    if (!isDraftReady) {
      setSaveMessage("초안을 생성한 뒤 저장할 수 있습니다.");
      return;
    }
    if (isViewingPastRevision) {
      setSaveMessage("과거 이력은 저장할 수 없습니다. 최신 버전에서 편집하세요.");
      return;
    }
    const previous = standards.find((standard) => standard.id === activeStandardId);
    if (previous && standardSignature(form, draft) === standardSignature(previous.form, previous.draft)) {
      setForm((prev) => ({ ...prev, rev: previous.rev || "Rev.01" }));
      setSaveMessage("변경 내용이 없어 버전은 유지되었습니다.");
      return;
    }

    const nextRev = previous ? formatRev(parseRevNumber(previous.rev) + 1) : "Rev.01";
    const versionedForm = { ...form, rev: nextRev };
    const record = makeStandardRecord(versionedForm, draft, activeStandardId, { previous });
    setStandards((prev) => {
      const exists = prev.some((standard) => standard.id === record.id);
      if (exists) return prev.map((standard) => (standard.id === record.id ? record : standard));
      return [record, ...prev];
    });
    setForm(versionedForm);
    setActiveStandardId(record.id);
    setSelectedRevisionRev(null);
    setSaveMessage(previous ? `${record.rev}로 새 버전 저장되었습니다.` : `${record.rev}로 표준서가 보관함에 저장되었습니다.`);
  };

  const addSystemOption = () => {
    const value = newSystemOption.trim();
    if (!value) return;
    setSystemOptions((prev) => normalizeSystemOptions([...prev, value]));
    setForm((prev) => ({ ...prev, system: value }));
    setNewSystemOption("");
    setSaveMessage("");
  };

  const deleteSystemOption = (option) => {
    setSystemOptions((prev) => {
      const next = normalizeSystemOptions(prev.filter((item) => item !== option));
      if (form.system === option) {
        setForm((current) => ({ ...current, system: next[0] || "기타" }));
      }
      return next;
    });
    setSaveMessage("");
  };

  const deleteStandard = (id) => {
    setStandards((prev) => prev.filter((standard) => standard.id !== id));
    if (activeStandardId === id) setActiveStandardId(null);
    if (storageMode === "remote") {
      deleteStandardFromRemote(id)
        .then(() => setStorageMessage("Supabase에서 표준서를 삭제했습니다."))
        .catch((error) => setStorageMessage(`Supabase 삭제 실패: ${error.message}`));
    }
  };

  const updateRows = (key, id, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
    setSaveMessage("");
  };

  const addRow = (key, row) => {
    setDraft((prev) => ({
      ...prev,
      [key]: [...prev[key], { id: makeId(), ...row }],
    }));
    setSaveMessage("");
  };

  const removeRow = (key, id) => {
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].filter((row) => row.id !== id),
    }));
    setSaveMessage("");
  };

  const moveDraftRow = (key, id, direction) => {
    setDraft((prev) => ({
      ...prev,
      [key]: moveRow(prev[key], id, direction),
    }));
    setSaveMessage("");
  };

  const doc = useMemo(() => {
    if (docTab === "tbm") return <TbmDoc form={form} draft={draft} />;
    if (docTab === "checklist") return <ChecklistDoc form={form} draft={draft} />;
    if (docTab === "record") return <RecordDoc form={form} draft={draft} />;
    return <StandardDoc form={form} draft={draft} />;
  }, [docTab, form, draft]);

  return (
    <div className="app-shell">
      <StepRail
        currentStep={currentStep}
        setCurrentStep={setCurrentStep}
        isDraftReady={isDraftReady}
        standardsCount={standards.length}
        workRecordsCount={workRecords.length}
        storageMode={storageMode}
        storageMessage={storageMessage}
      />

      <main className="main">
        <header className="topbar">
          <div>
            <span>Utility Maintenance</span>
            <h2>{form.title || "작업표준서 생성기"}</h2>
          </div>
          <div className="topbar-actions">
            {(session?.user?.email || bypassLabel) && (
              <div className="account-pill">
                <UserRound size={14} />
                <span>{session?.user?.email || bypassLabel}</span>
                <button type="button" onClick={handleSignOut} aria-label={authBypass ? "임시 통과 해제" : "로그아웃"} title={authBypass ? "임시 통과 해제" : "로그아웃"}>
                  <LogOut size={14} />
                </button>
              </div>
            )}
            <button type="button" className="button ghost" onClick={() => setCurrentStep(3)}>
              <Library size={16} />
              SOP 보관함
            </button>
            <button type="button" className="button ghost" onClick={() => setCurrentStep(0)}>
              <CalendarCheck size={16} />
              오늘 기록
            </button>
            <button type="button" className="button ghost" onClick={saveStandard} disabled={!isDraftReady}>
              <Save size={16} />
              표준서 저장
            </button>
            <button type="button" className="button primary" onClick={() => window.print()} disabled={!isDraftReady}>
              <Printer size={16} />
              인쇄/PDF
            </button>
          </div>
        </header>

        {needsLogin && (
          <AuthPanel
            email={authEmail}
            message={authMessage}
            loading={authLoading}
            onEmailChange={(value) => {
              setAuthEmail(value);
              setAuthMessage("");
            }}
            onGoogleLogin={handleGoogleLogin}
            onSendLink={sendAuthLink}
          />
        )}

        {!needsLogin && currentStep === 0 && (
          <WorkRecordPanel
            record={workRecordForm}
            systemOptions={systemOptions}
            message={workRecordMessage}
            onChange={updateWorkRecord}
            onToggleRisk={toggleWorkRecordRisk}
            onSave={saveWorkRecord}
            onReset={resetWorkRecord}
          />
        )}

        {!needsLogin && currentStep === 1 && (
          <WorkRecordLibrary records={workRecords} onEdit={editWorkRecord} onDelete={deleteWorkRecord} />
        )}

        {!needsLogin && currentStep === 2 && (
          <WorkAnalysisPanel groups={workGroups} recordsCount={workRecords.length} onPromote={promoteWorkGroup} />
        )}

        {!needsLogin && currentStep === 3 && (
          <StandardLibrary
            standards={standards}
            onCreateNew={createNewStandard}
            onView={(standard) => loadStandard(standard, "view")}
            onLoadToday={(standard) => loadStandard(standard, "today")}
            onEdit={(standard) => loadStandard(standard, "edit")}
            onDelete={deleteStandard}
          />
        )}

        {!needsLogin && currentStep === 4 && (
          <Section title="기본 정보" icon={FileText}>
            {activeStandard && (
              <div className="active-standard-note">
                보관된 표준서 편집 중: <strong>{activeStandard.title}</strong>
              </div>
            )}
            {saveMessage && <div className="save-message">{saveMessage}</div>}
            <div className="form-grid">
              <TextInput label="작업명" value={form.title} onChange={(value) => updateForm("title", value)} placeholder="예: 냉각수 펌프 이상소음 점검 및 조치" span={2} />
              <SelectField label="작업 유형" value={form.workType} onChange={(value) => updateForm("workType", value)} options={WORK_TYPES} />
              <TextInput label="대상 설비" value={form.equipment} onChange={(value) => updateForm("equipment", value)} placeholder="예: 냉각수 순환펌프" />
              <TextInput label="설비 TAG" value={form.tag} onChange={(value) => updateForm("tag", value)} placeholder="예: CTW-P-101A" />
              <SelectField label="관련 계통" value={form.system} onChange={(value) => updateForm("system", value)} options={visibleSystemOptions} />
              <TextInput label="담당팀" value={form.team} onChange={(value) => updateForm("team", value)} />
              <TextInput label="작성자" value={form.author} onChange={(value) => updateForm("author", value)} placeholder="이름" />
              <TextInput label="작성일" type="date" value={form.date} onChange={(value) => updateForm("date", value)} />
              <VersionDisplay value={form.rev} activeStandard={activeStandard} />
              <TextInput label="예상 소요시간" value={form.duration} onChange={(value) => updateForm("duration", value)} placeholder="예: 1~2시간" />
              <TextInput label="작업 인원" value={form.people} onChange={(value) => updateForm("people", value)} placeholder="예: 2인 1조" />
              <TextArea label="작업 목적" value={form.purpose} onChange={(value) => updateForm("purpose", value)} span={3} />
            </div>
            <SystemOptionsEditor
              options={systemOptions}
              selected={form.system}
              newValue={newSystemOption}
              onNewValueChange={setNewSystemOption}
              onAdd={addSystemOption}
              onDelete={deleteSystemOption}
            />
            <div className="panel-actions">
              <button type="button" className="button ghost" onClick={() => setCurrentStep(3)}>
                SOP 보관함
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(5)}>
                다음
              </button>
            </div>
          </Section>
        )}

        {!needsLogin && currentStep === 5 && (
          <Section title="작업 조건 및 위험 판단" icon={AlertTriangle}>
            <div className="form-grid">
              <SelectField label="정지/전환 조건" value={form.shutdownMode} onChange={(value) => updateForm("shutdownMode", value)} options={SHUTDOWN_MODES} />
              <SelectField label="작업허가" value={form.permit} onChange={(value) => updateForm("permit", value)} options={PERMIT_OPTIONS} />
              <SelectField label="LOTO" value={form.loto} onChange={(value) => updateForm("loto", value)} options={LOTO_OPTIONS} />
              <SelectField label="초기 판단" value={form.judgement} onChange={(value) => updateForm("judgement", value)} options={JUDGEMENT_OPTIONS} />
              <TextArea label="현재 설비 상태" value={form.operationState} onChange={(value) => updateForm("operationState", value)} span={2} />
              <TextArea label="공구/계측기" value={form.toolsText} onChange={(value) => updateForm("toolsText", value)} placeholder="쉼표 또는 줄바꿈으로 입력" />
              <TextArea label="예비품/자재" value={form.sparesText} onChange={(value) => updateForm("sparesText", value)} placeholder="쉼표 또는 줄바꿈으로 입력" />
              <TextArea label="중요 포인트" value={form.notes} onChange={(value) => updateForm("notes", value)} span={3} />
            </div>

            <div className="risk-block">
              <div className="field-label">주요 위험요인</div>
              <RiskSelector selected={form.risks} onToggle={toggleRisk} />
            </div>

            <PpeSelector selected={normalizePpeSelection(form.ppe)} recommended={recommendedPpe} onToggle={togglePpe} />

            <div className="panel-actions">
              <button type="button" className="button ghost" onClick={() => setCurrentStep(4)}>
                이전
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(6)}>
                다음
              </button>
            </div>
          </Section>
        )}

        {!needsLogin && currentStep === 6 && (
          <Section title="초안 생성" icon={Sparkles}>
            <div className="draft-summary">
              <div>
                <span>작업명</span>
                <strong>{form.title || "-"}</strong>
              </div>
              <div>
                <span>조건</span>
                <strong>{form.shutdownMode} · {form.permit} · LOTO {form.loto}</strong>
              </div>
              <div>
                <span>위험요인</span>
                <strong>{form.risks.length ? form.risks.join(", ") : "-"}</strong>
              </div>
              <div>
                <span>보호구</span>
                <strong>{normalizePpeSelection(form.ppe).length ? normalizePpeSelection(form.ppe).join(", ") : "-"}</strong>
              </div>
            </div>

            <div className="generate-panel">
              <Sparkles size={26} />
              <div>
                <h3>판단 기준, 절차, 중단 기준, 완료 기준을 한 번에 작성합니다.</h3>
                <p>생성 후 모든 문구는 상세 편집 단계에서 수정할 수 있습니다.</p>
              </div>
              <button type="button" className="button accent" onClick={createDraft}>
                <Sparkles size={16} />
                초안 생성
              </button>
            </div>

            <div className="panel-actions">
              <button type="button" className="button ghost" onClick={() => setCurrentStep(5)}>
                이전
              </button>
            </div>
          </Section>
        )}

        {!needsLogin && currentStep === 7 && (
          <div className="edit-stack">
            {saveMessage && <div className="save-message">{saveMessage}</div>}
            <Section
              title="작업 전 판단 기준"
              icon={ClipboardCheck}
              actions={
                <button type="button" className="button ghost" onClick={saveStandard} disabled={!isDraftReady}>
                  <Save size={16} />
                  표준서 저장
                </button>
              }
            >
              <EditableTable
                columns={[
                  { key: "item", label: "확인 항목", width: "160px" },
                  { key: "criteria", label: "판단 기준", rows: 2 },
                ]}
                rows={draft.preChecks}
                onChange={(id, key, value) => updateRows("preChecks", id, key, value)}
                onAdd={() => addRow("preChecks", { item: "신규 항목", criteria: "" })}
                onRemove={(id) => removeRow("preChecks", id)}
                onMove={(id, dir) => moveDraftRow("preChecks", id, dir)}
              />
            </Section>

            <Section title="작업 절차" icon={ListChecks}>
              <EditableTable
                columns={[
                  { key: "tag", label: "구분", type: "select", options: PROC_TAGS, width: "110px" },
                  { key: "action", label: "작업 내용", rows: 2 },
                  { key: "note", label: "비고", rows: 2 },
                ]}
                rows={draft.steps}
                onChange={(id, key, value) => updateRows("steps", id, key, value)}
                onAdd={() => addRow("steps", { tag: "확인", action: "", note: "" })}
                onRemove={(id) => removeRow("steps", id)}
                onMove={(id, dir) => moveDraftRow("steps", id, dir)}
              />
            </Section>

            <Section title="점검 항목 및 판정 기준" icon={ClipboardCheck}>
              <EditableTable
                columns={[
                  { key: "item", label: "점검 항목", width: "150px" },
                  { key: "type", label: "유형", width: "100px" },
                  { key: "criteria", label: "판정 기준", rows: 2 },
                  { key: "method", label: "확인 방법", rows: 2 },
                ]}
                rows={draft.inspectionCriteria}
                onChange={(id, key, value) => updateRows("inspectionCriteria", id, key, value)}
                onAdd={() => addRow("inspectionCriteria", { item: "", type: "기타", criteria: "", method: "" })}
                onRemove={(id) => removeRow("inspectionCriteria", id)}
                onMove={(id, dir) => moveDraftRow("inspectionCriteria", id, dir)}
              />
            </Section>

            <div className="two-column">
              <Section title="작업 중단 기준" icon={AlertTriangle}>
                <EditableList
                  rows={draft.stopCriteria}
                  onChange={(id, key, value) => updateRows("stopCriteria", id, key, value)}
                  onAdd={() => addRow("stopCriteria", { text: "" })}
                  onRemove={(id) => removeRow("stopCriteria", id)}
                  onMove={(id, dir) => moveDraftRow("stopCriteria", id, dir)}
                />
              </Section>

              <Section title="완료 기준" icon={ShieldCheck}>
                <EditableList
                  rows={draft.completionCriteria}
                  onChange={(id, key, value) => updateRows("completionCriteria", id, key, value)}
                  onAdd={() => addRow("completionCriteria", { text: "" })}
                  onRemove={(id) => removeRow("completionCriteria", id)}
                  onMove={(id, dir) => moveDraftRow("completionCriteria", id, dir)}
                />
              </Section>
            </div>

            <Section title="비정상 상황 대응 및 결과 기록" icon={FileText}>
              <EditableList
                rows={draft.abnormalActions}
                onChange={(id, key, value) => updateRows("abnormalActions", id, key, value)}
                onAdd={() => addRow("abnormalActions", { text: "" })}
                onRemove={(id) => removeRow("abnormalActions", id)}
                onMove={(id, dir) => moveDraftRow("abnormalActions", id, dir)}
              />
              <div className="spacer" />
              <EditableTable
                columns={[
                  { key: "field", label: "기록 항목", width: "150px" },
                  { key: "value", label: "기록 내용", rows: 2 },
                ]}
                rows={draft.resultRecords}
                onChange={(id, key, value) => updateRows("resultRecords", id, key, value)}
                onAdd={() => addRow("resultRecords", { field: "", value: "" })}
                onRemove={(id) => removeRow("resultRecords", id)}
                onMove={(id, dir) => moveDraftRow("resultRecords", id, dir)}
              />
            </Section>

            <div className="panel-actions">
              <button type="button" className="button ghost" onClick={() => setCurrentStep(6)}>
                이전
              </button>
              <button type="button" className="button ghost" onClick={saveStandard} disabled={!isDraftReady}>
                <Save size={16} />
                표준서 저장
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(8)}>
                오늘 작업 출력
              </button>
            </div>
          </div>
        )}

        {!needsLogin && currentStep === 8 && (
          <Section
            title={docTab === "standard" ? "표준서 출력" : "오늘 작업 출력"}
            icon={Printer}
            actions={
              <div className="panel-actions">
                <button type="button" className="button ghost" onClick={saveStandard} disabled={!isDraftReady}>
                  <Save size={16} />
                  표준서 저장
                </button>
                <button type="button" className="button primary" onClick={() => window.print()} disabled={!isDraftReady}>
                  <Printer size={16} />
                  인쇄/PDF
                </button>
              </div>
            }
          >
            {!isDraftReady ? (
              <div className="empty-card">
                <Sparkles size={24} />
                <p>초안을 먼저 생성하세요.</p>
                <button type="button" className="button primary" onClick={() => setCurrentStep(6)}>
                  초안 생성으로 이동
                </button>
              </div>
            ) : (
              <>
                {saveMessage && <div className="save-message">{saveMessage}</div>}
                <div className="today-note">
                  {docTab === "standard"
                    ? "표준서는 보관용 원본입니다. 저장해두면 이후 작업일에 오늘 작업 문서를 바로 출력할 수 있습니다."
                    : "오늘 작업용 문서입니다. 보관된 표준서를 기준으로 TBM, 체크리스트, 결과지를 출력합니다."}
                </div>
                <RevisionHistoryPanel standard={activeStandard} currentRev={form.rev} selectedRevisionRev={selectedRevisionRev} onSelect={loadRevision} />
                <div className="doc-tabs">
                  {DOC_TABS.map(({ key, label, icon: Icon }) => (
                    <button type="button" key={key} className={docTab === key ? "active" : ""} onClick={() => setDocTab(key)}>
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="preview-surface">{doc}</div>
              </>
            )}
          </Section>
        )}
      </main>
    </div>
  );
}
