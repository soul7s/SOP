import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  ClipboardCheck,
  Edit3,
  FileText,
  History,
  Library,
  ListChecks,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

const WORK_TYPES = ["점검", "교체", "운전", "기타"];
const DEFAULT_SYSTEMS = ["용수", "에어", "산소/질소", "DIW", "배관", "시설물", "전기", "공조", "기타"];
const SHUTDOWN_MODES = ["운전 중 가능", "예비기 전환 후 가능", "부분정지 필요", "전체정지 필요"];
const PERMIT_OPTIONS = ["불필요", "일반작업허가", "화기작업허가", "밀폐공간허가", "전기작업허가", "고소작업허가"];
const LOTO_OPTIONS = ["불필요", "필요", "조건부 필요"];
const JUDGEMENT_OPTIONS = ["즉시조치", "계획정비 반영", "모니터링 유지", "외부전문가 확인"];
const RISK_OPTIONS = ["전기", "압력", "고온", "저온", "회전체", "화학물질", "고소", "중량물", "누출", "소음", "협착"];
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
    toolsText: "",
    sparesText: "",
    notes: "",
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

function generateDraft(form) {
  const riskItems = form.risks.map((risk) => ({
    risk,
    check: riskLibrary[risk]?.check || `${risk} 관련 위험요인을 확인한다.`,
    control: riskLibrary[risk]?.control || `${risk} 위험 저감 조치를 완료한다.`,
  }));

  const ppe = [...new Set(form.risks.map((risk) => riskLibrary[risk]?.ppe).filter(Boolean))];
  const tools = [...splitText(form.toolsText), ...ppe].filter(Boolean);
  const spares = splitText(form.sparesText);

  return {
    preChecks: [
      { item: "작업 필요성", criteria: `${form.judgement} 대상으로 판단하고, 운전 안정성 영향 여부를 확인한다.` },
      { item: "운전 영향", criteria: `${form.shutdownMode}. 운전부서와 전환/정지 시점 및 복구 기준을 합의한다.` },
      { item: "작업허가", criteria: `${form.permit} 적용 여부를 확인하고 허가서 조건을 작업 전에 공유한다.` },
      { item: "LOTO", criteria: `${form.loto}. 전기/압력/자동기동 등 잔류에너지 차단 범위를 명확히 한다.` },
      { item: "예비품", criteria: spares.length ? `${spares.join(", ")} 보유 여부와 규격 일치 여부를 확인한다.` : "필요 예비품과 대체 가능 여부를 확인한다." },
      { item: "중단 권한", criteria: "현장 조건이 표준서와 다르거나 위험이 증가하면 작업자가 즉시 중단할 수 있다." },
    ],
    safetyRisks: riskItems,
    tools,
    steps: [
      { tag: "확인", action: "작업 요청 내용과 최근 운전 이력을 확인한다.", note: form.operationState || "운전 상태, 알람, 이전 조치 이력을 확인" },
      { tag: "확인", action: "현장 설비 TAG와 작업 대상 범위를 대조한다.", note: form.tag ? `${form.tag} 대상 여부 확인` : "동일 계통 설비 오인 방지" },
      { tag: "안전주의", action: "운전부서와 정지/전환/복구 조건을 협의한다.", note: form.shutdownMode },
      { tag: "안전주의", action: "작업허가, LOTO, 보호구 착용 상태를 확인한다.", note: `${form.permit} / LOTO ${form.loto}` },
      { tag: "측정", action: "초기 상태를 측정하고 사진 또는 수치로 기록한다.", note: "전류, 온도, 진동, 압력, 누설 상태" },
      { tag: "조작", action: "점검 범위 내에서 분해, 조정, 윤활, 체결 확인 등 필요한 조치를 수행한다.", note: "원인 불명 시 임의 조립/가공 금지" },
      { tag: "확인", action: "조립 전 이물질, 방향성, 체결상태, 보호커버 복구 여부를 확인한다.", note: "공구와 자재 회수 포함" },
      { tag: "측정", action: "시운전 후 운전값을 재측정하고 작업 전 상태와 비교한다.", note: "이상음, 진동, 온도, 전류, 누설 확인" },
      { tag: "확인", action: "운전부서에 결과를 인계하고 후속 점검 필요 여부를 등록한다.", note: "재발 가능성 및 관찰 주기 명시" },
    ],
    inspectionCriteria: makeDefaultInspection(form),
    stopCriteria: [
      ...form.risks.map((risk) => riskLibrary[risk]?.stop).filter(Boolean),
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
  const normalized = [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
  return normalized.length ? normalized : ["기타"];
}

function makeRevision(form, draft, savedAt, summary) {
  return {
    id: `${form.rev || "Rev.01"}-${savedAt}`,
    rev: form.rev || "Rev.01",
    savedAt,
    author: form.author || "",
    summary,
    form: { ...form },
    draft: normalizeDraft(draft),
  };
}

function normalizeRevision(revision) {
  return {
    ...revision,
    id: revision.id || `${revision.rev || "Rev.01"}-${revision.savedAt || makeId()}`,
    rev: revision.rev || revision.form?.rev || "Rev.01",
    savedAt: revision.savedAt || new Date().toISOString(),
    author: revision.author || revision.form?.author || "",
    summary: revision.summary || "이력 등록",
    form: { ...defaultForm, ...revision.form, rev: revision.rev || revision.form?.rev || "Rev.01" },
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
  const normalizedDraft = normalizeDraft(draft);
  const revision = makeRevision(form, normalizedDraft, now, options.summary || summarizeChange(previous, form, normalizedDraft));
  const previousRevisions = previous ? getRevisionHistory(previous) : [];
  const revisions = [...previousRevisions.filter((item) => item.rev !== revision.rev), revision];
  return {
    id: id || makeId(),
    title: form.title || "작업명 미입력",
    tag: form.tag || "",
    equipment: form.equipment || "",
    system: form.system || "",
    rev: form.rev || "Rev.01",
    savedAt: now,
    form: { ...form },
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
    const form = { ...defaultForm, ...standard.form, rev: standard.rev || standard.form?.rev || "Rev.01" };
    const draft = normalizeDraft(standard.draft || emptyDraft);
    return {
      ...standard,
      title: standard.title || form.title || "작업명 미입력",
      tag: standard.tag || form.tag || "",
      equipment: standard.equipment || form.equipment || "",
      system: standard.system || form.system || "",
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

function StepRail({ currentStep, setCurrentStep, isDraftReady, standardsCount }) {
  const steps = ["표준서 보관함", "기본 정보", "작업 조건", "초안 생성", "상세 편집", "오늘 작업 출력"];

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-logo">Plant Utility</div>
        <h1>작업표준서 생성기</h1>
      </div>

      <nav className="steps">
        {steps.map((step, index) => (
          <button
            key={step}
            className={`step-button ${currentStep === index ? "active" : ""} ${index < currentStep ? "done" : ""}`}
            onClick={() => setCurrentStep(index)}
            type="button"
          >
            <span>{index < currentStep ? "✓" : index + 1}</span>
            {step}
          </button>
        ))}
      </nav>

      <div className={`status-box ${isDraftReady ? "ready" : ""}`}>
        <Sparkles size={16} />
        <div>
          <strong>{isDraftReady ? "표준서 편집 중" : `${standardsCount}건 보관됨`}</strong>
          <p>{isDraftReady ? "저장 후 오늘 작업 문서를 바로 출력할 수 있습니다." : "보관된 표준서를 선택하거나 새로 작성하세요."}</p>
        </div>
      </div>
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
                  보기
                </button>
                <button type="button" className="button primary" onClick={() => onLoadToday(standard)}>
                  <CalendarCheck size={16} />
                  오늘 작업
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

function DocHeader({ form, docType = "비정형 작업 표준서" }) {
  return (
    <>
      <div className="doc-header">
        <div>
          <div className="doc-kicker">Work Standard · {docType}</div>
          <h2>{form.title || "작업명 미입력"}</h2>
          <p>
            {form.equipment || "대상 설비"} · {form.tag || "TAG 미입력"}
          </p>
        </div>
        <div className="rev-badge">
          <span>REV</span>
          <strong>{form.rev}</strong>
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
      <DocHeader form={form} docType="비정형 작업 표준서" />

      <div className="doc-body">
        <DocSection title="작업 목적">
          <p className="doc-text">{form.purpose || "-"}</p>
          {form.notes && <p className="doc-note">{form.notes}</p>}
        </DocSection>

        <DocSection title="작업 전 판단 기준">
          <SimpleTable
            columns={["확인 항목", "판단 기준"]}
            rows={draft.preChecks.map((row) => [row.item, row.criteria])}
          />
        </DocSection>

        <DocSection title="주요 위험요인 및 안전조치">
          <SimpleTable
            columns={["위험요인", "확인 내용", "조치"]}
            rows={draft.safetyRisks.map((row) => [row.risk, row.check, row.control])}
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
          </div>
        </DocSection>

        <DocSection title="TBM 확인 사항">
          <CheckRows
            rows={[
              "작업 대상 설비 TAG와 차단 범위를 전원이 확인했다.",
              "운전부서와 정지, 전환, 복구 조건을 공유했다.",
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
          <CheckRows rows={draft.preChecks.map((row) => `${row.item}: ${row.criteria}`)} />
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
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState(makeBlankForm);
  const [draft, setDraft] = useState(normalizeDraft(emptyDraft));
  const [docTab, setDocTab] = useState("standard");
  const [standards, setStandards] = useState([]);
  const [activeStandardId, setActiveStandardId] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [selectedRevisionRev, setSelectedRevisionRev] = useState(null);
  const [systemOptions, setSystemOptions] = useState(DEFAULT_SYSTEMS);
  const [newSystemOption, setNewSystemOption] = useState("");
  const [examplesSeeded, setExamplesSeeded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm(makeBlankForm());
        setDraft(normalizeDraft(emptyDraft));
        setDocTab("standard");
        setSystemOptions(normalizeSystemOptions(parsed.systemOptions));
        const parsedStandards = parsed.standards || [];
        const seeded = Boolean(parsed.examplesSeeded);
        const syncedStandards = syncExistingExampleStandards(parsedStandards);
        setStandards(seeded ? syncedStandards : mergeExampleStandards(syncedStandards));
        setActiveStandardId(null);
        setExamplesSeeded(true);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        setForm(makeBlankForm());
        setDraft(normalizeDraft(emptyDraft));
        setSystemOptions(DEFAULT_SYSTEMS);
        setStandards(mergeExampleStandards([]));
        setExamplesSeeded(true);
      }
    } else {
      setForm(makeBlankForm());
      setDraft(normalizeDraft(emptyDraft));
      setSystemOptions(DEFAULT_SYSTEMS);
      setStandards(mergeExampleStandards([]));
      setExamplesSeeded(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, draft, docTab, standards, activeStandardId, examplesSeeded, systemOptions }));
  }, [form, draft, docTab, standards, activeStandardId, examplesSeeded, systemOptions, loaded]);

  const isDraftReady = draft.steps.length > 0 || draft.preChecks.length > 0;
  const activeStandard = standards.find((standard) => standard.id === activeStandardId);
  const isViewingPastRevision = Boolean(selectedRevisionRev && activeStandard && selectedRevisionRev !== activeStandard.rev);
  const visibleSystemOptions = form.system && !systemOptions.includes(form.system) ? [form.system, ...systemOptions] : systemOptions;

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMessage("");
  };

  const toggleRisk = (risk) => {
    setForm((prev) => ({
      ...prev,
      risks: prev.risks.includes(risk) ? prev.risks.filter((item) => item !== risk) : [...prev.risks, risk],
    }));
    setSaveMessage("");
  };

  const createDraft = () => {
    setDraft(normalizeDraft(generateDraft(form)));
    setSaveMessage("");
    setCurrentStep(4);
  };

  const createNewStandard = () => {
    setForm(makeBlankForm());
    setDraft(normalizeDraft(emptyDraft));
    setActiveStandardId(null);
    setSelectedRevisionRev(null);
    setDocTab("standard");
    setSaveMessage("");
    setCurrentStep(1);
  };

  const loadStandard = (standard, mode) => {
    const loadedForm = { ...defaultForm, ...standard.form };
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
      setCurrentStep(5);
    } else {
      setDocTab("standard");
      setCurrentStep(4);
    }
  };

  const loadRevision = (revision) => {
    setForm({ ...defaultForm, ...revision.form });
    if (revision.form?.system && !systemOptions.includes(revision.form.system)) {
      setSystemOptions((prev) => normalizeSystemOptions([revision.form.system, ...prev]));
    }
    setDraft(normalizeDraft(revision.draft || emptyDraft));
    setSelectedRevisionRev(revision.rev);
    setDocTab("standard");
    setCurrentStep(5);
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
      <StepRail currentStep={currentStep} setCurrentStep={setCurrentStep} isDraftReady={isDraftReady} standardsCount={standards.length} />

      <main className="main">
        <header className="topbar">
          <div>
            <span>Utility Maintenance</span>
            <h2>{form.title || "작업표준서 생성기"}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button" className="button ghost" onClick={() => setCurrentStep(0)}>
              <Library size={16} />
              보관함
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

        {currentStep === 0 && (
          <StandardLibrary
            standards={standards}
            onCreateNew={createNewStandard}
            onView={(standard) => loadStandard(standard, "view")}
            onLoadToday={(standard) => loadStandard(standard, "today")}
            onEdit={(standard) => loadStandard(standard, "edit")}
            onDelete={deleteStandard}
          />
        )}

        {currentStep === 1 && (
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
              <button type="button" className="button ghost" onClick={() => setCurrentStep(0)}>
                보관함
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(2)}>
                다음
              </button>
            </div>
          </Section>
        )}

        {currentStep === 2 && (
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

            <div className="panel-actions">
              <button type="button" className="button ghost" onClick={() => setCurrentStep(1)}>
                이전
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(3)}>
                다음
              </button>
            </div>
          </Section>
        )}

        {currentStep === 3 && (
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
              <button type="button" className="button ghost" onClick={() => setCurrentStep(2)}>
                이전
              </button>
            </div>
          </Section>
        )}

        {currentStep === 4 && (
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
              <button type="button" className="button ghost" onClick={() => setCurrentStep(3)}>
                이전
              </button>
              <button type="button" className="button ghost" onClick={saveStandard} disabled={!isDraftReady}>
                <Save size={16} />
                표준서 저장
              </button>
              <button type="button" className="button primary" onClick={() => setCurrentStep(5)}>
                오늘 작업 출력
              </button>
            </div>
          </div>
        )}

        {currentStep === 5 && (
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
                <button type="button" className="button primary" onClick={() => setCurrentStep(3)}>
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
