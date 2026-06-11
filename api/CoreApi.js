/******************************************************************
 * G-WORLD Backend - Core API
 *
 * 【SECTION B-4〜B-9】Core 層の公開 API（フロントから呼ばれる）
 *
 * 含まれる関数：
 *   - Core_boot          : boot bundle取得（コース・設定をまとめて返す）
 *   - Core_health        : 疎通確認
 *   - Core_linkBackup    : ゲスト→保全済み 移行（データ保全連携の中核）
 *   - Core_ping          : 利用回数の同期記録
 *   - Core_getProfile    : プロフィール取得
 *   - Core_updateProfile : プロフィール更新
 *
 * 【呼出契約】
 *   全関数は (payload, meta) の2引数で受け、{ok: true/false, ...} を返す。
 *   Router.gs の _routeAction から呼ばれる前提。
 *
 * 【依存】
 *   - services_SheetService.gs : _sheet, _headerMap, _getConfig, _emptyRow, _safeJsonParse
 *   - services_IdentityService.gs : _resolveOrCreateIdentity, _findIdentity, _identityRowToObject
 *   - repositories_GolfRepository.gs : _loadAllCourses
 *   - repositories_BackupRepository.gs : _generateBackedUpId, _appendBackupLink, _findBackupLinkByProviderUid, _restoreFromBackup, _createBackedUpIdentity, _updatePlayersGwUserId
 *   - utils_Utils.gs : LOCK_WAIT_MS
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION B-4】Core_boot - boot bundle 取得
//
// 設計意図【既存 getBootBundle のリファクタ】：
//   - コース一覧 + 現在アクティブコース + isFinalized をまとめて返す
//   - フロントの GW.Core.Api.call('gland.boot' or 'core.boot') から呼ばれる
//   - identity への自動登録もここで行う（ユーザーが初めて通信した瞬間に記録）
// ════════════════════════════════════════════════════════════════

/**
 * boot bundle 取得
 *
 * @param {Object} payload - {} （現在は空でOK）
 * @param {Object} meta    - { gwUserId, deviceId, useCount, state }
 * @returns {Object} { ok, courses, activeCourseId, isFinalized, identity }
 */
