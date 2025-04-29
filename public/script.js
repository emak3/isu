// グローバル変数
let gridConfig = {
    rows: 5,
    cols: 5,
    disabledSeats: []
};
let totalSeats = gridConfig.rows * gridConfig.cols;
let selectedSeats = [];
let allStudents = [];
let assignedSeats = [];
let lastSyncTime = null;
let socket = null;
let isConnected = false;
let uniqueRoomId = "default"; // 部屋IDをカスタマイズ可能

// DOM要素の取得
const studentNameInput = document.getElementById('student-name');
const submitBtn = document.getElementById('submit-btn');
const resetBtn = document.getElementById('reset-btn');
const assignBtn = document.getElementById('assign-btn');
const assignRandomBtn = document.getElementById('assign-random-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const clearAssignmentsBtn = document.getElementById('clear-assignments-btn');
const seatingGrid = document.getElementById('seating-grid');
const assignmentGrid = document.getElementById('assignment-grid');
const customizationGrid = document.getElementById('customization-grid');
const studentListElem = document.getElementById('students');
const messageArea = document.getElementById('message-area');
const syncStatus = document.getElementById('sync-status-text');
const syncIcon = document.querySelector('.sync-status i');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// グリッド設定変更用の要素
const gridRowsInput = document.getElementById('grid-rows');
const gridColsInput = document.getElementById('grid-cols');
const updateGridBtn = document.getElementById('update-grid-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const resetConfigBtn = document.getElementById('reset-config-btn');

// Socket.IOの初期化とデータ同期セットアップ
function initializeSocketIO() {
    try {
        // URLパラメータから部屋IDを取得（カスタマイズ可能にする）
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('room')) {
            uniqueRoomId = urlParams.get('room');
        }
        
        debugLog("初期化を開始: 部屋ID = " + uniqueRoomId);
        
        // Socket.ioが定義されているか確認
        if (typeof io === 'undefined') {
            throw new Error("Socket.IOライブラリが読み込まれていません");
        }
        
        // Socket.ioインスタンスを作成（接続オプション付き）
        socket = io({
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 5000,
            transports: ['websocket', 'polling'] // WebSocketを優先し、フォールバックとしてポーリングを使用
        });
        
        debugLog("Socket.IOの接続を試みています...");
        
        // 接続成功イベント
        socket.on('connect', () => {
            debugLog("Socket.IOに接続しました。ID: " + socket.id);
            isConnected = true;
            updateConnectionStatus();
            
            // 部屋に参加
            socket.emit('joinRoom', uniqueRoomId);
            showMessage(`部屋 ${uniqueRoomId} に接続しました`);
        });
        
        // 接続エラーイベント
        socket.on('connect_error', (error) => {
            debugLog("接続エラー: " + error.message);
            // 5秒後に自動でダミーモードに切り替え
            setTimeout(() => {
                if (!isConnected) {
                    debugLog("サーバー接続ができないため、ローカルモードに切り替えます");
                    enableLocalModeWithDummySync();
                }
            }, 5000);
        });
        
        // 切断イベント
        socket.on('disconnect', () => {
            debugLog("Socket.IOから切断されました");
            isConnected = false;
            updateConnectionStatus();
        });
        
        // 再接続イベント
        socket.on('reconnect', () => {
            debugLog("Socket.IOに再接続しました");
            isConnected = true;
            updateConnectionStatus();
            
            // 再接続したら部屋に再参加して最新データを要求
            socket.emit('joinRoom', uniqueRoomId);
            socket.emit('requestData');
        });
        
        // 部屋の全データ受信イベント
        socket.on('roomData', (data) => {
            debugLog("部屋データを受信: " + JSON.stringify(data).substring(0, 100) + "...");
            
            if (data.students) {
                allStudents = data.students;
                updateStudentList();
            }
            
            if (data.assignedSeats) {
                assignedSeats = data.assignedSeats;
                initializeAssignmentGrid();
            }
            
            if (data.gridConfig) {
                gridConfig = data.gridConfig;
                updateGridConfigUI();
                
                // グリッドサイズが変更されている場合、全てのグリッドを更新
                totalSeats = gridConfig.rows * gridConfig.cols;
                initializeSeats();
                initializeAssignmentGrid();
                initializeCustomizationGrid();
            }
            
            if (data.timestamp) {
                lastSyncTime = new Date(data.timestamp);
            }
        });
        
        // 生徒データのみ更新イベント
        socket.on('studentsUpdated', (data) => {
            debugLog("生徒データが更新されました");
            allStudents = data;
            updateStudentList();
        });
        
        // 座席割り当てのみ更新イベント
        socket.on('assignedSeatsUpdated', (data) => {
            debugLog("座席割り当てが更新されました");
            assignedSeats = data;
            initializeAssignmentGrid();
        });
        
        // グリッド設定のみ更新イベント
        socket.on('gridConfigUpdated', (data) => {
            debugLog("グリッド設定が更新されました");
            gridConfig = data;
            updateGridConfigUI();
            
            // グリッドサイズが変更されたら全てのグリッドを更新
            totalSeats = gridConfig.rows * gridConfig.cols;
            initializeSeats();
            initializeAssignmentGrid();
            initializeCustomizationGrid();
        });
        
    } catch (error) {
        debugLog("Socket.IO初期化エラー: " + error.message);
        console.error("Socket.IO initialization error:", error);
        showMessage("リアルタイム同期の初期化に失敗しました。ローカルモードで動作します。", true);
        
        // Socket.IOが利用できない場合はローカルストレージからデータを復元
        enableLocalModeWithDummySync();
    }
}

// ローカルモードでもダミーの同期機能を有効化
function enableLocalModeWithDummySync() {
    debugLog("ダミー同期モードを有効化します");
    
    // Socket.IOの代わりにダミーのソケットオブジェクトを作成
    socket = {
        emit: function(event, data) {
            debugLog(`[ダミー] イベント ${event} が発行されました`);
            
            // ローカルストレージにデータを保存
            if (event === 'updateStudents') {
                localStorage.setItem('seat_simulator_students', JSON.stringify(data));
            }
            
            if (event === 'updateAssignedSeats') {
                localStorage.setItem('seat_simulator_assigned', JSON.stringify(data));
            }
            
            if (event === 'updateGridConfig') {
                localStorage.setItem('seat_simulator_grid_config', JSON.stringify(data));
                
                // 席数を更新
                gridConfig = data;
                totalSeats = gridConfig.rows * gridConfig.cols;
                
                // グリッドの再初期化
                initializeSeats();
                initializeAssignmentGrid();
                initializeCustomizationGrid();
            }
            
            if (event === 'clearAllData') {
                localStorage.removeItem('seat_simulator_students');
                localStorage.removeItem('seat_simulator_assigned');
                // グリッド設定は保持
            }
        }
    };
    
    // ローカルストレージからデータを復元
    initializeLocalData();
    
    // オフラインモードを表示
    isConnected = false;
    updateConnectionStatus();
}

// ローカルストレージからデータを取得（Socket.IOが使えない場合のフォールバック）
function initializeLocalData() {
    const storedStudents = localStorage.getItem('seat_simulator_students');
    const storedAssigned = localStorage.getItem('seat_simulator_assigned');
    const storedGridConfig = localStorage.getItem('seat_simulator_grid_config');
    
    if (storedStudents) {
        allStudents = JSON.parse(storedStudents);
    }
    
    if (storedAssigned) {
        assignedSeats = JSON.parse(storedAssigned);
    }
    
    if (storedGridConfig) {
        gridConfig = JSON.parse(storedGridConfig);
        totalSeats = gridConfig.rows * gridConfig.cols;
        updateGridConfigUI();
    }
    
    updateConnectionStatus();
}

// グリッド設定UIの更新
function updateGridConfigUI() {
    gridRowsInput.value = gridConfig.rows;
    gridColsInput.value = gridConfig.cols;
}

// 接続状態の表示更新
function updateConnectionStatus() {
    if (isConnected) {
        syncStatus.textContent = "リアルタイム同期中";
        syncStatus.classList.add("online");
        syncStatus.classList.remove("offline");
        syncIcon.classList.add("syncing");
        syncIcon.className = "fas fa-sync syncing"; // アイコンを回転させるクラスを追加
        debugLog("接続状態を「オンライン」に更新しました");
    } else {
        syncStatus.textContent = "オフライン (ローカルモード)";
        syncStatus.classList.remove("online");
        syncStatus.classList.add("offline");
        syncIcon.classList.remove("syncing");
        syncIcon.className = "fas fa-exclamation-circle"; // 警告アイコンに変更
        debugLog("接続状態を「オフライン」に更新しました");
    }
    
    // 部屋IDの表示エリアが無い場合は作成
    if (!document.querySelector('.room-id-display')) {
        const roomIdDisplay = document.createElement('div');
        roomIdDisplay.classList.add('room-id-display');
        roomIdDisplay.innerHTML = `
            <span>部屋ID: <strong>${uniqueRoomId}</strong></span>
            <button id="change-room-btn" class="mini-btn">変更</button>
        `;
        document.querySelector('.sync-status').appendChild(roomIdDisplay);
        
        // 部屋ID変更ボタンのイベントリスナーを追加
        document.getElementById('change-room-btn').addEventListener('click', () => {
            const newRoomId = prompt('新しい部屋IDを入力してください:', uniqueRoomId);
            if (newRoomId && newRoomId.trim() !== '') {
                // 新しいURLを生成して現在のページをリロード
                window.location.href = `${window.location.pathname}?room=${encodeURIComponent(newRoomId)}`;
            }
        });
    }
}

// タブ切り替え機能
function initializeTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            // アクティブなタブをリセット
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // 選択したタブをアクティブに
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            // タブに応じて表示を更新
            if (tabId === 'seating-assignment') {
                initializeAssignmentGrid();
            } else if (tabId === 'student-management') {
                updateStudentList();
            } else if (tabId === 'settings') {
                initializeCustomizationGrid();
            }
        });
    });
}

