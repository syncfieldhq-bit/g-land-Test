/******************************************************************
 * G-WORLD Backend - Identity Service
 *
 * 【SECTION B-3】★G-WORLD の心臓部
 * GW_USER_ID マスタ（identity シート）への自動登録・参照ロジック
 *
 * 設計意図【設計憲法・第1条・第7条】：
 *   - フロントから初めて GW_USER_ID が届いた時に、自動的に identity に登録
 *   - ゲスト(GW-G-*) は state='guest' で登録
 *   - 保全済み(GW-B-*) は state='backed_up' で登録
 *   - 既に存在する場合は last_active_at と use_count を更新するだけ
 *   - device_ids_json に新端末を追加（最大10端末まで保持）
 *   - "認証" の手続きはここでは一切発生しない（ご案内のみ）
 *
 * 含まれる関数：
 *   - _resolveOrCreateIdentity : GW_USER_ID 自動登録 + 利用回数更新
 *   - _identityRowToObject     : シート行を JS オブジェクトに変換
 *   - _findIdentity            : GW_USER_ID から identity を読込専用で検索
 *
 * 【依存】
 *   - services_SheetService.gs : _sheet, _headerMap, _emptyRow, _safeJsonParse
 *   - config_Config.gs         : SHEET_IDENTITY
 *
 * 【呼出元】
 *   - api_CoreApi.gs              : Core_boot / Core_ping / Core_getProfile / Core_updateProfile / Core_linkBackup
 *   - api_GolfApi.gs              : GLand_register
 *   - repositories_BackupRepository.gs : _restoreFromBackup
 ******************************************************************/


// ════════════════════════════════════════════════════════════════
// 【SECTION B-3】★ _resolveOrCreateIdentity
//
// GW_USER_ID から identity 行を取得（無ければ作成）
//
// 設計意図：
//   - 通信のたびに呼ばれ、初回ユーザーは自動登録される（バックエンド側の
//     "暗黙の歓迎"）
//   - 既存ユーザーは last_active_at と use_count が同期される
//   - device_ids_json は端末履歴として残し、機種変更時の補助情報になる
//
// 動作フロー：
//   1) identity シートを全件スキャンして既存検索
//   2) 見つかれば → 更新（use_count / last_active_at / device_ids_json）
//   3) 見つからなければ → 新規行を追加
//      - プレフィックス GW-G-* → state='guest'
//      - プレフィックス GW-B-* → state='backed_up'
//
// @param {string} gwUserId - フロントから送られたID
// @param {Object} meta     - リクエストメタ情報（deviceId / useCount 等）
// @returns {Object} identity 行の内容（ない場合は空オブジェクト）
// ════════════════════════════════════════════════════════════════
function _resolveOrCreateIdentity(gwUserId, meta) {
  if (!gwUserId) return { gwUserId: '' };

  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();

  // ── 既存検索 ──
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      // 既存：last_active_at と use_count を更新
      if (meta) {
        try {
          var newUseCount = Number(meta.useCount) || Number(data[i][map['use_count']]) || 0;
          if (newUseCount > 0) {
            sh.getRange(i + 1, map['use_count'] + 1).setValue(newUseCount);
          }
          sh.getRange(i + 1, map['last_active_at'] + 1).setValue(new Date());

          // device_ids_json に新しい端末IDがあれば追加
          if (meta.deviceId) {
            var devs = _safeJsonParse(data[i][map['device_ids_json']], []);
            if (Array.isArray(devs) && devs.indexOf(meta.deviceId) < 0) {
              devs.push(meta.deviceId);
              // 最大10端末まで（古いものから捨てる）
              if (devs.length > 10) devs = devs.slice(devs.length - 10);
              sh.getRange(i + 1, map['device_ids_json'] + 1).setValue(JSON.stringify(devs));
            }
          }
        } catch (e) {
          // 更新失敗は致命的でない
        }
      }
      return _identityRowToObject(data[i], map);
    }
  }

  // ── 新規作成 ──
  var row = _emptyRow(map);
  var now = new Date();
  var deviceIds = meta && meta.deviceId ? [meta.deviceId] : [];

  // プレフィックスから state を判別（GW-G-* → guest, GW-B-* → backed_up）
  var state = 'guest';
  if (String(gwUserId).indexOf('GW-B-') === 0) state = 'backed_up';

  row[map['gw_user_id']]              = gwUserId;
  row[map['display_name']]            = (meta && meta.displayName) || '';
  row[map['real_name']]               = (meta && meta.realName) || '';
  row[map['state']]                   = state;
  row[map['auth_provider']]           = '';
  row[map['provider_uid']]            = '';
  row[map['device_ids_json']]         = JSON.stringify(deviceIds);
  row[map['use_count']]               = (meta && Number(meta.useCount)) || 1;
  row[map['created_at']]              = now;
  row[map['last_active_at']]          = now;
  row[map['last_backup_prompt_at']]   = '';
  sh.appendRow(row);

  return {
    gwUserId:           gwUserId,
    state:              state,
    useCount:           1,
    isNew:              true
  };
}


// ════════════════════════════════════════════════════════════════
// 【identity 行 → JS オブジェクト変換】
// ════════════════════════════════════════════════════════════════

/**
 * identity 行を JS オブジェクトに変換
 *
 * 注意：
 *   - 全フィールドを String() / Number() で正規化
 *   - 日時系は Date オブジェクトのまま返す（呼出元で toISOString 等に変換）
 *
 * @param {Array} row - シート1行分の値配列
 * @param {Object} map - _headerMap の結果
 * @returns {Object}
 */
function _identityRowToObject(row, map) {
  return {
    gwUserId:            String(row[map['gw_user_id']] || ''),
    displayName:         String(row[map['display_name']] || ''),
    realName:            String(row[map['real_name']] || ''),
    state:               String(row[map['state']] || 'guest'),
    authProvider:        String(row[map['auth_provider']] || ''),
    providerUid:         String(row[map['provider_uid']] || ''),
    useCount:            Number(row[map['use_count']]) || 0,
    createdAt:           row[map['created_at']],
    lastActiveAt:        row[map['last_active_at']],
    lastBackupPromptAt:  row[map['last_backup_prompt_at']]
  };
}


// ════════════════════════════════════════════════════════════════
// 【identity 検索（読込専用）】
// ════════════════════════════════════════════════════════════════

/**
 * GW_USER_ID から identity を検索（更新しない・読込み専用）
 *
 * 設計意図：
 *   _resolveOrCreateIdentity は副作用（use_count++ / last_active_at 更新）が
 *   あるため、読み込みだけで済むケースには本関数を使う。
 *
 *   特に Core_linkBackup / Core_updateProfile では、対象行の rowIndex を
 *   保持して個別フィールドを書き換えるため、row + map + rowIndex + sheet を
 *   セットで返す。
 *
 * @param {string} gwUserId
 * @returns {Object|null} { row, map, rowIndex, sheet } または null
 */
function _findIdentity(gwUserId) {
  if (!gwUserId) return null;
  var sh = _sheet(SHEET_IDENTITY);
  var map = _headerMap(sh);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][map['gw_user_id']]) === String(gwUserId)) {
      return { row: data[i], map: map, rowIndex: i + 1, sheet: sh };
    }
  }
  return null;
}
