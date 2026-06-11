/******************************************************************
 * G-WORLD Backend - Backup Repository
 *
 * データ保全連携（ゲスト → 保全済み）の中核を支えるリポジトリ層
 *
 * 設計意図【設計憲法・第7条】：
 *   - "認証/ログイン" の語は使わず、"バックアップ" "データ保全" で統一
 *   - ゲストID (GW-G-*) → 保全済みID (GW-B-*) への移行
 *   - backup_links シートに永久記録（データ復元の鍵・編集禁止）
 *   - 既存の player_id 紐付けは絶対に壊さない（identity.gw_user_id のみ書換）
 *   - 同じプロバイダUIDで再連携時は「機種変更」と判定し、既存IDを引き継ぐ
 *
 * 含まれる関数：
 *   - _generateBackedUpId            : GW-B-* 連番ID発行（8桁ゼロパディング）
 *   - _appendBackupLink              : backup_links シートに永久記録
 *   - _findBackupLinkByProviderUid   : プロバイダUIDから既存リンクを検索
 *   - _restoreFromBackup             : 機種変更時の復元処理
 *   - _createBackedUpIdentity        : identity に直接 GW-B-* 行を作成
 *   - _updatePlayersGwUserId         : Players シートの gw_user_id を一括書換
 *
 * 【依存】
 *   - services_SheetService.gs    : _sheet, _headerMap, _emptyRow, _safeJsonParse
 *   - services_IdentityService.gs : _findIdentity
 *   - utils_Utils.gs              : _uuid
 *   - config_Config.gs            : SHEET_IDENTITY, SHEET_BACKUP_LINKS, SHEET_PLAYERS
 *
 * 【呼出元】
 *   - api_CoreApi.gs : Core_linkBackup から本ファイルの全6関数を呼出
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【GW-B-* ID 発行】
// ════════════════════════════════════════════════════════════════

/**
 * GW-B-* 連番ID発行
 *   - identity シートの既存 GW-B-* の最大番号+1
 *   - 8桁ゼロパディング（例：GW-B-00000123）
 *
 * 設計意図：
 *   ゲストID (GW-G-XXXX) はランダム8桁だったが、保全済みIDは
 *   「サポート問い合わせ時に口頭で伝えやすい」連番形式を採用。
 *   8桁 = 9999万人まで対応可能。
 *
 * @returns {string} 'GW-B-XXXXXXXX'
 */
function _generateBackedUpId() {
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var id = String(data[i][map['gw_user_id']] || '');
    if (id.indexOf('GW-B-') === 0) {
      var n = Number(id.substring(5));
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  var next = maxNum + 1;
  var padded = ('00000000' + next).slice(-8);
  return 'GW-B-' + padded;
}


// ════════════════════════════════════════════════════════════════
// 【backup_links シート操作】
// ════════════════════════════════════════════════════════════════

/**
 * backup_links に新規行を追加
 *   - データ復元の鍵となるため、絶対に削除しない
 *   - oldId / newId / provider / providerUid / deviceId / linkedAt の6項目を永久保存
 *
 * @param {string} oldId
 * @param {string} newId
 * @param {string} provider     - 'google' | 'line' | 'apple'
 * @param {string} providerUid  - プロバイダ側UID
 * @param {string} deviceId
 */
function _appendBackupLink(oldId, newId, provider, providerUid, deviceId) {
  var sh = _sheet(SHEET_BACKUP_LINKS);
  var map = _headerMap(sh);
  var row = _emptyRow(map);
  row[map['link_id']]         = _uuid('L');
  row[map['old_gw_user_id']]  = oldId;
  row[map['new_gw_user_id']]  = newId;
  row[map['linked_at']]       = new Date();
  row[map['provider']]        = provider;
  row[map['provider_uid']]    = providerUid;
  row[map['device_id']]       = deviceId;
  sh.appendRow(row);
}

/**
 * providerUid から既存 backup_link を検索
 *   - 同じプロバイダUIDで2回連携された場合 → 機種変更と判定
 *   - 最新順（逆順）にスキャンして最初に見つかったものを返す
 *
 * @param {string} provider
 * @param {string} providerUid
 * @returns {Object|null} { linkId, oldGwUserId, newGwUserId, linkedAt }
 */
function _findBackupLinkByProviderUid(provider, providerUid) {
  if (!provider || !providerUid) return null;
  var sh = _sheet(SHEET_BACKUP_LINKS);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  // 最新順にスキャンするため逆順
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][map['provider']]) === String(provider) &&
        String(data[i][map['provider_uid']]) === String(providerUid)) {
      return {
        linkId:      String(data[i][map['link_id']]),
        oldGwUserId: String(data[i][map['old_gw_user_id']]),
        newGwUserId: String(data[i][map['new_gw_user_id']]),
        linkedAt:    data[i][map['linked_at']]
      };
    }
  }
  return null;
}