// インデックスから座席番号を計算（行列形式）
function calculateSeatNumber(index) {
    const row = Math.floor(index / gridConfig.cols);
    const col = index % gridConfig.cols;
    // 1から始まる番号
    return col * gridConfig.rows + row + 1;
}

// 机/座席の初期化（選択画面）
function initializeSeats() {
    seatingGrid.innerHTML = '';
    
    // グリッドのスタイルを動的に設定
    seatingGrid.style.gridTemplateColumns = `repeat(${gridConfig.cols}, 1fr)`;
    
    for (let i = 0; i < totalSeats; i++) {
        // 座席のコンテナ
        const seat = document.createElement('div');
        seat.className = 'seat';
        seat.dataset.index = i;
        
        // 机のデザイン
        const desk = document.createElement('div');
        desk.className = 'desk';
        
        // 無効な座席かどうかをチェック
        if (gridConfig.disabledSeats.includes(i)) {
            desk.classList.add('disabled');
        }
        
        // 座席番号
        const seatNumber = calculateSeatNumber(i);
        
        const seatNumberElem = document.createElement('div');
        seatNumberElem.className = 'seat-number';
        seatNumberElem.textContent = seatNumber;
        desk.appendChild(seatNumberElem);
        
        // 椅子のアイコン
        const chairIcon = document.createElement('i');
        chairIcon.className = 'fas fa-chair';
        chairIcon.style.fontSize = '24px';
        chairIcon.style.color = '#6d4c41';
        chairIcon.style.marginBottom = '5px';
        desk.appendChild(chairIcon);
        
        seat.appendChild(desk);
        
        // 無効な座席は選択できないようにする
        if (!gridConfig.disabledSeats.includes(i)) {
            seat.addEventListener('click', selectSeat);
        }
        
        seatingGrid.appendChild(seat);
    }
    
    updateSeatSelections();
}

