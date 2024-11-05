class DrawingBoard {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.cursorCanvas = document.getElementById('cursor-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cursorCtx = this.cursorCanvas.getContext('2d');
        
        this.isDrawing = false;
        this.currentTool = 'pen';
        this.lineWidth = 2;
        this.eraserSize = 10;
        this.color = '#FF0000';
        this.userId = null;
        this.socket = null;
        
        // 儲存所有筆跡的數據
        this.strokes = new Map(); // userId -> stroke array
        
        // 新增：為每個用戶維護獨立的繪圖狀態
        this.activeStrokes = new Map();  // userId -> current active stroke
        
        this.initCanvas();
        this.bindEvents();
    }

    initCanvas() {
        const setCanvasSize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight - 70;
            
            this.canvas.width = width;
            this.canvas.height = height;
            this.cursorCanvas.width = width;
            this.cursorCanvas.height = height;
            
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.redrawAllStrokes();
        };

        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', (e) => {
            this.updateCursor(e);
            this.draw(e);
        });
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }

    updateCursor(e) {
        this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
        
        if (this.currentTool === 'eraser') {
            const pos = this.getPosition(e);
            this.cursorCtx.beginPath();
            this.cursorCtx.arc(pos.x, pos.y, this.eraserSize, 0, Math.PI * 2);
            this.cursorCtx.strokeStyle = '#000';
            this.cursorCtx.stroke();
        }
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getPosition(e);
        
        if (!this.strokes.has(this.userId)) {
            this.strokes.set(this.userId, []);
        }
        
        const stroke = {
            tool: this.currentTool,
            color: this.color,
            lineWidth: this.currentTool === 'pen' ? this.lineWidth : this.eraserSize,
            points: [pos]
        };
        
        // 儲存當前用戶的活動筆劃
        this.activeStrokes.set(this.userId, {
            ctx: this.ctx,
            stroke: stroke
        });
        
        this.strokes.get(this.userId).push(stroke);
        
        // 為當前筆劃設置正確的樣式
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = stroke.lineWidth;
        this.ctx.moveTo(pos.x, pos.y);

        // 發送 draw-start 事件，包含完整的筆跡信息
        if (this.socket) {
            this.socket.emit('draw-start', {
                x: pos.x,
                y: pos.y,
                tool: this.currentTool,
                color: this.color,
                lineWidth: stroke.lineWidth,
                stroke: stroke  // 發送完整的筆跡對象
            });
        }
    }

    draw(e) {
        if (!this.isDrawing) return;
        const pos = this.getPosition(e);
        
        // 獲取當前用戶的活動筆劃
        const activeStroke = this.activeStrokes.get(this.userId);
        if (!activeStroke) return;

        const currentStrokes = this.strokes.get(this.userId);
        const currentStroke = currentStrokes[currentStrokes.length - 1];
        currentStroke.points.push(pos);
        
        if (this.currentTool === 'pen') {
            // 確保使用正確的繪圖上下文和樣式
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = currentStroke.lineWidth;
            this.ctx.lineTo(pos.x, pos.y);
            this.ctx.stroke();
        } else if (this.currentTool === 'eraser') {
            this.clearUserStrokesAtPosition(pos, this.userId);
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            // 清除當前用戶的活動筆劃
            this.activeStrokes.delete(this.userId);
            
            // 重新設置繪圖上下文的默認狀態
            this.ctx.beginPath();

            // 廣播完成的筆跡
            const currentStrokes = this.strokes.get(this.userId);
            const currentStroke = currentStrokes[currentStrokes.length - 1];
            if (currentStroke) {
                const points = currentStroke.points;
                if (points.length > 0) {
                    // 廣播整個筆跡的所有點
                    this.socket.emit('draw', {
                        userId: this.userId,
                        tool: this.currentTool,
                        color: this.color,
                        lineWidth: currentStroke.lineWidth,
                        points: points // 傳送整個筆跡的點
                    });
                }
            }
        }
    }

    clearUserStrokesAtPosition(pos, userId) {
        const userStrokes = this.strokes.get(userId);
        if (!userStrokes) return;

        // 標記要刪除的筆跡
        const toRemove = [];
        userStrokes.forEach((stroke, index) => {
            if (stroke.tool === 'pen' && this.isStrokeNearPoint(stroke, pos)) {
                toRemove.push(index);
            }
        });

        // 從後往前刪除筆跡
        for (let i = toRemove.length - 1; i >= 0; i--) {
            userStrokes.splice(toRemove[i], 1);
        }

        // 重繪所有筆跡
        this.redrawAllStrokes();

        // 發送擦除事件
        if (this.socket) {
            this.socket.emit('erase', {
                x: pos.x,
                y: pos.y,
                eraserSize: this.eraserSize,
                userId: this.userId
            });
        }
    }

    isStrokeNearPoint(stroke, point) {
        return stroke.points.some(p => {
            const dx = p.x - point.x;
            const dy = p.y - point.y;
            return Math.sqrt(dx * dx + dy * dy) <= this.eraserSize;
        });
    }

    redrawAllStrokes() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.strokes.forEach((userStrokes, userId) => {
            userStrokes.forEach(stroke => {
                if (stroke.tool === 'pen' && stroke.points.length > 0) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = stroke.color;
                    this.ctx.lineWidth = stroke.lineWidth;
                    
                    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                    stroke.points.forEach(point => {
                        this.ctx.lineTo(point.x, point.y);
                    });
                    this.ctx.stroke();
                }
            });
        });
    }

    getPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true,
            view: window
        });
        this.canvas.dispatchEvent(mouseEvent);
    }

    clearAll() {
        this.strokes.clear();
        this.redrawAllStrokes();
        if (this.socket) {
            this.socket.emit('clear-all');
        }
    }

    // 修改接收其他用戶繪圖的方法
    handleRemoteDraw(data) {
        if (!this.strokes.has(data.userId)) {
            this.strokes.set(data.userId, []);
        }

        const userStrokes = this.strokes.get(data.userId);
        if (userStrokes && userStrokes.length > 0) {
            const currentStroke = userStrokes[userStrokes.length - 1];
            currentStroke.points.push({x: data.x, y: data.y});

            // 只重繪當前用戶的當前筆劃
            if (currentStroke.points.length >= 2) {
                const lastTwoPoints = currentStroke.points.slice(-2);
                
                this.ctx.beginPath();
                this.ctx.strokeStyle = data.color;
                this.ctx.lineWidth = data.lineWidth;
                this.ctx.moveTo(lastTwoPoints[0].x, lastTwoPoints[0].y);
                this.ctx.lineTo(lastTwoPoints[1].x, lastTwoPoints[1].y);
                this.ctx.stroke();
            }
        }
    }
} 