function Core_boot(payload, meta) {
  payload = payload || {};
  meta    = meta    || {};

  // ── identity への自動登録（初回のみ） ──
  var identity = null;
  if (meta.gwUserId) {
    identity = _resolveOrCreateIdentity(meta.gwUserId, meta);
  }

  // ── Courses シートからコース一覧を取得 ──
  var courseList = _loadAllCourses();
  if (!courseList || courseList.length === 0) {
    return {
      ok:    false,
      error: 'Coursesシートにデータがありません。先に setupInitialSheets() を実行してください',
      code:  'E_NO_COURSES',
      courses: []
    };
  }

  // ── アクティブコース・isFinalized 取得 ──
  var activeId = _getConfig('active_course_id') ||
                 (courseList[0] ? courseList[0].id : '');
  var isFinalized = _getConfig('finalized') === 'true';

  return {
    ok:             true,
    courses:        courseList,
    activeCourseId: activeId,
    isFinalized:    isFinalized,
    identity:       identity,
    bundleVersion:  'v1.0.0',
    apiVersion:     API_VERSION,
    serverTime:     new Date().toISOString()
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-5】Core_health - 疎通確認
//
// 設計意図：
//   - フロントから「サーバが生きているか」を確認するための軽量API
//   - 通信できれば必ず ok:true を返す
// ════════════════════════════════════════════════════════════════
function Core_health(payload, meta) {
  return {
    ok:         true,
    version:    APP_VERSION,
    apiVersion: API_VERSION,
    serverTime: new Date().toISOString(),
    yourGwId:   (meta && meta.gwUserId) || ''
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-6】★ Core_linkBackup - データ保全連携の中核
//
// 設計意図【設計憲法・第7条】：
//   - "ゲストモード" → "データ保全済み" への移行を実行
//   - 旧ID(GW-G-*) → 新ID(GW-B-*) への変換
//   - backup_links シートに永久記録（データ復元の鍵）
//   - Players / Scores / History の player_id 紐付きを切らないため、
//     既存データは旧IDのまま維持し、identity.gw_user_id だけを書き換える
//
// 【※注意】
//   現バージョンでは実プロバイダ(Google/LINE/Apple)との連携は実装せず、
//   この関数はインターフェース確定用のスタブ。
//   フロント側も link-backup ボタンは "次期リリース予定" としている。
//   将来 Google SDK 等を導入する際の差し替えポイントとなる。
// ════════════════════════════════════════════════════════════════

/**
 * ゲスト → 保全済み への移行
 *
 * @param {Object} payload
 * @param {string} payload.oldGwUserId  - 旧ID (GW-G-*)
 * @param {string} payload.provider     - 'google' | 'line' | 'apple'
 * @param {string} payload.providerUid  - プロバイダ側UID
 * @param {string} payload.deviceId
 * @param {Object} payload.profile      - { nickname, realName, ... }
 * @param {Object} meta
 * @returns {Object} { ok, newGwUserId, linkedAt }
 */
function Core_linkBackup(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    var oldId       = String(payload.oldGwUserId || '');
    var provider    = String(payload.provider || '');
    var providerUid = String(payload.providerUid || '');
    var deviceId    = String(payload.deviceId || (meta && meta.deviceId) || '');
    var profile     = payload.profile || {};

    if (!oldId) return { ok: false, error: 'oldGwUserId が必要です' };
    if (!provider) return { ok: false, error: 'provider が必要です' };

    // ── 同じ providerUid で既に保全済みなら、復元処理に切替 ──
    var existing = _findBackupLinkByProviderUid(provider, providerUid);
    if (existing) {
      // 既存ユーザーの機種変更 → 新端末に旧IDを引き継ぐ
      return _restoreFromBackup(existing.newGwUserId, deviceId);
    }

    // ── 新規 GW-B-* IDを発行（連番8桁） ──
    var newId = _generateBackedUpId();

    // ── identity の旧IDを更新（gw_user_id を書き換え + state変更） ──
    var idInfo = _findIdentity(oldId);
    if (idInfo) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['gw_user_id']     + 1).setValue(newId);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['state']          + 1).setValue('backed_up');
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['auth_provider']  + 1).setValue(provider);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['provider_uid']   + 1).setValue(providerUid);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());
      if (profile.nickname) {
        idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['display_name'] + 1).setValue(profile.nickname);
      }
      if (profile.realName) {
        idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['real_name'] + 1).setValue(profile.realName);
      }
    } else {
      // identity 行が無ければ新規作成（通常はあり得ないが念のため）
      _createBackedUpIdentity(newId, provider, providerUid, deviceId, profile);
    }

    // ── backup_links に永久記録 ──
    _appendBackupLink(oldId, newId, provider, providerUid, deviceId);

    // ── Players シートの gw_user_id 列も更新 ──
    _updatePlayersGwUserId(oldId, newId);

    return {
      ok:          true,
      newGwUserId: newId,
      linkedAt:    new Date().toISOString(),
      message:     'データを保全しました'
    };
  } catch (err) {
    return { ok: false, error: 'バックアップ連携に失敗しました: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-7】Core_ping - 利用回数の同期記録
//
// 設計意図：
//   - フロントの利用回数 (use_count) をサーバ側 identity に反映
//   - フロントだけで管理するとデバイス紛失時に消えるため、サーバにも記録
//   - 高頻度で呼ばれることを想定し、軽量に
// ════════════════════════════════════════════════════════════════
function Core_ping(payload, meta) {
  if (!meta || !meta.gwUserId) {
    return { ok: false, error: 'gwUserId が必要です' };
  }
  // _resolveOrCreateIdentity が last_active_at + use_count を自動更新するため、
  // ここで明示的に呼ぶだけで足りる
  _resolveOrCreateIdentity(meta.gwUserId, meta);
  return { ok: true, serverTime: new Date().toISOString() };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-8】Core_getProfile - プロフィール取得
// ════════════════════════════════════════════════════════════════
function Core_getProfile(payload, meta) {
  var gwUserId = (meta && meta.gwUserId) || payload.gwUserId || '';
  if (!gwUserId) return { ok: false, error: 'gwUserId が必要です' };

  var idInfo = _findIdentity(gwUserId);
  if (!idInfo) {
    return {
      ok:     true,
      exists: false,
      profile: null
    };
  }
  var p = _identityRowToObject(idInfo.row, idInfo.map);
  return {
    ok:     true,
    exists: true,
    profile: {
      gwUserId:    p.gwUserId,
      displayName: p.displayName,
      realName:    p.realName,
      state:       p.state,
      useCount:    p.useCount,
      createdAt:   p.createdAt,
      lastActiveAt: p.lastActiveAt
    }
  };
}


// ════════════════════════════════════════════════════════════════
// 【SECTION B-9】Core_updateProfile - プロフィール更新
// ════════════════════════════════════════════════════════════════
function Core_updateProfile(payload, meta) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);

    var gwUserId = (meta && meta.gwUserId) || payload.gwUserId || '';
    if (!gwUserId) return { ok: false, error: 'gwUserId が必要です' };

    var idInfo = _findIdentity(gwUserId);
    if (!idInfo) {
      // 存在しなければ新規作成（自動的に登録）
      _resolveOrCreateIdentity(gwUserId, meta);
      idInfo = _findIdentity(gwUserId);
      if (!idInfo) return { ok: false, error: 'identity の作成に失敗しました' };
    }

    // ── 更新可能フィールドのみ反映 ──
    if (payload.displayName !== undefined) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['display_name'] + 1)
                  .setValue(String(payload.displayName));
    }
    if (payload.realName !== undefined) {
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['real_name'] + 1)
                  .setValue(String(payload.realName));
    }
    idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());

    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'updateProfile失敗: ' + String(err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