// カスタマイズ画面の座席初期化
function initializeCustomizationGrid() {
    customizationGrid.innerHTML = '';
    
    // グリッドのスタイルを動的に設定
    customizationGrid.style.gridTemplateColumns = `repeat(${gridConfig.cols}, 1fr)`;
    
    for (let i = 0; i < totalSeats; i++) {
        // 座席のコンテナ
        const seat = document.createElement('div');
        seat.className = 'seat';
        seat.dataset.index = i;
        
        // 机のデザイン
        const desk = document.createElement('div');
        desk.className = 'desk';
        
        // 無効な座席の場合はクラスを追加
        if (gridConfig.disabledSeats.includes(i)) {
            desk.classList.add('disabled');
        }
        
        // 座席番号
        const seatNumber = calculateSeatNumber(i);
        
        const seatNumberElem = document.createElement('div');
        seatNumberElem.className = 'seat-number';
        seatNumberElem.textContent = seatNumber;
        desk.appendChild(seatNumberElem);
        
        // 椅子のアイコン
        const chairIcon = document.createElement('i');
        chairIcon.className = 'fas fa-chair';
        chairIcon.style.fontSize = '24px';
        chairIcon.style.color = '#6d4c41';
        chairIcon.style.marginBottom = '5px';
        desk.appendChild(chairIcon);
        
        seat.appendChild(desk);
        
        // 座席のカスタマイズ用クリックイベント
        seat.addEventListener('click', toggleSeatDisabled);
        
        customizationGrid.appendChild(seat);
    }
}

