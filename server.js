const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const os = require('os');

app.use(express.static('public'));

const users = new Map();
const colors = ['#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#00FFFF'];

// 儲存所有繪圖動作的歷史記錄
const drawHistory = [];
// 儲存完整的筆跡數據
const strokesData = new Map(); // userId -> strokes array

// 獲取所有網絡接口的 IP 地址
function getNetworkAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    
    for (const interfaceName in interfaces) {
        const interface = interfaces[interfaceName];
        for (const address of interface) {
            // 只顯示 IPv4 地址且不是內部環回地址
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push({
                    interface: interfaceName,
                    address: address.address
                });
            }
        }
    }
    
    return addresses;
}

io.on('connection', (socket) => {
    socket.on('register', (existingUserId) => {
        let userId = existingUserId;
        
        if (!userId || users.has(userId)) {
            userId = socket.id;
        }
        
        let userColor = users.get(userId)?.color || colors[users.size % colors.length];
        
        users.set(userId, {
            color: userColor,
            isDrawing: false,
            socketId: socket.id
        });

        // 發送初始化數據，包含完整的筆跡數據
        socket.emit('init', {
            userId,
            color: userColor,
            userCount: users.size,
            history: drawHistory,
            strokesData: Array.from(strokesData.entries())
        });

        console.log('User registered:', {
            userId,
            strokesData: Array.from(strokesData.entries())
        });

        io.emit('user-count-update', users.size);
    });

    socket.on('draw-start', (data) => {
        const userId = Array.from(users.entries())
            .find(([_, user]) => user.socketId === socket.id)?.[0];
        
        if (userId && users.has(userId)) {
            data.userId = userId;
            data.color = users.get(userId).color;
            
            // 初始化用戶的筆跡數據
            if (!strokesData.has(userId)) {
                strokesData.set(userId, []);
            }
            
            // 保存完整的筆跡數據
            if (data.stroke) {
                strokesData.get(userId).push(data.stroke);
            }
            
            drawHistory.push({
                type: 'draw-start',
                ...data
            });
            
            console.log('Draw Start:', {
                strokesData: Array.from(strokesData.entries()),
                drawHistory
            });
            
            socket.broadcast.emit('draw-start', data);
        }
    });

    socket.on('draw', (data) => {
        const userId = Array.from(users.entries())
            .find(([_, user]) => user.socketId === socket.id)?.[0];
        
        if (userId && users.has(userId)) {
            data.userId = userId;
            data.color = users.get(userId).color;
            
            // 更新現有筆跡的點
            const userStrokes = strokesData.get(userId);
            if (userStrokes && userStrokes.length > 0) {
                const currentStroke = userStrokes[userStrokes.length - 1];
                currentStroke.points = data.points;
            }
            
            drawHistory.push({
                type: 'draw',
                ...data
            });
            
            console.log('Draw:', {
                strokesData: Array.from(strokesData.entries()),
                drawHistory
            });
            
            socket.broadcast.emit('draw', data);
        }
    });

    socket.on('erase', (data) => {
        const userId = Array.from(users.entries())
            .find(([_, user]) => user.socketId === socket.id)?.[0];
            
        if (userId && strokesData.has(userId)) {
            // 更新筆跡數據，移除被擦除的部分
            const userStrokes = strokesData.get(userId);
            // 在這裡實現擦除邏輯...
            
            drawHistory.push({
                type: 'erase',
                ...data
            });
        }
        console.log('Erase:', drawHistory);
        socket.broadcast.emit('erase', data);
    });

    socket.on('clear-all', () => {
        drawHistory.length = 0;
        strokesData.clear();
        console.log('Clear All:', drawHistory);
        io.emit('clear-all');
    });

    socket.on('disconnect', () => {
        const userId = Array.from(users.entries())
            .find(([_, user]) => user.socketId === socket.id)?.[0];
        
        if (userId) {
            users.delete(userId);
            io.emit('user-count-update', users.size);
        }
    });
});

// 定期清理過舊的歷史記錄，避免記憶體過度使用
setInterval(() => {
    if (drawHistory.length > 10000) {  // 設定最大歷史記錄數
        drawHistory.splice(0, drawHistory.length - 10000);
    }
}, 60000);  // 每分鐘檢查一次

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('\nAvailable Network Addresses:');
    console.log('----------------------------');
    
    // 顯示本地環回地址
    console.log(`Localhost: http://localhost:${PORT}`);
    
    // 顯示所有網絡接口的地址
    const addresses = getNetworkAddresses();
    if (addresses.length > 0) {
        addresses.forEach(({interface, address}) => {
            console.log(`${interface}: http://${address}:${PORT}`);
        });
    } else {
        console.log('No network interfaces found');
    }
    
    console.log('----------------------------');
}); 