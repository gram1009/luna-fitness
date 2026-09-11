/**
 * 루나의 운동일지 — Apps Script 백엔드
 *
 * 이 스크립트가 연결된 구글시트에는 아래 4개 탭이 있어야 합니다.
 *   Item          : 항목ID / 카테고리 / 항목명 / 세부사항
 *   Weekly_Plan   : 요일 / 순서 / 항목ID
 *   Log           : 날짜 / 요일 / 항목ID / 체크여부 / 체크시각   (자동 기록, 헤더만 있으면 됨)
 *   Weight_Log    : 날짜 / 시간대 / 체중 / 메모                  (자동 기록, 헤더만 있으면 됨)
 *   Profile_Data  : (선택) Key / Value 2열 형식                 (목표 요약, 있으면 같이 내려줌)
 *
 * 배포 방법
 *   1) 확장 프로그램 → Apps Script 에서 이 파일 내용을 Code.gs 로 붙여넣기
 *   2) 배포 → 새 배포 → 유형: 웹 앱
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자 (Anyone)
 *   3) 배포 후 나오는 웹 앱 URL을 index.html 의 SCRIPT_URL 에 붙여넣기
 *
 * CORS 참고
 *   Apps Script 웹앱은 브라우저의 preflight(OPTIONS) 요청을 처리하지 못합니다.
 *   그래서 프론트엔드에서 POST 보낼 때 Content-Type을 'text/plain'으로 보내
 *   preflight 자체가 발생하지 않게 우회합니다. (index.html에 이미 반영됨)
 */

const SHEET_ITEM = 'Item';
const SHEET_PLAN = 'Weekly_Plan';
const SHEET_LOG = 'Log';
const SHEET_WEIGHT = 'Weight_Log';
const SHEET_PROFILE = 'Profile_Data';

// JS의 Date.getDay() 기준 (0=일요일)에 맞춘 한글 요일 매핑
const DAY_MAP = ['일', '월', '화', '수', '목', '금', '토'];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getToday';
  let result;
  try {
    if (action === 'getToday') {
      result = getTodayData(e.parameter.date);
    } else if (action === 'getProfile') {
      result = getProfile();
    } else if (action === 'getWeightHistory') {
      result = getWeightHistory(Number(e.parameter.days) || 30);
    } else if (action === 'getStats') {
      result = getStats(Number(e.parameter.days) || 7);
    } else {
      result = { error: 'unknown action: ' + action };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return jsonOutput(result);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ error: 'invalid request body' });
  }

  let result;
  try {
    if (body.action === 'checkItem') {
      result = checkItem(body);
    } else if (body.action === 'logWeight') {
      result = logWeight(body);
    } else {
      result = { error: 'unknown action: ' + body.action };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return jsonOutput(result);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('시트를 찾을 수 없음: ' + name);
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function formatDateKey(date) {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
}

/**
 * 오늘(또는 지정 날짜) 요일에 해당하는 전체 체크리스트 + 완료 여부
 */
function getTodayData(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  const dateKey = formatDateKey(date);
  const dayName = DAY_MAP[date.getDay()];

  const items = sheetToObjects(getSheet(SHEET_ITEM));
  const itemMap = {};
  items.forEach(it => (itemMap[it['항목ID']] = it));

  const plan = sheetToObjects(getSheet(SHEET_PLAN))
    .filter(r => r['요일'] === dayName)
    .sort((a, b) => Number(a['순서']) - Number(b['순서']));

  const logRows = sheetToObjects(getSheet(SHEET_LOG)).filter(r => {
    const d = r['날짜'] instanceof Date ? formatDateKey(r['날짜']) : r['날짜'];
    return d === dateKey;
  });
  const checkedMap = {};
  logRows.forEach(r => {
    checkedMap[r['항목ID']] = !!r['체크여부'];
  });

  const list = plan.map(p => {
    const item = itemMap[p['항목ID']] || {};
    return {
      id: p['항목ID'],
      order: Number(p['순서']),
      category: item['카테고리'] || '',
      name: item['항목명'] || p['항목ID'],
      detail: item['세부사항'] || '',
      checked: !!checkedMap[p['항목ID']],
    };
  });

  return { date: dateKey, day: dayName, items: list };
}

/**
 * 항목 체크/해제 → Log 시트에 upsert
 */
function checkItem(body) {
  const sheet = getSheet(SHEET_LOG);
  const date = body.date || formatDateKey(new Date());
  const day = body.day || DAY_MAP[new Date(date).getDay()];
  const itemId = body.itemId;
  const checked = !!body.checked;
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    const rDate = data[i][0] instanceof Date ? formatDateKey(data[i][0]) : data[i][0];
    if (rDate === date && data[i][2] === itemId) {
      rowIndex = i + 1; // 시트 행 번호(1-base)
      break;
    }
  }

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 4).setValue(checked);
    sheet.getRange(rowIndex, 5).setValue(checked ? now : '');
  } else {
    sheet.appendRow([date, day, itemId, checked, checked ? now : '']);
  }

  return { ok: true, itemId, checked };
}