// 割り当て画面の座席初期化
function initializeAssignmentGrid() {
    assignmentGrid.innerHTML = '';
    
    // グリッドのスタイルを動的に設定
    assignmentGrid.style.gridTemplateColumns = `repeat(${gridConfig.cols}, 1fr)`;
    
    for (let i = 0; i < totalSeats; i++) {
        // 座席のコンテナ
        const seat = document.createElement('div');
        seat.className = 'seat';
        
        // 机のデザイン
        const desk = document.createElement('div');
        desk.className = 'desk';
        
        // 無効な座席の場合はクラスを追加
        if (gridConfig.disabledSeats.includes(i)) {
            desk.classList.add('disabled');
            
            seat.appendChild(desk);
            assignmentGrid.appendChild(seat);
            continue; // 無効な座席は割り当て対象外
        }
        
        // 座席番号
        const seatNumber = calculateSeatNumber(i);
        
        const seatNumberElem = document.createElement('div');
        seatNumberElem.className = 'seat-number';
        seatNumberElem.textContent = seatNumber;
        desk.appendChild(seatNumberElem);
        
        // 割り当てられた生徒がいる場合は表示
        if (assignedSeats[i]) {
            // 椅子のアイコンを人のアイコンに変更
            const personIcon = document.createElement('i');
            personIcon.className = 'fas fa-user';
            personIcon.style.fontSize = '20px';
            personIcon.style.color = '#3a7bd5';
            personIcon.style.marginBottom = '5px';
            desk.appendChild(personIcon);
            
            const studentNameElem = document.createElement('div');
            studentNameElem.className = 'student-name';
            studentNameElem.textContent = assignedSeats[i].name;
            
            const preferenceElem = document.createElement('div');
            preferenceElem.className = 'preference-indicator';
            
            if (assignedSeats[i].preference === 1) {
                preferenceElem.textContent = '第一希望';
                preferenceElem.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
                preferenceElem.style.color = '#c62828';
            } else if (assignedSeats[i].preference === 2) {
                preferenceElem.textContent = '第二希望';
                preferenceElem.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
                preferenceElem.style.color = '#e65100';
            } else if (assignedSeats[i].preference === 3) {
                preferenceElem.textContent = '第三希望';
                preferenceElem.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                preferenceElem.style.color = '#2e7d32';
            } else {
                preferenceElem.textContent = 'ランダム';
                preferenceElem.style.backgroundColor = 'rgba(158, 158, 158, 0.1)';
                preferenceElem.style.color = '#424242';
            }
            
            desk.appendChild(studentNameElem);
            desk.appendChild(preferenceElem);
        } else {
            // 空席は椅子のアイコン
            const chairIcon = document.createElement('i');
            chairIcon.className = 'fas fa-chair';
            chairIcon.style.fontSize = '24px';
            chairIcon.style.color = '#6d4c41';
            chairIcon.style.marginBottom = '5px';
            desk.appendChild(chairIcon);
            
            const emptyText = document.createElement('div');
            emptyText.className = 'student-name';
            emptyText.textContent = '空席';
            emptyText.style.color = '#aaa';
            emptyText.style.fontWeight = 'normal';
            desk.appendChild(emptyText);
        }
        
        seat.appendChild(desk);
        assignmentGrid.appendChild(seat);
    }
}

// 座席の有効/無効を切り替え（カスタマイズ画面用）
function toggleSeatDisabled(event) {
    const seatElement = event.currentTarget;
    const seatIndex = parseInt(seatElement.dataset.index);
    const desk = seatElement.querySelector('.desk');
    
    // 無効/有効を切り替え
    const isCurrentlyDisabled = desk.classList.contains('disabled');
    
    if (isCurrentlyDisabled) {
        // 有効化
        desk.classList.remove('disabled');
        gridConfig.disabledSeats = gridConfig.disabledSeats.filter(idx => idx !== seatIndex);
    } else {
        // 無効化
        desk.classList.add('disabled');
        if (!gridConfig.disabledSeats.includes(seatIndex)) {
            gridConfig.disabledSeats.push(seatIndex);
        }
    }
}

