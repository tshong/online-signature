document.addEventListener('DOMContentLoaded', () => {
    // 初始化 Socket.IO
    const socket = io();
    
    // 初始化繪圖板
    const drawingBoard = new DrawingBoard('drawing-board');
    drawingBoard.socket = socket;
    
    // UI 元素
    const penTool = document.getElementById('pen-tool');
    const eraserTool = document.getElementById('eraser-tool');
    const eraserSizes = document.querySelectorAll('input[name="eraser-size"]');
    const onlineCount = document.getElementById('online-count');
    const userId = document.getElementById('user-id');
    
    // 從 localStorage 獲取已存在的 userId
    const existingUserId = localStorage.getItem('userId');
    
    // 向服務器註冊（發送現有 ID 或 null）
    socket.emit('register', existingUserId);
    
    // 工具切換
    penTool.addEventListener('click', () => {
        drawingBoard.currentTool = 'pen';
        penTool.classList.add('active');
        eraserTool.classList.remove('active');
        drawingBoard.ctx.strokeStyle = drawingBoard.color;
        document.body.style.cursor = 'crosshair';
    });
    
    eraserTool.addEventListener('click', () => {
        drawingBoard.currentTool = 'eraser';
        eraserTool.classList.add('active');
        penTool.classList.remove('active');
        document.body.style.cursor = 'none'; // 隱藏默認游標，使用自定義游標
    });
    
    // 橡皮擦大小切換
    eraserSizes.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (drawingBoard.currentTool === 'eraser') {
                drawingBoard.eraserSize = parseInt(e.target.value);
            }
        });
    });
    
    // Socket.IO 事件處理
    socket.on('init', (data) => {
        localStorage.setItem('userId', data.userId);
        
        drawingBoard.userId = data.userId;
        drawingBoard.color = data.color;
        drawingBoard.ctx.strokeStyle = data.color;
        userId.textContent = `ID: ${data.userId.slice(0, 6)}`;
        onlineCount.textContent = `在線人數: ${data.userCount}`;

        // 從 strokesData 恢復完整的筆跡數據
        if (data.strokesData) {
            data.strokesData.forEach(([userId, strokes]) => {
                drawingBoard.strokes.set(userId, strokes);
            });
            drawingBoard.redrawAllStrokes();
        }

        // 處理歷史記錄
        if (data.history && data.history.length > 0) {
            data.history.forEach(action => {
                if (!drawingBoard.strokes.has(action.userId)) {
                    drawingBoard.strokes.set(action.userId, []);
                }
                
                if (action.type === 'draw-start') {
                    const stroke = {
                        tool: action.tool,
                        color: action.color,
                        lineWidth: action.lineWidth,
                        points: [{x: action.x, y: action.y}]
                    };
                    drawingBoard.strokes.get(action.userId).push(stroke);
                } else if (action.type === 'draw') {
                    const userStrokes = drawingBoard.strokes.get(action.userId);
                    if (userStrokes && userStrokes.length > 0) {
                        const currentStroke = userStrokes[userStrokes.length - 1];
                        if (action.points) {
                            currentStroke.points = action.points;
                        } else {
                            currentStroke.points.push({
                                x: action.x,
                                y: action.y
                            });
                        }
                    }
                }
            });
            drawingBoard.redrawAllStrokes();
        }
    });
    
    socket.on('user-count-update', (count) => {
        onlineCount.textContent = `在線人數: ${count}`;
    });
    
    socket.on('draw-start', (data) => {
        if (!drawingBoard.strokes.has(data.userId)) {
            drawingBoard.strokes.set(data.userId, []);
        }
        
        const stroke = {
            tool: data.tool,
            color: data.color,
            lineWidth: data.lineWidth,
            points: [{x: data.x, y: data.y}]
        };
        
        drawingBoard.strokes.get(data.userId).push(stroke);
        drawingBoard.redrawAllStrokes();
    });
    
    socket.on('draw', (data) => {
        const userStrokes = drawingBoard.strokes.get(data.userId);
        if (!userStrokes) {
            drawingBoard.strokes.set(data.userId, []);
        }

        const stroke = {
            tool: data.tool,
            color: data.color,
            lineWidth: data.lineWidth,
            points: data.points // 使用接收到的整個筆跡
        };

        drawingBoard.strokes.get(data.userId).push(stroke);
        drawingBoard.redrawAllStrokes();
    });

    socket.on('erase', (data) => {
        drawingBoard.clearUserStrokesAtPosition({x: data.x, y: data.y}, data.userId);
    });

    socket.on('clear-all', () => {
        drawingBoard.strokes.clear();
        drawingBoard.redrawAllStrokes();
    });

    // 添加清除按鈕事件處理
    const clearAllBtn = document.getElementById('clear-all');
    clearAllBtn.addEventListener('click', () => {
        if (confirm('確定要清除所有人的筆跡嗎？')) {
            drawingBoard.clearAll();
        }
    });
}); 