/**
 * 체중 기록 추가
 */
function logWeight(body) {
  const sheet = getSheet(SHEET_WEIGHT);
  const date = body.date || formatDateKey(new Date());
  const weight = Number(body.weight);
  if (!weight || weight < 30 || weight > 250) {
    throw new Error('체중 값이 올바르지 않습니다');
  }
  sheet.appendRow([date, body.timeOfDay || '아침', weight, body.memo || '']);
  return { ok: true };
}

/**
 * 최근 N일 체중 이력 (그래프용)
 */
function getWeightHistory(days) {
  const rows = sheetToObjects(getSheet(SHEET_WEIGHT));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const history = rows
    .map(r => ({
      date: r['날짜'] instanceof Date ? formatDateKey(r['날짜']) : r['날짜'],
      timeOfDay: r['시간대'],
      weight: Number(r['체중']),
      memo: r['메모'] || '',
    }))
    .filter(r => r.date && new Date(r.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return { history };
}

/**
 * 최근 N일 진행률 + 연속 기록일수
 */
function getStats(days) {
  const plan = sheetToObjects(getSheet(SHEET_PLAN));
  const totalByDay = {}; // { '월': 24, '화': 24, ... }
  plan.forEach(p => {
    totalByDay[p['요일']] = (totalByDay[p['요일']] || 0) + 1;
  });

  const logRows = sheetToObjects(getSheet(SHEET_LOG));
  const doneByDate = {}; // { '2026-09-11': 3 }
  logRows.forEach(r => {
    if (!r['체크여부']) return;
    const d = r['날짜'] instanceof Date ? formatDateKey(r['날짜']) : r['날짜'];
    doneByDate[d] = (doneByDate[d] || 0) + 1;
  });

  const result = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = formatDateKey(d);
    const dayName = DAY_MAP[d.getDay()];
    const total = totalByDay[dayName] || 0;
    const done = doneByDate[dateKey] || 0;
    result.push({ date: dateKey, day: dayName, done, total });
  }

  const weekDone = result.reduce((s, r) => s + r.done, 0);
  const weekTotal = result.reduce((s, r) => s + r.total, 0);

  // 연속 기록일수: 오늘부터 거슬러 올라가며 "하나라도 체크한 날"이 끊기지 않은 일수
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = formatDateKey(d);
    if ((doneByDate[dateKey] || 0) > 0) {
      streak++;
    } else if (i === 0) {
      continue; // 오늘은 아직 하나도 안 했어도 스트릭이 끊긴 걸로 보지 않음
    } else {
      break;
    }
  }

  return { days: result, weekDone, weekTotal, streak };
}


function getProfile() {
  const sheet = getSheet(SHEET_PROFILE);
  const rows = sheet.getDataRange().getValues();
  const obj = {};
  rows.forEach(r => {
    if (r[0]) obj[r[0]] = r[1];
  });
  return obj;
}