// 席を選択する（希望席選択画面用）
function selectSeat(event) {
    const seatElement = event.currentTarget;
    const seatIndex = parseInt(seatElement.dataset.index);
    const desk = seatElement.querySelector('.desk');
    
    // 無効な座席は選択できない
    if (gridConfig.disabledSeats.includes(seatIndex)) {
        return;
    }
    
    // すでに選択されている場合は選択を解除
    const existingIndex = selectedSeats.indexOf(seatIndex);
    if (existingIndex !== -1) {
        selectedSeats.splice(existingIndex, 1);
    } else if (selectedSeats.length < 3) {
        // 3つまで選択可能
        selectedSeats.push(seatIndex);
    } else {
        // すでに3つ選択している場合はアニメーションでお知らせ
        desk.classList.add('shake');
        
        setTimeout(() => {
            desk.classList.remove('shake');
        }, 500);
        
        showMessage("最大3つまで選択できます。別の席を選ぶには、すでに選択した席をクリックして解除してください。", true);
        return;
    }
    
    updateSeatSelections();
}

// 席の選択状態を更新
function updateSeatSelections() {
    const seats = document.querySelectorAll('#seating-grid .seat');
    
    // まず全てのラベルを削除
    document.querySelectorAll('.preference-label').forEach(label => {
        label.remove();
    });
    
    seats.forEach(seat => {
        const index = parseInt(seat.dataset.index);
        const desk = seat.querySelector('.desk');
        
        // クラスをリセット
        desk.classList.remove('selected-1', 'selected-2', 'selected-3');
        
        const selectionIndex = selectedSeats.indexOf(index);
        if (selectionIndex !== -1) {
            // 希望席のクラスを追加
            desk.classList.add(`selected-${selectionIndex + 1}`);
            
            // 希望順序のラベルを追加
            const label = document.createElement('div');
            label.className = `preference-label preference-label-${selectionIndex + 1}`;
            label.textContent = selectionIndex + 1;
            desk.appendChild(label);
        }
    });
}

// 生徒リストを更新
function updateStudentList() {
    studentListElem.innerHTML = '';
    
    if (allStudents.length === 0) {
        const listItem = document.createElement('li');
        listItem.textContent = '生徒はまだ登録されていません。';
        listItem.style.fontStyle = 'italic';
        listItem.style.color = '#888';
        studentListElem.appendChild(listItem);
        return;
    }
    
    // 名前でソート
    const sortedStudents = [...allStudents].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    
    sortedStudents.forEach(student => {
        const listItem = document.createElement('li');
        
        // 学生の名前
        const nameSpan = document.createElement('span');
        nameSpan.textContent = student.name;
        nameSpan.style.fontWeight = 'bold';
        listItem.appendChild(nameSpan);
        
        // 希望席情報の追加
        if (student.preferences && student.preferences.length > 0) {
            const prefSpan = document.createElement('span');
            prefSpan.style.marginLeft = '10px';
            prefSpan.style.fontSize = '0.85rem';
            prefSpan.style.color = '#666';
            
            // 希望席の数字を座席番号に変換
            const seatNumbers = student.preferences.map(index => calculateSeatNumber(index));
            
            prefSpan.textContent = `(希望席: ${seatNumbers.join(', ')})`;
            listItem.appendChild(prefSpan);
        }
        
        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.style.marginLeft = 'auto';
        deleteBtn.style.padding = '2px 6px';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.color = '#f44336';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.title = '削除';
        
        deleteBtn.addEventListener('click', () => removeStudent(student.name));
        
        listItem.appendChild(deleteBtn);
        listItem.style.display = 'flex';
        listItem.style.alignItems = 'center';
        listItem.style.justifyContent = 'space-between';
        
        studentListElem.appendChild(listItem);
    });
}

// 生徒を削除
function removeStudent(name) {
    if (confirm(`${name}さんのデータを削除しますか？`)) {
        allStudents = allStudents.filter(student => student.name !== name);
        
        // 割り当て済みの席からも削除
        for (let i = 0; i < assignedSeats.length; i++) {
            if (assignedSeats[i] && assignedSeats[i].name === name) {
                assignedSeats[i] = null;
            }
        }
        
        // データを保存
        saveData();
        
        // 表示を更新
        updateStudentList();
        initializeAssignmentGrid();
        showMessage(`${name}さんのデータを削除しました。`);
    }
}