// ════════════════════════════════════════════════════════════════
// 【復元処理（機種変更時）】
// ════════════════════════════════════════════════════════════════

/**
 * バックアップ済みアカウントから復元（機種変更時）
 *   - 同じプロバイダUIDで再連携した場合、既存の GW-B-* を引き継ぐ
 *   - device_ids_json に新端末を追加（最大10端末まで保持）
 *
 * @param {string} newGwUserId - 既存の GW-B-*
 * @param {string} deviceId    - 新端末のID
 * @returns {Object} { ok, newGwUserId, restored, message }
 */
function _restoreFromBackup(newGwUserId, deviceId) {
  var idInfo = _findIdentity(newGwUserId);
  if (!idInfo) {
    return { ok: false, error: '復元対象のアカウントが見つかりません' };
  }

  // device_ids_json に新端末を追加
  try {
    var devs = _safeJsonParse(idInfo.row[idInfo.map['device_ids_json']], []);
    if (Array.isArray(devs) && deviceId && devs.indexOf(deviceId) < 0) {
      devs.push(deviceId);
      if (devs.length > 10) devs = devs.slice(devs.length - 10);
      idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['device_ids_json'] + 1).setValue(JSON.stringify(devs));
    }
    idInfo.sheet.getRange(idInfo.rowIndex, idInfo.map['last_active_at'] + 1).setValue(new Date());
  } catch (e) {}

  return {
    ok:          true,
    newGwUserId: newGwUserId,
    restored:    true,
    message:     'お帰りなさい。データを復元しました'
  };
}


// ════════════════════════════════════════════════════════════════
// 【identity 直接作成（フォールバック）】
// ════════════════════════════════════════════════════════════════

/**
 * identity に直接 GW-B-* 行を作成
 *   - _resolveOrCreateIdentity が走らなかった場合のフォールバック
 *   - 通常パスでは _findIdentity(oldId) で見つかるため呼ばれないが、
 *     identity 行が消失している異常系で復旧手段として動作
 *
 * @param {string} newId
 * @param {string} provider
 * @param {string} providerUid
 * @param {string} deviceId
 * @param {Object} profile - { nickname, realName }
 */
function _createBackedUpIdentity(newId, provider, providerUid, deviceId, profile) {
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var row = _emptyRow(map);
  var now = new Date();

  row[map['gw_user_id']]            = newId;
  row[map['display_name']]          = profile.nickname || '';
  row[map['real_name']]             = profile.realName || '';
  row[map['state']]                 = 'backed_up';
  row[map['auth_provider']]         = provider;
  row[map['provider_uid']]          = providerUid;
  row[map['device_ids_json']]       = JSON.stringify(deviceId ? [deviceId] : []);
  row[map['use_count']]             = 1;
  row[map['created_at']]            = now;
  row[map['last_active_at']]        = now;
  row[map['last_backup_prompt_at']] = '';
  sh.appendRow(row);
}


// ════════════════════════════════════════════════════════════════
// 【Players シート一括更新】
// ════════════════════════════════════════════════════════════════

/**
 * Players シートの gw_user_id 列を一括更新
 *   - ゲスト → 保全済み に移行した時、過去のラウンド記録を新IDに紐づけ直す
 *   - 該当する全行を旧IDから新IDに書き換え
 *
 * 設計意図：
 *   既存の player_id 自体は絶対に変更しない（Scores/History との紐付けを守る）。
 *   gw_user_id 列だけを書き換えることで、UI上は「同じプレイヤー」として
 *   過去履歴と新規ラウンドが繋がる。
 *
 * @param {string} oldId
 * @param {string} newId
 */
function _updatePlayersGwUserId(oldId, newId) {
  var sh = _sheet(SHEET_PLAYERS);
  var map = _headerMap(sh);
  // gw_user_id 列が無ければ何もしない（既存データ救済）
  if (map['gw_user_id'] === undefined) return;

  var data = sh.getDataRange().getValues();
  var updates = []; // [行番号, 列番号]
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(oldId)) {
      updates.push(i + 1);
    }
  }
  // 一括更新（性能配慮）
  if (updates.length > 0) {
    for (var u = 0; u < updates.length; u++) {
      sh.getRange(updates[u], map['gw_user_id'] + 1).setValue(newId);
    }
  }
}