// メッセージを表示
function showMessage(message, isError = false) {
    debugLog(`メッセージ表示: ${message} (${isError ? 'エラー' : '成功'})`);
    
    messageArea.innerHTML = '';
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isError ? 'error' : 'success'}`;
    
    // メッセージアイコンを追加
    const icon = document.createElement('i');
    icon.className = isError ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    icon.style.marginRight = '8px';
    messageDiv.appendChild(icon);
    
    // メッセージテキスト
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    messageDiv.appendChild(textSpan);
    
    messageArea.appendChild(messageDiv);
    
    // アニメーションでフェードイン
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(-10px)';
    messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    // 次のフレームでアニメーション開始
    setTimeout(() => {
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 10);
    
    // 3秒後にフェードアウト
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(10px)';
        
        // トランジション完了後に要素を削除
        setTimeout(() => {
            messageArea.innerHTML = '';
        }, 300);
    }, 3000);
}

// データを保存（Socket.IOで送信 + ローカルストレージにバックアップ）
function saveData() {
    if (isConnected && socket) {
        try {
            // 生徒データを送信
            socket.emit('updateStudents', allStudents);
            
            // 割り当てデータを送信
            socket.emit('updateAssignedSeats', assignedSeats);
            
        } catch (error) {
            console.error("Socket.IO send error:", error);
            
            // Socket.IOが失敗したらローカルストレージに保存
            saveToLocalStorage();
            
            showMessage("同期に失敗しました。データはローカルに保存されました。", true);
        }
    } else {
        // オフラインの場合はローカルストレージに保存
        saveToLocalStorage();
    }
    
    // どのケースでもローカルストレージにバックアップ
    saveToLocalStorage();
}

// グリッド設定を保存
function saveGridConfig() {
    if (isConnected && socket) {
        try {
            socket.emit('updateGridConfig', gridConfig);
        } catch (error) {
            console.error("Socket.IO send error:", error);
            saveGridConfigToLocalStorage();
            showMessage("グリッド設定の同期に失敗しました。設定はローカルに保存されました。", true);
        }
    } else {
        saveGridConfigToLocalStorage();
    }
    
    // バックアップ
    saveGridConfigToLocalStorage();
}

// ローカルストレージにグリッド設定を保存
function saveGridConfigToLocalStorage() {
    localStorage.setItem('seat_simulator_grid_config', JSON.stringify(gridConfig));
}

// ローカルストレージにデータを保存
function saveToLocalStorage() {
    localStorage.setItem('seat_simulator_students', JSON.stringify(allStudents));
    localStorage.setItem('seat_simulator_assigned', JSON.stringify(assignedSeats));
    localStorage.setItem('seat_simulator_timestamp', JSON.stringify(new Date().toISOString()));
}

// 席の割り当て（希望席優先）
function assignSeats() {
    if (allStudents.length === 0) {
        showMessage('生徒がいません。まず生徒を追加してください。', true);
        return;
    }
    
    // 割り当て前にリセット
    assignedSeats = Array(totalSeats).fill(null);
    
    // 生徒をシャッフル（ランダム化）して順番に依存しないようにする
    const shuffledStudents = [...allStudents];
    for (let i = shuffledStudents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledStudents[i], shuffledStudents[j]] = [shuffledStudents[j], shuffledStudents[i]];
    }
    
    // すべての生徒のassigned状態をリセット
    shuffledStudents.forEach(student => {
        student.assigned = false;
        delete student.assignedSeat;
    });
    
    // 第一希望から順に割り当て
    for (let preference = 1; preference <= 3; preference++) {
        shuffledStudents.forEach(student => {
            if (!student.assigned && student.preferences) {
                const preferenceIndex = preference - 1;
                
                // 学生が希望席を指定している場合
                if (student.preferences.length > preferenceIndex) {
                    const seatIndex = student.preferences[preferenceIndex];
                    
                    // 無効な座席かどうかをチェック
                    if (gridConfig.disabledSeats.includes(seatIndex)) {
                        return; // 次の生徒へ
                    }
                    
                    // まだ誰も座っていない場合
                    if (!assignedSeats[seatIndex]) {
                        assignedSeats[seatIndex] = {
                            name: student.name,
                            preference: preference
                        };
                        student.assigned = true;
                        student.assignedSeat = seatIndex;
                    }
                }
            }
        });
    }
    
    // まだ席が割り当てられていない生徒をランダムに配置
    const unassignedStudents = shuffledStudents.filter(student => !student.assigned);
    let emptySeats = [];
    
    // 空席のインデックスを取得（無効な座席を除く）
    for (let i = 0; i < assignedSeats.length; i++) {
        if (assignedSeats[i] === null && !gridConfig.disabledSeats.includes(i)) {
            emptySeats.push(i);
        }
    }
    
    // 空席をシャッフル
    for (let i = emptySeats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [emptySeats[i], emptySeats[j]] = [emptySeats[j], emptySeats[i]];
    }
    
    // 未割り当ての生徒を空席にランダムに配置
    unassignedStudents.forEach(student => {
        if (emptySeats.length > 0) {
            const seatIndex = emptySeats.pop();
            
            assignedSeats[seatIndex] = {
                name: student.name,
                preference: 0 // ランダム割り当て
            };
            student.assigned = true;
            student.assignedSeat = seatIndex;
        }
    });
    
    // 割り当てが終わったことをアニメーションで表示
    const assignmentTab = document.querySelector('[data-tab="seating-assignment"]');
    assignmentTab.classList.add('pulse');
    setTimeout(() => {
        assignmentTab.classList.remove('pulse');
    }, 1000);
    
    // データを保存
    saveData();
    
    // 表示を更新
    initializeAssignmentGrid();
    showMessage('席の割り当てが完了しました！');
}

// 完全ランダムな席割り当て
function assignRandomSeats() {
    if (allStudents.length === 0) {
        showMessage('生徒がいません。まず生徒を追加してください。', true);
        return;
    }
    
    // 割り当て前にリセット
    assignedSeats = Array(totalSeats).fill(null);
    
    // 生徒をシャッフル
    const shuffledStudents = [...allStudents];
    for (let i = shuffledStudents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledStudents[i], shuffledStudents[j]] = [shuffledStudents[j], shuffledStudents[i]];
    }
    
    // 空席のインデックスを取得（無効な座席を除く）
    let availableSeats = [];
    for (let i = 0; i < totalSeats; i++) {
        if (!gridConfig.disabledSeats.includes(i)) {
            availableSeats.push(i);
        }
    }
    
    // 空席をシャッフル
    for (let i = availableSeats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableSeats[i], availableSeats[j]] = [availableSeats[j], availableSeats[i]];
    }
    
    // 生徒をランダムに配置
    shuffledStudents.forEach(student => {
        student.assigned = false;
        delete student.assignedSeat;
        
        if (availableSeats.length > 0) {
            const seatIndex = availableSeats.pop();
            
            assignedSeats[seatIndex] = {
                name: student.name,
                preference: -1 // 完全ランダム割り当て
            };
            student.assigned = true;
            student.assignedSeat = seatIndex;
        }
    });
    
    // 割り当てが終わったことをアニメーションで表示
    const assignmentTab = document.querySelector('[data-tab="seating-assignment"]');
    assignmentTab.classList.add('pulse');
    setTimeout(() => {
        assignmentTab.classList.remove('pulse');
    }, 1000);
    
    // データを保存
    saveData();
    
    // 表示を更新
    initializeAssignmentGrid();
    showMessage('ランダムに席を割り当てました！');
}

// イベントリスナー
function initializeEventListeners() {
    submitBtn.addEventListener('click', () => {
        const name = studentNameInput.value.trim();
        
        if (!name) {
            showMessage('名前を入力してください。', true);
            studentNameInput.focus();
            return;
        }
        
        if (selectedSeats.length !== 3) {
            showMessage('3つの希望席を選択してください。', true);
            return;
        }
        
        // 選択した席に無効な席が含まれていないか確認
        const hasDisabledSeat = selectedSeats.some(index => gridConfig.disabledSeats.includes(index));
        if (hasDisabledSeat) {
            showMessage('無効な席が選択されています。有効な席を選択してください。', true);
            return;
        }
        
        // 同じ名前の生徒がすでにいる場合は上書き
        const existingIndex = allStudents.findIndex(student => student.name === name);
        
        if (existingIndex !== -1) {
            if (confirm(`${name}さんの希望席を更新しますか？`)) {
                allStudents[existingIndex].preferences = [...selectedSeats];
                allStudents[existingIndex].assigned = false;
                delete allStudents[existingIndex].assignedSeat;
            } else {
                return;
            }
        } else {
            allStudents.push({
                name: name,
                preferences: [...selectedSeats],
                assigned: false
            });
        }
        
        // データを保存
        saveData();
        
        // 表示を更新
        updateStudentList();
        
        // 成功メッセージと共に提出完了アニメーション
        showMessage(`${name}さんの希望が登録されました！`);
        
        // フォームをリセット
        studentNameInput.value = '';
        selectedSeats = [];
        updateSeatSelections();
    });
    
    resetBtn.addEventListener('click', () => {
        selectedSeats = [];
        updateSeatSelections();
        showMessage('選択がリセットされました。');
    });
    
    assignBtn.addEventListener('click', assignSeats);
    
    assignRandomBtn.addEventListener('click', assignRandomSeats);
    
    clearAllBtn.addEventListener('click', () => {
        if (confirm('すべての生徒データをクリアしますか？この操作は元に戻せません。')) {
            // Socket.IOで全クリア通知を送信
            if (isConnected && socket) {
                socket.emit('clearAllData');
            }
            
            allStudents = [];
            assignedSeats = Array(totalSeats).fill(null);
            
            // データを保存
            saveToLocalStorage();
            
            // 表示を更新
            updateStudentList();
            initializeAssignmentGrid();
            showMessage('すべての生徒データがクリアされました。');
        }
    });
    
    clearAssignmentsBtn.addEventListener('click', () => {
        if (confirm('席の割り当てをクリアしますか？')) {
            assignedSeats = Array(totalSeats).fill(null);
            
            allStudents.forEach(student => {
                student.assigned = false;
                delete student.assignedSeat;
            });
            
            // データを保存
            saveData();
            
            // 表示を更新
            initializeAssignmentGrid();
            showMessage('席の割り当てがクリアされました。');
        }
    });
    
    // グリッドサイズ変更処理
    updateGridBtn.addEventListener('click', () => {
        // 入力値の検証
        const newRows = parseInt(gridRowsInput.value);
        const newCols = parseInt(gridColsInput.value);
        
        if (isNaN(newRows) || isNaN(newCols) || newRows < 1 || newCols < 1 || newRows > 10 || newCols > 10) {
            showMessage('行数と列数は1から10の間で指定してください。', true);
            return;
        }
        
        // 確認が必要かどうか（サイズが小さくなる場合）
        const newTotal = newRows * newCols;
        if (newTotal < totalSeats) {
            if (!confirm('グリッドサイズを小さくすると、既存の席割り当てやデータが失われる可能性があります。続けますか？')) {
                return;
            }
        }
        
        // グリッド設定を更新
        gridConfig.rows = newRows;
        gridConfig.cols = newCols;
        
        // 無効な座席のフィルタリング（新しいサイズを超える座席は削除）
        gridConfig.disabledSeats = gridConfig.disabledSeats.filter(index => index < newTotal);
        
        // 総座席数を更新
        totalSeats = newTotal;
        
        // 割り当て配列のサイズを調整
        const newAssignedSeats = Array(totalSeats).fill(null);
        for (let i = 0; i < Math.min(assignedSeats.length, totalSeats); i++) {
            newAssignedSeats[i] = assignedSeats[i];
        }
        assignedSeats = newAssignedSeats;
        
        // グリッド設定を保存
        saveGridConfig();
        
        // 各グリッドを更新
        initializeSeats();
        initializeAssignmentGrid();
        initializeCustomizationGrid();
        
        showMessage('グリッドサイズを更新しました！');
    });
    
    // 設定保存ボタン
    saveConfigBtn.addEventListener('click', () => {
        // グリッド設定を保存
        saveGridConfig();
        
        initializeSocketIO();

        // カスタマイズ画面から席選択画面に移動
        document.querySelector('[data-tab="seat-selection"]').click();

        
        showMessage('座席設定が保存されました！');
    });
    
    // 設定リセットボタン
    resetConfigBtn.addEventListener('click', () => {
        if (confirm('座席の設定をリセットしますか？無効にした座席が全て有効に戻ります。')) {
            // 無効な座席をクリア
            gridConfig.disabledSeats = [];
            
            // グリッド設定を保存
            saveGridConfig();
            
            // カスタマイズグリッドを更新
            initializeCustomizationGrid();
            
            // 選択画面と割り当て画面も更新
            initializeSeats();
            initializeAssignmentGrid();
            
            showMessage('座席設定がリセットされました。');
        }
    });
    
    // キーボードショートカットの設定
    document.addEventListener('keydown', (e) => {
        // Escキーでメッセージをクリア
        if (e.key === 'Escape') {
            messageArea.innerHTML = '';
        }
    });
}

// アプリケーションの初期化
function initializeApp() {
    // 割り当て配列の初期化
    assignedSeats = Array(totalSeats).fill(null);
    
    // Socket.IO初期化とデータ同期セットアップ
    initializeSocketIO();
    
    // タブ切り替え初期化
    initializeTabs();
    
    // 座席の初期化
    initializeSeats();
    initializeAssignmentGrid();
    initializeCustomizationGrid();
    
    // イベントリスナーの設定
    initializeEventListeners();
    
    // 生徒リスト更新
    updateStudentList();
}

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', initializeApp);